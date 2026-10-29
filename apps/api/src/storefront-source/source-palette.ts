/** Identity libraries (T2b): a deterministic palette from the store's logo and product photos. Colour facts come from the
 * existing pixel sampler (source-photo-sampler.ts); no model. The result keeps the kit's contrast rules: ink on paper and
 * on surface at 4.5:1 or more, and the accent's own text (onAccent) at 4.5:1, the pay button's rule. No logo and no photo,
 * or a sampler that cannot run, gives no palette: the theme's own defaults apply. T4 decides when to use it. */
import { contrastRatio } from './source-scorecard';
import { samplePhotoColours, type PhotoSample } from './source-photo-sampler';

export type SourcePalette = { paper: string; ink: string; accent: string; surface: string; onAccent: string };
export type PaletteImage = { url: string; path: string; bytes: Buffer };
type Rgb = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/i;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const toRgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (colour: readonly number[]) => '#' + colour.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255], max = Math.max(x, y, z), min = Math.min(x, y, z), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255].map(Math.round) as Rgb;
}
const mix = (a: Rgb, b: Rgb, weight: number): Rgb => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * weight)) as Rgb;
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A colour that can carry a brand: saturated enough, neither near-white nor near-black. */
const chromatic = (colour: Rgb) => { const [, s, l] = toHsl(colour); return s >= .28 && l > .12 && l < .88; };
const brightness = (colour: Rgb) => contrastRatio(colour, BLACK);

/** Pure and deterministic: the same samples always give the same palette. `page` forces a light or a dark page (a bold
 *  style card wants the dark one); without it a logo on a dark backdrop decides. */
export function paletteFromSamples(input: { logo?: PhotoSample; photos?: PhotoSample[] }, options: { page?: 'light' | 'dark' } = {}): SourcePalette | undefined {
  const logo = (input.logo?.dominant ?? []).filter(value => HEX.test(value)).map(toRgb);
  const photos = (input.photos ?? []).flatMap(sample => {
    const backdrop = sample.backdropHex && HEX.test(sample.backdropHex) ? toRgb(sample.backdropHex) : undefined;
    // The goods, not what they sit on: a colour close to the backdrop is the table or the sweep.
    return (sample.dominant ?? []).filter(value => HEX.test(value)).map(toRgb).filter(colour => !backdrop || distance(colour, backdrop) > 40);
  });
  // A coloured logo first, then the goods; a monochrome brand (a black mark) takes its dark colour.
  const accent = logo.find(chromatic) ?? photos.find(chromatic) ?? [...logo, ...photos].find(colour => toHsl(colour)[2] < .35);
  if (!accent) return undefined;
  const backdrop = input.logo?.backdropHex && HEX.test(input.logo.backdropHex) ? toRgb(input.logo.backdropHex) : undefined;
  const dark = options.page ? options.page === 'dark' : !!backdrop && (input.logo?.uniformity ?? 0) >= .8 && toHsl(backdrop)[2] < .2;
  const [hue, saturation] = toHsl(accent);
  // Owner 2026-10-28 (PEPPA and DooBoo on the same #faf5f5): a light, tinted colour the brand already shows — the logo's or the
  // photos' backdrop (DooBoo's cream) — is the paper; only without one is the paper a near-white tint of the accent's hue.
  const lightBrand = [input.logo?.backdropHex, ...(input.photos ?? []).map(sample => sample.backdropHex)]
    .filter((value): value is string => !!value && HEX.test(value)).map(toRgb)
    .find(colour => { const [, s, l] = toHsl(colour); return l >= .84 && l <= .97 && s >= .12; });
  const paper = dark ? fromHsl(hue, Math.min(saturation, .18), .08) : lightBrand ?? fromHsl(hue, Math.min(saturation, .35), .95);
  let ink = dark ? fromHsl(hue, Math.min(saturation, .15), .94) : fromHsl(hue, Math.min(saturation, .3), .13);
  const surface = mix(paper, ink, .06);
  if (contrastRatio(ink, paper) < 4.5 || contrastRatio(ink, surface) < 4.5) ink = dark ? WHITE : BLACK;
  // The accent's text: white, the ink or the paper, whichever reads best; if none reaches 4.5:1, move the accent's
  // lightness away from that text until it does (white or near-black always gets there).
  const onAccent = (fill: Rgb): Rgb => [WHITE, ink, paper].reduce((best, colour) => contrastRatio(colour, fill) > contrastRatio(best, fill) ? colour : best);
  let fill = accent;
  for (let step = 0; step < 50 && contrastRatio(onAccent(fill), fill) < 4.5; step++) {
    const [h, s, l] = toHsl(fill), lighterText = brightness(onAccent(fill)) > brightness(fill);
    fill = fromHsl(h, s, Math.max(0, Math.min(1, l + (lighterText ? -.02 : .02))));
  }
  return { paper: toHex(paper), ink: toHex(ink), accent: toHex(fill), surface: toHex(surface), onAccent: toHex(onAccent(fill)) };
}

