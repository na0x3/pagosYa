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
  const paper = dark ? fromHsl(hue, Math.min(saturation, .18), .08) : fromHsl(hue, Math.min(saturation, .35), .97);
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
