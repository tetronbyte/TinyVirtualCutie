import type { Theme } from './art/dumbo.js';
import { Animator, FRONT_REST, type FrontState } from './engine/animator';
import { clips, STAND, SIT } from './engine/clips';
import { actionOn, tuneOf, ALL_ACTIONS, type ActionId, type KnobKey } from './actions';
import { host, type Settings, type Cursor, type Foreground, type ReactionAction, type Hold, type HoldKind } from './host';

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
/** Is this action switched on in settings? (settings page: tick list) */
const on = (id: ActionId) => actionOn(S, id);
/** Settings ⚙ knob for an action; 0 = Auto (recommended, a little random). */
const tune = (id: ActionId, key: KnobKey) => tuneOf(S, id, key);
/** How often: random-pick weight, scaled by the "How often" knob. */
const often = (id: ActionId) => tune(id, 'often') || 1;
const w = (id: ActionId, weight: number) => (on(id) ? weight * often(id) : 0);
/** How long: repetitions — Auto = random in [min, max], otherwise the middle × Short/Long. */
const reps = (id: ActionId, min: number, max: number) => {
  const l = tune(id, 'length');
  return l ? Math.max(1, Math.round(((min + max) / 2) * l)) : min + Math.floor(rand(0, max - min + 1));
};

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
  hello: () => [`hi! I'm ${S.name}`, 'hello hello!', 'hiii'],
  helloAgain: ['hello again!', "I'm awake! hi again", 'oh hi, welcome back!'],
  wake: ['*yawn*', 'mm… morning?', '5 more minutes…'],
  petted: ['hehe', 'more pls', 'mmm nice'],
  tickled: ['hehehe stop!', 'ahaha!', 'tickles!!'],
  click: ['hi!', 'boop!', 'hehe', '?'],
  pout: ['hmph!', 'I was busy…', 'put me down!'],
  happyDrop: ['wheee!', 'again again!'],
  coding: ['tap tap tap', 'shipping it', 'one more bug…'],
  exercise: ['1… 2… 3…', 'getting strong!', 'huff puff'],
  trip: ['oops…', 'I meant to do that'],
  lowBattery: ['charge me pls', 'so… sleepy… need power', 'battery low…'],
  charged: ['yay, power!', 'zoom zoom!', 'thank youuu'],
  full: ["unplug me, I'm full!", 'all charged! unplug pls'],
  perch: ['nice view up here', 'my window now', 'wheee up!'],
  nibble: ['nom nom', 'tastes like pixels', '*crunch*'],
  peek: ["what's in here?", 'ooh', 'sniff sniff'],
  push: ['hnnngh!', "it won't budge…", 'so heavy…'],
  stretch: ["let's stretch!", 'break time! move with me', 'stretchy time!'],
  stretchDone: ['your turn!', 'feels good right?'],
  welcome: ['welcome back!', "you're back!", 'missed you'],
  pinned: ["I'll stay right here", 'not moving!', 'staying put!'],
  unpinned: ['free to roam!', 'wheee, free!'],
  timeUp: ["time's up! back to normal", 'all done!'],
  stillSleeping: ['5 more minutes…', 'zzz… mm?', '*snore*'],
  hideStart: ["hide and seek! count to ten!", "let's play hide and seek!", "bet you can't find me!"],
  peekaboo: ['peekaboo!', 'hehe', 'over here!'],
  found: ['you found me!', 'aww, found me!', 'again again!'],
  notFound: ['you never found me hehe', "I win!", 'too good at hiding'],
  noWindow: ["bring a window to the front (not too high) and I'll hop on!", 'no window to sit on…'],
};
const HOLD_LINES: Record<HoldKind, string[]> = {
  free: ['back to normal!'],
  sleep: ['nap time'],
  awake: ["I'm wide awake!", 'no naps today!'],
  coding: ['coding mode', "let's ship it!"],
  exercise: ['workout time!', 'getting strong!'],
  walk: ['going for a walk!', 'stroll time'],
};
const appName = (n: string) => n.replace(/\.exe$/i, '').replace(/^\w/, c => c.toUpperCase());
const REACT_LINES: Record<ReactionAction, (a: string) => string[]> = {
  coding: a => [`${a}! let's code`, 'coding time!', "I'll code too!"],
  dance: a => [`${a}!`, 'music!!', 'dance time!'],
  wave: a => [`hi ${a} friends!`, 'say hi from me!'],
  exercise: () => ['workout time!'],
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
// Owner's "stay here" pin and "keep doing…" state (tray), with an optional timer kept by the host.
let hold: Hold = { pin: false, kind: 'free', until: 0 };

// ---------- battery saver ----------
// Calmer and sleepier: fewer actions, longer pauses, 8 fps animation, looks at you once a second,
// checks apps less often. On when chosen, or automatically while unplugged (if that's ticked).
const saving = () => S?.perfMode === 'battery' || (!!S?.saverUnplugged && !!battery && !battery.charging);
let tracking = false;
const track = (v: boolean) => { tracking = v; host.track(v, saving() ? 1000 : 250); };
let wasSaving: boolean | null = null;
function applyPerf() {
  const now = saving();
  Animator.maxFps = now ? 8 : 60;
  if (now !== wasSaving && wasSaving !== null) { if (tracking) track(true); host.log(`battery saver ${now ? 'on' : 'off'}`); }
  wasSaving = now;
}
const slow = (ms: number) => (saving() ? ms * 2 : ms);

// Bumped when you grab him: any fall / jump / hide-and-seek slide still running stops moving the window.
let motion = 0;

const schedule = (ms: number) => { clearTimeout(decideTimer); decideTimer = window.setTimeout(decide, ms > 4000 ? slow(ms) : ms); };
function setFacing(left: boolean) { facingLeft = left; stage.classList.toggle('left', left); }

/** Make sure we are sitting and facing the user. */
async function toFront(expr = 'smile') {
  if (dragging) return; // grabbed meanwhile: the drop decides what comes next
  if (anim.view === 'side') {
    if (anim.side.base !== 'sit') await anim.play(clips.sitDown());
  }
  if (dragging) return;
  anim.setFront({ ...FRONT_REST, expr, shadow: !perch });
  mode = 'front';
  track(true);
  scheduleBlink();
  idleExprLater();
}

/** Switch to the side view, standing (or sitting) and ready for an action. */
async function toSide(stand = true) {
  track(false);
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
  }, rand(2200, 6000) * (chance(0.15) ? 0.1 : 1) * (saving() ? 1.6 : 1)); // sometimes a double blink
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
  }, slow(rand(5000, 12000)));
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
    if (hold.kind === 'sleep') return schedule(rand(60_000, 120_000));
    if (hold.kind !== 'free') { await wake(false); return schedule(500); }
    if (stretchDue && !isNight()) { await wake(true); return schedule(500); }
    if (isNight()) return schedule(rand(600_000, 1_200_000));
    await wake(false);
    return schedule(rand(6000, 12000));
  }
  if (hold.kind === 'sleep') return sleep();
  if (hold.kind === 'coding' || hold.kind === 'exercise' || hold.kind === 'walk') return holdActivity();
  const awakeFor = Date.now() - awakeSince;
  const awakeBudget = (isNight() ? 45_000 : rand(90_000, 240_000) * (1.4 - S.sleepiness)) * (saving() ? 0.5 : 1);
  if (hold.kind !== 'awake' && awakeFor > awakeBudget && Date.now() - lastInteraction > 20_000) return sleep();

  if (await batteryCheck()) return schedule(rand(8000, 15000));
  if (await stretchCheck()) return schedule(rand(10_000, 20_000));

  if (perch) {
    // Up on a window: look around, peek over the edge, nibble the corner, then hop down.
    const p = Date.now() - perch.since > perch.stay ? 'down' : pickW<string>([['nothing', 4], ['peek', w('peek', 2)], ['nibble', w('nibble', 1.5)], ['stroll', w('walk', 1.5)]]);
    if (p === 'down') await hopDown();
    else if (p === 'peek') { say(pick(LINES.peek), 2200); await perchedAction(clips.peek()); }
    else if (p === 'nibble') await nibbleCorner();
    else if (p === 'stroll') await walk(rand(2000, 5000), 30);
    return schedule(rand(8000, 18_000));
  }

  if (S.visitWindows && !hold.pin && !lowBattery && chance(0.35)) {
    const fg = await getFg();
    if (fg && on('perch') && await canPerch(fg) && chance(Math.min(1, 0.6 * often('perch')))) { await hopOnto(fg); return schedule(rand(8000, 15_000)); }
    if (fg && on('push') && await canPush(fg) && chance(Math.min(1, 0.5 * often('push')))) { await pushWindow(fg); return schedule(rand(10_000, 20_000)); }
  }

  const next = lowBattery
    ? pickW<string>([['nothing', 6], ['walk', hold.pin ? 0 : w('walk', 1)]])
    : pickW<string>([['nothing', saving() ? 16 : 6], ['walk', hold.pin ? 0 : w('walk', 3)], ['earflap', w('earflap', 1.5)], ['wave', w('wave', 1)], ['coding', w('coding', 1.6)],
      ['pushups', w('pushups', .7)], ['rope', w('rope', .7)], ['hideSeek', hold.pin ? 0 : w('hideSeek', .45)]]);
  switch (next) {
    case 'walk': await stroll('walk'); break;
    case 'earflap': await frontEarFlap(); break;
    case 'wave': await sideAction(clips.wave()); break;
    case 'coding': say(pick(LINES.coding)); await sideAction(clips.coding(reps('coding', 1, 3)), false); break;
    case 'pushups': say(pick(LINES.exercise)); await sideAction(clips.pushups(reps('pushups', 4, 7))); break;
    case 'rope': say(pick(LINES.exercise)); await sideAction(clips.rope(reps('rope', 5, 9))); break;
    case 'hideSeek': await hideAndSeek(); break;
  }
  schedule(rand(10_000, 25_000)); // calm pace: every drawn frame costs CPU
}

