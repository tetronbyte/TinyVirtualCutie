// Dumbo host process (Electron), Windows + macOS.
// Windows: runs on the stock, already-trusted electron.exe so Smart App Control doesn't block it —
// we never compile our own .exe. macOS: Dumbo.app built in CI (ad-hoc signed, "Open Anyway" once).
// All pet logic lives in the renderer (src/).
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, nativeTheme, powerMonitor, shell } = require('electron');
const { WinWatch } = require('./winwatch.cjs');
const { Updater } = require('./updater.cjs');
const { STATE_DIR } = require('./common.cjs');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

for (const f of (process.env.DUMBO_FLAGS || '').split(' ').filter(Boolean)) { const [k, v] = f.replace(/^--/, '').split('='); app.commandLine.appendSwitch(k, v); }
// App name, userData and the single-instance lock are set up in boot.cjs (the entry point).

const DEV_URL = process.env.DUMBO_DEV_URL; // set by scripts/dev.mjs
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'assets', IS_WIN ? 'icon.ico' : 'icon.png');
// Portable/packaged layout (scripts/package.mjs): Dumbo.exe + resources/app.asar. The stock runtime
// finds the app by itself, so no app-path argument is needed — and the icon for Windows shortcuts
// lives outside the archive at resources/dumbo.ico.
const SELF_CONTAINED = /\.asar$/i.test(ROOT) || path.basename(path.dirname(ROOT)).toLowerCase() === 'resources';
const LAUNCH_ARGS = SELF_CONTAINED ? [] : [path.resolve(ROOT)];
const SHORTCUT_ICON = SELF_CONTAINED ? path.join(process.resourcesPath, 'dumbo.ico') : ICON;
// Version actually running: the shipped one, or a downloaded update picked by boot.cjs.
const BOOT = global.dumboBoot || { version: app.getVersion(), overlay: null, currentFile: '' };
const APP_VERSION = BOOT.version;
// Settings live next to the installed app (%USERPROFILE%\Apps\Dumbo\state.json), not in AppData:
// packaged apps (e.g. a terminal inside the Claude desktop app) get AppData silently redirected,
// which split settings between two invisible copies. One file, same for dev and installed runs.
const STATE_FILE = () => path.join(STATE_DIR, 'state.json');
function migrateState() {
  const old = path.join(app.getPath('userData'), 'state.json');
  if (!fs.existsSync(STATE_FILE()) && fs.existsSync(old)) { try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.copyFileSync(old, STATE_FILE()); } catch {} }
}

// Base window size in DIPs at size scale 1. The pet itself is drawn 120×116 at the bottom-centre;
// the rest is transparent, click-through room for speech bubbles and jumps.
const BASE_W = 240, BASE_H = 220;

/** @type {BrowserWindow} */ let pet;
// His window can be gone (quitting) while timers or late messages still fire: check before touching it.
const alive = () => !!pet && !pet.isDestroyed();
function sendPet(ch, v) { if (alive() && !pet.webContents.isDestroyed()) pet.webContents.send(ch, v); }

// A pet shouldn't pop up error boxes: an uncaught error in the host is logged next to state.json instead.
// (The error box also blocked quitting.)
function logError(e) {
  console.error(e);
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.appendFileSync(path.join(STATE_DIR, 'errors.log'), `${new Date().toISOString()} ${APP_VERSION} ${e && e.stack || e}\n`); } catch {}
}
process.on('uncaughtException', logError);
process.on('unhandledRejection', logError);
/** @type {BrowserWindow|null} */ let settingsWin = null;
let tray;
migrateState();
let state = loadState();
// Low memory mode: no graphics acceleration (no GPU process) and no window watcher. Decided here,
// before the app is ready (this file runs at start-up, also when loaded as an update), so changing
// the mode restarts Dumbo.
const LOW_MEM = state.settings?.perfMode === 'memory';
if (LOW_MEM) app.disableHardwareAcceleration();
// Restarted by himself after the laptop woke up (see restartAfterSleep): he says "hello again".
const WOKE = !!state.helloAgain;
if (WOKE) { delete state.helloAgain; saveState(); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch { return {}; }
}
function saveState() {
  try { fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true }); fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2)); } catch (e) { console.error(e); }
}
// Custom modes (tray Modes / settings): work for N minutes, break for M, repeat.
const DEFAULT_ROUTINES = [
  { id: 'focus', name: 'Focus', work: 'coding', workMin: 25, rest: 'stretch', restMin: 5, rounds: 4 },
  { id: 'deep', name: 'Deep work', work: 'coding', workMin: 50, rest: 'stretch', restMin: 10, rounds: 2 },
];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// The day you met: first start (older installs: the first start of this version).
if (!state.settings?.metOn) { state.settings = { ...(state.settings || {}), metOn: today() }; saveState(); }
const settings = () => ({
  name: 'Dumbo', theme: 'auto', size: 1, startWithWindows: false,
  batteryLow: 30, batteryHigh: 90, sleepStart: '23:00', sleepEnd: '07:00', sleepiness: 0.6,
  visitWindows: true, stretchEvery: 50, autoUpdate: true, actions: {}, tune: {}, perfMode: 'normal', saverUnplugged: false,
  // Daily life: birthday ("MM-DD", empty = the day you met), days-together counter, water + night look + quiet.
  birthday: '', metOn: '', daysTogether: 0, lastDay: '', waterEvery: 60, nightLook: true, quietInMeetings: true,
  routines: DEFAULT_ROUTINES,
  appReactions: [
    { app: 'Code', action: 'coding' }, { app: 'Cursor', action: 'coding' }, { app: 'devenv', action: 'coding' },
    { app: 'idea64', action: 'coding' }, { app: 'WindowsTerminal', action: 'coding' },
    { app: 'Spotify', action: 'dance' }, { app: 'Discord', action: 'wave' },
  ],
  ...(state.settings || {}),
});

