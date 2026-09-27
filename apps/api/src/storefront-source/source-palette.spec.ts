jest.setTimeout(90_000);
import { contrastRatio } from './source-scorecard';
import { paletteFromSamples, proposeStorePalette, type SourcePalette } from './source-palette';
import { png } from './fixtures/png';

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
function expectReadable(palette: SourcePalette | undefined) {
  expect(palette).toBeDefined();
  const p = palette!;
  for (const value of Object.values(p)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  expect(contrastRatio(rgb(p.ink), rgb(p.paper))).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(rgb(p.ink), rgb(p.surface))).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(rgb(p.onAccent), rgb(p.accent))).toBeGreaterThanOrEqual(4.5);
}

describe('paletteFromSamples', () => {
  it('takes the accent from a coloured logo and holds every contrast rule', () => {
    const palette = paletteFromSamples({ logo: { dominant: ['#ffffff', '#e4572e'], backdropHex: '#ffffff', uniformity: 1 }, photos: [] });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#e4572e'))).toBeLessThan(8);
  });

  it('without a logo, takes the goods\' colour from the photos, never the backdrop they sit on', () => {
    const palette = paletteFromSamples({ photos: [{ dominant: ['#f4f1ec', '#1f7a74', '#d9d4cc'], backdropHex: '#f3f0eb', uniformity: .9 }] });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#1f7a74'))).toBeLessThan(8);
  });

  it('gives nothing with neither a logo nor a photo, or with only near-white and grey', () => {
    expect(paletteFromSamples({})).toBeUndefined();
    expect(paletteFromSamples({ logo: { dominant: ['#f7f7f7', '#bdbdbd'] }, photos: [] })).toBeUndefined();
  });

  it('builds a monochrome palette from a black mark, and a dark paper from a logo drawn on black', () => {
    expectReadable(paletteFromSamples({ logo: { dominant: ['#111111'], backdropHex: '#ffffff', uniformity: 1 } }));
    const dark = paletteFromSamples({ logo: { dominant: ['#0b0b0b', '#f3c77a'], backdropHex: '#0b0b0b', uniformity: .95 } })!;
    expectReadable(dark);
    expect(contrastRatio(rgb(dark.paper), [0, 0, 0])).toBeLessThan(1.5);
  });

  it('keeps a pale brand colour and gives it dark text instead of washing it out', () => {
    const palette = paletteFromSamples({ logo: { dominant: ['#f5e050'] } })!;
    expectReadable(palette);
    expect(palette.accent).toBe('#f5e050');
    expect(palette.onAccent).toBe(palette.ink);
  });

  it('is deterministic and ignores malformed colours', () => {
    const input = { logo: { dominant: ['not-a-colour', '#e4572e'] }, photos: [{ dominant: ['#123'] }] };
    expect(paletteFromSamples(input)).toEqual(paletteFromSamples(input));
    expect(paletteFromSamples(input)).toEqual(paletteFromSamples({ logo: { dominant: ['#e4572e'] } }));
  });
});

describe('proposeStorePalette: real pixels through the photo sampler', () => {
  const orange = [228, 87, 46, 255] as const, white = [255, 255, 255, 255] as const, clear = [0, 0, 0, 0] as const, teal = [31, 122, 116, 255] as const;
  const image = (name: string, bytes: Buffer) => ({ url: `https://cdn.test/${name}.png`, path: `${name}.png`, bytes });

  it('reads a flat single-colour logo', async () => {
    const palette = await proposeStorePalette({ logo: image('flat', png(32, 32, () => orange)) });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#e4572e'))).toBeLessThan(8);
  });

  it('reads a transparent PNG logo by its mark, not by the transparency', async () => {
    const palette = await proposeStorePalette({ logo: image('mark', png(48, 48, (x, y) => Math.hypot(x - 24, y - 24) < 14 ? orange : clear)) });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#e4572e'))).toBeLessThan(8);
  });

  it('falls back to the photos when the logo is fully transparent', async () => {
    const product = png(64, 64, (x, y) => x > 16 && x < 48 && y > 16 && y < 48 ? teal : white);
    const palette = await proposeStorePalette({ logo: image('blank', png(16, 16, () => clear)), photos: [image('product', product)] });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#1f7a74'))).toBeLessThan(8);
  });

  it('gives no palette without images, and degrades to none when the sampler fails', async () => {
    const sample = jest.fn();
    expect(await proposeStorePalette({}, { sample: sample as any })).toBeUndefined();
    expect(sample).not.toHaveBeenCalled();
    const logo = image('flat', png(8, 8, () => orange));
    expect(await proposeStorePalette({ logo }, { sample: async () => { throw new Error('no chromium'); } })).toBeUndefined();
    expect(await proposeStorePalette({ logo }, { sample: async () => new Map() })).toBeUndefined();
  });
});
