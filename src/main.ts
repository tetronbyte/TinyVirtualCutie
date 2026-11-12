import type { Theme } from './art/dumbo.js';
import { Animator, FRONT_REST, type FrontState } from './engine/animator';
import { clips, STAND, SIT } from './engine/clips';
import { host, type Settings, type Cursor, type Foreground, type ReactionAction } from './host';

// ======================================================================
//  Dumbo's brain. Event-driven: timers + input events, no polling loops.
// ======================================================================

window.addEventListener('error', e => host.log(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', e => host.log(`unhandled: ${String(e.reason)}`));

const stage = document.getElementById('stage')!;
const art = document.getElementById('art')!;
const bubbleEl = document.getElementById('bubble')!;
const anim = new Animator(art);

let S: Settings;
let hasBattery = false;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const chance = (p: number) => Math.random() < p;
const pickW = <T>(xs: Array<[T, number]>): T => {
  let r = Math.random() * xs.reduce((s, x) => s + x[1], 0);
  for (const [v, w] of xs) if ((r -= w) <= 0) return v;
  return xs[0][0];
};
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------- theme ----------
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const theme: Theme = S.theme === 'auto' ? (darkMq.matches ? 'dark' : 'light') : S.theme;
  anim.setTheme(theme);
  document.body.classList.toggle('dark', theme === 'dark');
}
darkMq.addEventListener('change', () => S && applyTheme());

// ---------- speech bubble ----------
let bubbleTimer = 0;
function say(text: string, ms = 3200) {
  bubbleEl.textContent = text;
  bubbleEl.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => bubbleEl.classList.remove('show'), ms);
}
const LINES = {
  hello: () => [`hi! I'm ${S.name}`, 'hello hello!', 'hiii 👋'],
  wake: ['*yawn*', 'mm… morning?', '5 more minutes…'],
  petted: ['hehe', 'more pls 🥰', 'mmm nice'],
  tickled: ['hehehe stop!', 'ahaha!', 'tickles!!'],
  click: ['hi!', 'boop!', 'hehe', '?'],
  pout: ['hmph!', 'I was busy…', 'put me down!'],
  happyDrop: ['wheee!', 'again again!'],
  coding: ['tap tap tap', 'shipping it 🚀', 'one more bug…'],
  exercise: ['1… 2… 3…', 'getting strong!', 'huff puff'],
  trip: ['oops…', 'I meant to do that'],
  lowBattery: ['charge me pls 🥺', 'so… sleepy… need power', 'battery low…'],
  charged: ['yay, power!', 'zoom zoom!', 'thank youuu ⚡'],
  full: ["unplug me, I'm full! 💪", 'all charged! unplug pls'],
  perch: ['nice view up here', 'my window now', 'wheee up!'],
  nibble: ['nom nom', 'tastes like pixels', '*crunch*'],
  peek: ["what's in here?", 'ooh', 'sniff sniff'],
  push: ['hnnngh!', "it won't budge…", 'so heavy…'],
  stretch: ["let's stretch! 🙆", 'break time! move with me', 'stretchy time!'],
  stretchDone: ['your turn! 🙆', 'feels good right?'],
  welcome: ['welcome back!', "you're back! 🥰", 'missed you'],
};
const appName = (n: string) => n.replace(/\.exe$/i, '').replace(/^\w/, c => c.toUpperCase());
const REACT_LINES: Record<ReactionAction, (a: string) => string[]> = {
  coding: a => [`${a}! let's code 💻`, 'coding time!', "I'll code too!"],
  dance: a => [`${a}! 🎶`, 'music!! 🎵', 'dance time!'],
  wave: a => [`hi ${a} friends! 👋`, 'say hi from me!'],
  exercise: () => ['workout time! 💪'],
  run: () => ['zoom zoom!'],
  none: () => [],
};

// ---------- modes ----------
// front: sitting, facing you (idle home state) · side: doing a side-view action
// sleep: napping · held: being dragged · busy: transition/one-off
type Mode = 'front' | 'side' | 'sleep' | 'held' | 'busy';
let mode: Mode = 'busy';
let sleepStyle: 'doze' | 'curl' = 'doze';
let facingLeft = false;
let decideTimer = 0, blinkTimer = 0, exprTimer = 0;
let awakeSince = Date.now();
let lastInteraction = Date.now();

const schedule = (ms: number) => { clearTimeout(decideTimer); decideTimer = window.setTimeout(decide, ms); };
function setFacing(left: boolean) { facingLeft = left; stage.classList.toggle('left', left); }

/** Make sure we are sitting and facing the user. */
async function toFront(expr = 'smile') {
  if (anim.view === 'side') {
    if (anim.side.base !== 'sit') await anim.play(clips.sitDown());
  }
  anim.setFront({ ...FRONT_REST, expr, shadow: !perch });
  mode = 'front';
  host.track(true);
  scheduleBlink();
  idleExprLater();
}