function load(win, page) {
  if (DEV_URL) win.loadURL(`${DEV_URL}/${page}`);
  else win.loadFile(path.join(ROOT, 'dist', page));
}

/** Is enough of this rect (his body, bottom-centre) on some connected screen to see and grab him? */
function onScreen(r) {
  const cx = r.x + r.width / 2, by = r.y + r.height * 0.75;
  return screen.getAllDisplays().some(d => { const a = d.bounds; return cx >= a.x && cx < a.x + a.width && by >= a.y && by < a.y + a.height; });
}
/** Off every screen (monitor unplugged, resolution changed): bring him back bottom-right of the main one. */
function rescueIfLost() {
  if (!alive() || onScreen(pet.getBounds())) return;
  const wa = screen.getPrimaryDisplay().workArea, { width, height } = petSize();
  console.log('[host] he was off-screen, bringing him back');
  moveTo(wa.x + wa.width - width - 30, wa.y + wa.height - height);
  state.pos = { x: pet.getBounds().x, y: pet.getBounds().y }; saveState();
}

function petSize() {
  const s = settings().size;
  return { width: Math.round(BASE_W * s), height: Math.round(BASE_H * s) };
}

function createPet() {
  const { width, height } = petSize();
  const wa = screen.getPrimaryDisplay().workArea;
  // Saved spot on a monitor that isn't connected any more? Start bottom-right of the main screen.
  const p = state.pos && onScreen({ x: state.pos.x, y: state.pos.y, width, height }) ? state.pos : null;
  const x = p?.x ?? wa.x + wa.width - width - 30;
  const y = p?.y ?? wa.y + wa.height - height;
  pet = new BrowserWindow({
    width, height, x, y,
    transparent: !process.env.DUMBO_OPAQUE, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: false, show: false,
    backgroundColor: process.env.DUMBO_OPAQUE ? '#ffffff' : '#00000000', title: settings().name, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false, spellcheck: false, additionalArguments: process.env.DUMBO_BENCH ? [`--dumbo-bench=${process.env.DUMBO_BENCH}`] : [] },
  });
  pet.setAlwaysOnTop(true, 'floating');
  if (IS_MAC) pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); // stays with you across Spaces
  if (!process.env.DUMBO_NOFWD) pet.setIgnoreMouseEvents(true, { forward: true }); // renderer turns this off while the cursor is over Dumbo
  load(pet, 'index.html');
  pet.once('ready-to-show', () => { pet.showInactive(); updater.markGood(); startHoverPoll(); });
  pet.on('closed', () => { stopTimers(); app.quit(); });
  // Renderer crashed (can happen after sleep/resume or a graphics driver reset): bring him back.
  pet.webContents.on('render-process-gone', (_e, d) => {
    console.error('pet renderer gone:', d.reason);
    if (d.reason !== 'clean-exit') setTimeout(() => { if (alive()) pet.reload(); }, 1000);
  });
}

