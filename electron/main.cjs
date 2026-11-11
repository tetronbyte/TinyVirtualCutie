// Dumbo host process (Electron).
// Runs on the stock, already-trusted electron.exe so Windows Smart App Control doesn't block it —
// we never compile our own .exe. All pet logic lives in the renderer (src/).
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

for (const f of (process.env.DUMBO_FLAGS || '').split(' ').filter(Boolean)) { const [k, v] = f.replace(/^--/, '').split('='); app.commandLine.appendSwitch(k, v); }
app.setName('Dumbo');
app.setPath('userData', path.join(app.getPath('appData'), 'Dumbo')); // same state for dev + installed copy
app.setAppUserModelId('dev.tinyvirtualcutie.dumbo');
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const DEV_URL = process.env.DUMBO_DEV_URL; // set by scripts/dev.mjs
const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'assets', 'icon.ico');
// Settings live next to the installed app (%USERPROFILE%\Apps\Dumbo\state.json), not in AppData:
// packaged apps (e.g. a terminal inside the Claude desktop app) get AppData silently redirected,
// which split settings between two invisible copies. One file, same for dev and installed runs.
const STATE_DIR = path.join(require('os').homedir(), 'Apps', 'Dumbo');
const STATE_FILE = () => path.join(STATE_DIR, 'state.json');
function migrateState() {
  const old = path.join(app.getPath('userData'), 'state.json');
  if (!fs.existsSync(STATE_FILE()) && fs.existsSync(old)) { try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.copyFileSync(old, STATE_FILE()); } catch {} }
}

// Base window size in DIPs at size scale 1. The pet itself is drawn 120×116 at the bottom-centre;
// the rest is transparent, click-through room for speech bubbles and jumps.
const BASE_W = 240, BASE_H = 220;

/** @type {BrowserWindow} */ let pet;
/** @type {BrowserWindow|null} */ let settingsWin = null;
let tray;
migrateState();
let state = loadState();

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch { return {}; }
}
function saveState() {
  try { fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true }); fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2)); } catch (e) { console.error(e); }
}
const settings = () => ({
  name: 'Dumbo', theme: 'auto', size: 1, startWithWindows: false,
  batteryLow: 30, batteryHigh: 90, sleepStart: '23:00', sleepEnd: '07:00', sleepiness: 0.6,
  ...(state.settings || {}),
});

function load(win, page) {
  if (DEV_URL) win.loadURL(`${DEV_URL}/${page}`);
  else win.loadFile(path.join(ROOT, 'dist', page));
}

function petSize() {
  const s = settings().size;
  return { width: Math.round(BASE_W * s), height: Math.round(BASE_H * s) };
}

function createPet() {
  const { width, height } = petSize();
  const wa = screen.getPrimaryDisplay().workArea;
  const x = state.pos?.x ?? wa.x + wa.width - width - 30;
  const y = state.pos?.y ?? wa.y + wa.height - height;
  pet = new BrowserWindow({
    width, height, x, y,
    transparent: !process.env.DUMBO_OPAQUE, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: false, show: false,
    backgroundColor: process.env.DUMBO_OPAQUE ? '#ffffff' : '#00000000', title: settings().name, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false, spellcheck: false, additionalArguments: process.env.DUMBO_BENCH ? [`--dumbo-bench=${process.env.DUMBO_BENCH}`] : [] },
  });
  pet.setAlwaysOnTop(true, 'floating');
  if (!process.env.DUMBO_NOFWD) pet.setIgnoreMouseEvents(true, { forward: true }); // renderer turns this off while the cursor is over Dumbo
  load(pet, 'index.html');
  pet.once('ready-to-show', () => pet.showInactive());
  pet.on('closed', () => app.quit());
}

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 460, height: 640, title: `${settings().name} settings`, icon: ICON, autoHideMenuBar: true, resizable: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15121f' : '#f4f1f7',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), spellcheck: false },
  });
  load(settingsWin, 'settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

function applySettings(next) {
  const prev = settings();
  state.settings = { ...prev, ...next };
  saveState();
  const s = settings();
  if (s.size !== prev.size) {
    const b = pet.getBounds(), { width, height } = petSize();
    // keep feet where they were
    pet.setBounds({ x: Math.round(b.x + (b.width - width) / 2), y: b.y + b.height - height, width, height });
  }
  if (s.startWithWindows !== prev.startWithWindows) setAutostart(s.startWithWindows);
  pet.setTitle(s.name);
  tray?.setToolTip(s.name);
  pet.webContents.send('settings', s);
  buildTrayMenu();
}

function setAutostart(on) {
  // process.execPath = the stock runtime (renamed Dumbo.exe, so Electron thinks it's "packaged");
  // the app folder must always be passed or it boots Electron's default app instead of Dumbo.
  const args = [path.resolve(ROOT)];
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args, name: 'Dumbo' });
}