/** Switch to the side view, standing (or sitting) and ready for an action. */
async function toSide(stand = true) {
  host.track(false);
  clearTimeout(exprTimer);
  if (anim.view === 'front') anim.setSide(SIT);
  if (stand && anim.side.base === 'sit') await anim.play(clips.standUp());
}

// ---------- the eyes: looking at you ----------
let gazeTarget: Partial<FrontState> | null = null;
host.onCursor(c => lookAt(c));

function lookAt(c: Cursor) {
  if (mode !== 'front') return;
  // Head centre of the 3/4 view inside the window (stage = bottom-centre 50% × 52.7%).
  const hx = c.w / 2, hy = c.h - c.h * 0.527 * 0.62;
  let dx = c.x - hx;
  const dy = c.y - hy;
  // Turn the whole body toward the side you're on (with hysteresis).
  if (!facingLeft && dx < -c.w * 0.9) setFacing(true);
  else if (facingLeft && dx > c.w * 0.9) setFacing(false);
  if (facingLeft) dx = -dx;
  const dist = Math.hypot(dx, dy);
  const nx = dx / Math.max(dist, 1), ny = dy / Math.max(dist, 1);
  const reach = clamp(dist / 120, 0, 1); // far away = full eye travel
  gazeTarget = {
    gaze: [nx * 13 * reach, ny * 9 * reach],
    tilt: clamp(dx / 60, -7, 7),
    head: [clamp(dx / 40, -6, 6), clamp(dy / 60, -4, 5)],
  };
  // Very close and moving = curious.
  if (dist < c.h * 0.45 && anim.front.expr === 'neutral' && !anim.busy) setExpr('curious', 2500);
  // Eyes jump (saccade) in a single redraw instead of gliding: every drawn frame costs CPU.
  const g = anim.front.gaze, moved = Math.abs(g[0] - gazeTarget.gaze![0]) + Math.abs(g[1] - gazeTarget.gaze![1]);
  if (!anim.busy && moved > 2.5) anim.setFront(gazeTarget);
}

function scheduleBlink() {
  clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(async () => {
    if (mode === 'front' && !anim.busy) await anim.face([{ s: { blink: 1 }, ms: 70 }, { s: { blink: 1 }, ms: 50 }, { s: { blink: 0 }, ms: 90 }], false, 15);
    if (mode === 'front') scheduleBlink();
  }, rand(2200, 6000) * (chance(0.15) ? 0.1 : 1)); // sometimes a double blink
}

function setExpr(expr: string, ms = 3000) {
  anim.setFront({ expr });
  clearTimeout(exprTimer);
  exprTimer = window.setTimeout(() => { if (mode === 'front' && !anim.busy) { anim.setFront({ expr: baseExpr() }); idleExprLater(); } }, ms);
}
const baseExpr = () => (lowBattery ? 'tired' : 'neutral');

/** Little face changes while idling so he never looks frozen. */
function idleExprLater() {
  clearTimeout(exprTimer);
  exprTimer = window.setTimeout(() => {
    if (mode !== 'front' || anim.busy) return idleExprLater();
    const e = lowBattery ? pick(['tired', 'sad', 'tired']) : pickW<string>([['smile', 4], ['happy', 1.5], ['thinking', 1.5], ['curious', 1], ['neutral', 3]]);
    if (e === 'thinking') anim.setFront({ expr: e, gaze: [4, -7] });
    else anim.setFront({ expr: e });
    setTimeout(() => { if (mode === 'front' && !anim.busy) anim.setFront({ expr: baseExpr() }); }, rand(1800, 4000));
    idleExprLater();
  }, rand(5000, 12000));
}