function openSettings() {
  if (settingsWin) { if (settingsWin.isMinimized()) settingsWin.restore(); settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 600, height: Math.min(820, screen.getPrimaryDisplay().workArea.height - 40), minWidth: 420, minHeight: 400, title: `${settings().name} settings`, icon: ICON, autoHideMenuBar: true, resizable: true,
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
  if (s.autoUpdate !== prev.autoUpdate) updater.start(s.autoUpdate);
  if (s.quietInMeetings !== prev.quietInMeetings) checkQuiet().catch(() => {});
  // Low memory mode only takes effect at start-up (graphics acceleration): restart for him.
  if ((s.perfMode === 'memory') !== LOW_MEM) {
    sendPet('say', s.perfMode === 'memory' ? 'restarting to save memory… brb!' : 'restarting… brb!');
    setTimeout(() => { app.relaunch(); app.quit(); }, 1500);
  }
  pet.setTitle(s.name);
  tray?.setToolTip(s.name);
  sendPet('settings', s);
  buildTrayMenu();
}

function setAutostart(on) {
  // process.execPath = the stock runtime renamed Dumbo.exe. In the dev/folder layout the app folder
  // must be passed or it boots Electron's default app; the portable layout needs no argument.
  if (IS_MAC) { if (!DEV_URL) app.setLoginItemSettings({ openAtLogin: on }); return; } // macOS: Login Items of Dumbo.app
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: LAUNCH_ARGS, name: 'Dumbo' });
}

