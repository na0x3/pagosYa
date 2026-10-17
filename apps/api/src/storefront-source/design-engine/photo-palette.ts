/**
 * The store's own colours, from its photos (and logo) — 2026-10-16, baek: eleven warm bakery photos and the bold card drew
 * teal and orange from the stock list, while the colour line told the model «Do not take colours from the photos».
 * A photo palette carries its colours in its id (photo:paper.ink.accent.accent2.l|d), so a saved frame-draw.json keeps
 * it on every later edit without a catalogue entry. Deterministic: the same samples always give the same palettes.
 */
import { contrastRatio } from '../source-scorecard';
import { paletteFromSamples } from '../source-palette';
import type { PhotoSample } from '../source-photo-sampler';
import type { Palette } from './frame-draw';

export const PHOTO_PALETTE_PREFIX = 'photo:';
const ID = /^photo:([0-9a-f]{6})\.([0-9a-f]{6})\.([0-9a-f]{6})\.([0-9a-f]{6})\.(l|d)$/;
const HEX = /^#[0-9a-f]{6}$/i;
const NAMES = { light: 'the light tones of the store\'s own photos', dark: 'a dark page in the colours of the store\'s own photos' };

export const isPhotoPalette = (id: string | undefined): boolean => typeof id === 'string' && id.startsWith(PHOTO_PALETTE_PREFIX);

function photoPalette(colours: { paper: string; ink: string; accent: string; accent2: string }, dark: boolean): Palette {
  const hex = (value: string) => value.slice(1).toLowerCase();
  const id = `${PHOTO_PALETTE_PREFIX}${hex(colours.paper)}.${hex(colours.ink)}.${hex(colours.accent)}.${hex(colours.accent2)}.${dark ? 'd' : 'l'}`;
  return { id, name: dark ? NAMES.dark : NAMES.light, paper: `#${hex(colours.paper)}`, ink: `#${hex(colours.ink)}`, accent: `#${hex(colours.accent)}`, accent2: `#${hex(colours.accent2)}`, dark };
}

/** The palette a photo id stands for; undefined for any other id or a malformed one. */
export function decodePhotoPalette(id: string): Palette | undefined {
  const match = ID.exec(id);
  if (!match) return undefined;
  const [, paper, ink, accent, accent2, page] = match;
  return photoPalette({ paper: `#${paper}`, ink: `#${ink}`, accent: `#${accent}`, accent2: `#${accent2}` }, page === 'd');
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (colour: Rgb) => '#' + colour.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, weight: number) => { const [x, y] = [rgb(a), rgb(b)]; return toHex([0, 1, 2].map(i => x[i] + (y[i] - x[i]) * weight) as Rgb); };
const hueOf = (hex: string) => {
  const [r, g, b] = rgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return { hue: 0, saturation: 0, lightness: (max + min) / 2 };
  const lightness = (max + min) / 2, saturation = lightness > .5 ? d / (2 - max - min) : d / (max + min);
  const hue = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { hue, saturation, lightness };
};
const hueGap = (a: number, b: number) => { const gap = Math.abs(a - b) % 360; return gap > 180 ? 360 - gap : gap; };

/**
 * The panels' colour: a second real colour of the photos (another hue, saturated, visible against the page), else the
 * accent softened towards the page. On a dark page a panel is lighter than the page, on a light page it is a tint.
 */
function secondColour(photos: PhotoSample[], accent: string, paper: string, dark: boolean): string {
  const candidates = photos.flatMap(sample => sample.dominant ?? []).filter(value => HEX.test(value));
  const main = hueOf(accent).hue;
  const found = candidates.find(value => {
    const { hue, saturation, lightness } = hueOf(value);
    return saturation >= .25 && lightness > .15 && lightness < .9 && hueGap(hue, main) >= 18 && contrastRatio(rgb(value), rgb(paper)) >= 1.6;
  });
  return found?.toLowerCase() ?? mix(accent, dark ? '#ffffff' : paper, dark ? .35 : .7);
}

/**
 * A dark page's accent must stand out from the page (3:1, the contrast of a large control): the first saturated photo
 * colour that does, else the accent lightened until it does. Its text colour is the kit's to choose.
 */
function standOut(photos: PhotoSample[], accent: string, paper: string): string {
  const visible = (value: string) => contrastRatio(rgb(value), rgb(paper)) >= 3;
  if (visible(accent)) return accent;
  const found = photos.flatMap(sample => sample.dominant ?? []).filter(value => HEX.test(value)).find(value => {
    const { saturation, lightness } = hueOf(value);
    return saturation >= .25 && lightness < .9 && visible(value);
  });
  if (found) return found.toLowerCase();
  let lifted = accent;
  for (let step = 1; step <= 20 && !visible(lifted); step++) lifted = mix(accent, '#ffffff', step * .05);
  return lifted;
}

/** Instagram's own interface blues (the «Seguir» button, links, the verified badge): in a profile screenshot they are the app,
 *  not the brand (final review 2026-10-16). */
const APP_COLOURS = ['#0095f6', '#3797f0', '#4a5df9', '#4150f7', '#0064e0', '#00376b'].map(rgb);
const appColour = (hex: string) => { const colour = rgb(hex); return APP_COLOURS.some(app => Math.hypot(colour[0] - app[0], colour[1] - app[1], colour[2] - app[2]) < 28); };
/** A brand graphic's colours without the app's interface; its main colour always stays (a brand can be that blue). */
export const withoutAppColours = (sample: PhotoSample): PhotoSample => ({ ...sample, dominant: (sample.dominant ?? []).filter((value, index) => index === 0 || !HEX.test(value) || !appColour(value)) });

/** A light palette for a calm card and a dark one for a bold card, both from the same photos; undefined without a usable colour. */
export function photoPalettes(raw: { logo?: PhotoSample; photos: PhotoSample[] }, options: { graphics?: boolean } = {}): { calm: Palette; bold: Palette } | undefined {
  // Brand graphics (Instagram posts, banners): their background IS a brand colour, not the table a product sits on.
  const input = options.graphics ? { ...raw, photos: raw.photos.map(({ backdropHex: _backdrop, ...sample }) => withoutAppColours(sample)) } : raw;
  const light = paletteFromSamples(input, { page: 'light' });
  const dark = paletteFromSamples(input, { page: 'dark' });
  if (!light || !dark) return undefined;
  return {
    calm: photoPalette({ paper: light.paper, ink: light.ink, accent: light.accent, accent2: secondColour(input.photos, light.accent, light.paper, false) }, false),
    bold: (accent => photoPalette({ paper: dark.paper, ink: dark.ink, accent, accent2: secondColour(input.photos, accent, dark.paper, true) }, true))(standOut(input.photos, dark.accent, dark.paper)),
  };
}
