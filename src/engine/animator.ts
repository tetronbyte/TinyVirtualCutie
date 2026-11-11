import { poseSVG, POSES, type PoseParams, type Theme } from '../art/dumbo.js';

/** A keyframe: pose params + how long to travel from the previous key to this one (ms). */
export interface Key { p: PoseParams; ms: number }
export interface Clip { keys: Key[]; loop?: boolean; fps?: number }

/** Crop of the design canvas shown in the pet window (aspect must match the window: 120×116). */
export const VIEWBOX = '0 -66 540 522';

const lerp =(a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep

const NUM_ARRAYS = ['root', 'head', 'ears', 'trunk'] as const;
const DEFAULTS: Record<string, number[]> = { root: [0, 0, 0], head: [0, 0, 0], ears: [0, 0], trunk: [0, 0] };

/** Blend two poses. Numbers interpolate; discrete fields (eyes, mouth, base, hood, props) switch halfway. */
export function blend(a: PoseParams, b: PoseParams, t: number): PoseParams {
  const out: PoseParams = { ...(t < 0.5 ? a : b) };
  for (const k of NUM_ARRAYS) {
    const av = (a[k] ?? DEFAULTS[k]) as number[];
    const bv = (b[k] ?? DEFAULTS[k]) as number[];
    (out as any)[k] = av.map((v, i) => lerp(v, bv[i], t));
  }
  out.tail = lerp(a.tail ?? 0, b.tail ?? 0, t);
  out.breathe = lerp(a.breathe ?? 1, b.breathe ?? 1, t);
  const legs: Record<string, number> = {};
  for (const k of ['fl', 'ff', 'bl', 'bf'] as const) {
    legs[k] = lerp(a.legs?.[k] ?? 0, b.legs?.[k] ?? 0, t);
  }
  out.legs = legs;
  // Root pivot only matters when rotating; take the one of whichever side rotates.
  out.rp = (Math.abs(b.root?.[2] ?? 0) > 0 ? b.rp : a.rp) ?? b.rp ?? a.rp;
  return out;
}

/** Look up a frame from the design's pose sheet, e.g. frame('walk', 0). */
export function frame(set: string, i: number): PoseParams {
  const s = POSES.find(p => p[0] === set);
  if (!s) throw new Error(`unknown pose set ${set}`);
  return s[3][i][1];
}

/**
 * Event-driven renderer: draws only while a clip is moving, then stops completely
 * (no rAF loop when idle → ~0% CPU). Idle breathing is a CSS animation on the compositor.
 */
export class Animator {
  private el: HTMLElement;
  private theme: Theme = 'light';
  private current: PoseParams = {};
  private clip: Clip | null = null;
  private idx = 0;
  private from: PoseParams = {};
  private t0 = 0;
  private raf = 0;
  private lastDraw = 0;
  private lastKey = '';
  private done: (() => void) | null = null;

  constructor(el: HTMLElement) { this.el = el; }

  get pose() { return this.current; }
  get busy() { return this.clip !== null; }

  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.lastKey = '';
    this.draw(this.current);
  }

  /** Jump to a pose immediately. */
  set(p: PoseParams) { this.stop(); this.draw(p); }

  /** Play a clip from the current pose. Resolves when a non-looping clip ends (or is interrupted). */
  play(clip: Clip): Promise<void> {
    this.stop();
    this.clip = clip;
    this.idx = 0;
    this.from = this.current;
    this.t0 = performance.now();
    return new Promise(res => { this.done = res; this.tick(); });
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clip = null;
    const d = this.done; this.done = null; d?.();
  }

  private tick = () => {
    const clip = this.clip;
    if (!clip) return;
    const now = performance.now();
    const key = clip.keys[this.idx];
    const t = key.ms <= 0 ? 1 : Math.min(1, (now - this.t0) / key.ms);
    const frameMs = 1000 / (clip.fps ?? 24);
    if (now - this.lastDraw >= frameMs || t >= 1) {
      this.draw(blend(this.from, key.p, ease(t)));
      this.lastDraw = now;
    }
    if (t >= 1) {
      this.from = key.p;
      this.t0 = now;
      this.idx++;
      if (this.idx >= clip.keys.length) {
        if (clip.loop) this.idx = 0;
        else { this.current = key.p; this.stop(); return; }
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(p: PoseParams) {
    this.current = p;
    // Design canvas is "-60 -110 700 560" (room for props); crop tight around the pet for the desktop.
    const svg = poseSVG(this.theme, p, 'd').replace('viewBox="-60 -110 700 560"', `viewBox="${VIEWBOX}"`);
    if (svg === this.lastKey) return;
    this.lastKey = svg;
    this.el.innerHTML = svg;
  }
}
