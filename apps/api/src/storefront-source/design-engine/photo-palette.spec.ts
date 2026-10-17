import { contrastRatio } from '../source-scorecard';
import { decodePhotoPalette, isPhotoPalette, photoPalettes } from './photo-palette';
import { frameForRun, paletteById, parseFrameDraw, drawFrame, frameDirection } from './frame-draw';

// baek (tholhejh), 2026-10-16: eleven warm bakery photos (crust browns, cream, terracotta) and the bold card drew teal and orange.
const bakery = { photos: [
  { dominant: ['#efe4d3', '#8a5a33', '#c9875b', '#2a1d14'], backdropHex: '#efe4d3', uniformity: 0.4 },
  { dominant: ['#3b2a20', '#b06a3b', '#e9dcc6'], backdropHex: '#3b2a20', uniformity: 0.3 },
  { dominant: ['#d9c3a5', '#7a2e1f', '#f4ecdf'] },
] };
const hue = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b); if (max === min) return 0; const d = max - min; const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return h * 60; };

describe('photo palettes', () => {
  it('gives a light calm palette and a dark bold one, both in the photos\' warm hues and readable', () => {
    const palettes = photoPalettes(bakery)!;
    expect(palettes.calm.dark).toBe(false);
    expect(palettes.bold.dark).toBe(true);
    for (const palette of [palettes.calm, palettes.bold]) {
      expect(isPhotoPalette(palette.id)).toBe(true);
      // Warm: reds, oranges and browns (hue 0–50), never the teal or aqua of the stock bold palettes.
      expect(hue(palette.accent)).toBeLessThan(50);
      const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
      expect(contrastRatio(rgb(palette.ink), rgb(palette.paper))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives the dark page an accent that stands out from it, taken from the photos (baek: crust brown on espresso was invisible)', () => {
    const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const baek = { photos: [{ dominant: ['#8c8371', '#5c2c13', '#725333', '#a5a194'] }, { dominant: ['#5d422b', '#836345', '#321a0d', '#b28c5a'] }, { dominant: ['#0b0201', '#4b1c0c', '#844b23', '#ecdbc2'] }] };
    const { calm, bold } = photoPalettes(baek)!;
    expect(contrastRatio(rgb(bold.accent), rgb(bold.paper))).toBeGreaterThanOrEqual(3);
    expect(hue(bold.accent)).toBeLessThan(50);
    expect(calm.accent).toBe('#5c2c13');
  });

  it('round-trips through its id, so a saved draw keeps the colours on every later edit', () => {
    const { calm, bold } = photoPalettes(bakery)!;
    expect(decodePhotoPalette(calm.id)).toEqual(calm);
    expect(paletteById(bold.id)).toEqual(bold);
    expect(paletteById('teal-sand')?.name).toBe('deep teal and sand');
    expect(decodePhotoPalette('photo:zzz')).toBeUndefined();
    expect(decodePhotoPalette('teal-sand')).toBeUndefined();
  });

  it('gives nothing without usable photo colours', () => {
    expect(photoPalettes({ photos: [] })).toBeUndefined();
    expect(photoPalettes({ photos: [{ dominant: ['#ffffff', '#fefefe'] }] })).toBeUndefined();
  });
});

describe('a store with photos', () => {
  const base = { enabled: true, designEnabled: true, fresh: true, previous: [], recent: [], available: { photos: 11, products: 8, facts: true }, request: 'Rediseña todo mi sitio' };

  it('builds in the colours of its photos, calm or bold, and the prompt says so', () => {
    const palettes = photoPalettes(bakery)!;
    for (const boldStyle of [false, true]) {
      const run = frameForRun({ ...base, boldStyle, photoPalettes: palettes, random: () => 0.3 });
      expect(run.palette).toEqual(boldStyle ? palettes.bold : palettes.calm);
      expect(parseFrameDraw(run.file!.content).palette).toBe(run.palette!.id);
      expect(run.paragraph).toContain("taken from the store's own photos");
      expect(run.paragraph).not.toContain('Do not take colours from the photos');
    }
    // An ordinary edit keeps the photo palette its design was built in.
    const built = frameForRun({ ...base, photoPalettes: palettes, random: () => 0.3 });
    const edit = frameForRun({ ...base, fresh: false, previous: [built.file!] });
    expect(edit.palette).toEqual(palettes.calm);
  });

  it('a look edit with brand material takes the brand palette over the kept one, unless brand colours are confirmed', () => {
    const palettes = photoPalettes(bakery)!;
    const built = frameForRun({ ...base, random: () => 0.3 });
    expect(frameForRun({ ...base, fresh: false, previous: [built.file!], paletteOverride: palettes.calm }).palette).toEqual(palettes.calm);
    expect(frameForRun({ ...base, fresh: false, previous: [built.file!], paletteOverride: palettes.calm, brandColours: true }).palette).toBeUndefined();
  });

  it('confirmed brand colours still win over the photos', () => {
    const run = frameForRun({ ...base, brandColours: true, photoPalettes: photoPalettes(bakery)!, random: () => 0.3 });
    expect(run.palette).toBeUndefined();
  });

  it('never draws a hero without a photo when the store has photos, and still can when it has none', () => {
    const PHOTOLESS = ['type-only', 'facts-panel', 'catalog-lead', 'illustration'];
    for (let i = 0; i < 40; i++) {
      const value = i / 40;
      expect(PHOTOLESS).not.toContain(drawFrame(() => value, [], { photos: 3, products: 8, facts: true }).hero);
      expect(PHOTOLESS).not.toContain(drawFrame(() => value, [], { photos: 1, products: 0, facts: true }, { hero: ['type-only'] }).hero);
    }
    const none = new Set(Array.from({ length: 40 }, (_, i) => drawFrame(() => i / 40, [], { photos: 0, products: 0, facts: true }).hero));
    expect([...none].some(id => PHOTOLESS.includes(id))).toBe(true);
    expect(frameDirection({ hero: 'split' })).toContain('Hero:');
  });
});

// Live 2026-10-16: an Instagram post's background IS the brand colour; for brand graphics it must not be dropped as «the table».
describe('brand graphics', () => {
  it('keeps the background colour of a brand graphic as the accent', () => {
    const posts = { photos: [{ dominant: ['#7a1f5c', '#fdf2f8', '#3f7d3a'], backdropHex: '#7a1f5c', uniformity: 0.9 }, { dominant: ['#fdf2f8', '#7a1f5c', '#3f7d3a'], backdropHex: '#fdf2f8', uniformity: 0.9 }] };
    const hueOf = (hex: string) => hue(hex);
    expect(hueOf(photoPalettes(posts, { graphics: true })!.calm.accent)).toBeGreaterThan(290);
    expect(hueOf(photoPalettes(posts)!.calm.accent)).toBeLessThan(150);
  });
});

// Deferred minor (final review 2026-10-16): an Instagram profile screenshot carries the app's own blue (the «Seguir» button,
// links), and that blue could become the store's accent.
it('brand graphics never take Instagram\'s own interface blue, unless it is the graphic\'s main colour', () => {
  const screenshot = { dominant: ['#ffffff', '#0095f6', '#c2185b', '#262626'], backdropHex: '#ffffff', uniformity: 0.9 };
  const palettes = photoPalettes({ photos: [screenshot] }, { graphics: true })!;
  for (const palette of [palettes.calm, palettes.bold]) expect(hue(palette.accent)).toBeGreaterThan(300);
  const blueBrand = { dominant: ['#0095f6', '#ffffff'] };
  expect(hue(photoPalettes({ photos: [blueBrand] }, { graphics: true })!.calm.accent)).toBeGreaterThan(190);
  const { withoutAppColours } = require('./photo-palette');
  expect(withoutAppColours(screenshot).dominant).toEqual(['#ffffff', '#c2185b', '#262626']);
});