function buildTrayMenu() {
  const s = settings();
  const theme = t => ({ label: { auto: 'Auto (follow Windows)', light: 'Light', dark: 'Dark' }[t], type: 'radio', checked: s.theme === t, click: () => applySettings({ theme: t }) });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: pet.isVisible() ? `Hide ${s.name}` : `Show ${s.name}`, click: togglePet },
    { label: 'Sleep', click: () => pet.webContents.send('action', 'sleep') },
    { label: 'Wake up', click: () => pet.webContents.send('action', 'wake') },
    { label: 'Theme', submenu: ['auto', 'light', 'dark'].map(theme) },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: s.startWithWindows, click: i => applySettings({ startWithWindows: i.checked }) },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function togglePet() {
  if (pet.isVisible()) pet.hide(); else pet.showInactive();
  buildTrayMenu();
}

// ---------- IPC ----------
ipcMain.handle('state:get', () => ({ settings: settings(), hasBattery }));
ipcMain.handle('settings:get', () => settings());
ipcMain.on('settings:set', (_e, next) => applySettings(next));
ipcMain.on('log', (_e, msg) => console.log('[pet]', msg));
ipcMain.on('mouse:ignore', (_e, ignore) => { if (!process.env.DUMBO_NOFWD) pet.setIgnoreMouseEvents(ignore, { forward: true }); });
ipcMain.handle('win:info', () => ({ bounds: pet.getBounds(), workArea: screen.getDisplayMatching(pet.getBounds()).workArea }));
ipcMain.on('win:move', (_e, x, y) => { const b = pet.getBounds(); pet.setBounds({ x: Math.round(x), y: Math.round(y), width: b.width, height: b.height }); });
ipcMain.on('win:save', () => { const b = pet.getBounds(); state.pos = { x: b.x, y: b.y }; saveState(); });
ipcMain.on('open:settings', openSettings);

// Drag: renderer reports grab offset; we follow the cursor until it says stop.
let dragTimer = null;
ipcMain.on('drag:start', (_e, ox, oy) => {
  clearInterval(dragTimer);
  const b = pet.getBounds();
  dragTimer = setInterval(() => {
    const c = screen.getCursorScreenPoint();
    pet.setBounds({ x: c.x - ox, y: c.y - oy, width: b.width, height: b.height });
  }, 16);
});
ipcMain.on('drag:end', () => { clearInterval(dragTimer); dragTimer = null; });

// Cursor tracking for "looks at you": only runs while the renderer asks for it, ~4 Hz, sends only on change.
let trackTimer = null, lastCursor = '';
ipcMain.on('track', (_e, on) => {
  clearInterval(trackTimer); trackTimer = null;
  if (!on) return;
  trackTimer = setInterval(() => {
    const c = screen.getCursorScreenPoint(), b = pet.getBounds();
    const key = `${c.x},${c.y},${b.x},${b.y}`;
    if (key === lastCursor) return;
    lastCursor = key;
    pet.webContents.send('cursor', { x: c.x - b.x, y: c.y - b.y, w: b.width, h: b.height });
  }, 250);
});

// Does this machine have a battery? (desktop PCs: no battery reactions)
let hasBattery = false;
function detectBattery() {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Battery | Measure-Object).Count'], { windowsHide: true, timeout: 15000 }, (err, out) => {
    hasBattery = !err && parseInt(String(out).trim(), 10) > 0;
    pet?.webContents.send('battery:present', hasBattery);
  });
}

app.whenReady().then(() => {
  detectBattery();
  createPet();
  tray = new Tray(nativeImage.createFromPath(ICON));
  tray.setToolTip(settings().name);
  tray.on('click', togglePet);
  buildTrayMenu();
  setAutostart(settings().startWithWindows); // always reconcile: repairs or removes stale entries from older installs
  // Boot report next to the app, so problems can be diagnosed without the console.
  try {
    const li = app.getLoginItemSettings({ path: process.execPath, args: [path.resolve(ROOT)] });
    fs.writeFileSync(path.join(STATE_DIR, 'boot.json'), JSON.stringify({ at: new Date().toISOString(), exe: process.execPath, app: path.resolve(ROOT), dev: !!DEV_URL, startWithWindows: settings().startWithWindows, loginItem: { openAtLogin: li.openAtLogin, executableWillLaunchAtLogin: li.executableWillLaunchAtLogin, launchItems: li.launchItems } }, null, 2));
  } catch (e) { console.error(e); }
});
app.on('second-instance', () => pet?.showInactive());
app.on('window-all-closed', () => app.quit());