// ---------- decisions ----------
function isNight() {
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = S.sleepStart.split(':').map(Number), [eh, em] = S.sleepEnd.split(':').map(Number);
  const a = sh * 60 + sm, b = eh * 60 + em;
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

async function decide() {
  if (mode === 'held' || mode === 'busy' || mode === 'side') return schedule(rand(3000, 6000));
  if (mode === 'sleep') {
    if (stretchDue && !isNight()) { await wake(true); return schedule(500); }
    if (isNight()) return schedule(rand(600_000, 1_200_000));
    await wake(false);
    return schedule(rand(6000, 12000));
  }
  const awakeFor = Date.now() - awakeSince;
  const awakeBudget = (isNight() ? 45_000 : rand(90_000, 240_000) * (1.4 - S.sleepiness));
  if (awakeFor > awakeBudget && Date.now() - lastInteraction > 20_000) return sleep();

  if (await batteryCheck()) return schedule(rand(8000, 15000));
  if (await stretchCheck()) return schedule(rand(10_000, 20_000));

  if (perch) {
    // Up on a window: look around, peek over the edge, nibble the corner, then hop down.
    const p = Date.now() - perch.since > perch.stay ? 'down' : pickW<string>([['nothing', 4], ['peek', 2], ['nibble', 1.5], ['stroll', 1.5]]);
    if (p === 'down') await hopDown();
    else if (p === 'peek') { say(pick(LINES.peek), 2200); await perchedAction(clips.peek()); }
    else if (p === 'nibble') await nibbleCorner();
    else if (p === 'stroll') await walk(rand(2000, 5000), 30);
    return schedule(rand(8000, 18_000));
  }

  if (S.visitWindows && !lowBattery && chance(0.35)) {
    const fg = await getFg();
    if (fg && await canPerch(fg) && chance(0.6)) { await hopOnto(fg); return schedule(rand(8000, 15_000)); }
    if (fg && await canPush(fg) && chance(0.5)) { await pushWindow(fg); return schedule(rand(10_000, 20_000)); }
  }

  const next = lowBattery
    ? pickW<string>([['nothing', 6], ['walk', 1]])
    : pickW<string>([['nothing', 6], ['walk', 3], ['earflap', 1.5], ['wave', 1], ['coding', 1.6], ['pushups', .7], ['rope', .7]]);
  switch (next) {
    case 'walk': await walk(rand(3000, 8000)); break;
    case 'earflap': await frontEarFlap(); break;
    case 'wave': await sideAction(clips.wave()); break;
    case 'coding': say(pick(LINES.coding)); await sideAction(clips.coding(1 + Math.floor(rand(0, 3))), false); break;
    case 'pushups': say(pick(LINES.exercise)); await sideAction(clips.pushups(4 + Math.floor(rand(0, 4)))); break;
    case 'rope': say(pick(LINES.exercise)); await sideAction(clips.rope(5 + Math.floor(rand(0, 5)))); break;
  }
  schedule(rand(10_000, 25_000)); // calm pace: every drawn frame costs CPU
}

async function sideAction(clip: ReturnType<typeof clips.wave>, stand = true) {
  mode = 'side';
  await toSide(stand);
  if (mode !== 'side') return;
  await anim.play(clip);
  if (mode !== 'side') return;
  mode = 'busy';
  await toFront('smile');
}

async function frontEarFlap() {
  mode = 'busy';
  anim.setFront({ expr: 'laugh' });
  const flap = [{ s: { earAdd: [22, -22] as [number, number], bounce: 8 }, ms: 160 }, { s: { earAdd: [-6, 6] as [number, number], bounce: 0 }, ms: 160 }];
  await anim.face([...flap, ...flap, ...flap, { s: { earAdd: [0, 0] as [number, number], expr: 'happy' }, ms: 200 }]);
  if (mode !== 'busy') return;
  mode = 'front';
  setExpr('happy', 2000);
}

// ---------- sleep ----------
async function sleep() {
  mode = 'busy';
  host.track(false);
  clearTimeout(exprTimer); clearTimeout(blinkTimer);
  sleepStyle = chance(0.6) ? 'doze' : 'curl';
  if (sleepStyle === 'doze') {
    if (anim.view !== 'front') await toFront('neutral');
    host.track(false);
    await anim.face([{ s: { expr: 'tired', gaze: [0, 3], blink: 0 }, ms: 700 }, { s: { blink: 1 }, ms: 900 }, { s: { blink: .4 }, ms: 500 }, { s: { blink: 1, expr: 'sleeping', tilt: 9, head: [-2, 10], earAdd: [-6, 6] }, ms: 1400 }], false, 10);
  } else {
    await toSide(false);
    await anim.play(clips.curlUp());
  }
  if (mode !== 'busy') return;
  mode = 'sleep';
  schedule(isNight() ? rand(600_000, 1_200_000) : rand(180_000, 600_000) * (0.5 + S.sleepiness));
}

async function wake(byUser: boolean) {
  mode = 'busy';
  if (anim.view === 'side') { await anim.play(clips.uncurl()); }
  anim.setFront({ ...FRONT_REST, expr: 'sleeping' });
  await anim.face([{ s: { expr: 'tired', blink: .5 }, ms: 500 }, { s: { blink: 0, expr: byUser ? 'happy' : 'smile' }, ms: 400 }]);
  if (byUser) say(pick(LINES.wake));
  awakeSince = Date.now();
  mode = 'front';
  await toFront(byUser ? 'happy' : 'smile');
}

// ---------- walking / running along the ground ----------
let walkStop: (() => void) | null = null;
async function walk(ms: number, speed = 36, clip = clips.walk(), targetX?: number, thenFront = true) {
  mode = 'side';
  await toSide(true);
  if (mode !== 'side') return;
  const { bounds, workArea } = await host.winInfo();
  // On the taskbar: whole screen width. Perched: stay on the window's top edge.
  const minX = perch ? perch.x - bounds.width * 0.3 : workArea.x - bounds.width * 0.25;
  const maxX = perch ? perch.x + perch.w - bounds.width * 0.7 : workArea.x + workArea.width - bounds.width * 0.75;
  let x = bounds.x;
  const y = perch ? perchY(bounds) : Math.min(bounds.y, workArea.y + workArea.height - bounds.height);
  const dir = targetX !== undefined ? (targetX > x ? 1 : -1) : x <= minX + 20 ? 1 : x >= maxX - 20 ? -1 : chance(0.5) ? 1 : -1;
  setFacing(dir < 0);
  anim.play(clip);
  let last = performance.now();
  await new Promise<void>(resolve => {
    const iv = window.setInterval(() => {
      const now = performance.now();
      x += dir * speed * (now - last) / 1000;
      last = now;
      if (x <= minX || x >= maxX) { x = clamp(x, minX, maxX); end(); }
      if (targetX !== undefined && (dir > 0 ? x >= targetX : x <= targetX)) { x = targetX; end(); }
      host.move(x, y);
    }, 40);
    const to = window.setTimeout(end, ms);
    function end() { clearInterval(iv); clearTimeout(to); walkStop = null; resolve(); }
    walkStop = end;
  });
  host.savePos();
  if (mode !== 'side') return;
  if (!thenFront) { await anim.play(clips.toStand()); return; }
  if (!lowBattery && !perch && chance(0.12)) { say(pick(LINES.trip)); await anim.play(clips.trip()); }
  else await anim.play(clips.toStand());
  if (mode !== 'side') return;
  mode = 'busy';
  await toFront('smile');
}

// ---------- gravity: dropped mid-air → falls to the taskbar ----------
async function fallToGround() {
  const { bounds, workArea } = await host.winInfo();
  const groundY = perch ? perchY(bounds) : workArea.y + workArea.height - bounds.height;
  if (bounds.y >= groundY - 3) return false;
  // Clamp horizontally inside the screen too.
  const x = clamp(bounds.x, workArea.x - bounds.width * 0.25, workArea.x + workArea.width - bounds.width * 0.75);
  anim.play(clips.fall());
  let y = bounds.y, v = 0, last = performance.now();
  await new Promise<void>(resolve => {
    const iv = window.setInterval(() => {
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      v = Math.min(v + 2600 * dt, 1800);
      y = Math.min(groundY, y + v * dt);
      host.move(x, y);
      if (y >= groundY) { clearInterval(iv); resolve(); }
    }, 16);
  });
  await anim.play(clips.land());
  return true;
}

// ---------- windows: perch on top, peek, nibble, fake-push ----------
/** Foreground app source (swappable by the dev 'perch' scenario test). */
let getFg = () => host.foreground();
interface Perch { name: string; x: number; y: number; w: number; h: number; since: number; stay: number }
let perch: Perch | null = null;
let perchWatch = 0;
/** Window y that puts Dumbo's feet on the perched window's top edge. */
const perchY = (b: { height: number }) => (perch ? perch.y - b.height + 3 : 0);
const sameRect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h) < 6;

