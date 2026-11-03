/** Chunky colour titles (spec 2026-11-03): four title styles YAPI picks per product on Único stores, the colours they are drawn in
 *  (from the store's photos, always readable on the page) and the chat asks that change them. Pure; no I/O. */
import { contrastRatio } from './sketch/sketch-schema';

export type TitleStyle = 'burbuja' | 'redonda' | 'firme' | 'poster';
export const TITLE_STYLES: Record<TitleStyle, { font: string; colours: number; underline: boolean }> = {
  burbuja: { font: 'baloo-2', colours: 4, underline: true }, redonda: { font: 'fredoka', colours: 2, underline: true },
  firme: { font: 'archivo-black', colours: 2, underline: false }, poster: { font: 'anton', colours: 3, underline: false },
};
export const isTitleStyle = (value: unknown): value is TitleStyle => typeof value === 'string' && value in TITLE_STYLES;

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
const distance = (a: string, b: string) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const mix = (a: string, b: string, t: number) => '#' + rgb(a).map((value, at) => Math.round(value * (1 - t) + rgb(b)[at] * t).toString(16).padStart(2, '0')).join('');
/** Darkened toward ink until it reads on the paper at 3:1 (large text); ink itself always does. */
const readable = (colour: string, paper: string, ink: string) => {
  for (let step = 0; step <= 10; step++) { const mixed = mix(colour, ink, step / 10); if (contrastRatio(mixed, paper) >= 3) return mixed; }
  return ink.toLowerCase();
};

/** Up to four title colours: the accent as text first, then the photos' other goods colours, then the deep colour; ink when fewer than two. */
export function titleColours(input: { paper: string; ink: string; accentInk: string; deep?: string; extras?: string[] }): string[] {
  const out: string[] = [];
  for (const candidate of [input.accentInk, ...(input.extras ?? []), ...(input.deep ? [input.deep] : [])]) {
    if (!HEX.test(candidate) || out.length >= 4) continue;
    const colour = readable(candidate.toLowerCase(), input.paper, input.ink);
    if (out.every(kept => distance(kept, colour) >= 40)) out.push(colour);
  }
  if (out.length < 2) out.push(input.ink.toLowerCase());
  return out;
}

export function libraryTitleStyle(answer: { titleStyle?: unknown } | null | undefined, playful: boolean): TitleStyle {
  if (playful) return 'burbuja';
  return isTitleStyle(answer?.titleStyle) ? answer!.titleStyle as TitleStyle : 'redonda';
}

// «títulos más tranquilos / más divertidos», «cambia los títulos»: only when that is the whole request.
const CALMER = /\bt[ií]tulos?\s+(?:m[aá]s\s+)?(tranquil|sobri|calmad|seri)[oa]s?\b/gi;
const LIVELIER = /\bt[ií]tulos?\s+(?:m[aá]s\s+)?(divertid|colorid|loc)[oa]s?\b|\bt[ií]tulos?\s+(?:m[aá]s\s+)?alegres?\b/gi;
const OTHER = /\b(cambia|otr[oa]s?)\s+(?:los\s+|el\s+)?t[ií]tulos?\b|\bt[ií]tulos?\s+distint[oa]s\b/gi;
const FILLER = new Set(['haz', 'hazme', 'pon', 'ponle', 'los', 'las', 'el', 'la', 'que', 'sean', 'sea', 'mas', 'un', 'poco', 'por', 'favor', 'porfa',
  'quiero', 'quisiera', 'mis', 'de', 'mi', 'tienda', 'estilo', 'ahora']);
export function readTitleAsk(text: string): 'calmer' | 'livelier' | 'other' | null {
  const found = ([['calmer', CALMER], ['livelier', LIVELIER], ['other', OTHER]] as const).find(([, pattern]) => { const hit = pattern.test(text); pattern.lastIndex = 0; return hit; });
  if (!found) return null;
  const rest = text.replace(CALMER, ' ').replace(LIVELIER, ' ').replace(OTHER, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return rest.every(word => FILLER.has(word)) ? found[0] : null;
}

const LADDER: TitleStyle[] = ['burbuja', 'redonda', 'firme'];
export function nextTitleStyle(current: string | undefined, ask: 'calmer' | 'livelier' | 'other'): TitleStyle {
  const style = isTitleStyle(current) ? current : 'redonda';
  if (ask === 'other') return (['burbuja', 'redonda', 'firme', 'poster'] as TitleStyle[]).find(id => id !== style)!;
  const at = LADDER.indexOf(style === 'poster' ? 'redonda' : style);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, at + (ask === 'calmer' ? 1 : -1)))];
}
