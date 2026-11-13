// Foreground-window watcher, built only from Microsoft-signed parts (no compiled code, Smart App
// Control safe): one long-lived PowerShell process using UI Automation, queried on demand over stdin.
// Privacy: returns only the app's process name and window rectangle — never window titles or content.
//
// Protocol: the script (passed with -EncodedCommand) prints "ready" once loaded; each question is
// "fg <id>" on stdin and each answer carries that id. (The script used to be fed through stdin, where
// PowerShell's reader swallowed the first question; one unanswered question then shifted every later
// answer onto the wrong one — 0.3.5 bug: every query timed out, so each drop waited 3 s before he
// fell, and window visits / app reactions stopped.)
const { spawn } = require('child_process');

const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $id = [int]('0' + ($line -replace '\D', ''))
  $out = '{"id":' + $id + '}'
  try {
    $e = [System.Windows.Automation.AutomationElement]::FocusedElement
    while ($e -ne $null) { $p = $walker.GetParent($e); if ($p -eq $null -or $p -eq $root) { break }; $e = $p }
    if ($e -ne $null) {
      $r = $e.Current.BoundingRectangle
      $procId = $e.Current.ProcessId
      $name = (Get-Process -Id $procId).ProcessName
      $max = $false
      try { $wp = $e.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern); $max = ($wp.Current.WindowVisualState -eq 'Maximized') } catch {}
      $out = '{"id":' + $id + ',"name":"' + $name + '","pid":' + $procId + ',"x":' + [int]$r.X + ',"y":' + [int]$r.Y + ',"w":' + [int]$r.Width + ',"h":' + [int]$r.Height + ',"max":' + $max.ToString().ToLower() + '}'
    }
  } catch {}
  [Console]::Out.WriteLine($out)
  [Console]::Out.Flush()
}
`;

class WinWatch {
  constructor() { this.proc = null; this.ready = false; this.pending = new Map(); this.waiting = []; this.nextId = 1; this.buf = ''; }

  start() {
    if (this.proc) return;
    // Script on the command line, not stdin: stdin then carries only questions, so none get swallowed.
    const proc = this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PS, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.ready = false; this.buf = '';
    proc.on('error', () => {});
    proc.stdin.on('error', () => {}); // process gone mid-write: 'exit' cleans up
    proc.stdout.on('data', d => {
      if (this.proc !== proc) return; // an old, replaced watcher
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (line === 'ready') { this.ready = true; for (const id of this.waiting.splice(0)) proc.stdin.write(`fg ${id}\n`); continue; }
        if (!line.startsWith('{')) continue;
        let v; try { v = JSON.parse(line); } catch { continue; }
        const cb = this.pending.get(v.id);
        if (cb) { this.pending.delete(v.id); cb(v); }
      }
    });
    proc.on('exit', () => { if (this.proc !== proc) return; this.proc = null; this.failAll(); });
  }

  failAll() { this.waiting.length = 0; for (const cb of [...this.pending.values()]) cb({}); this.pending.clear(); }

  /** @returns {Promise<{name?:string,pid?:number,x?:number,y?:number,w?:number,h?:number,max?:boolean}>} physical-pixel rect */
  foreground() {
    // Stuck watcher (several questions unanswered): start a fresh one.
    if (this.pending.size >= 4) this.stop();
    this.start();
    return new Promise(resolve => {
      const id = this.nextId++;
      const t = setTimeout(() => { this.pending.delete(id); resolve({}); }, this.ready ? 3000 : 10000);
      this.pending.set(id, v => { clearTimeout(t); resolve(v); });
      if (this.ready) this.proc.stdin.write(`fg ${id}\n`); else this.waiting.push(id);
    });
  }

  stop() { this.proc?.kill(); this.proc = null; this.failAll(); }
}

module.exports = { WinWatch };