/** "Keep doing…" from the tray: the same activity over and over, with short breaks facing you. */
async function holdActivity() {
  switch (hold.kind) {
    case 'coding':
      if (chance(0.2)) say(pick(LINES.coding));
      await sideAction(clips.coding(reps('coding', 2, 4)), false);
      return schedule(rand(2500, 6000));
    case 'exercise':
      if (chance(0.3)) say(pick(LINES.exercise));
      await sideAction(chance(0.5) ? clips.pushups(reps('pushups', 5, 8)) : clips.rope(reps('rope', 6, 10)));
      return schedule(rand(3000, 7000));
    case 'walk':
      if (hold.pin) return schedule(rand(4000, 8000)); // pinned wins: no walking off
      await stroll('walk', true);
      return schedule(rand(1500, 4000));
  }
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
async function sleep(style?: 'doze' | 'curl') {
  if (dragging) return;
  mode = 'busy';
  track(false);
  clearTimeout(exprTimer); clearTimeout(blinkTimer);
  sleepStyle = style ?? (on('curl') && (!on('doze') || chance(0.4)) ? 'curl' : 'doze');
  if (sleepStyle === 'doze') {
    if (anim.view !== 'front') await toFront('neutral');
    track(false);
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
  await settle();
}

/** If he's up in the air (pin just released), drop to the ground. */
async function settle() {
  if (perch || mode !== 'front') return;
  const { bounds, workArea } = await host.winInfo();
  if (bounds.y >= workArea.y + workArea.height - bounds.height - 3 || hold.pin) { await fallToGround(); return; } // just steps back into view if needed
  mode = 'busy';
  track(false);
  anim.setSide(STAND);
  await fallToGround();
  host.savePos();
  await toFront('happy');
}

// ---------- walking / running along the ground ----------
/** Walk or run using the settings ⚙ knobs: How far (Auto = a short random stroll) and Speed. */
async function stroll(id: 'walk' | 'run', long = false) {
  const run = id === 'run';
  const sp = tune(id, 'speed') || rand(0.85, 1.15);
  const speed = (run ? 110 : 36) * sp;
  const clip = run ? clips.run() : clips.walk();
  // Legs keep up with the speed: faster steps (and a few more redraws) when fast, slower when slow.
  clip.keys = clip.keys.map(k => ({ ...k, ms: k.ms / Math.sqrt(sp) }));
  clip.fps = Math.round(clamp((clip.fps ?? 12) * Math.sqrt(sp), 7, 16));
  const dist = tune(id, 'distance');
  if (!dist || perch) return walk(run ? rand(3000, 5000) : long ? rand(6000, 14_000) : rand(3000, 8000), speed, clip);
  const { bounds, workArea } = await host.winInfo();
  const minX = workArea.x - bounds.width * 0.25, maxX = workArea.x + workArea.width - bounds.width * 0.75;
  const x = bounds.x, span = (maxX - minX) * dist;
  const roomR = maxX - x, roomL = x - minX;
  const dir = dist < 1 && roomR >= span && roomL >= span ? (chance(0.5) ? 1 : -1) : roomR >= roomL ? 1 : -1;
  const target = dist >= 1 ? (dir > 0 ? maxX : minX) : clamp(x + dir * span, minX, maxX);
  return walk(180_000, speed, clip, target);
}

let walkStop: (() => void) | null = null;
async function walk(ms: number, speed = 36, clip = clips.walk(), targetX?: number, thenFront = true) {
  if (hold.pin) { if (mode === 'side') { mode = 'busy'; await toFront('smile'); } return; } // pinned: stays put
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
  if (!lowBattery && !perch && on('trip') && chance(Math.min(1, 0.12 * often('trip')))) { say(pick(LINES.trip)); await anim.play(clips.trip()); }
  else await anim.play(clips.toStand());
  if (mode !== 'side') return;
  mode = 'busy';
  await toFront('smile');
}

// ---------- gravity: dropped mid-air → falls to the taskbar ----------
async function fallToGround() {
  if (hold.pin) return false; // pinned: stays exactly where you put him, even mid-air
  const { bounds, workArea } = await host.winInfo();
  const groundY = perch ? perchY(bounds) : workArea.y + workArea.height - bounds.height;
  // Clamp horizontally inside the screen too.
  const x = clamp(bounds.x, workArea.x - bounds.width * 0.25, workArea.x + workArea.width - bounds.width * 0.75);
  if (bounds.y >= groundY - 3) {
    // Below the ground or off the side (taskbar moved, resolution or monitor changed): step back into view.
    if (bounds.y > groundY + 3 || x !== bounds.x) host.move(x, Math.min(bounds.y, groundY));
    return false;
  }
  anim.play(clips.fall());
  const my = motion;
  let y = bounds.y, v = 0, last = performance.now();
  await new Promise<void>(resolve => {
    const iv = window.setInterval(() => {
      if (my !== motion) { clearInterval(iv); return resolve(); } // grabbed mid-fall
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      v = Math.min(v + 2600 * dt, 1800);
      y = Math.min(groundY, y + v * dt);
      host.move(x, y);
      if (y >= groundY) { clearInterval(iv); resolve(); }
    }, 16);
  });
  if (my === motion) await anim.play(clips.land());
  return true;
}

// ---------- windows: perch on top, peek, nibble, fake-push ----------
/** Foreground app source (swappable by the dev 'perch' scenario test). */
let getFg = () => host.foreground();
/** Foreground window, but never wait long (a drop shouldn't hang in the air): falls back to the last one seen. */
let lastFg: Foreground | null = null;
const fgQuick = (ms = 400) => Promise.race([getFg().then(f => (lastFg = f)), wait(ms).then(() => lastFg)]);
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
  const t0 = performance.now(), my = motion;
  await new Promise<void>(resolve => {
    const iv = window.setInterval(() => {
      if (my !== motion) { clearInterval(iv); return resolve(); } // grabbed mid-jump
      const t = Math.min(1, (performance.now() - t0) / ms);
      const x = x0 + (tx - x0) * t;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * peak + t * t * ty; // quadratic Bézier through the peak
      host.move(x, y);
      if (t >= 1) { clearInterval(iv); resolve(); }
    }, 16);
  });
  if (my === motion) await anim.play(clips.land());
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
      const fg = lastFg = await getFg();
      if (fg && fg.name !== lastApp) { const prev = lastApp; lastApp = fg.name; if (import.meta.env.DEV) host.log(`app: ${fg.name} ${Math.round(fg.x)},${Math.round(fg.y)} ${Math.round(fg.w)}x${Math.round(fg.h)}${fg.max ? ' max' : ''}`); if (prev) await onAppSwitch(fg); }
    }
    watchApps();
  }, mode === 'sleep' || saving() ? 15_000 : 5000);
}

