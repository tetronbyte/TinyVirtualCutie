import type { PoseParams } from '../art/dumbo.js';
import { frame, type Clip, type Key } from './animator';

export const STAND: PoseParams = {};
export const SIT: PoseParams = frame('sitdown', 2);
export const ASLEEP: PoseParams = frame('sleep', 2);

const k = (p: PoseParams, ms: number): Key => ({ p, ms });
/** Design-sheet frame. Explanatory props (cursor arrows, fake windows, in-art bubbles) are dropped;
 *  real props (laptop, rope, plug, cable, socket) are kept. Speech is drawn by the page instead. */
const DROP = new Set(['cursor', 'window', 'bubble', 'motion']);
const f = (set: string, i: number, _keep = true): PoseParams => {
  const p = frame(set, i);
  const props = (p.props || []).filter(x => !DROP.has(String(x.k)));
  return props.length ? { ...p, props } : (({ props: _, ...rest }) => rest)(p);
};
const repeat = (keys: Key[], n: number) => Array.from({ length: n }, () => keys).flat();

/** Side-view clips (all frames come from the Claude Design pose sheet). */
export const clips = {
  earflap: (): Clip => ({ keys: [k(f('earflap', 0), 160), ...repeat([k(f('earflap', 1), 170), k(f('earflap', 2), 170)], 2), k(STAND, 260)] }),
  wave: (): Clip => ({ keys: [k(f('wave', 0), 320), ...repeat([k(f('wave', 1), 260), k(f('wave', 2), 260)], 2), k(STAND, 380)] }),
  walk: (): Clip => ({ loop: true, fps: 10, keys: [0, 1, 2, 3].map(i => k(f('walk', i), 210)) }),
  run: (): Clip => ({ loop: true, fps: 12, keys: [0, 1, 2, 3].map(i => k(f('run', i), 120)) }),
  toStand: (): Clip => ({ keys: [k(STAND, 260)] }),
  sitDown: (): Clip => ({ keys: [k(f('sitdown', 1), 380), k(SIT, 360)] }),
  standUp: (): Clip => ({ keys: [k(f('sitdown', 1), 360), k(STAND, 380)] }),

  curlUp: (): Clip => ({ fps: 10, keys: [k(f('sleep', 0), 1400), k(f('sleep', 0), 1000), k(f('sleep', 1), 1500), k(ASLEEP, 1600)] }),
  uncurl: (): Clip => ({ keys: [k(f('sleep', 1), 500), k(f('sleep', 0), 600), k({ ...SIT, eyes: 'happy', mouth: 'smile' }, 400)] }),

  dangle: (pout: boolean): Clip => ({ keys: [k(f('scruff', pout ? 1 : 0), 180)] }),
  /** Falling back to the ground after being dropped mid-air. */
  fall: (): Clip => ({ keys: [k({ ...f('scruff', 0), eyes: 'strain', mouth: 'laugh' }, 120)] }),
  land: (): Clip => ({ keys: [k({ breathe: .9, root: [0, 6, 0], ears: [-14, -10], eyes: 'happy', mouth: 'smile' }, 110), k(STAND, 260)] }),

  pushups: (n = 5): Clip => ({ keys: [k(f('pushups', 0), 400), ...repeat([k(f('pushups', 1), 520), k(f('pushups', 0), 480)], n), k(STAND, 400)] }),
  rope: (n = 6): Clip => ({ fps: 12, keys: [...repeat([k(f('rope', 0, true), 260), k(f('rope', 1, true), 240)], n), k(STAND, 300)] }),
  trip: (): Clip => ({ keys: [k(f('trip', 0), 260), k(f('trip', 1), 300), k(f('trip', 1), 700), k(f('trip', 2), 600), k(f('trip', 2), 1200)] }),

  /** Coding in the hoodie at a tiny laptop. Hood goes up when he's "focused". */
  coding: (focusedBursts = 2): Clip => ({
    loop: false, fps: 8,
    keys: [
      k(f('coding', 0, true), 500),
      ...repeat([k(f('coding', 1, true), 230), k(f('coding', 0, true), 230)], 6),
      ...Array.from({ length: focusedBursts }, () => [
        k(f('coding', 2, true), 600),
        ...repeat([k({ ...f('coding', 2, true), legs: { fl: -26, ff: -38 } }, 220), k(f('coding', 2, true), 220)], 6),
        k(f('coding', 0, true), 500),
        ...repeat([k(f('coding', 1, true), 230), k(f('coding', 0, true), 230)], 4),
      ]).flat(),
    ],
  }),

  /** "Unplug me, I'm full!" — up on back legs flexing, bubble is drawn by the page (not the art). */
  flex: (): Clip => ({ keys: [k(f('flex', 0, false), 500), ...repeat([k(f('flex', 1), 420), k(f('flex', 0), 420)], 3), k(STAND, 500)] }),
  tired: (): Clip => ({ fps: 8, keys: [k(f('tired', 0), 900), k(f('tired', 1), 1800), k(f('tired', 0), 1400)] }),
  chargedBounce: (): Clip => ({ keys: repeat([k(f('charged', 0), 220), k(f('charged', 1), 200)], 3) }),
};
