import type { Theme } from './dumbo.js';
export const FRONT_VIEWBOX: string;
export const EXPRESSIONS: Record<string, Record<string, unknown>>;
export function frontSVG(theme: Theme, s?: {
  expr?: string; gaze?: [number, number]; blink?: number; tilt?: number;
  head?: [number, number]; earAdd?: [number, number]; bounce?: number; shadow?: boolean;
}, u?: string): string;