/** Desktop + Start Menu shortcuts pointing at this copy of Dumbo, with his icon. */
function createShortcuts() {
  const opts = { target: process.execPath, args: LAUNCH_ARGS.map(a => `"${a}"`).join(' '), cwd: path.dirname(process.execPath), icon: SHORTCUT_ICON, iconIndex: 0, description: 'Dumbo — a tiny desktop pet', appUserModelId: 'dev.tinyvirtualcutie.dumbo' };
  const places = [path.join(app.getPath('desktop'), 'Dumbo.lnk'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Dumbo.lnk')];
  let ok = 0;
  for (const p of places) { try { if (shell.writeShortcutLink(p, fs.existsSync(p) ? 'replace' : 'create', opts)) ok++; } catch (e) { console.error(e); } }
  return ok;
}

function buildTrayMenu() {
  const s = settings();
  const theme = t => ({ label: { auto: IS_MAC ? 'Auto (follow macOS)' : 'Auto (follow Windows)', light: 'Light', dark: 'Dark' }[t], type: 'radio', checked: s.theme === t, click: () => applySettings({ theme: t }) });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: alive() && pet.isVisible() ? `Hide ${s.name}` : `Show ${s.name}`, click: togglePet },
    { label: 'Sleep', click: () => sendPet('action', 'sleep') },
    { label: 'Wake up', click: () => { if (hold.kind === 'sleep') setHold({ kind: 'free' }); sendPet('action', 'wake'); } },
    { type: 'separator' },
    ...holdMenu(),
    { type: 'separator' },
    { label: 'Theme', submenu: ['auto', 'light', 'dark'].map(theme) },
    { label: 'Mode', submenu: [
      ...[['normal', 'Normal'], ['battery', 'Battery saver'], ['memory', 'Low memory (restarts)']].map(([m, l]) => ({ label: l, type: 'radio', checked: s.perfMode === m, click: () => applySettings({ perfMode: m }) })),
      ...(hasBattery ? [{ type: 'separator' }, { label: 'Battery saver when unplugged', type: 'checkbox', checked: s.saverUnplugged, click: i => applySettings({ saverUnplugged: i.checked }) }] : []),
    ] },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: IS_MAC ? 'Open at login' : 'Start with Windows', type: 'checkbox', checked: s.startWithWindows, click: i => applySettings({ startWithWindows: i.checked }) },
    ...(IS_WIN ? [{ label: 'Add Desktop & Start Menu shortcuts', click: createShortcuts }] : []),
    { type: 'separator' },
    ...updateMenu(),
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ---------- "Stay here" + "Keep him…" (owner holds), with an optional timer ----------
// Lives here (not in the renderer) so the timer and the pin survive restarts (state.json).
const HOLD_KINDS = [['free', 'Whatever he likes'], ['sleep', 'Sleeping'], ['awake', 'Staying awake'], ['coding', 'Coding'], ['exercise', 'Exercising'], ['walk', 'Walking around']];
const TIMERS = [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [0, 'No timer']];
const FREE = { pin: false, kind: 'free', until: 0 };
let hold = (() => { const h = state.hold; return h && (!h.until || h.until > Date.now()) ? { pin: !!h.pin, kind: HOLD_KINDS.some(k => k[0] === h.kind) ? h.kind : 'free', until: h.until || 0 } : { ...FREE }; })();
let holdTimer = null, holdTick = null;
const holdActive = () => hold.pin || hold.kind !== 'free';
/** Any change restarts the timer from now (if one is chosen). */
function setHold(patch, reason = 'user') {
  if (routine) {
    if (!('kind' in patch)) { // pin on/off or timer pick during a mode: keep the mode's own timing
      if ('pin' in patch) { hold = { ...hold, pin: !!patch.pin }; state.hold = hold; saveState(); sendPet('hold', { ...hold, reason, routine: routineInfo() }); }
      if (tray) buildTrayMenu();
      return;
    }
    endRoutine(); // you picked another "Keep him…": the mode stops
  }
  hold = { ...hold, ...patch };
  if (hold.pin && hold.kind === 'walk') hold.kind = 'free'; // can't stay put and walk around
  const min = state.holdMinutes || 0;
  hold.until = holdActive() && min ? Date.now() + min * 60e3 : 0;
  state.hold = hold; saveState();
  armHoldTimer();
  sendPet('hold', { ...hold, reason });
  if (tray) buildTrayMenu();
}
function armHoldTimer() {
  clearTimeout(holdTimer); clearInterval(holdTick);
  if (routine) return; // the mode runs its own timer
  if (!hold.until) return;
  holdTimer = setTimeout(() => {
    hold = { ...FREE }; state.hold = hold; saveState();
    clearInterval(holdTick);
    sendPet('hold', { ...hold, reason: 'timer' });
    if (tray) buildTrayMenu();
  }, Math.max(0, hold.until - Date.now()));
  holdTick = setInterval(() => tray && buildTrayMenu(), 60e3); // keeps "N min left" fresh
}
function holdMenu() {
  const min = state.holdMinutes || 0;
  const left = hold.until ? Math.max(1, Math.ceil((hold.until - Date.now()) / 60e3)) : 0;
  const r = routineInfo();
  const modes = { label: r ? `Mode: ${r.name}` : 'Modes', submenu: r
    ? [{ label: `${r.phase === 'work' ? 'Working' : 'Break'} · round ${r.round} of ${r.rounds} · ${left} min left`, enabled: false }, { label: `Stop ${r.name}`, click: () => stopRoutine('stopped') }]
    : [...routineDefs().map(d => ({ label: `${d.name} (${d.workMin} min${Number(d.restMin) > 0 ? ` + ${d.restMin} min break` : ''}${Number(d.rounds) > 1 ? ` × ${d.rounds}` : ''})`, click: () => startRoutine(d.id) })),
       { type: 'separator' }, { label: 'Edit modes…', click: openSettings }] };
  if (r) return [modes, { label: 'Stay here', type: 'checkbox', checked: hold.pin, click: i => setHold({ pin: i.checked }) }];
  return [
    modes,
    { label: 'Stay here', type: 'checkbox', checked: hold.pin, click: i => setHold({ pin: i.checked }) },
    { label: 'Keep him…', submenu: HOLD_KINDS.map(([k, l]) => ({ label: l, type: 'radio', checked: hold.kind === k, enabled: !(k === 'walk' && hold.pin), click: () => setHold({ kind: k }) })) },
    { label: left ? `Timer (${left} min left)` : 'Timer', submenu: TIMERS.map(([m, l]) => ({ label: l, type: 'radio', checked: min === m, click: () => { state.holdMinutes = m; saveState(); if (holdActive()) setHold({}); else buildTrayMenu(); } })) },
  ];
}

// ---------- custom modes: work N min → break M min → … × rounds (runs on top of the hold) ----------
let routine = null; // { def, phase: 'work'|'rest', round, until }
const MINUTE = Number(process.env.DUMBO_TEST_MINUTE) || 60e3; // tests: shorter minutes
let routineTimer = null;
const routineDefs = () => (Array.isArray(settings().routines) ? settings().routines : []);
const phaseKind = k => (k === 'stretch' ? 'exercise' : HOLD_KINDS.some(h => h[0] === k) ? k : 'free');
function routineInfo() {
  if (!routine) return null;
  const d = routine.def;
  return { id: d.id, name: d.name, phase: routine.phase, round: routine.round, rounds: Number(d.rounds) || 1, work: d.work, rest: d.rest, min: Number(routine.phase === 'work' ? d.workMin : d.restMin) || 1, until: routine.until };
}
function armRoutine() { clearTimeout(routineTimer); routineTimer = setTimeout(nextPhase, Math.max(0, routine.until - Date.now())); clearInterval(holdTick); holdTick = setInterval(() => tray && buildTrayMenu(), 60e3); }
function enterPhase(phase, event) {
  const d = routine.def, min = Math.max(1, Number(phase === 'work' ? d.workMin : d.restMin) || 1);
  routine.phase = phase; routine.until = Date.now() + min * MINUTE;
  hold = { pin: hold.pin, kind: phaseKind(phase === 'work' ? d.work : d.rest), until: routine.until };
  state.hold = hold; state.routine = { id: d.id, def: d, phase, round: routine.round, until: routine.until }; saveState();
  clearTimeout(holdTimer); armRoutine();
  sendPet('hold', { ...hold, reason: 'routine', event, routine: routineInfo() });
  if (tray) buildTrayMenu();
}
function nextPhase() {
  if (!routine) return;
  const d = routine.def;
  if (routine.phase === 'work' && Number(d.restMin) > 0) return enterPhase('rest', 'rest');
  if (routine.round >= (Number(d.rounds) || 1)) return stopRoutine('done');
  routine.round++;
  enterPhase('work', 'work');
}
function startRoutine(id) {
  const def = routineDefs().find(r => r.id === id);
  if (!def) return;
  if (!alive() || !pet.isVisible()) togglePet();
  routine = { def: { ...def }, round: 1 };
  enterPhase('work', 'start');
}
/** Forget the mode (no hold change). */
function endRoutine() { routine = null; clearTimeout(routineTimer); routineTimer = null; delete state.routine; }
function stopRoutine(event = 'stopped') {
  if (!routine) return;
  const info = routineInfo();
  endRoutine();
  hold = { pin: hold.pin, kind: 'free', until: 0 }; state.hold = hold; saveState(); armHoldTimer();
  sendPet('hold', { ...hold, reason: 'routine', event, routine: info });
  if (tray) buildTrayMenu();
}
/** After a restart (sleep, update): carry on with the mode if its phase isn't over yet. */
function resumeRoutine() {
  const r = state.routine;
  if (!r || !r.def || !(r.until > Date.now())) { if (r) { delete state.routine; saveState(); } return false; }
  routine = { def: r.def, phase: r.phase, round: r.round, until: r.until };
  armRoutine();
  return true;
}

// ---------- meeting manners: quiet while the camera or microphone is in use, or a full-screen app is in front ----------
// Windows keeps "which app last used the camera / mic, and is it still using it" under CapabilityAccessManager.
// Only a yes/no is kept here: no app names are stored or sent anywhere.
let quiet = false, quietWhy = '', quietTimer = null;
const CAP = k => `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\${k}`;
function deviceInUse(kind) {
  return new Promise(res => execFile('reg.exe', ['query', CAP(kind), '/s'], { windowsHide: true, timeout: 8000 }, (err, out) => {
    if (err) return res(false);
    let start = '0', stop = '', busy = false;
    const flush = () => { if (stop === '0' && start !== '0') busy = true; start = '0'; stop = ''; };
    for (const line of String(out).split(/\r?\n/)) {
      if (/^HKEY_/.test(line)) { flush(); continue; }
      const m = /^\s+LastUsedTime(Start|Stop)\s+REG_QWORD\s+0x([0-9a-f]+)/i.exec(line);
      if (m) { if (m[1] === 'Start') start = m[2]; else stop = m[2]; }
    }
    flush();
    res(busy);
  }));
}
async function fullscreenApp() {
  if (LOW_MEM) return false; // no window watcher in low memory mode
  const r = await winWatch.foreground();
  if (!r.name || r.pid === process.pid || /^(Dumbo|electron|explorer|ShellExperienceHost|SearchHost|StartMenuExperienceHost|LockApp)$/i.test(r.name)) return false;
  const d = screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.w, height: r.h }), b = screen.getDisplayMatching(d).bounds;
  return d.x <= b.x + 1 && d.y <= b.y + 1 && d.x + d.width >= b.x + b.width - 1 && d.y + d.height >= b.y + b.height - 1;
}
async function checkQuiet() {
  let why = '';
  if (process.env.DUMBO_TEST_QUIET) why = 'test';
  else if (IS_WIN && settings().quietInMeetings) {
    const [cam, mic] = await Promise.all([deviceInUse('webcam'), deviceInUse('microphone')]);
    why = cam ? 'camera' : mic ? 'microphone' : (await fullscreenApp()) ? 'fullscreen' : '';
  }
  if (!!why !== quiet || why !== quietWhy) { quiet = !!why; quietWhy = why; console.log('[host] quiet', quiet, why); sendPet('quiet', { on: quiet, why }); }
}
function startQuietWatch() { clearInterval(quietTimer); quietTimer = setInterval(() => checkQuiet().catch(() => {}), 15000); checkQuiet().catch(() => {}); }

