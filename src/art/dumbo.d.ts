export type Theme = 'light' | 'dark';

/** Pose params understood by the Claude Design generator (see dumbo.js). */
export interface PoseParams {
  base?: 'stand' | 'sit';
  root?: [number, number, number];
  rp?: [number, number];
  head?: [number, number, number];
  ears?: [number, number];
  trunk?: [number, number];
  tail?: number;
  breathe?: number;
  legs?: Partial<Record<'fl' | 'ff' | 'bl' | 'bf', number>>;
  eyes?: 'closed' | 'happy' | 'strain' | 'half';
  brows?: 'worried' | 'determined' | 'raised';
  mouth?: 'laugh' | 'pout' | 'flat' | 'smile';
  blush?: number;
  hood?: 'up' | 'down';
  shadow?: boolean;
  shadowX?: number;
  props?: Array<Record<string, unknown>>;
  hide?: string[];
  show?: string[];
}

export type PoseSet = [key: string, title: string, note: string, frames: Array<[label: string, params: PoseParams]>];

export function poseSVG(theme: Theme, P: PoseParams, uid: string): string;
export const POSES: PoseSet[];
export const TH: Record<Theme, Record<string, unknown>>;
export const SW: number;
