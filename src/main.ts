import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalPosition, PhysicalPosition } from '@tauri-apps/api/window';
import type { Theme } from './art/dumbo.js';
import { Animator } from './engine/animator';
import { clips, STAND, SIT, ASLEEP } from './engine/clips';

// ---------- diagnostics: page errors → terminal ----------
const log = (msg: string) => invoke('log', { msg }).catch(() => {});
window.addEventListener('error', e => log(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', e => log(`unhandled: ${String(e.reason)}`));

// ---------- persisted state ----------
type ThemePref = 'auto' | Theme;
interface Saved { x?: number; y?: number; theme?: ThemePref; name?: string }
let saved: Saved = {};
const persist = () => invoke('save_state', { json: JSON.stringify(saved) }).catch(() => {});

// ---------- setup ----------
const win = getCurrentWindow();
const petEl = document.getElementById('pet')!;
const breathEl = document.getElementById('breath')!;
const anim = new Animator(document.getElementById('art')!);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: Array<[T, number]>): T => {
  let r = Math.random() * xs.reduce((s, x) => s + x[1], 0);
  for (const [v, w] of xs) if ((r -= w) <= 0) return v;
  return xs[0][0];
};

// ---------- theme: follow Windows unless overridden from tray ----------
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => {
  const pref = saved.theme ?? 'auto';
  anim.setTheme(pref === 'auto' ? (darkMq.matches ? 'dark' : 'light') : pref);
};
darkMq.addEventListener('change', applyTheme);

// ---------- behaviour state machine ----------
type Mode = 'idle' | 'sitting' | 'walking' | 'sleeping' | 'busy' | 'held';
let mode: Mode = 'idle';
let decideTimer = 0;
let blinkTimer = 0;
let awakeSince = Date.now();
let facing: 1 | -1 = 1;

/** Finish a busy step only if nothing (e.g. a drag) took over meanwhile. */
const settle = (m: Mode) => { if (mode === 'busy') mode = m; };
const schedule = (ms: number) => { clearTimeout(decideTimer); decideTimer = window.setTimeout(decide, ms); };
const restPose = () => (mode === 'sitting' ? SIT : mode === 'sleeping' ? ASLEEP : STAND);

function scheduleBlink() {
  clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(async () => {
    if ((mode === 'idle' || mode === 'sitting') && !anim.busy) await anim.play(clips.blink(restPose()));
    scheduleBlink();
  }, rand(2500, 6500));
}

/** Pick the next thing to do. Dumbo mostly sleeps; when awake he potters around. */
async function decide() {
  if (mode === 'held' || mode === 'busy' || mode === 'walking') return;
  if (mode === 'sleeping') { await wake(); return schedule(rand(4000, 9000)); }

  const awakeFor = Date.now() - awakeSince;
  const sleepy = awakeFor > rand(90_000, 240_000);
  const next = sleepy ? 'sleep' : pick<string>([
    ['walk', 4], ['earflap', 2], ['wave', 1.5], [mode === 'sitting' ? 'stand' : 'sit', 2], ['nothing', 3],
  ]);

  switch (next) {
    case 'sleep': return sleep();
    case 'walk': await walk(rand(2500, 7000)); break;
    case 'earflap': await act(clips.earflap()); break;
    case 'wave': await act(clips.wave()); break;
    case 'sit': mode = 'busy'; await anim.play(clips.sitDown()); settle('sitting'); break;
    case 'stand': mode = 'busy'; await anim.play(clips.standUp()); settle('idle'); break;
  }
  schedule(rand(5000, 14000));
}

/** Play a one-off action from standing, then return to idle. */
async function act(clip: ReturnType<typeof clips.wave>) {
  if (mode === 'sitting') { mode = 'busy'; await anim.play(clips.standUp()); }
  mode = 'busy';
  await anim.play(clip);
  settle('idle');
}

async function sleep() {
  if (mode === 'sitting') anim.set(SIT);
  mode = 'busy';
  await anim.play(clips.fallAsleep());
  if (mode !== 'busy') return; // interrupted (e.g. picked up)
  mode = 'sleeping';
  breathEl.classList.add('sleep');
  schedule(rand(300_000, 900_000)); // nap 5–15 min
}

async function wake() {
  breathEl.classList.remove('sleep');
  mode = 'busy';
  await anim.play(clips.wakeUp());
  settle('idle');
  awakeSince = Date.now();
}

// ---------- walking: moves the real window along the screen ----------
let walkStop: (() => void) | null = null;
async function walk(ms: number) {
  if (mode === 'sitting') { mode = 'busy'; await anim.play(clips.standUp()); }
  mode = 'walking';
  const scale = await win.scaleFactor();
  const pos = await win.outerPosition();
  const maxX = (screen.availWidth - window.innerWidth) * scale;
  if (pos.x <= 10) facing = 1; else if (pos.x >= maxX - 10) facing = -1; else if (Math.random() < 0.5) facing = facing === 1 ? -1 : 1;
  petEl.classList.toggle('left', facing === -1);

  const speed = 38 * scale; // px per second
  let x = pos.x;
  let last = performance.now();
  anim.play(clips.walk());
  await new Promise<void>(resolve => {
    const iv = window.setInterval(() => {
      const now = performance.now();
      x += facing * speed * (now - last) / 1000;
      last = now;
      if (x <= 0 || x >= maxX) { x = Math.max(0, Math.min(maxX, x)); end(); }
      win.setPosition(new PhysicalPosition(Math.round(x), pos.y));
    }, 50);
    const to = window.setTimeout(end, ms);
    function end() { clearInterval(iv); clearTimeout(to); walkStop = null; resolve(); }
    walkStop = end;
  });
  if (mode !== 'walking') return;
  mode = 'busy';
  await anim.play(clips.toStand());
  settle('idle');
  savePosition();
}

async function savePosition() {
  const p = await win.outerPosition();
  saved.x = p.x; saved.y = p.y;
  persist();
}

// ---------- interactions: click, drag (scruff), petting, tickling ----------
let down: { x: number; y: number } | null = null;
let dragging = false;
let moveEndTimer = 0;
const recentX: Array<{ x: number; t: number }> = [];
let hoverStart = 0;
let reactCooldown = 0;

petEl.addEventListener('mousedown', e => { if (e.button === 0) down = { x: e.screenX, y: e.screenY }; });

petEl.addEventListener('mousemove', e => {
  if (down && (e.buttons & 1) && !dragging && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
    startDrag();
    return;
  }
  if (e.buttons) return;
  // Petting = slow hover; tickling = fast back-and-forth rubbing.
  const now = performance.now();
  recentX.push({ x: e.screenX, t: now });
  while (recentX.length && now - recentX[0].t > 700) recentX.shift();
  if (!hoverStart) hoverStart = now;
  if (now < reactCooldown || mode === 'held' || mode === 'busy' || mode === 'walking') return;
  let flips = 0;
  for (let i = 2; i < recentX.length; i++) {
    const a = recentX[i - 1].x - recentX[i - 2].x, b = recentX[i].x - recentX[i - 1].x;
    if (a * b < 0 && Math.abs(b) > 2) flips++;
  }
  if (flips >= 5 && mode !== 'sleeping') { reactCooldown = now + 4000; react(clips.tickled()); }
  else if (now - hoverStart > 1600 && mode !== 'sleeping') { reactCooldown = now + 6000; hoverStart = 0; react(clips.petted()); }
});
petEl.addEventListener('mouseleave', () => { hoverStart = 0; recentX.length = 0; });

petEl.addEventListener('mouseup', e => {
  if (e.button !== 0 || !down || dragging) return;
  down = null;
  if (mode === 'sleeping') { wake().then(() => schedule(rand(4000, 9000))); return; }
  if (mode === 'idle' || mode === 'sitting') react(clips.happyBounce());
});

async function react(clip: ReturnType<typeof clips.wave>) {
  const wasSitting = mode === 'sitting';
  mode = 'busy';
  await anim.play(clip);
  if (mode !== 'busy') return;
  mode = 'idle';
  if (wasSitting) anim.set(STAND);
  schedule(rand(5000, 12000));
}

async function startDrag() {
  dragging = true;
  const grumpy = mode === 'sleeping' || mode === 'busy' || mode === 'walking';
  walkStop?.();
  clearTimeout(decideTimer);
  breathEl.classList.remove('sleep');
  breathEl.classList.add('still');
  mode = 'held';
  anim.play(clips.dangle(grumpy));
  await win.startDragging();
}

// The OS owns the drag loop, so we detect "dropped" as "window stopped moving".
win.onMoved(() => {
  if (!dragging) return;
  clearTimeout(moveEndTimer);
  moveEndTimer = window.setTimeout(endDrag, 280);
});

async function endDrag() {
  if (!dragging) return;
  dragging = false;
  down = null;
  breathEl.classList.remove('still');
  mode = 'busy';
  await anim.play(clips.toStand());
  settle('idle');
  awakeSince = Date.now();
  savePosition();
  schedule(rand(4000, 9000));
}
// If the user clicks without moving after startDragging, release on mouseup too.
window.addEventListener('mouseup', () => { if (dragging) { clearTimeout(moveEndTimer); moveEndTimer = window.setTimeout(endDrag, 120); } });

// ---------- tray events ----------
listen<string>('theme', e => { saved.theme = e.payload as ThemePref; applyTheme(); persist(); });
listen<string>('action', async e => {
  if (e.payload === 'sleep' && mode !== 'sleeping' && mode !== 'held') { walkStop?.(); anim.stop(); clearTimeout(decideTimer); sleep(); }
  if (e.payload === 'wake' && mode === 'sleeping') { await wake(); schedule(rand(4000, 9000)); }
});

// ---------- boot ----------
async function boot() {
  try { saved = JSON.parse((await invoke<string | null>('load_state')) ?? '{}') ?? {}; } catch { saved = {}; }
  applyTheme();
  anim.set(STAND);

  if (saved.x !== undefined && saved.y !== undefined) {
    await win.setPosition(new PhysicalPosition(saved.x, saved.y));
  } else {
    // Bottom-right, feet resting on the taskbar.
    await win.setPosition(new LogicalPosition(screen.availWidth - window.innerWidth - 40, screen.availHeight - window.innerHeight));
  }
  await win.show();
  await anim.play(clips.earflap()); // hello!
  scheduleBlink();
  schedule(rand(6000, 12000));
}
boot().then(() => log("boot ok")).catch(e => log(`boot failed: ${e}`));