async function onAppSwitch(fg: Foreground) {
  const rule = S.appReactions.find(r => r.app && r.app.toLowerCase() === fg.name.toLowerCase());
  const now = Date.now();
  if (rule && rule.action !== 'none' && mode === 'front' && (hold.kind === 'free' || hold.kind === 'awake') && now - (reactedAt[fg.name] ?? 0) > 10 * 60_000) {
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
    case 'coding': await sideAction(clips.coding(reps('coding', 2, 4)), false); break;
    case 'dance': if (on('dance')) await dance(); break;
    case 'wave': await sideAction(clips.wave()); break;
    case 'exercise': await sideAction(chance(0.5) ? clips.pushups(reps('pushups', 5, 7)) : clips.rope(reps('rope', 6, 9))); break;
    case 'run': if (on('run')) await stroll('run'); break;
  }
  schedule(rand(10_000, 20_000));
}

async function dance() {
  mode = 'busy';
  const sway = (t: number, e: [number, number]) => ({ s: { expr: 'laugh', tilt: t, earAdd: e, bounce: Math.abs(t) }, ms: 300 });
  const beat = [sway(9, [18, -4]), sway(-9, [-4, 18])];
  await anim.face([...Array.from({ length: reps('dance', 3, 5) }, () => beat).flat(), { s: { tilt: 0, earAdd: [0, 0] as [number, number], bounce: 0, expr: 'happy' }, ms: 250 }]);
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
      if (mode === 'sleep' && hold.kind !== 'sleep' && chance(0.5)) { await wake(true); schedule(rand(6000, 12000)); }
      if (mode === 'front' && on('welcome')) { say(pick(LINES.welcome), 2600); frontEarFlap(); }
    }
  }, 4000);
}

