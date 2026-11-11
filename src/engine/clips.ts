import type { PoseParams } from '../art/dumbo.js';
import { frame, type Clip } from './animator';

/** Neutral standing pose. */
export const STAND: PoseParams = {};
export const SIT: PoseParams = frame('sitdown', 2);
export const ASLEEP: PoseParams = frame('sleep', 2);

const k = (p: PoseParams, ms: number) => ({ p, ms });

export const clips = {
  blink: (base: PoseParams): Clip => ({ keys: [k({ ...base, eyes: 'closed' }, 70), k({ ...base, eyes: 'closed' }, 60), k(base, 90)], fps: 30 }),

  earflap: (): Clip => ({
    keys: [k(frame('earflap', 0), 160), k(frame('earflap', 1), 170), k(frame('earflap', 2), 170), k(frame('earflap', 1), 170), k(frame('earflap', 2), 170), k(frame('earflap', 0), 170), k(STAND, 260)],
  }),

  wave: (): Clip => ({
    keys: [k(frame('wave', 0), 320), k(frame('wave', 1), 260), k(frame('wave', 2), 260), k(frame('wave', 1), 260), k(frame('wave', 2), 260), k(STAND, 380)],
  }),

  walk: (): Clip => ({
    loop: true, fps: 20,
    keys: [k(frame('walk', 0), 210), k(frame('walk', 1), 210), k(frame('walk', 2), 210), k(frame('walk', 3), 210)],
  }),

  run: (): Clip => ({
    loop: true, fps: 24,
    keys: [0, 1, 2, 3].map(i => k(frame('run', i), 120)),
  }),

  toStand: (): Clip => ({ keys: [k(STAND, 260)] }),

  sitDown: (): Clip => ({ keys: [k(frame('sitdown', 1), 380), k(SIT, 360)] }),
  standUp: (): Clip => ({ keys: [k(frame('sitdown', 1), 360), k(STAND, 380)] }),

  fallAsleep: (): Clip => ({ keys: [k(frame('sitdown', 1), 380), k(SIT, 360), k(frame('sleep', 0), 1400), k(frame('sleep', 0), 1200), k(frame('sleep', 1), 1500), k(ASLEEP, 1600)], fps: 20 }),
  wakeUp: (): Clip => ({ keys: [k(frame('sleep', 1), 500), k(frame('sleep', 0), 600), k({ ...SIT, eyes: 'happy', mouth: 'smile' }, 400), k(frame('sitdown', 1), 400), k(STAND, 380)] }),

  /** Held by the cursor. Pouts if it was busy/sleeping. */
  dangle: (pout: boolean): Clip => ({ keys: [k(strip(frame('scruff', pout ? 1 : 0)), 180)] }),

  petted: (): Clip => ({ keys: [k(strip(frame('petted', 0)), 300), k(strip(frame('petted', 0)), 1400), k(STAND, 400)] }),

  tickled: (): Clip => ({
    keys: [k(strip(frame('petted', 1)), 140), k(strip(frame('petted', 2)), 160), k(strip(frame('petted', 1)), 160), k(strip(frame('petted', 2)), 160), k(strip(frame('petted', 1)), 160), k({ ...frame('earflap', 0) }, 300), k(STAND, 300)],
  }),

  happyBounce: (): Clip => ({ keys: [k({ ...frame('earflap', 1), root: [0, -18, 0] }, 180), k(frame('earflap', 0), 180), k({ ...frame('earflap', 1), root: [0, -12, 0] }, 170), k(STAND, 260)] }),
};

/** Remove design-sheet props (cursor arrows, windows) that only exist to explain the pose. */
function strip(p: PoseParams): PoseParams {
  const { props, ...rest } = p;
  return rest;
}
