/** Checks that a build used the merchant's own brand (spec 2026-10-16 brand source §3): its colours and one of its quotes. */
import { parse } from 'parse5';
import type { Palette } from './design-engine/frame-draw';
import { visibleText, type BrandQuote } from './brand-source-website';

type File = { path: string; content: string; encoding?: string };
const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i;
const toRgb = (hex: string) => { const h = hex.replace('#', ''); const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h; return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)); };
/** CIE76 ΔE in Lab: enough to tell «the same colour, a shade off» from «another colour». */
const lab = ([r, g, b]: number[]) => {
  const lin = [r, g, b].map(v => { v /= 255; return v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92; });
  const xyz = [(lin[0] * .4124 + lin[1] * .3576 + lin[2] * .1805) / .95047, lin[0] * .2126 + lin[1] * .7152 + lin[2] * .0722, (lin[0] * .0193 + lin[1] * .1192 + lin[2] * .9505) / 1.08883];
  const [x, y, z] = xyz.map(t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a: string, b: string) => { const [p, q] = [lab(toRgb(a)), lab(toRgb(b))]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const TOKENS: Array<[string, 'paper' | 'ink' | 'accent']> = [['--store-background', 'paper'], ['--store-foreground', 'ink'], ['--store-accent', 'accent']];

/** A near-white or near-black with almost no colour: always fits a brand. */
const neutral = (hex: string) => { const [l, a, b] = lab(toRgb(hex)); return Math.hypot(a, b) < 8 && (l > 94 || l < 14); };

/** The store's colour tokens against the brand: a token passes when it is a neutral or within ΔE 12 of any of the brand's
 *  colours (the palette and every colour sampled from its images); a token never set, or not a hex, is not judged.
 *  Live 2026-10-16: the model rightly used the posts' magenta as accent while the palette's accent was their green. */
export function brandColourDrift(files: File[], palette: Palette, brandColours: string[] = []): string[] {
  const css = files.filter(f => f.encoding !== 'base64' && /\.css$/i.test(f.path)).map(f => f.content).join('\n');
  const allowed = [palette.paper, palette.ink, palette.accent, palette.accent2, ...brandColours.filter(value => HEX.test(value))];
  const problems: string[] = [];
  for (const [token, key] of TOKENS) {
    const declared = [...css.matchAll(new RegExp(`${token}\\s*:\\s*([^;}]+)`, 'gi'))].at(-1)?.[1].match(HEX)?.[0];
    if (declared && !neutral(declared) && !allowed.some(colour => deltaE(declared, colour) <= 12)) problems.push(`${token} es ${declared}, pero los colores de la marca del comercio son ${palette[key]} y los de sus imágenes`);
  }
  return problems.length ? [`Colores de la marca: ${problems.join('; ')}. Usa los colores de las imágenes de su marca.`] : [];
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[«»"“”'‘’]/g, '').replace(/\s+/g, ' ').trim();
const pageText = (html: string) => visibleText(parse(html));

/** The first brand quote that appears in some page (entities decoded by the parser, accents/case/quotes/spacing folded). */
export function brandQuoteFound(files: File[], quotes: BrandQuote[]): BrandQuote | undefined {
  const text = fold(files.filter(f => f.encoding !== 'base64' && /\.html$/i.test(f.path)).map(f => pageText(f.content)).join(' '));
  return quotes.find(quote => text.includes(fold(quote.text)));
}
/** At least one brand quote appears in some page; no quotes is true. */
export const brandQuotesUsed = (files: File[], quotes: BrandQuote[]) => !quotes.length || Boolean(brandQuoteFound(files, quotes));
