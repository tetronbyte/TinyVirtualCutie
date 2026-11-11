import { poseSVG, POSES, type PoseParams, type Theme } from '../art/dumbo.js';
import { frontSVG } from '../art/front.js';

/**
 * Two views, both generated from the Claude Design code:
 *  - 'side'  : full-body side view, used for walking, running, exercise, coding... (pose keyframe clips)
 *  - 'front' : 3/4 sitting view facing you, expressive face, eyes follow the cursor
 */
export type View = 'side' | 'front';

export interface Key { p: PoseParams; ms: number }
export interface Clip { keys: Key[]; loop?: boolean; fps?: number }

export interface FrontState {
  expr: string;
  gaze: [number, number];
  blink: number;
  tilt: number;
  head: [number, number];
  earAdd: [number, number];
  bounce: number;
}
export const FRONT_REST: FrontState = { expr: 'neutral', gaze: [0, 0], blink: 0, tilt: 0, head: [0, 0], earAdd: [0, 0], bounce: 0 };

/** Side-view crop of the design canvas (aspect matches the 120×116 pet stage). */
export const SIDE_VIEWBOX = '0 -66 540 522';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

const NUM_ARRAYS = ['root', 'head', 'ears', 'trunk'] as const;
const DEFAULTS: Record<string, number[]> = { root: [0, 0, 0], head: [0, 0, 0], ears: [0, 0], trunk: [0, 0] };

/** Blend two side poses: numbers interpolate, discrete fields switch halfway. */
export function blend(a: PoseParams, b: PoseParams, t: number): PoseParams {
  const out: PoseParams = { ...(t < 0.5 ? a : b) };
  for (const k of NUM_ARRAYS) {
    const av = (a[k] ?? DEFAULTS[k]) as number[], bv = (b[k] ?? DEFAULTS[k]) as number[];
    (out as any)[k] = av.map((v, i) => lerp(v, bv[i], t));
  }
  out.tail = lerp(a.tail ?? 0, b.tail ?? 0, t);
  out.breathe = lerp(a.breathe ?? 1, b.breathe ?? 1, t);
  const legs: Record<string, number> = {};
  for (const k of ['fl', 'ff', 'bl', 'bf'] as const) legs[k] = lerp(a.legs?.[k] ?? 0, b.legs?.[k] ?? 0, t);
  out.legs = legs;
  out.rp = (Math.abs(b.root?.[2] ?? 0) > 0 ? b.rp : a.rp) ?? b.rp ?? a.rp;
  return out;
}

function blendFront(a: FrontState, b: FrontState, t: number): FrontState {
  const l2 = (x: [number, number], y: [number, number]): [number, number] => [lerp(x[0], y[0], t), lerp(x[1], y[1], t)];
  return {
    expr: t < 0.5 ? a.expr : b.expr,
    gaze: l2(a.gaze, b.gaze), head: l2(a.head, b.head), earAdd: l2(a.earAdd, b.earAdd),
    blink: lerp(a.blink, b.blink, t), tilt: lerp(a.tilt, b.tilt, t), bounce: lerp(a.bounce, b.bounce, t),
  };
}

export function frame(set: string, i: number): PoseParams {
  const s = POSES.find(p => p[0] === set);
  if (!s) throw new Error(`unknown pose set ${set}`);
  return s[3][i][1];
}

type Job =
  | { view: 'side'; clip: Clip; idx: number; from: PoseParams; t0: number; fps: number }
  | { view: 'front'; keys: Array<{ s: FrontState; ms: number }>; loop: boolean; idx: number; from: FrontState; t0: number; fps: number };

/**
 * Event-driven renderer: draws only while something moves, then stops (no idle loop → ~0% CPU).
 * Every drawn frame costs real CPU in Electron (~10–30 ms), so clips run at low, cartoon-style
 * frame rates (10–14 fps) and nothing animates continuously.
 */
export class Animator {
  /** Diagnostics: total SVG redraws (all instances). */
  static draws = 0;
  view: View = 'front';
  side: PoseParams = {};
  front: FrontState = { ...FRONT_REST };
  private theme: Theme = 'light';
  private job: Job | null = null;
  private raf = 0;
  private lastDraw = 0;
  private lastSvg = '';
  private done: (() => void) | null = null;

  constructor(private el: HTMLElement) {}

  get busy() { return this.job !== null; }

  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.redraw();
  }

  /** Show a side pose immediately. */
  setSide(p: PoseParams) { this.stop(); this.view = 'side'; this.side = p; this.redraw(); }
  /** Show a front state immediately. */
  setFront(s: Partial<FrontState>) { this.stop(); this.view = 'front'; this.front = { ...this.front, ...s }; this.redraw(); }

  /** Play a side-view keyframe clip. Resolves when it ends or is interrupted. */
  play(clip: Clip): Promise<void> {
    this.stop();
    if (this.view !== 'side') { this.view = 'side'; }
    this.job = { view: 'side', clip, idx: 0, from: this.side, t0: performance.now(), fps: clip.fps ?? 12 };
    return this.run();
  }

  /** Tween the front view through one or more targets. */
  face(keys: Array<{ s: Partial<FrontState>; ms: number }>, loop = false, fps = 14): Promise<void> {
    this.stop();
    this.view = 'front';
    let prev = this.front;
    const full = keys.map(k => (prev = { ...prev, ...k.s, gaze: (k.s.gaze ?? prev.gaze) as [number, number] }, { s: prev, ms: k.ms }));
    this.job = { view: 'front', keys: full, loop, idx: 0, from: this.front, t0: performance.now(), fps };
    return this.run();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.job = null;
    const d = this.done; this.done = null; d?.();
  }

  private run(): Promise<void> {
    return new Promise(res => { this.done = res; this.tick(); });
  }

  private tick = () => {
    const j = this.job;
    if (!j) return;
    const now = performance.now();
    const ms = j.view === 'side' ? j.clip.keys[j.idx].ms : j.keys[j.idx].ms;
    const t = ms <= 0 ? 1 : Math.min(1, (now - j.t0) / ms);
    if (now - this.lastDraw >= 1000 / j.fps || t >= 1) {
      if (j.view === 'side') this.side = blend(j.from, j.clip.keys[j.idx].p, ease(t));
      else this.front = blendFront(j.from, j.keys[j.idx].s, ease(t));
      this.redraw();
      this.lastDraw = now;
    }
    if (t >= 1) {
      const len = j.view === 'side' ? j.clip.keys.length : j.keys.length;
      const loop = j.view === 'side' ? !!j.clip.loop : j.loop;
      if (j.view === 'side') j.from = j.clip.keys[j.idx].p; else j.from = j.keys[j.idx].s;
      j.t0 = now;
      j.idx++;
      if (j.idx >= len) {
        if (loop) j.idx = 0;
        else { this.stop(); return; }
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private redraw() {
    const svg = this.view === 'side'
      ? poseSVG(this.theme, this.side, 'd').replace('viewBox="-60 -110 700 560"', `viewBox="${SIDE_VIEWBOX}"`)
      : frontSVG(this.theme, this.front, 'f');
    if (svg === this.lastSvg) return;
    this.lastSvg = svg;
    this.el.innerHTML = svg;
    Animator.draws++;
  }
}