// ---------- updates (electron/updater.cjs) ----------
const PKG = (() => { try { return require(path.join(ROOT, 'package.json')); } catch { return {}; } })();
const updater = new Updater({ repo: PKG.updates?.repo || '', current: APP_VERSION, running: BOOT.overlay, currentFile: BOOT.currentFile || path.join(STATE_DIR, 'updates', 'current.json'), onChange: onUpdateStatus });
let announced = '';
function onUpdateStatus(u) {
  const name = settings().name;
  const line =
    u.state === 'ready' && (u.manual || announced !== u.version) ? `I learned new tricks! Restart me from the tray to get v${u.version}` :
    u.state === 'reinstall' && (u.manual || announced !== u.version) ? `${name} v${u.version} is out! It needs a fresh download (tray menu).` :
    u.manual && u.state === 'latest' ? `I'm all up to date! (v${APP_VERSION})` :
    u.manual && u.state === 'checking' ? 'checking for updates…' :
    u.manual && u.state === 'error' ? "couldn't reach the update shelf. later!" :
    u.manual && u.state === 'off' ? 'updates are not set up in this copy' : '';
  if (u.version) announced = u.version;
  if (line) sendPet('say', line);
  if (u.state === 'error') console.error('[update]', u.error);
  if (tray) buildTrayMenu();
}
function updateMenu() {
  const u = updater.status;
  const items = [{ label: `${settings().name} v${APP_VERSION}`, enabled: false }];
  if (u.state === 'ready') items.push({ label: `Restart to update (v${u.version})`, click: () => { app.relaunch(); app.quit(); } });
  else if (u.state === 'reinstall') items.push({ label: `Download v${u.version}…`, click: () => shell.openExternal(updater.releasesPage) });
  else items.push({ label: u.state === 'checking' ? 'Checking for updates…' : 'Check for updates', enabled: updater.enabled && u.state !== 'checking', click: () => updater.check(true) });
  return items;
}

