// Builds a portable, shareable Dumbo:  release/Dumbo/Dumbo.exe  +  release/Dumbo-<version>-win-x64.zip
//
// Why this layout: Windows Smart App Control (and SmartScreen) block brand-new unsigned executables.
// So we never create or modify an .exe. Dumbo.exe is Electron's stock, byte-identical runtime, just
// renamed. Stock Electron automatically runs the app found at resources\app.asar next to it — that's
// where our code goes. Friends unzip and double-click Dumbo.exe; nothing to install.
import { build } from 'vite';
import { createPackage } from '@electron/asar';
import { execFileSync } from 'child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, renameSync, readdirSync, statSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createHash } from 'crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release');
const out = path.join(release, 'Dumbo');
const stage = path.join(release, '.app');
const zip = path.join(release, `Dumbo-${pkg.version}-win-x64.zip`);

const dirSize = p => statSync(p).isDirectory() ? readdirSync(p).reduce((s, f) => s + dirSize(path.join(p, f)), 0) : statSync(p).size;
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;

console.log('1/5 building pages…');
await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn' });

console.log('2/5 copying stock Electron runtime (unmodified)…');
rmSync(release, { recursive: true, force: true });
cpSync(path.join(root, 'node_modules', 'electron', 'dist'), out, { recursive: true });
renameSync(path.join(out, 'electron.exe'), path.join(out, 'Dumbo.exe'));
rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true }); // Electron's demo app
// Keep only English UI strings (Chromium falls back to en-US): saves ~40 MB.
for (const f of readdirSync(path.join(out, 'locales'))) if (f !== 'en-US.pak') rmSync(path.join(out, 'locales', f));

console.log('3/5 packing app into resources/app.asar…');
mkdirSync(stage, { recursive: true });
for (const d of ['dist', 'electron', 'assets']) cpSync(path.join(root, d), path.join(stage, d), { recursive: true });
writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'dumbo', productName: 'Dumbo', version: pkg.version, main: pkg.main, updates: pkg.updates }, null, 2));
await createPackage(stage, path.join(out, 'resources', 'app.asar'));
rmSync(stage, { recursive: true, force: true });
// Icon outside the archive so Windows shortcuts can use it.
copyFileSync(path.join(root, 'assets', 'icon.ico'), path.join(out, 'resources', 'dumbo.ico'));
writeFileSync(path.join(out, 'README.txt'), [
  `Dumbo ${pkg.version} — a tiny desktop pet`,
  '',
  'Run: double-click Dumbo.exe (no install needed). On first run he adds Desktop + Start Menu shortcuts.',
  'Control him from the tray icon (bottom-right, near the clock): settings, sleep, theme, start with Windows, quit.',
  'Remove: Quit from the tray, then delete this folder (and the "Apps\\Dumbo" folder in your user folder for settings).',
  '',
  'Dumbo.exe is the unmodified Electron runtime (https://www.electronjs.org), renamed. Licenses: LICENSE, LICENSES.chromium.html.',
].join('\r\n'));

// Update files (electron/updater.cjs): the same archive under a versioned name + unsigned update.json
// (scripts/sign-update.mjs adds the signature in CI).
const asarName = `dumbo-app-${pkg.version}.asar`;
copyFileSync(path.join(out, 'resources', 'app.asar'), path.join(release, asarName));
const electronVersion = JSON.parse(readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
writeFileSync(path.join(release, 'update.json'), JSON.stringify({
  version: pkg.version, electron: electronVersion.split('.')[0], asar: asarName,
  sha512: createHash('sha512').update(readFileSync(path.join(release, asarName))).digest('base64'),
  notes: (process.env.DUMBO_RELEASE_NOTES || '').split('\n').filter(l => !/^Co-Authored-By:/i.test(l)).join('\n').trim(),
}, null, 2));

console.log('4/5 zipping…');
// Windows' built-in tar (System32, Microsoft-signed) writes zip files.
execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', path.basename(zip), 'Dumbo'], { cwd: release });

console.log('5/5 done\n');
console.log(`folder: ${out}  (${mb(dirSize(out))})`);
console.log(`  Dumbo.exe         ${mb(statSync(path.join(out, 'Dumbo.exe')).size)}  (stock Electron ${JSON.parse(readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version})`);
console.log(`  resources/app.asar ${mb(statSync(path.join(out, 'resources', 'app.asar')).size)}  (Dumbo himself)`);
console.log(`zip:    ${zip}  (${mb(statSync(zip).size)})`);
