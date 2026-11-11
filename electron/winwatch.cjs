// Foreground-window watcher, built only from Microsoft-signed parts (no compiled code, Smart App
// Control safe): one long-lived PowerShell process using UI Automation, queried on demand over stdin.
// Privacy: returns only the app's process name and window rectangle — never window titles or content.
const { spawn } = require('child_process');

const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $out = '{}'
  try {
    $e = [System.Windows.Automation.AutomationElement]::FocusedElement
    while ($e -ne $null) { $p = $walker.GetParent($e); if ($p -eq $null -or $p -eq $root) { break }; $e = $p }
    if ($e -ne $null) {
      $r = $e.Current.BoundingRectangle
      $procId = $e.Current.ProcessId
      $name = (Get-Process -Id $procId).ProcessName
      $max = $false
      try { $wp = $e.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern); $max = ($wp.Current.WindowVisualState -eq 'Maximized') } catch {}
      $out = '{"name":"' + $name + '","pid":' + $procId + ',"x":' + [int]$r.X + ',"y":' + [int]$r.Y + ',"w":' + [int]$r.Width + ',"h":' + [int]$r.Height + ',"max":' + $max.ToString().ToLower() + '}'
    }
  } catch {}
  [Console]::Out.WriteLine($out)
  [Console]::Out.Flush()
}
`;

class WinWatch {
  constructor() { this.proc = null; this.queue = []; this.buf = ''; }

  start() {
    if (this.proc) return;
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc.stdin.write(PS + '\n');
    this.proc.stdout.on('data', d => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        const cb = this.queue.shift();
        try { cb?.(JSON.parse(line)); } catch { cb?.({}); }
      }
    });
    this.proc.on('exit', () => { this.proc = null; for (const cb of this.queue.splice(0)) cb({}); });
  }

  /** @returns {Promise<{name?:string,pid?:number,x?:number,y?:number,w?:number,h?:number,max?:boolean}>} physical-pixel rect */
  foreground() {
    this.start();
    return new Promise(resolve => {
      const t = setTimeout(() => { const i = this.queue.indexOf(done); if (i >= 0) this.queue.splice(i, 1); resolve({}); }, this.warm ? 3000 : 10000);
      this.warm = true;
      const done = v => { clearTimeout(t); resolve(v); };
      this.queue.push(done);
      this.proc.stdin.write('fg\n');
    });
  }

  stop() { this.proc?.kill(); this.proc = null; }
}

module.exports = { WinWatch };