function trayImage() {
  if (!IS_MAC) return nativeImage.createFromPath(ICON);
  // Menu bar: 16 pt, from the 32 px head icon as the Retina (2x) image.
  const img = nativeImage.createEmpty();
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'tray.png'));
  img.addRepresentation({ scaleFactor: 2, buffer: png });
  img.addRepresentation({ scaleFactor: 1, buffer: nativeImage.createFromBuffer(png).resize({ width: 16, height: 16, quality: 'best' }).toPNG() });
  return img;
}

function togglePet() {
  if (!alive()) return;
  if (pet.isVisible()) pet.hide(); else pet.showInactive();
  buildTrayMenu();
}

// ---------- IPC ----------
ipcMain.handle('state:get', e => ({ settings: settings(), hasBattery, platform: process.platform, hold: { ...hold, reason: 'restore', routine: routineInfo() }, quiet: { on: quiet, why: quietWhy }, wokeUp: WOKE && alive() && e.sender === pet.webContents }));
ipcMain.handle('settings:get', () => settings());
ipcMain.on('settings:set', (_e, next) => applySettings(next));
ipcMain.on('log', (_e, msg) => console.log('[pet]', msg));
ipcMain.on('mouse:ignore', (_e, ignore) => { if (alive() && !process.env.DUMBO_NOFWD) pet.setIgnoreMouseEvents(ignore, { forward: true }); });
ipcMain.handle('win:info', () => { const b = alive() ? pet.getBounds() : screen.getPrimaryDisplay().workArea; return { bounds: { x: b.x, y: b.y, ...petSize() }, workArea: screen.getDisplayMatching(b).workArea }; });
// Always pass the intended size: reusing getBounds() size on scaled displays (150%) lets rounding
// grow the window a few px on every move.
const moveTo = (x, y) => alive() && pet.setBounds({ x: Math.round(x), y: Math.round(y), ...petSize() });
ipcMain.on('win:move', (_e, x, y) => moveTo(x, y));
ipcMain.on('win:save', () => { if (!alive()) return; const b = pet.getBounds(); state.pos = { x: b.x, y: b.y }; saveState(); });
ipcMain.on('open:settings', openSettings);
ipcMain.on('routine:start', (_e, id) => startRoutine(String(id)));
ipcMain.on('routine:stop', () => stopRoutine('stopped'));
// Settings page ▶ buttons: play one action now.
ipcMain.on('try', (_e, id) => { if (!alive()) return; if (!pet.isVisible()) { pet.showInactive(); buildTrayMenu(); } sendPet('try', id); });