async function stretchCheck(): Promise<boolean> {
  if (!stretchDue) return false;
  stretchDue = false;
  if (!on('stretch')) return false;
  say(pick(LINES.stretch), 3500);
  await sideAction(chance(0.5) ? clips.rope(6) : clips.pushups(5));
  say(pick(LINES.stretchDone), 3000);
  return true;
}

// ---------- interactions ----------
// Click-through: the window ignores the mouse except over Dumbo's actual pixels.
let overPet = false;
const hitAt = (x: number, y: number) => { const el = document.elementFromPoint(x, y); return !!el && el !== art && art.contains(el) && el.tagName !== 'svg'; };
// A few px of slack so thin bits (trunk tip, tail, legs) and the gaps between them are easy to grab.
const SLACK = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]];
const hitPet = (x: number, y: number) => SLACK.some(([dx, dy]) => hitAt(x + dx, y + dy));
function setOver(v: boolean) {
  if (v === overPet) return;
  overPet = v; host.ignoreMouse(!v);
  if ((window.host as any)?.bench) host.log(`over ${v}`);
}
// Host re-applied click-through after sleep/unlock/display change: forget our idea of it, drop any
// press or drag that can't still be real; the next hover check turns grabbing back on.
host.onMouseReset(() => {
  overPet = false; down = null;
  if (dragging) endDrag();
  else if (mode === 'front') settle().catch(() => {}); // screen layout may have changed: back on the ground, in view
  if ((window.host as any)?.bench) host.log('mouse reset');
});
// Host says where the cursor is while it's inside his window (see startHoverPoll in electron/main.cjs).
host.onHover(p => {
  if (dragging || down) return;
  setOver(!!p && hitPet(p.x, p.y));
});

