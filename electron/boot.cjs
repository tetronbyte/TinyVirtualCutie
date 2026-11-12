// Entry point (package.json "main"). Picks which copy of Dumbo's code to run:
//   - the one shipped in resources/app.asar, or
//   - a newer downloaded update in %USERPROFILE%\Apps\Dumbo\updates\ (see updater.cjs).
// Updates are plain archives of code + art, never executables: Dumbo.exe itself never changes,
// so Smart App Control has nothing new to block. If an update fails to start 3 times in a row,
// Dumbo goes back to the shipped version by himself.
const { app } = require('electron');
const fs = require('original-fs'); // plain fs: treat .asar files as files, not folders
const path = require('path');
const { STATE_DIR, UPDATES_DIR, newer } = require('./common.cjs');

app.setName('Dumbo');
app.setPath('userData', process.env.DUMBO_STATE_DIR ? path.join(STATE_DIR, 'userData') : path.join(app.getPath('appData'), 'Dumbo'));
app.setAppUserModelId('dev.tinyvirtualcutie.dumbo');
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const bundled = require('../package.json').version;
const CURRENT = path.join(UPDATES_DIR, 'current.json');
const MAX_TRIES = 3;

function pickUpdate() {
  if (process.env.DUMBO_DEV_URL || process.env.DUMBO_NO_UPDATES) return null;
  try {
    const cur = JSON.parse(fs.readFileSync(CURRENT, 'utf8'));
    const file = path.join(UPDATES_DIR, path.basename(String(cur.file)));
    if (!newer(cur.version, bundled)) return null; // the installed version is already as new
    if (String(cur.electron) !== process.versions.electron.split('.')[0]) return null; // needs a newer Dumbo.exe
    if ((cur.tries || 0) >= MAX_TRIES || !fs.existsSync(file)) return null;
    cur.tries = (cur.tries || 0) + 1; // reset to 0 by main.cjs once the pet is on screen
    fs.writeFileSync(CURRENT, JSON.stringify(cur, null, 2));
    return { version: cur.version, file };
  } catch { return null; }
}

const update = pickUpdate();
global.dumboBoot = { bundled, version: update ? update.version : bundled, overlay: update ? update.file : null, currentFile: CURRENT };
try {
  require(update ? path.join(update.file, 'electron', 'main.cjs') : './main.cjs');
} catch (e) {
  if (!update) throw e;
  console.error('update failed to load, using shipped version', e);
  try { const cur = JSON.parse(fs.readFileSync(CURRENT, 'utf8')); cur.tries = MAX_TRIES; fs.writeFileSync(CURRENT, JSON.stringify(cur, null, 2)); } catch {}
  global.dumboBoot = { bundled, version: bundled, overlay: null, currentFile: CURRENT };
  require('./main.cjs');
}