async function canPerch(fg: Foreground) {
  const { bounds, workArea } = await host.winInfo();
  return !fg.max && fg.w >= 260 && fg.h >= 120 && fg.y - bounds.height * 0.55 > workArea.y && fg.y < workArea.y + workArea.height - 140
    && fg.x + 60 > workArea.x && fg.x + fg.w - 60 < workArea.x + workArea.width;
}
async function canPush(fg: Foreground) {
  const { workArea } = await host.winInfo();
  // Only windows that come down to the taskbar, so he can lean on their side.
  return !fg.max && fg.y + fg.h > workArea.y + workArea.height - 60 && fg.w < workArea.width - 200;
}

/** Arc the pet window from where it is to (tx, ty), showing the airborne pose. */
async function jumpTo(tx: number, ty: number, ms = 750) {
  const { bounds } = await host.winInfo();
  const x0 = bounds.x, y0 = bounds.y, peak = Math.min(y0, ty) - 70;
  setFacing(tx < x0);
  anim.play(clips.hop());
  const t0 = performance.now();
  await new Promise<void>(resolve => {
    const iv = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const x = x0 + (tx - x0) * t;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * peak + t * t * ty; // quadratic Bézier through the peak
      host.move(x, y);
      if (t >= 1) { clearInterval(iv); resolve(); }
    }, 16);
  });
  await anim.play(clips.land());
}

async function hopOnto(fg: Foreground) {
  mode = 'side';
  await toSide(true);
  if (mode !== 'side') return;
  const { bounds } = await host.winInfo();
  perch = { ...fg, since: Date.now(), stay: rand(40_000, 120_000) };
  const cx = fg.x + rand(80, fg.w - 80);
  await jumpTo(cx - bounds.width / 2, perchY(bounds));
  host.savePos();
  if (mode !== 'side') return;
  say(pick(LINES.perch), 2400);
  mode = 'busy';
  await toFront('happy');
  watchPerch();
}

