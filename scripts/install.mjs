// Installs/updates Dumbo for the current user from the portable package (scripts/package.mjs):
//   %USERPROFILE%\Apps\Dumbo\Dumbo\Dumbo.exe   ← stock Electron runtime (unmodified, renamed) + resources\app.asar
//   %USERPROFILE%\Apps\Dumbo\state.json         ← settings (kept across updates)
// Dumbo creates his own Desktop + Start Menu shortcuts on first run.
// Deliberately NOT under AppData: when this runs from a packaged (MSIX) app such as the Claude desktop
// app, Windows silently redirects AppData writes into that app's private cache.
import { execFileSync, spawn } from 'child_process';
import { cpSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(os.homedir(), 'Apps', 'Dumbo');
const target = path.join(base, 'Dumbo');

await import('./package.mjs');

console.log('\ninstalling…');
try { execFileSync('taskkill', ['/IM', 'Dumbo.exe', '/F'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1000)); } catch { /* not running */ }
for (const old of ['runtime', 'app']) rmSync(path.join(base, old), { recursive: true, force: true }); // pre-0.3 layout
rmSync(target, { recursive: true, force: true });
cpSync(path.join(root, 'release', 'Dumbo'), target, { recursive: true });

console.log(`Installed to ${target}\nStarting Dumbo…`);
// Launch through Explorer so Dumbo runs as a normal app, outside whatever started this script.
spawn('explorer.exe', [path.join(target, 'Dumbo.exe')], { detached: true, stdio: 'ignore' }).unref();