/** Logo and up to 12 product photos through the pixel sampler, then paletteFromSamples. Any failure gives no palette. */
export async function proposeStorePalette(images: { logo?: PaletteImage; photos?: PaletteImage[] }, options: { signal?: AbortSignal; sample?: typeof samplePhotoColours } = {}): Promise<SourcePalette | undefined> {
  const photos = (images.photos ?? []).slice(0, 12);
  const all = [...(images.logo ? [images.logo] : []), ...photos];
  if (!all.length) return undefined;
  try {
    const samples = await (options.sample ?? samplePhotoColours)(all, options.signal);
    const logo = images.logo ? samples.get(images.logo.url) : undefined;
    const photoSamples = photos.flatMap(photo => { const sample = samples.get(photo.url); return sample ? [sample] : []; });
    if (!logo && !photoSamples.length) return undefined;
    return paletteFromSamples({ logo, photos: photoSamples });
  } catch { return undefined; }
}

/** Owner 2026-10-28 («uniqueness from the brand, not the dice»): the store's deep colour (dark bands, closings) from its own accent —
 *  the accent's hue, kept dark enough for light text. */
export function deepFromAccent(accent: string): string | undefined {
  if (!HEX.test(accent)) return undefined;
  const [hue, saturation, lightness] = toHsl(toRgb(accent));
  // 2026-10-28: red and maroon both came out #3b16xx; a darker accent keeps a darker deep, so two brands of one hue stay apart.
  return toHex(fromHsl(hue, Math.min(saturation, .7), Math.max(.13, Math.min(.24, lightness * .45))));
}

/** Colour names a merchant writes, longest first so «verde oliva» never reads as «verde». */
const NAMED_COLOURS: ReadonlyArray<readonly [RegExp, string]> = ([
  ['rojo[- ]naranja|rojo anaranjado', '#e4572e'], ['rosa p[aá]lido|rosa palo', '#f2c4cc'], ['rosa fuerte|fucsia|magenta', '#d6336c'],
  ['verde oliva|oliva', '#6b7a2a'], ['verde menta|menta', '#5fbf9a'], ['verde agua|turquesa', '#1fa4a8'], ['azul marino', '#1d3557'],
  ['vino|burdeos|bord[oó]', '#7b1e3a'], ['terracota', '#c0603a'], ['coral', '#f26b5b'], ['mostaza', '#c99a0e'], ['dorado', '#b8901f'],
  ['lila|lavanda', '#a98bd4'], ['violeta', '#7c3aed'], ['morado|p[uú]rpura', '#6d3fa0'], ['celeste', '#5aa9dd'], ['azul', '#2457c5'],
  ['naranja', '#ee7d1f'], ['amarillo', '#f0bd1b'], ['verde', '#2e8b57'], ['rosa(?:do)?', '#e07a95'], ['rojo|roja', '#d62828'],
  ['caf[eé]|marr[oó]n|chocolate', '#6f4126'], ['beige|arena', '#e3d2b4'], ['crema|marfil', '#f6efdf'], ['blanco|blanca', '#ffffff'],
  ['negro|negra', '#141414'], ['gris', '#8a8a8a'],
] as const).map(([words, hex]) => [new RegExp(`(?<![\\p{L}])(?:${words})(?![\\p{L}])`, 'giu'), hex] as const);
/** Only sentences about the brand's look: «Colores de la marca: …», «Mi logo es el espiral rojo» — never «Brillo Rosa» or «flores blancas». */
const ABOUT_COLOUR = /(?<![\p{L}])(colou?r(es)?|logo|marca|tonos|paleta)(?![\p{L}])/iu;

/** Owner 2026-10-28 (Oh Belly named «rosa pálido, rojo-naranja, verde oliva y morado» and got mustard from its pears): the colours the
 *  merchant names for the brand, in the order written. Pure; no model. */
export function coloursFromWords(text: string | undefined): string[] {
  const named: Array<{ at: number; hex: string }> = [];
  let offset = 0;
  for (const sentence of (text ?? '').split(/(?<=[.!?])\s+|\n+/)) {
    if (ABOUT_COLOUR.test(sentence)) {
      let rest = sentence;
      for (const [pattern, hex] of NAMED_COLOURS) rest = rest.replace(pattern, (match, at: number) => { named.push({ at: offset + at, hex }); return ' '.repeat(match.length); });
    }
    offset += sentence.length + 1;
  }
  return [...new Set(named.sort((a, b) => a.at - b.at).map(entry => entry.hex))];
}

/** The named colours as a palette, the way a logo's colours are: the first colour that can carry a brand is the accent. None, none. */
export function paletteFromNamed(hexes: readonly string[]): SourcePalette | undefined {
  const valid = hexes.filter(hex => HEX.test(hex));
  // A pastel («rosa pálido») tints the page; the strong, mid-tone colour («rojo-naranja») carries the buttons.
  const carries = (hex: string) => { const [, s, l] = toHsl(toRgb(hex)); return s >= .35 && l > .2 && l < .75; };
  const ordered = [...valid.filter(carries), ...valid.filter(hex => !carries(hex))];
  return ordered.some(hex => chromatic(toRgb(hex))) ? paletteFromSamples({ logo: { dominant: ordered } }) : undefined;
}