function watchPerch() {
  clearInterval(perchWatch);
  perchWatch = window.setInterval(async () => {
    if (!perch) return clearInterval(perchWatch);
    if (mode === 'held') return;
    const fg = await getFg();
    // The window moved, resized, maximized, closed or you switched away → he loses his footing.
    if (!fg || fg.name !== perch.name || fg.max || !sameRect(fg, perch)) {
      clearInterval(perchWatch);
      perch = null;
      walkStop?.();
      if (mode === 'sleep') await wake(false);
      mode = 'busy';
      anim.setSide(STAND);
      await fallToGround();
      const e = chance(0.5) ? 'confused' : 'pout';
      await toFront(e);
      setExpr(e, 2500);
      host.savePos();
    }
  }, 2000);
}

async function hopDown() {
  if (!perch) return;
  mode = 'side';
  await toSide(true);
  clearInterval(perchWatch);
  perch = null;
  const { bounds } = await host.winInfo();
  anim.play(clips.hop());
  host.move(bounds.x + (chance(0.5) ? 40 : -40), bounds.y - 30);
  await fallToGround();
  host.savePos();
  mode = 'busy';
  await toFront('smile');
}

async function perchedAction(clip: ReturnType<typeof clips.wave>) {
  mode = 'side';
  await toSide(true);
  if (mode !== 'side') return;
  setFacing(chance(0.5));
  await anim.play(clip);
  if (mode !== 'side') return;
  mode = 'busy';
  await toFront('smile');
}

async function nibbleCorner() {
  if (!perch) return;
  const { bounds } = await host.winInfo();
  const right = chance(0.5);
  const tx = right ? perch.x + perch.w - bounds.width * 0.7 : perch.x - bounds.width * 0.3; // his face reaches the corner
  await walk(15_000, 40, clips.walk(), tx, false);
  if (mode !== 'side' || !perch) return;
  setFacing(!right);
  say(pick(LINES.nibble), 2200);
  await anim.play(clips.nibble());
  if (mode !== 'side') return;
  mode = 'busy';
  await toFront('happy');
}

async function pushWindow(fg: Foreground) {
  const { bounds } = await host.winInfo();
  const fromLeft = bounds.x + bounds.width / 2 < fg.x + fg.w / 2;
  // His nose touches the window's side. The window itself never moves.
  const tx = fromLeft ? fg.x - bounds.width * 0.68 : fg.x + fg.w - bounds.width * 0.32;
  await walk(20_000, 40, clips.walk(), tx, false);
  if (mode !== 'side') return;
  setFacing(!fromLeft);
  say(pick(LINES.push), 2500);
  await anim.play(clips.push(2 + Math.floor(rand(0, 2))));
  if (mode !== 'side') return;
  mode = 'busy';
  await toFront('pout');
  setExpr('pout', 2500);
}

// ---------- apps you open: curious glances + configurable reactions ----------
let lastApp = '';
const reactedAt: Record<string, number> = {};
let appTimer = 0;
function watchApps() {
  clearTimeout(appTimer);
  appTimer = window.setTimeout(async () => {
    if (mode !== 'sleep' && mode !== 'held') {
      const fg = await getFg();
      if (fg && fg.name !== lastApp) { const prev = lastApp; lastApp = fg.name; if (import.meta.env.DEV) host.log(`app: ${fg.name} ${Math.round(fg.x)},${Math.round(fg.y)} ${Math.round(fg.w)}x${Math.round(fg.h)}${fg.max ? ' max' : ''}`); if (prev) await onAppSwitch(fg); }
    }
    watchApps();
  }, mode === 'sleep' ? 15_000 : 5000);
}

async function onAppSwitch(fg: Foreground) {
  const rule = S.appReactions.find(r => r.app && r.app.toLowerCase() === fg.name.toLowerCase());
  const now = Date.now();
  if (rule && rule.action !== 'none' && mode === 'front' && now - (reactedAt[fg.name] ?? 0) > 10 * 60_000) {
    reactedAt[fg.name] = now;
    return appReaction(rule.action, appName(fg.name));
  }
  // Otherwise: a curious glance toward the window you just switched to.
  if (mode !== 'front' || anim.busy) return;
  const { bounds } = await host.winInfo();
  const dx = fg.x + fg.w / 2 - (bounds.x + bounds.width / 2), dy = fg.y + fg.h / 2 - (bounds.y + bounds.height / 2);
  const d = Math.hypot(dx, dy) || 1;
  const gx = ((facingLeft ? -dx : dx) / d) * 13, gy = (dy / d) * 9;
  anim.setFront({ expr: 'curious', gaze: [gx, gy], tilt: clamp(gx / 2, -6, 6) });
  setExpr('curious', 2200);
}