let down: { x: number; y: number } | null = null;
let dragging = false;
let hoverStart = 0, reactUntil = 0;
const rub: Array<{ x: number; t: number }> = [];

let moveEvents = 0;
document.addEventListener('mousemove', e => {
  moveEvents++;
  if (dragging) { if (!(e.buttons & 1)) endDrag(); return; } // button released where we didn't see the mouseup
  if (down && !(e.buttons & 1)) down = null; // same for a press that never turned into a drag
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
  if (flips >= 4) { reactUntil = now + 3500; if (on('tickled')) tickled(); }
  else if (now - hoverStart > 1500) { reactUntil = now + 5000; hoverStart = 0; if (on('petted')) petted(); }
});
document.addEventListener('mouseleave', () => { if (!dragging && !down) setOver(false); });

document.addEventListener('mousedown', e => {
  if ((window.host as any)?.bench) host.log(`mousedown ${Math.round(e.clientX)},${Math.round(e.clientY)} hit=${hitPet(e.clientX, e.clientY)}`);
  if (e.button === 0 && hitPet(e.clientX, e.clientY)) down = { x: e.clientX, y: e.clientY };
  if (e.button === 2 && hitPet(e.clientX, e.clientY)) host.openSettings();
});
document.addEventListener('mouseup', e => {
  if (e.button !== 0) return;
  if (dragging) { endDrag(); return; }
  if (!down) return;
  down = null;
  lastInteraction = Date.now();
  if (game?.peeking) { game.found = true; game.wake?.(); return; } // hide and seek: found him!
  clicked();
});

async function clicked() {
  if (mode === 'sleep' && hold.kind === 'sleep') { say(pick(LINES.stillSleeping), 2000); return; }
  if (mode === 'sleep') { await wake(true); return schedule(rand(6000, 12000)); }
  if (mode !== 'front' || !on('click')) return;
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
  if ((window.host as any)?.bench) host.log('drag start');
  motion++;
  abortGame(false); // you've got him: no need to put him back first
  dragging = true;
  grumpy = mode === 'sleep' || mode === 'side' || mode === 'busy';
  walkStop?.();
  clearTimeout(decideTimer); clearTimeout(exprTimer); clearTimeout(blinkTimer);
  track(false);
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
  if (S.visitWindows && !hold.pin) {
    const [fg, { bounds, workArea }] = await Promise.all([fgQuick(), host.winInfo()]);
    if (dragging) return; // grabbed again meanwhile
    const feetY = bounds.y + bounds.height - 3, cx = bounds.x + bounds.width / 2;
    // (Not on a window whose top is at the very top of the screen: he'd sit mostly above the screen.)
    if (fg && !fg.max && cx > fg.x + 20 && cx < fg.x + fg.w - 20 && feetY > fg.y - 70 && feetY < fg.y + 25 && fg.y - bounds.height * 0.55 > workArea.y) {
      perch = { ...fg, since: Date.now(), stay: rand(60_000, 180_000) };
      host.move(bounds.x, perchY(bounds));
      watchPerch();
    }
  }
  if (dragging) return;
  const fell = await fallToGround();
  if (dragging) return; // grabbed again mid-fall
  if (fell && !grumpy && chance(0.5)) say(pick(LINES.happyDrop), 1800);
  if (!fell) await anim.play(clips.toStand());
  if (dragging) return;
  host.savePos();
  awakeSince = Date.now();
  if (hold.kind === 'sleep') { await toFront('pout'); return sleep(); } // put down → back to his nap
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
  applyPerf();
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
  applyPerf();
  if (!battery.charging) { flexCount = 0; return; }
  // Plugged in → excited, bounces, runs around, then back to normal life.
  if (mode === 'held' || hold.kind === 'sleep' || game || !on('charged')) return;
  await chargedJoy();
  schedule(rand(6000, 10000));
}

async function chargedJoy() {
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
  if (on('run')) await stroll('run');
  else { mode = 'busy'; await toFront('happy'); }
}

/** Returns true if a battery reaction happened. */
async function batteryCheck(): Promise<boolean> {
  if (!battery) return false;
  const now = Date.now();
  if (lowBattery && on('tired') && now - lastLowNag > 8 * 60_000) {
    lastLowNag = now;
    say(pick(LINES.lowBattery), 4000);
    await sideAction(clips.tired(), false);
    anim.setFront({ expr: 'tired' });
    return true;
  }
  if (battery.charging && on('flex') && battery.level * 100 >= S.batteryHigh && flexCount < 3 && now - lastFlex > 3 * 60_000) {
    flexCount++; lastFlex = now;
    say(pick(LINES.full), 4000);
    await sideAction(clips.flex());
    return true;
  }
  return false;
}

