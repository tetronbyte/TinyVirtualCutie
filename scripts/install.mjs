// Installs Dumbo for the current user — no compiled/unsigned .exe involved, so Smart App Control stays happy:
//   %USERPROFILE%\Apps\Dumbo\runtime\Dumbo.exe   ← the stock Electron runtime (byte-identical, just renamed)
//   %USERPROFILE%\Apps\Dumbo\app\                ← our code (built pages + host scripts)
// plus Desktop and Start Menu shortcuts. Re-run any time to update (your settings are kept).
// Deliberately NOT under AppData: when this runs from a packaged (MSIX) app such as the Claude desktop
// app, Windows silently redirects AppData writes into that app's private cache, so the shortcut would
// point at a folder that doesn't exist for you ("Unable to find Electron app").
import { build } from 'vite';
import { execFileSync, spawn } from 'child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, renameSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(os.homedir(), 'Apps', 'Dumbo');
const runtime = path.join(target, 'runtime');
const appDir = path.join(target, 'app');
const exe = path.join(runtime, 'Dumbo.exe');
const icon = path.join(appDir, 'assets', 'icon.ico');

console.log('1/5 building pages…');
await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn' });

console.log('2/5 stopping running Dumbo (if any)…');
try { execFileSync('taskkill', ['/IM', 'Dumbo.exe', '/F'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); } catch { /* not running */ }

console.log('3/5 copying runtime…');
const pkg = JSON.parse(readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8'));
const stamp = path.join(runtime, '.electron-version');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== pkg.version) {
  rmSync(runtime, { recursive: true, force: true });
  cpSync(path.join(root, 'node_modules', 'electron', 'dist'), runtime, { recursive: true });
  renameSync(path.join(runtime, 'electron.exe'), exe);
  writeFileSync(stamp, pkg.version);
}

console.log('4/5 copying app…');
rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
for (const d of ['dist', 'electron', 'assets']) cpSync(path.join(root, d), path.join(appDir, d), { recursive: true });
const ver = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'dumbo', productName: 'Dumbo', version: ver, main: 'electron/main.cjs' }, null, 2));

console.log('5/5 creating shortcuts…');
const ps = (lnk) => `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}');$s.TargetPath='${exe}';$s.Arguments='"${appDir}"';$s.WorkingDirectory='${appDir}';$s.IconLocation='${icon}';$s.Description='Dumbo desktop pet';$s.Save()`;
const desktop = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"]).toString().trim();
const startMenu = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
for (const lnk of [path.join(desktop, 'Dumbo.lnk'), path.join(startMenu, 'Dumbo.lnk')]) {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps(lnk)], { stdio: 'inherit' });
}

console.log(`\nInstalled to ${target}\nStarting Dumbo…`);
// Launch through Explorer so Dumbo runs as a normal app, outside whatever started this script.
spawn('explorer.exe', [path.join(desktop, 'Dumbo.lnk')], { detached: true, stdio: 'ignore' }).unref();