async function appReaction(action: ReactionAction, app: string) {
  clearTimeout(decideTimer);
  mode = 'busy';
  say(pick(REACT_LINES[action](app)), 2800);
  const hop = [{ s: { bounce: 16, earAdd: [16, -16] as [number, number] }, ms: 160 }, { s: { bounce: 0, earAdd: [0, 0] as [number, number] }, ms: 160 }];
  await anim.face([{ s: { expr: 'excited' }, ms: 1 }, ...hop, ...hop]);
  if (mode !== 'busy') return;
  mode = 'front';
  switch (action) {
    case 'coding': await sideAction(clips.coding(3), false); break;
    case 'dance': await dance(); break;
    case 'wave': await sideAction(clips.wave()); break;
    case 'exercise': await sideAction(chance(0.5) ? clips.pushups(6) : clips.rope(8)); break;
    case 'run': await walk(rand(3000, 5000), 110, clips.run()); break;
  }
  schedule(rand(10_000, 20_000));
}

async function dance() {
  mode = 'busy';
  const sway = (t: number, e: [number, number]) => ({ s: { expr: 'laugh', tilt: t, earAdd: e, bounce: Math.abs(t) }, ms: 300 });
  const beat = [sway(9, [18, -4]), sway(-9, [-4, 18])];
  await anim.face([...beat, ...beat, ...beat, ...beat, { s: { tilt: 0, earAdd: [0, 0] as [number, number], bounce: 0, expr: 'happy' }, ms: 250 }]);
  if (mode === 'busy') { mode = 'front'; setExpr('happy', 2000); }
}

// ---------- your activity: "let's stretch" + "welcome back" ----------
// Uses only Windows' "seconds since last input" — no keys or clicks are recorded.
let activeMin = 0, wasAway = false, stretchDue = false;
function watchActivity() {
  setInterval(async () => {
    const idle = await host.idleSeconds();
    if (idle >= 300) { activeMin = 0; wasAway = true; return; }
    if (idle < 120) activeMin++;
    if (S.stretchEvery > 0 && activeMin >= S.stretchEvery) { stretchDue = true; activeMin = 0; if (mode === 'front' || mode === 'sleep') schedule(300); }
  }, 60_000);
  // Notice you coming back (only checks while you're away).
  setInterval(async () => {
    if (!wasAway) return;
    if ((await host.idleSeconds()) < 5) {
      wasAway = false;
      if (mode === 'sleep' && chance(0.5)) { await wake(true); schedule(rand(6000, 12000)); }
      if (mode === 'front') { say(pick(LINES.welcome), 2600); frontEarFlap(); }
    }
  }, 4000);
}

async function stretchCheck(): Promise<boolean> {
  if (!stretchDue) return false;
  stretchDue = false;
  say(pick(LINES.stretch), 3500);
  await sideAction(chance(0.5) ? clips.rope(6) : clips.pushups(5));
  say(pick(LINES.stretchDone), 3000);
  return true;
}

// ---------- interactions ----------
// Click-through: the window ignores the mouse except over Dumbo's actual pixels.
let overPet = false;
const hitPet = (x: number, y: number) => { const el = document.elementFromPoint(x, y); return !!el && el !== art && art.contains(el) && el.tagName !== 'svg'; };
function setOver(v: boolean) { if (v !== overPet) { overPet = v; host.ignoreMouse(!v); } }

let down: { x: number; y: number } | null = null;
let dragging = false;
let hoverStart = 0, reactUntil = 0;
const rub: Array<{ x: number; t: number }> = [];