// ---------- hide and seek ----------
// He vanishes, then peeks upside down from the top edge of the screen (up to 3 spots). Click him while
// he peeks to find him; otherwise he gives up and drops down. The window just goes invisible and
// moves: no extra drawing while hidden.
interface Game { found: boolean; abort: boolean; peeking: boolean; wake?: () => void; home?: { x: number; y: number } }
let game: Game | null = null;
const gameWait = (g: Game, ms: number) => new Promise<void>(r => { const t = setTimeout(r, ms); g.wake = () => { clearTimeout(t); r(); }; });
/** Stop hide and seek. `putBack`: return him to where the game started (he may be hidden above the screen). */
function abortGame(putBack = true) {
  if (!game) return;
  const home = game.home;
  game.abort = true; game.wake?.(); game = null;
  motion++; // stop a slide in progress
  document.body.classList.remove('upside', 'hiding');
  if (putBack && home) host.move(home.x, home.y);
}
function slide(x: number, from: number, to: number, ms: number) {
  const t0 = performance.now(), my = motion;
  return new Promise<void>(resolve => {
    const iv = window.setInterval(() => {
      if (my !== motion) { clearInterval(iv); return resolve(); }
      const t = Math.min(1, (performance.now() - t0) / ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      host.move(x, from + (to - from) * e);
      if (t >= 1) { clearInterval(iv); resolve(); }
    }, 16);
  });
}

async function hideAndSeek(quick = false) {
  if (hold.pin || perch || game) return;
  const g: Game = game = { found: false, abort: false, peeking: false };
  if (anim.view !== 'front' || mode !== 'front') await toFront('giggle');
  mode = 'busy';
  track(false); clearTimeout(exprTimer); clearTimeout(blinkTimer);
  say(pick(LINES.hideStart), 2600);
  await anim.face([{ s: { expr: 'giggle', bounce: 14, earAdd: [16, -16] }, ms: 160 }, { s: { bounce: 0, earAdd: [0, 0] }, ms: 180 }, { s: { expr: 'happy' }, ms: 1100 }]);
  if (g.abort) return;
  bubbleEl.classList.remove('show');
  document.body.classList.add('hiding');
  const { bounds, workArea } = await host.winInfo();
  g.home = { x: bounds.x, y: bounds.y };
  const stageH = bounds.height * 0.5273;
  const hidden = workArea.y - stageH - 4, peekY = workArea.y - stageH * 0.32;
  let x = bounds.x;
  const hideK = tune('hideSeek', 'hide') || 1;
  await gameWait(g, quick ? rand(1200, 2200) * hideK : rand(10_000, 30_000) * hideK);
  for (let i = 0; i < 3 && !g.abort && !g.found; i++) {
    x = rand(workArea.x, workArea.x + workArea.width - bounds.width);
    host.move(x, hidden);
    document.body.classList.add('upside');
    setFacing(chance(0.5));
    anim.setFront({ ...FRONT_REST, expr: 'giggle', gaze: [0, -8], tilt: rand(-6, 6), shadow: false });
    await wait(60);
    document.body.classList.remove('hiding');
    await slide(x, hidden, peekY, 450);
    if (g.abort) return;
    g.peeking = true;
    say(pick(LINES.peekaboo), 2400);
    anim.face([{ s: { expr: 'happy', earAdd: [10, -10] }, ms: 300 }, { s: { earAdd: [0, 0], blink: 1 }, ms: 120 }, { s: { blink: 0, expr: 'giggle' }, ms: 160 }]);
    await gameWait(g, quick ? rand(3500, 5000) : rand(4500, 8000));
    g.peeking = false;
    if (g.abort || g.found) break;
    bubbleEl.classList.remove('show');
    await slide(x, peekY, hidden, 350);
    document.body.classList.add('hiding');
    if (i < 2) await gameWait(g, (quick ? rand(1000, 2000) : rand(6000, 15_000)) * hideK);
  }
  if (g.abort) return;
  if (g.found) {
    say(pick(LINES.found), 2600);
    await anim.face([{ s: { expr: 'laugh', bounce: 10, earAdd: [16, -16] }, ms: 180 }, { s: { bounce: 0, earAdd: [0, 0] }, ms: 200 }, { s: { bounce: 6 }, ms: 140 }, { s: { bounce: 0 }, ms: 160 }]);
    if (g.abort) return;
  }
  // Flip upright just under the top edge and drop to the ground.
  document.body.classList.remove('upside', 'hiding');
  game = null;
  host.move(x, workArea.y);
  anim.setSide(STAND);
  await fallToGround();
  host.savePos();
  if (!g.found) say(pick(LINES.notFound), 2800);
  awakeSince = Date.now();
  await toFront(g.found ? 'happy' : 'giggle');
}

// ---------- ▶ Try (settings page) ----------
/** Stop whatever he's doing (without the old action resuming) and sit facing you. */
async function interrupt() {
  abortGame();
  walkStop?.();
  clearTimeout(decideTimer);
  if (mode === 'sleep') { await wake(false); return; }
  // 'held' makes every running action bail out at its next step (they all check their own mode).
  mode = 'held';
  anim.stop();
  await wait(40);
  mode = 'busy';
  await toFront('smile');
  await settle();
}

async function tryAction(id: ActionId) {
  if (mode === 'held' || dragging) return;
  lastInteraction = Date.now();
  await interrupt();
  const winTarget = async () => { const fg = await getFg(); return fg && !fg.max ? fg : null; };
  switch (id) {
    case 'walk': if (hold.pin) say("I'm pinned!", 2000); else await stroll('walk'); break;
    case 'trip': mode = 'side'; await toSide(true); say(pick(LINES.trip)); await anim.play(clips.trip()); if (mode === 'side') { mode = 'busy'; await toFront('pout'); } break;
    case 'earflap': await frontEarFlap(); break;
    case 'wave': await sideAction(clips.wave()); break;
    case 'coding': say(pick(LINES.coding)); await sideAction(clips.coding(reps('coding', 1, 2)), false); break;
    case 'pushups': say(pick(LINES.exercise)); await sideAction(clips.pushups(reps('pushups', 4, 5))); break;
    case 'rope': say(pick(LINES.exercise)); await sideAction(clips.rope(reps('rope', 5, 6))); break;
    case 'hideSeek': if (hold.pin) say("I'm pinned!", 2000); else await hideAndSeek(true); break;
    case 'perch': {
      if (perch) { say(pick(LINES.perch), 2000); break; }
      const fg = await winTarget();
      if (fg && !hold.pin && await canPerch(fg)) await hopOnto(fg); else say(hold.pin ? "I'm pinned!" : pick(LINES.noWindow), 3200);
      break;
    }
    case 'peek': say(pick(LINES.peek), 2200); if (perch) await perchedAction(clips.peek()); else await sideAction(clips.peek()); break;
    case 'nibble':
      if (perch && !hold.pin) await nibbleCorner();
      else { say(pick(LINES.nibble), 2200); await sideAction(clips.nibble()); }
      break;
    case 'push': {
      const fg = await winTarget();
      if (fg && !perch && !hold.pin && await canPush(fg)) await pushWindow(fg);
      else { say(pick(LINES.push), 2500); await sideAction(clips.push(2)); }
      break;
    }
    case 'click': mode = 'front'; await clicked(); break;
    case 'petted': await petted(); break;
    case 'tickled': await tickled(); break;
    case 'welcome': say(pick(LINES.welcome), 2600); await frontEarFlap(); break;
    case 'stretch': say(pick(LINES.stretch), 3500); await sideAction(clips.rope(5)); say(pick(LINES.stretchDone), 3000); break;
    case 'dance': await dance(); break;
    case 'run': if (hold.pin) say("I'm pinned!", 2000); else await stroll('run'); break;
    case 'charged': await chargedJoy(); break;
    case 'flex': say(pick(LINES.full), 4000); await sideAction(clips.flex()); break;
    case 'tired': say(pick(LINES.lowBattery), 4000); await sideAction(clips.tired(), false); break;
    case 'doze': case 'curl':
      await sleep(id);
      // A short demo nap, then back up (unless you asked him to keep sleeping).
      setTimeout(async () => { if (mode === 'sleep' && hold.kind !== 'sleep') { await wake(false); schedule(rand(6000, 12000)); } }, 6000);
      return;
  }
  schedule(rand(8000, 15_000));
}

// ---------- tray / settings ----------
async function trayAction(a: string) {
  if (a === 'sleep' && mode !== 'sleep' && mode !== 'held') { abortGame(); walkStop?.(); anim.stop(); clearTimeout(decideTimer); await sleep(); }
  if (a === 'wake' && mode === 'sleep') { await wake(true); schedule(rand(6000, 12000)); }
}
host.onAction(a => { trayAction(a).catch(e => host.log(`${a} failed: ${e?.stack || e}`)); });
host.onSettings(s => { S = s; applyTheme(); updateLow(); applyPerf(); });
host.onHold(h => { applyHold(h).catch(e => host.log(`hold failed: ${e?.stack || e}`)); });

async function applyHold(h: Hold) {
  const prev = hold;
  hold = h;
  if (game && (h.pin !== prev.pin || h.kind !== prev.kind)) { abortGame(); mode = 'busy'; await toFront('smile'); }
  if (h.pin && !prev.pin) {
    walkStop?.();
    if (perch) { perch = null; clearInterval(perchWatch); } // stays on that spot even if the window moves
    host.savePos();
    say(pick(LINES.pinned), 2400);
  }
  if (h.kind !== prev.kind) {
    walkStop?.();
    if (h.kind === 'sleep' && mode !== 'sleep' && mode !== 'held') { anim.stop(); clearTimeout(decideTimer); sleep(); }
    else if (h.kind !== 'sleep' && h.kind !== 'free' && mode === 'sleep') { await wake(false); schedule(500); }
    else if (h.kind !== 'free') schedule(800);
    if (h.reason === 'user' && h.kind !== 'sleep' && h.kind !== 'free') say(pick(HOLD_LINES[h.kind]), 2600);
  }
  if (h.reason === 'timer') say(pick(LINES.timeUp), 3000);
  else if (!h.pin && prev.pin && h.kind === prev.kind) say(pick(LINES.unpinned), 2000);
  if (!h.pin && prev.pin && mode !== 'held') await settle();
}
host.onBatteryPresent(b => { hasBattery = b; initBattery(); });
host.onSay(t => say(t, 5000)); // host messages (updates)
host.onTry(id => { tryAction(id).catch(e => host.log(`try ${id} failed: ${e?.stack || e}`)); });

// ---------- boot ----------
async function boot() {
  const st = await host.getState();
  S = st.settings; hasBattery = st.hasBattery;
  if (st.hold) hold = st.hold;
  if (st.wokeUp) host.log('woke up: hello again');
  applyTheme();
  applyPerf();
  setOver(false);
  initBattery();
  mode = 'busy';
  anim.setFront({ ...FRONT_REST, expr: 'happy' });
  if (!(await fallToGround())) { /* already on the ground */ }
  await toFront('happy');
  say(pick(st.wokeUp ? LINES.helloAgain : LINES.hello()), 2800);
  await frontEarFlap();
  watchApps();
  watchActivity();
  schedule(hold.kind !== 'free' ? 1500 : rand(6000, 12000));
}
const BENCH = (window.host as any)?.bench as string | null;
if (BENCH) {
  // Perf benchmarks (scripts/bench.sh): 'idle' = static pose, no timers; 'fN'/'sN' = N front/side redraws per second.
  if (BENCH === 'tryall' || BENCH.startsWith('try:')) {
    // Scenario test: runs every ▶ Try action once (fake 600×400 window for window actions) and logs
    // how each one ends. Hide and seek: "finds" him on his second peek.
    const fake: Foreground = { name: 'FakeApp', x: 350, y: 300, w: 600, h: 400, max: false };
    getFg = async () => fake;
    (async () => {
      await boot();
      const only = BENCH.startsWith('try:') ? BENCH.slice(4).split(',') : null; // e.g. try:walk,run
      for (const a of ALL_ACTIONS.filter(x => !only || only.includes(x.id))) {
        const t0 = Date.now();
        let peeks = 0;
        const done = tryAction(a.id);
        while (Date.now() - t0 < 40_000) {
          await wait(200);
          const g = game as Game | null; // (read fresh: changes while we wait)
          if (g?.peeking) {
            const { bounds } = await host.winInfo();
            if (!peeks++) host.log(`  peek: x=${bounds.x} y=${bounds.y} upside=${document.body.classList.contains('upside')}`);
            else { g.found = true; g.wake?.(); }
            while (g.peeking) await wait(100);
          }
          if (Date.now() - t0 > 1500 && (mode as Mode) === 'front' && !anim.busy && !game) break;
        }
        await done;
        clearTimeout(decideTimer);
        const { bounds } = await host.winInfo();
        host.log(`try ${a.id}: ${((Date.now() - t0) / 1000).toFixed(1)}s mode=${mode} perch=${!!perch} at ${bounds.x},${bounds.y}`);
        await wait(500);
      }
      host.log('tryall done');
    })().catch(e => host.log(`tryall failed: ${e?.stack || e}`));
  } else if (BENCH === 'edge') {
    // Scenario test for tricky moments: grabbed mid-fall, tray Sleep during hide and seek, stuck below the screen.
    const at = async () => { const { bounds, workArea } = await host.winInfo(); return { x: bounds.x, y: bounds.y, ground: workArea.y + workArea.height - bounds.height }; };
    (async () => {
      await boot(); clearTimeout(decideTimer);
      // 0. dropped at the very top of the screen (real window watcher): how long until he's down?
      for (let k = 0; k < 2; k++) {
        host.move(700, 0); await wait(150);
        startDrag(10, 10); host.dragEnd(); await wait(300);
        const t0 = performance.now(); await endDrag(); const d = await at();
        host.log(`edge drop-from-top #${k + 1}: ${Math.round(performance.now() - t0)}ms onGround=${Math.abs(d.y - d.ground) <= 3} perch=${!!perch}`);
        clearTimeout(decideTimer);
      }
      // 1. grabbed while falling: the fall must stop moving him; after the drop he's on the ground, front
      host.move(600, 100); await wait(100);
      const f = fallToGround(); await wait(120);
      startDrag(10, 10); host.dragEnd(); // (don't follow the real cursor in a test)
      const a1 = await at(); await wait(400); const a2 = await at();
      host.log(`edge grab-mid-fall: still while held=${a1.y === a2.y} mode=${mode}`);
      await f; await endDrag(); const a3 = await at();
      host.log(`edge after drop: mode=${mode} onGround=${Math.abs(a3.y - a3.ground) <= 3}`);
      // 2. tray Sleep while hidden in hide and seek: he must come back to where he was
      const home = await at();
      const hs = hideAndSeek(true); await wait(4500);
      const hid = await at();
      await trayAction('sleep'); await hs; const back = await at();
      host.log(`edge sleep-during-hide: was y=${hid.y} now y=${back.y} home=${home.y} mode=${mode} hidden=${document.body.classList.contains('hiding')}`);
      await trayAction('wake');
      // 3. below the screen (e.g. taskbar moved): back into view
      host.move(back.x, back.ground + 150); await wait(100);
      mode = 'front'; await settle(); const s3 = await at();
      host.log(`edge below-screen: onGround=${Math.abs(s3.y - s3.ground) <= 3}`);
      host.log('edge done');
    })().catch(e => host.log(`edge failed: ${e?.stack || e}`));
  } else if (BENCH === 'perch') {
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