// Foreground app (name + rect in DIPs). Never titles or content. Our own windows are ignored.
const winWatch = new WinWatch();
ipcMain.handle('fg:get', async () => {
  // Our own settings window counts as "your window" while it's in front: that's what the ▶ buttons
  // for window actions use (and it works on macOS too). The pet window itself never does.
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible() && settingsWin.isFocused() && !settingsWin.isMinimized()) {
    const b = settingsWin.getBounds();
    return { name: 'Dumbo settings', x: b.x, y: b.y, w: b.width, h: b.height, max: settingsWin.isMaximized() || settingsWin.isFullScreen() };
  }
  if (!IS_WIN || LOW_MEM) return null; // low memory: no window watcher process (~tens of MB). macOS: window visits / app reactions not built yet (need the Accessibility permission)
  const r = await winWatch.foreground();
  if (!r.name || r.pid === process.pid || /^(Dumbo|electron)$/i.test(r.name)) return null;
  const d = screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.w, height: r.h });
  return { name: r.name, x: d.x, y: d.y, w: d.width, h: d.height, max: !!r.max };
});
// Seconds since the last keyboard/mouse input anywhere (no key logging — just a timestamp from Windows).
ipcMain.handle('idle:get', () => powerMonitor.getSystemIdleTime());

// Drag: renderer reports grab offset; we follow the cursor until it says stop.
let dragTimer = null;
ipcMain.on('drag:start', (_e, ox, oy) => {
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!alive()) return;
    const c = screen.getCursorScreenPoint();
    moveTo(c.x - ox, c.y - oy);
  }, 16);
});
ipcMain.on('drag:end', () => { clearInterval(dragTimer); dragTimer = null; });

// Grab fallback. The pet window lets clicks through except over Dumbo, and the renderer only learns the
// cursor is over him from forwarded mouse moves. Those don't come when he moves under a still cursor
// (walking, falling, peeking) or when Windows drops the forward hook, so he couldn't be grabbed.
// While the cursor is inside his window, send its position so the renderer re-checks. Cheap: no redraw.
let hoverTimer = null, hoverInside = false;
function startHoverPoll() {
  clearInterval(hoverTimer);
  hoverTimer = setInterval(() => {
    if (!alive() || !pet.isVisible() || dragTimer) return;
    const c = screen.getCursorScreenPoint(), b = pet.getBounds();
    const inside = c.x >= b.x && c.y >= b.y && c.x < b.x + b.width && c.y < b.y + b.height;
    if (inside || hoverInside) sendPet('hover', inside ? { x: c.x - b.x, y: c.y - b.y } : null);
    hoverInside = inside;
  }, 200);
}

function stopTimers() {
  for (const t of [dragTimer, hoverTimer, trackTimer, holdTick, quietTimer]) clearInterval(t);
  clearTimeout(holdTimer); clearTimeout(routineTimer);
  dragTimer = hoverTimer = trackTimer = holdTick = holdTimer = null;
}

// After sleep/resume, unlock or a display change Windows can leave his window click-through for good
// (the mouse-forwarding hook and topmost state don't always survive). Re-apply both and tell the
// renderer to forget what it thought, so the next hover check turns grabbing back on.
function resyncPet(why) {
  if (!alive()) return;
  console.log('[host] resync after', why);
  rescueIfLost();
  pet.setAlwaysOnTop(true, 'floating');
  if (!process.env.DUMBO_NOFWD) { pet.setIgnoreMouseEvents(false); pet.setIgnoreMouseEvents(true, { forward: true }); }
  clearInterval(dragTimer); dragTimer = null;
  if (pet.webContents.isCrashed()) pet.reload();
  else sendPet('mouse:reset');
  if (pet.isVisible()) startHoverPoll();
}
// After sleep, Windows can leave his window unable to receive mouse presses (seen on the owner's laptop:
// the release arrives, the press never does; reloading the page or re-showing the window didn't help,
// a fresh process did). So on wake he restarts himself, a couple of seconds later, and says hello again.
let restarting = false;
function restartAfterSleep() {
  if (restarting) return;
  if (DEV_URL || process.env.DUMBO_NO_WAKE_RESTART) { resyncSoon('resume'); return; } // dev (vite hot reload): no relaunch
  restarting = true;
  console.log('[host] woke from sleep: restarting for a fresh window');
  setTimeout(() => { state.helloAgain = true; saveState(); app.relaunch(); app.quit(); }, 2500);
}
function resyncSoon(why) { resyncPet(why); setTimeout(() => resyncPet(why + ' (again)'), 3000); } // displays settle late