let moveEvents = 0;
document.addEventListener('mousemove', e => {
  moveEvents++;
  if (dragging) return;
  if (down && (e.buttons & 1) && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { startDrag(down.x, down.y); return; }
  const hit = hitPet(e.clientX, e.clientY);
  setOver(hit || !!down);
  if (!hit || e.buttons) { hoverStart = 0; rub.length = 0; return; }
  lastInteraction = Date.now();
  // Petting = slow hover. Tickling = fast back-and-forth rubbing.
  const now = performance.now();
  rub.push({ x: e.clientX, t: now });
  while (rub.length && now - rub[0].t > 700) rub.shift();
  if (!hoverStart) hoverStart = now;
  if (now < reactUntil || mode !== 'front') return;
  let flips = 0;
  for (let i = 2; i < rub.length; i++) { const a = rub[i - 1].x - rub[i - 2].x, b = rub[i].x - rub[i - 1].x; if (a * b < 0 && Math.abs(b) > 1) flips++; }
  if (flips >= 4) { reactUntil = now + 3500; tickled(); }
  else if (now - hoverStart > 1500) { reactUntil = now + 5000; hoverStart = 0; petted(); }
});
document.addEventListener('mouseleave', () => { if (!dragging && !down) setOver(false); });

document.addEventListener('mousedown', e => {
  if (e.button === 0 && hitPet(e.clientX, e.clientY)) down = { x: e.clientX, y: e.clientY };
  if (e.button === 2 && hitPet(e.clientX, e.clientY)) host.openSettings();
});
document.addEventListener('mouseup', e => {
  if (e.button !== 0) return;
  if (dragging) { endDrag(); return; }
  if (!down) return;
  down = null;
  lastInteraction = Date.now();
  clicked();
});

async function clicked() {
  if (mode === 'sleep') { await wake(true); return schedule(rand(6000, 12000)); }
  if (mode !== 'front') return;
  mode = 'busy';
  if (chance(0.3)) say(pick(LINES.click), 1800);
  await anim.face([{ s: { expr: 'laugh', bounce: 16, earAdd: [14, -14] }, ms: 150 }, { s: { bounce: 0, earAdd: [0, 0] }, ms: 170 }, { s: { bounce: 8 }, ms: 120 }, { s: { bounce: 0 }, ms: 140 }]);
  if (mode === 'busy') { mode = 'front'; setExpr('happy', 2200); }
}

async function petted() {
  mode = 'busy';
  say(pick(LINES.petted), 2200);
  await anim.face([{ s: { expr: 'laugh', tilt: -6, head: [-3, 3], earAdd: [-10, 10] }, ms: 350 }, { s: { tilt: -9 }, ms: 1200 }, { s: { tilt: 0, head: [0, 0], earAdd: [0, 0], expr: 'happy' }, ms: 400 }]);
  if (mode === 'busy') { mode = 'front'; setExpr('happy', 2500); }
}

async function tickled() {
  mode = 'busy';
  say(pick(LINES.tickled), 2200);
  const w = (t: number) => ({ s: { expr: 'giggle', tilt: t, bounce: Math.abs(t) / 2 }, ms: 120 });
  await anim.face([w(8), w(-8), w(8), w(-8), w(6), w(-6), { s: { tilt: 0, bounce: 0, expr: 'laugh' }, ms: 200 }]);
  if (mode === 'busy') { mode = 'front'; setExpr('happy', 2500); }
}

let grumpy = false;
function startDrag(ox: number, oy: number) {
  dragging = true;
  grumpy = mode === 'sleep' || mode === 'side' || mode === 'busy';
  walkStop?.();
  clearTimeout(decideTimer); clearTimeout(exprTimer); clearTimeout(blinkTimer);
  host.track(false);
  mode = 'held';
  setOver(true);
  anim.setSide(STAND);
  anim.play(clips.dangle(grumpy));
  if (grumpy) say(pick(LINES.pout), 2000);
  host.dragStart(Math.round(ox), Math.round(oy));
}

async function endDrag() {
  dragging = false;
  down = null;
  host.dragEnd();
  lastInteraction = Date.now();
  mode = 'busy';
  // Dropped onto the top edge of the window you're using? He sits on it.
  perch = null; clearInterval(perchWatch);
  if (S.visitWindows) {
    const [fg, { bounds }] = await Promise.all([getFg(), host.winInfo()]);
    const feetY = bounds.y + bounds.height - 3, cx = bounds.x + bounds.width / 2;
    if (fg && !fg.max && cx > fg.x + 20 && cx < fg.x + fg.w - 20 && feetY > fg.y - 70 && feetY < fg.y + 25) {
      perch = { ...fg, since: Date.now(), stay: rand(60_000, 180_000) };
      host.move(bounds.x, perchY(bounds));
      watchPerch();
    }
  }
  const fell = await fallToGround();
  if (fell && !grumpy && chance(0.5)) say(pick(LINES.happyDrop), 1800);
  if (!fell) await anim.play(clips.toStand());
  host.savePos();
  awakeSince = Date.now();
  await toFront(grumpy ? 'pout' : 'happy');
  if (grumpy) setExpr('pout', 3000);
  schedule(rand(5000, 10000));
}

// ---------- battery ----------
interface BatteryManager extends EventTarget { level: number; charging: boolean }
let battery: BatteryManager | null = null;
let lowBattery = false, flexCount = 0, lastLowNag = 0, lastFlex = 0;

async function initBattery() {
  if (!hasBattery || battery) return;
  try { battery = await (navigator as any).getBattery(); } catch { return; }
  battery!.addEventListener('chargingchange', onChargingChange);
  battery!.addEventListener('levelchange', () => { updateLow(); });
  updateLow();
}
function updateLow() {
  if (!battery) return;
  const was = lowBattery;
  lowBattery = !battery.charging && battery.level * 100 <= S.batteryLow;
  if (lowBattery && !was && mode === 'front') { lastLowNag = 0; schedule(500); }
  if (!lowBattery && was && mode === 'front') anim.setFront({ expr: 'smile' });
}
async function onChargingChange() {
  if (!battery) return;
  updateLow();
  if (!battery.charging) { flexCount = 0; return; }
  // Plugged in → excited, bounces, runs around, then back to normal life.
  if (mode === 'held') return;
  walkStop?.();
  if (mode === 'sleep') await wake(false);
  clearTimeout(decideTimer);
  mode = 'busy';
  await toFront('excited');
  say(pick(LINES.charged), 2500);
  const hop = [{ s: { bounce: 18, earAdd: [18, -18] as [number, number] }, ms: 170 }, { s: { bounce: 0, earAdd: [0, 0] as [number, number] }, ms: 170 }];
  await anim.face([...hop, ...hop, ...hop]);
  mode = 'side';
  await toSide(true);
  await anim.play(clips.chargedBounce());
  await walk(rand(3500, 6000), 110, clips.run());
  schedule(rand(6000, 10000));
}

/** Returns true if a battery reaction happened. */
async function batteryCheck(): Promise<boolean> {
  if (!battery) return false;
  const now = Date.now();
  if (lowBattery && now - lastLowNag > 8 * 60_000) {
    lastLowNag = now;
    say(pick(LINES.lowBattery), 4000);
    await sideAction(clips.tired(), false);
    anim.setFront({ expr: 'tired' });
    return true;
  }
  if (battery.charging && battery.level * 100 >= S.batteryHigh && flexCount < 3 && now - lastFlex > 3 * 60_000) {
    flexCount++; lastFlex = now;
    say(pick(LINES.full), 4000);
    await sideAction(clips.flex());
    return true;
  }
  return false;
}

// ---------- tray / settings ----------
host.onAction(async a => {
  if (a === 'sleep' && mode !== 'sleep' && mode !== 'held') { walkStop?.(); anim.stop(); clearTimeout(decideTimer); sleep(); }
  if (a === 'wake' && mode === 'sleep') { await wake(true); schedule(rand(6000, 12000)); }
});
host.onSettings(s => { S = s; applyTheme(); updateLow(); });
host.onBatteryPresent(b => { hasBattery = b; initBattery(); });
host.onSay(t => say(t, 5000)); // host messages (updates)

// ---------- boot ----------
async function boot() {
  const st = await host.getState();
  S = st.settings; hasBattery = st.hasBattery;
  applyTheme();
  setOver(false);
  initBattery();
  mode = 'busy';
  anim.setFront({ ...FRONT_REST, expr: 'happy' });
  if (!(await fallToGround())) { /* already on the ground */ }
  await toFront('happy');
  say(pick(LINES.hello()), 2800);
  await frontEarFlap();
  watchApps();
  watchActivity();
  schedule(rand(6000, 12000));
}
const BENCH = (window.host as any)?.bench as string | null;
if (BENCH) {
  // Perf benchmarks (scripts/bench.sh): 'idle' = static pose, no timers; 'fN'/'sN' = N front/side redraws per second.
  if (BENCH === 'perch') {
    // Scenario test: a simulated 500×300 window; Dumbo hops on, nibbles, gets knocked off when it "moves".
    let fake: Foreground | null = { name: 'FakeApp', x: 400, y: 380, w: 500, h: 300, max: false };
    getFg = async () => fake;
    const where = async (tag: string) => { const { bounds } = await host.winInfo(); host.log(`${tag}: pet x=${bounds.x} y=${bounds.y} feet=${bounds.y + bounds.height - 3} perch=${perch ? perch.y : 'none'} mode=${mode}`); };
    (async () => {
      const st = await host.getState(); S = st.settings; applyTheme(); anim.setFront({ ...FRONT_REST }); mode = 'front';
      await fallToGround(); await where('start');
      host.log(`canPerch=${await canPerch(fake!)}`);
      await hopOnto(fake!); await where('perched');
      await nibbleCorner(); await where('after nibble');
      fake = { ...fake!, x: 300 }; await new Promise(r => setTimeout(r, 4500)); await where('after window moved');
      host.log('perch scenario done');
    })().catch(e => host.log(`scenario failed: ${e?.stack || e}`));
  } else
  host.getState().then(st => {
    S = st.settings; applyTheme(); anim.setFront({ ...FRONT_REST });
    const m = /^([fs])(\d+)$/.exec(BENCH);
    if (m) { let i = 0; if (m[1] === 's') anim.setSide(STAND); setInterval(() => { i++; if (m[1] === 'f') anim.setFront({ gaze: [Math.sin(i / 3) * 10, 0] }); else anim.setSide({ ...STAND, ears: [Math.sin(i / 3) * 20, 0] }); }, 1000 / Number(m[2])); }
    host.log(`bench ${BENCH} running`);
  });
} else boot().then(() => host.log('boot ok')).catch(e => host.log(`boot failed: ${e?.stack || e}`));

// Diagnostics (dev only): SVG redraws per 10 s + current mode, to trace CPU use to a cause.
if (import.meta.env.DEV) {
  let lastDraws = 0;
  setInterval(() => { host.log(`perf: ${moveEvents} mousemoves, ${Animator.draws - lastDraws} redraws/10s, mode=${mode}, view=${anim.view}, busy=${anim.busy}`); lastDraws = Animator.draws; moveEvents = 0; }, 10_000);
}
