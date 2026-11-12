// Narrow, explicit bridge between the pet/settings pages and the host process.
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => { const h = (_e, v) => cb(v); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };

const benchArg = process.argv.find(a => a.startsWith('--dumbo-bench='));

contextBridge.exposeInMainWorld('host', {
  bench: benchArg ? benchArg.split('=')[1] : null,
  getState: () => ipcRenderer.invoke('state:get'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.send('settings:set', s),
  log: (m) => ipcRenderer.send('log', String(m)),
  ignoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', !!ignore),
  winInfo: () => ipcRenderer.invoke('win:info'),
  move: (x, y) => ipcRenderer.send('win:move', x, y),
  savePos: () => ipcRenderer.send('win:save'),
  dragStart: (ox, oy) => ipcRenderer.send('drag:start', ox, oy),
  dragEnd: () => ipcRenderer.send('drag:end'),
  track: (on) => ipcRenderer.send('track', !!on),
  openSettings: () => ipcRenderer.send('open:settings'),
  foreground: () => ipcRenderer.invoke('fg:get'),
  idleSeconds: () => ipcRenderer.invoke('idle:get'),
  onCursor: on('cursor'),
  onAction: on('action'),
  onSettings: on('settings'),
  onBatteryPresent: on('battery:present'),
  onSay: on('say'),
  onHold: on('hold'),
  tryAction: (id) => ipcRenderer.send('try', String(id)),
  onTry: on('try'),
});
