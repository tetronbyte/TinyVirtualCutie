// Front-facing (3/4) sitting Dumbo with a fully expressive head.
// Body = "master 3/4 sit" from Dumbo Poses.dc.html (pet3q); head = Dumbo Expressions.dc.html layers().
// Both share the same coordinate space (head ellipse at 205,145), so they compose directly.
import { TH, P3, TAIL_TUFT, SW } from './dumbo.js';
import { EXPR, layers, faceDefs, r1 } from './face.js';

export const EXPRESSIONS = Object.fromEntries(EXPR.map(([key, , cfg]) => [key, cfg]));

/** Viewport for the pet window (aspect ≈ 120×116, ground at the same height as the side view). */
export const FRONT_VIEWBOX = '-48 -66 506 490';

/**
 * @param {'light'|'dark'} theme
 * @param {{expr?:string, gaze?:[number,number], blink?:number, tilt?:number, head?:[number,number], earAdd?:[number,number], bounce?:number, shadow?:boolean}} s
 * @param {string} u unique id prefix
 */
export function frontSVG(theme, s = {}, u = 'f') {
  const t = TH[theme], ol = t.ol, id = x => u + x;
  const base = EXPRESSIONS[s.expr || 'neutral'] || EXPRESSIONS.neutral;
  // A full blink uses the design's soft closed-eye curve (lids alone leave hollow eye outlines).
  const shut = (s.blink || 0) >= 0.85 && !['happy', 'sleep'].includes(String(base.eyes));
  const k = { ...base, gaze: s.gaze, blink: shut ? 0 : s.blink, earAdd: s.earAdd, ...(shut ? { eyes: 'sleep' } : {}) };
  const G = layers(theme, k, u);
  const hx = (s.head || [0, 0])[0], hy = (s.head || [0, 0])[1], tilt = (base.tilt || 0) + (s.tilt || 0);
  const headT = `translate(${r1(hx)} ${r1(hy)}) rotate(${r1(tilt)} 205 245)`;
  const by = s.bounce || 0;

  const pad = (cx, cy, rx, ry, rot) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="${t.pad}"/>`;
  const bodySil = (cc, sw) => `<path d="${P3.TAIL}" fill="none" stroke="${cc}" stroke-width="${10 + sw}" stroke-linecap="round"/><path d="${TAIL_TUFT}" fill="${cc}" stroke="${cc}" stroke-width="${sw}"/><ellipse cx="210" cy="318" rx="92" ry="78" fill="${cc}" stroke="${cc}" stroke-width="${sw}"/><path d="${P3.LEG_L}Z" fill="${cc}" stroke="${cc}" stroke-width="${sw}"/><path d="${P3.LEG_R}Z" fill="${cc}" stroke="${cc}" stroke-width="${sw}"/><ellipse ${P3.FOOT_L} fill="${cc}" stroke="${cc}" stroke-width="${sw}"/><ellipse ${P3.FOOT_R} fill="${cc}" stroke="${cc}" stroke-width="${sw}"/>`;
  const rimCol = `url(#${id('rim')})`;
  const rim = t.neon
    ? `<g filter="url(#${id('glow')})" opacity=".8">${bodySil(rimCol, 20)}<g transform="${headT}">${G.sil([rimCol, 20])}</g></g>${bodySil(rimCol, 13)}<g transform="${headT}">${G.sil([rimCol, 13])}</g>`
    : '';

  const defs = faceDefs(theme, u).replace('</defs>',
    `<linearGradient id="${id('belly')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.belly1}"/><stop offset="1" stop-color="${t.belly2}"/></linearGradient>` +
    `<clipPath id="${id('bod')}"><ellipse cx="210" cy="318" rx="92" ry="78"/></clipPath>` +
    `<filter id="${id('sh')}" x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="6"/></filter></defs>`);

  const shadow = s.shadow === false ? '' : `<ellipse cx="214" cy="408" rx="${r1(168 - Math.abs(by) * .6)}" ry="13" fill="${t.neon ? '#000' : ol}" opacity="${t.neon ? .5 : .16}" filter="url(#${id('sh')})"/>`;

  const body =
    `<path d="${P3.TAIL}" fill="none" stroke="${ol}" stroke-width="${10 + SW * 2}" stroke-linecap="round"/><path d="${P3.TAIL}" fill="none" stroke="${t.shade}" stroke-width="10" stroke-linecap="round"/><path d="${TAIL_TUFT}" fill="${t.tuft}" stroke="${ol}" stroke-width="5" stroke-linejoin="round"/>` +
    `<g transform="${headT}">${G.ears}</g>` +
    `<ellipse cx="210" cy="318" rx="92" ry="78" fill="${t.shade}"/><g clip-path="url(#${id('bod')})"><ellipse cx="198" cy="306" rx="90" ry="76" fill="url(#${id('body')})" filter="url(#${id('soft')})"/></g><ellipse cx="210" cy="318" rx="92" ry="78" fill="none" stroke="${ol}" stroke-width="${SW}"/>` +
    `<path d="M188 266 C182 294 194 318 215 330 C236 318 248 294 242 266 C230 257 200 257 188 266 Z" fill="url(#${id('belly')})"/>` +
    `<path d="${P3.LEG_L}Z" fill="url(#${id('body')})"/><path d="${P3.LEG_L}" fill="none" stroke="${ol}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${P3.LEG_R}Z" fill="url(#${id('body')})"/><path d="${P3.LEG_R}" fill="none" stroke="${ol}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/>` +
    [172, 185, 198, 230, 243, 256].map(x => `<path d="M${x - 7} 400 Q${x - 7} 389 ${x} 389 Q${x + 7} 389 ${x + 7} 400" fill="${t.nail}" stroke="${ol}" stroke-width="3" stroke-linejoin="round"/>`).join('') +
    `<ellipse ${P3.FOOT_L} fill="${t.sole}" stroke="${ol}" stroke-width="${SW}"/>${pad(114, 366, 19, 15, -14)}${pad(86, 334, 7.5, 8, -14)}${pad(105, 321, 8.5, 9, -14)}${pad(127, 324, 7.5, 8, -14)}` +
    `<ellipse ${P3.FOOT_R} fill="${t.sole}" stroke="${ol}" stroke-width="${SW}"/>${pad(320, 362, 14, 12, 14)}${pad(302, 330, 5.5, 6, 14)}${pad(317, 320, 6, 6.5, 14)}${pad(333, 327, 5.5, 6, 14)}` +
    `<ellipse cx="210" cy="260" rx="78" ry="14" fill="${ol}" opacity=".18" filter="url(#${id('soft')})"/>`;

  const head = `<g transform="${headT}">${G.cheekPuff}${G.head}${G.hair}${G.brows}${G.eyes}${G.highlights}${G.lids}${G.blush}${G.mouth}${G.tongue}${G.trunk}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FRONT_VIEWBOX}">${defs}${shadow}<g transform="translate(0 ${r1(-by)})">${rim}${body}${head}</g></svg>`;
}