// Cursor tracking for "looks at you": only runs while the renderer asks for it, ~4 Hz, sends only on change.
let trackTimer = null, lastCursor = '';
ipcMain.on('track', (_e, on, ms) => {
  clearInterval(trackTimer); trackTimer = null;
  if (!on) return;
  trackTimer = setInterval(() => {
    if (!alive()) return;
    const c = screen.getCursorScreenPoint(), b = pet.getBounds();
    const key = `${c.x},${c.y},${b.x},${b.y}`;
    if (key === lastCursor) return;
    lastCursor = key;
    sendPet('cursor', { x: c.x - b.x, y: c.y - b.y, w: b.width, h: b.height });
  }, Math.max(100, Number(ms) || 250)); // 1 s in battery saver
});

// Does this machine have a battery? (desktop PCs: no battery reactions)
let hasBattery = false;
function detectBattery() {
  if (IS_MAC) {
    execFile('/usr/bin/pmset', ['-g', 'batt'], { timeout: 15000 }, (err, out) => {
      hasBattery = !err && /InternalBattery/.test(String(out));
      sendPet('battery:present', hasBattery);
    });
    return;
  }
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Battery | Measure-Object).Count'], { windowsHide: true, timeout: 15000 }, (err, out) => {
    hasBattery = !err && parseInt(String(out).trim(), 10) > 0;
    sendPet('battery:present', hasBattery);
  });
}

app.whenReady().then(() => {
  detectBattery();
  createPet();
  if (IS_MAC) app.dock?.hide(); // menu-bar pet: no Dock icon (also LSUIElement in the built app)
  tray = new Tray(trayImage());
  tray.setToolTip(settings().name);
  if (!IS_MAC) tray.on('click', togglePet); // macOS: a click opens the menu, as menu-bar apps do
  buildTrayMenu();
  if (!DEV_URL) updater.start(settings().autoUpdate);
  if (!resumeRoutine()) armHoldTimer();
  startQuietWatch();
  setAutostart(settings().startWithWindows); // always reconcile: repairs or removes stale entries from older installs
  // Installer build (electron-builder NSIS) makes and removes its own shortcuts; only the portable copy makes them itself.
  const INSTALLED = fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Dumbo.exe'));
  if (IS_WIN && SELF_CONTAINED && !INSTALLED && !DEV_URL && state.shortcutsFor !== process.execPath) {
    if (createShortcuts()) { state.shortcutsFor = process.execPath; saveState(); }
  }
  // Boot report next to the app, so problems can be diagnosed without the console.
  try {
    const li = IS_MAC ? app.getLoginItemSettings() : app.getLoginItemSettings({ path: process.execPath, args: LAUNCH_ARGS });
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(STATE_DIR, 'boot.json'), JSON.stringify({ at: new Date().toISOString(), exe: process.execPath, app: path.resolve(ROOT), selfContained: SELF_CONTAINED, version: APP_VERSION, shippedVersion: app.getVersion(), update: BOOT.overlay, platform: process.platform, lowMemory: LOW_MEM, wokeUp: WOKE, dev: !!DEV_URL, startWithWindows: settings().startWithWindows, loginItem: { openAtLogin: li.openAtLogin, executableWillLaunchAtLogin: li.executableWillLaunchAtLogin, launchItems: li.launchItems } }, null, 2));
  } catch (e) { console.error(e); }
});
app.on('second-instance', () => { if (alive()) { pet.showInactive(); rescueIfLost(); buildTrayMenu(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', stopTimers);
app.on('will-quit', () => { stopTimers(); winWatch.stop(); updater.stop(); });
app.whenReady().then(() => {
  powerMonitor.on('resume', restartAfterSleep);
  powerMonitor.on('unlock-screen', () => resyncSoon('unlock-screen'));
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, () => resyncSoon(ev));
  app.on('child-process-gone', (_e, d) => { if (d.type === 'GPU') setTimeout(() => resyncPet('graphics reset'), 1500); });
  if (process.env.DUMBO_TEST_RESUME && !WOKE) setTimeout(() => powerMonitor.emit('resume'), Number(process.env.DUMBO_TEST_RESUME)); // once, not again after the restart
  if (process.env.DUMBO_TEST_QUIT) setTimeout(() => app.quit(), Number(process.env.DUMBO_TEST_QUIT));
  if (process.env.DUMBO_TEST_ROUTINE) setTimeout(() => startRoutine(process.env.DUMBO_TEST_ROUTINE), 8000);
});
