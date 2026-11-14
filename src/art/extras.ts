// Small props drawn on top of the front (3/4 sitting) view: party hat, nightcap, water cup.
// Our own art (not from the Claude Design sheets), in the same coordinate space as front.js
// (head ellipse around 205,145; the head group pivots at 205,245). Outline matches the design (SW).
import { TH, SW } from './dumbo.js';
import type { Theme } from './dumbo.js';

export type Hat = 'party' | 'night' | null;
export interface Extras { hat: Hat; cup: boolean }
export const NO_EXTRAS: Extras = { hat: null, cup: false };

/** Hat on his head (goes inside the head transform). */
export function hatSVG(theme: Theme, hat: Hat, u: string): string {
  const ol = (TH as any)[theme].ol;
  if (hat === 'party') {
    const cone = 'M196 68 L262 -50 L318 58 Q258 84 196 68 Z';
    return `<g transform="translate(-4 12) rotate(14 257 30)">
      <clipPath id="${u}hc"><path d="${cone}"/></clipPath>
      <path d="${cone}" fill="#ff8fb8"/>
      <g clip-path="url(#${u}hc)" fill="#ffe27a"><path d="M170 30 L340 -10 L340 12 L170 52 Z"/><path d="M170 -10 L340 -50 L340 -28 L170 12 Z"/><path d="M170 70 L340 30 L340 52 L170 92 Z"/></g>
      <path d="${cone}" fill="none" stroke="${ol}" stroke-width="${SW}" stroke-linejoin="round"/>
      <circle cx="262" cy="-52" r="15" fill="#8fd6ff" stroke="${ol}" stroke-width="${SW - 1}"/>
    </g>`;
  }
  if (hat === 'night') {
    const cap = 'M128 82 C126 20 190 -22 262 -18 C330 -14 372 30 368 92 C352 54 330 36 300 36 C318 52 322 66 318 80 C250 60 190 64 128 82 Z';
    const band = 'M122 86 C190 62 252 58 324 82 L326 100 C252 76 190 80 124 104 Z';
    return `<g>
      <path d="${cap}" fill="#8f9ff0" stroke="${ol}" stroke-width="${SW}" stroke-linejoin="round"/>
      <path d="M180 10 Q230 -6 280 0" fill="none" stroke="#c7cff9" stroke-width="6" stroke-linecap="round" opacity=".8"/>
      <path d="${band}" fill="#f4f0ff" stroke="${ol}" stroke-width="${SW}" stroke-linejoin="round"/>
      <circle cx="370" cy="98" r="17" fill="#f4f0ff" stroke="${ol}" stroke-width="${SW - 1}"/>
    </g>`;
  }
  return '';
}

/** Little cup of water held up near his trunk (goes in the body group). */
export function cupSVG(theme: Theme): string {
  const ol = (TH as any)[theme].ol;
  return `<g transform="translate(-8 -24)">
    <path d="M280 300 C300 296 312 300 314 306" fill="none" stroke="${ol}" stroke-width="${SW - 1}"/>
    <path d="M300 296 C324 294 330 326 304 330" fill="none" stroke="${ol}" stroke-width="${SW}" stroke-linecap="round"/>
    <path d="M236 284 L304 284 L296 346 Q270 356 244 346 Z" fill="#e8f6ff" stroke="${ol}" stroke-width="${SW}" stroke-linejoin="round"/>
    <path d="M241 300 L299 300 L295 330 Q270 338 245 330 Z" fill="#7cc8f7" opacity=".9"/>
    <ellipse cx="270" cy="300" rx="29" ry="6" fill="#a9dcfb"/>
  </g>`;
}
