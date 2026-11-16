jest.setTimeout(90_000);
import { contrastRatio } from './source-scorecard';
import { colourRolesFromWords, coloursFromWords, deepFromAccent, loudAccent, neutralInk, paletteFromNamed, paletteFromSamples, proposeStorePalette, type SourcePalette, richerGround, groundPalette } from './source-palette';
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
  for (const [key, value] of Object.entries(p)) if (key !== 'extras') expect(value).toMatch(/^#[0-9a-f]{6}$/);
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

// Owner 2026-10-28: Oh Belly named its colours and got mustard from its pears; Brillo Rosa's name is not a colour request.
it('reads the colours a merchant names for the brand, and only those', () => {
  expect(coloursFromWords('Usa el logo OH BELLY. Colores de la marca: rosa pálido, rojo-naranja, verde oliva y morado.')).toEqual(['#f2c4cc', '#e4572e', '#6b7a2a', '#6d3fa0']);
  expect(coloursFromWords('Crea la tienda de Remolino: licuadoras.\nMi logo es el espiral rojo. En el catálogo, selector de colores.')).toEqual(['#d62828']);
  expect(coloursFromWords('Mi negocio se llama Brillo Rosa. Ramos con flores blancas.')).toEqual([]);
  expect(coloursFromWords(undefined)).toEqual([]);
  const ohBelly = paletteFromNamed(['#f2c4cc', '#e4572e', '#6b7a2a', '#6d3fa0'])!;
  expect(ohBelly.accent).toMatch(/^#e[4-6][4-6]/); // the red-orange, only nudged for its text's contrast (2026-10-29: the brand ink moves it a step)
  expect(contrastRatio(rgb(ohBelly.onAccent), rgb(ohBelly.accent))).toBeGreaterThanOrEqual(4.5);
  expect(paletteFromNamed(['#f6efdf', '#ffffff'])).toBeUndefined();
});

describe('brand paper and deep colour (2026-10-28 unique first build)', () => {
  it('uses a light tinted backdrop from the photos as the paper', () => {
    const palette = paletteFromSamples({ photos: [{ dominant: ['#7b1e3a', '#f3e9d6'], backdropHex: '#f3e9d6', uniformity: .9 }] });
    expectReadable(palette);
    expect(palette!.paper).toBe('#f3e9d6');
  });
  it('keeps red and maroon apart in the deep colour', () => {
    // PEPPA and DooBoo came out #3b1616 and #3b1621: the same near-black on two brands.
    const [red, maroon] = [deepFromAccent('#d62828')!, deepFromAccent('#7b1e3a')!].map(rgb);
    expect(Math.hypot(red[0] - maroon[0], red[1] - maroon[1], red[2] - maroon[2])).toBeGreaterThan(30);
  });
});

// Owner 2026-10-29 (yes to «brand colours like Amboras»: cream page, botanical-green text and buttons, mustard accent): the brand's own
// dark colour carries the text, and the bands are visibly the brand's, not a 6 % grey.
describe('the full brand palette', () => {
  const hsl = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    const s = max === min ? 0 : l > .5 ? (max - min) / (2 - max - min) : (max - min) / (max + min); return { s, l }; };
  it('a brand with a dark colour of its own (green beside mustard) writes its text in that colour', () => {
    const palette = paletteFromSamples({ logo: { dominant: ['#c99a0e', '#2f5d34'] } })!;
    expect(palette.accent.toLowerCase()).not.toBe('#2f5d34');
    expect(palette.ink.toLowerCase()).toBe('#2f5d34');
  });
  it('a one-colour brand gets a dark text clearly in its hue, not near-black', () => {
    const palette = paletteFromSamples({ logo: { dominant: ['#d62828'] } })!;
    expect(hsl(palette.ink).s).toBeGreaterThan(.4);
    expect(hsl(palette.ink).l).toBeLessThan(.25);
  });
  it('the band colour is a visible tint of the brand', () => {
    const palette = paletteFromSamples({ logo: { dominant: ['#c99a0e', '#2f5d34'] } })!;
    expect(hsl(palette.surface).s).toBeGreaterThan(.25);
    expect(palette.surface.toLowerCase()).not.toBe(palette.paper.toLowerCase());
  });
});

// Owner 2026-11-02 (DooBoo: cream headings on a cream page): pale goods on a brand-coloured backdrop take the backdrop's colour.
it('takes a strong brand backdrop over a pale goods colour, and keeps strong goods first', () => {
  const dooboo = paletteFromSamples({ photos: [{ dominant: ['#471411', '#e4ddcc', '#4b4444'], backdropHex: '#471411', uniformity: .8 }, { dominant: ['#e9e7da', '#cccabd'], backdropHex: '#e9e7da', uniformity: .9 }] })!;
  expectReadable(dooboo);
  expect(dooboo.accent).toBe('#471411');
  expect(contrastRatio(rgb(dooboo.accent), rgb(dooboo.paper))).toBeGreaterThanOrEqual(3);
  const teal = paletteFromSamples({ photos: [{ dominant: ['#1f7a74', '#e4ddcc'], backdropHex: '#471411', uniformity: .8 }] })!;
  expect(Math.abs(hue(teal.accent) - hue('#1f7a74'))).toBeLessThan(8);
});

describe('palette extras for titles (spec 2026-11-03 chunky colour titles)', () => {
  it('returns the photos\' other goods colours, distinct, without the accent', () => {
    const palette = paletteFromSamples({ photos: [{ dominant: ['#2f6db5', '#2e6cb4', '#c0392b', '#f2f2f2', '#e0a030'] }] })!;
    expect(palette.extras).toEqual(['#c0392b', '#e0a030']);
  });
  it('returns no extras for grey photos', () => {
    expect(paletteFromSamples({ photos: [{ dominant: ['#2f6db5', '#9a9a9a', '#f4f4f4'] }] })!.extras ?? []).toEqual([]);
  });
});

// Owner 2026-11-13 (ZARA got lavender and brown; Oh Belly's red-orange painted the whole cover).
describe('colour roles', () => {
  it('reads ZARA: black and white, a soft grey for support', () => {
    expect(colourRolesFromWords('Tiene que ser minimalista y seria, como una casa de moda: nada de colores, nada de juegos. Fondo blanco, texto negro y un gris muy suave como único apoyo.'))
      .toEqual({ mono: true, paper: '#ffffff', ink: '#111111', muted: '#efefef' });
  });
  it('gives a colour a job only right after its role word', () => {
    expect(colourRolesFromWords('Vendemos flores blancas y rosas rojas para bodas.')).toEqual({});
    expect(colourRolesFromWords('Quiero botones color terracota y el fondo crema.')).toEqual({ accent: '#c0603a', paper: '#f6efdf' });
  });
  it('keeps text from photos a near-neutral dark and calls a saturated mid accent loud', () => {
    const [, saturation] = [0, 0]; void saturation;
    expect(neutralInk('#3c1b15')).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseInt(neutralInk('#3c1b15').slice(1, 3), 16) - parseInt(neutralInk('#3c1b15').slice(5, 7), 16)).toBeLessThan(12);
    expect(loudAccent('#e66540')).toBe(true);
    expect(loudAccent('#5e5b45')).toBe(false);
    expect(loudAccent('#111111')).toBe(false);
  });

  it('gives a near-white ground the brand\'s hue at about 89.5%, keeps the band deeper, and leaves real colours alone', () => {
    const ground = richerGround('#f7f0ee', '#f4d8cf');
    expect(ground.paper).not.toBe('#f7f0ee');
    const light = (hex: string) => { const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2; };
    expect(light(ground.paper)).toBeCloseTo(.895, 1);
    expect(light(ground.muted!)).toBeLessThan(light(ground.paper));
    expect(richerGround('#ffffff').paper).not.toBe('#ffffff');
    expect(richerGround('#e9dccb')).toEqual({ paper: '#e9dccb', muted: undefined });
    expect(richerGround('#2d2d2b', '#a5d0ea')).toEqual({ paper: '#2d2d2b', muted: '#a5d0ea' });
  });

  it('takes the page colours from the hero backdrop: a light one is the page, a dark one the bands', () => {
    expect(groundPalette('#e8d5c4')).toMatchObject({ paper: '#e8d5c4' });
    expect(groundPalette('#e8d5c4')!.deep).toBeUndefined();
    const dark = groundPalette('#1f3a5f')!;
    expect(dark.deep).toBe('#1f3a5f');
    expect(dark.paper).not.toBe('#1f3a5f');
    expect(groundPalette('nope')).toBeUndefined();
  });
});

