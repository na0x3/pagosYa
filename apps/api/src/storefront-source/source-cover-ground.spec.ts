import { compositeSeam, withCoverGround, withHeroShape } from './source-row-tints';

// Fuller hero (owner 2026-11-13 «i want the picture fuller in hero»).
describe('withCoverGround', () => {
  const layout = [{ type: 'cover-split', photo: '/v1/uploads/a.jpg', title: 'Hola' }, { type: 'products-grid' }];
  it('gives the cover its photo backdrop as ground, with the ink that reads on it', async () => {
    const light = await withCoverGround(layout, async () => ({ hex: '#F3E9DC', uniformity: .9 }));
    expect(light[0]).toMatchObject({ ground: '#f3e9dc', groundTone: 'light' });
    const dark = await withCoverGround(layout, async () => ({ hex: '#4b3f72', uniformity: .8 }));
    expect(dark[0]).toMatchObject({ ground: '#4b3f72', groundTone: 'dark' });
  });
  it('keeps the template ground for a busy photo, a cover with no photo or a full-photo cover', async () => {
    expect((await withCoverGround(layout, async () => ({ hex: '#f3e9dc', uniformity: .3 })))[0]).not.toHaveProperty('ground');
    expect((await withCoverGround(layout, async () => ({ hex: '#dcd5d4', uniformity: .53 })))[0]).toMatchObject({ ground: '#dcd5d4', groundTone: 'light' });
    expect((await withCoverGround([{ type: 'cover-full', photo: '/v1/uploads/a.jpg' }], async () => ({ hex: '#f3e9dc', uniformity: .9 })))[0]).not.toHaveProperty('ground');
    expect((await withCoverGround([{ type: 'cover-split' }], async () => ({ hex: '#f3e9dc', uniformity: .9 })))[0]).not.toHaveProperty('ground');
  });
});

// Owner 2026-11-13 («these two pictures together»): a design board (flat poster on top, a street photo below) never fills a band.
describe('compositeSeam', () => {
  const pink = [252, 232, 228] as const, rows = (n: number, f: (i: number) => readonly [number, number, number]) => Array.from({ length: n }, (_, i) => f(i));
  it('finds a flat half meeting a photo half at a hard seam', () => {
    // Oh Belly's real board: pink ground, five rows of orange letters, then the street photo from row 22.
    const board = rows(48, i => (i < 22 ? (i >= 16 && i <= 20 ? [251, 162, 142] : pink) : [90 + (i % 5) * 18, 70 + (i % 3) * 25, 60 + (i % 4) * 20]));
    expect(compositeSeam(board, rows(48, () => [170, 150, 140]))).toBe(true);
  });
  it('leaves an ordinary photo alone, even with a sky above a street', () => {
    const scene = rows(48, i => (i < 20 ? [120 + i * 3, 160 + i * 2, 220 - i] : [80 + (i % 6) * 15, 75 + (i % 4) * 12, 70 + (i % 5) * 14]));
    expect(compositeSeam(scene, rows(48, i => [100 + (i % 7) * 10, 110, 120]))).toBe(false);
  });
});

describe('hero shape by photo (owner 2026-11-13)', () => {
  const home = (type: string) => [{ type, photo: '/v1/uploads/a.jpg', title: 'Hola', look: 'sticker', products: ['A'] }, { type: 'products-grid' }];
  it('puts a product on a plain backdrop on its own colour, half picture', async () => {
    const out = await withHeroShape(home('cover-poster') as never, 'abc', async () => ({ hex: '#E8D5C4', uniformity: .8 }));
    expect(['cover-split', 'cover-half']).toContain(out.layout[0].type);
    expect(out.layout[0]).toMatchObject({ ground: '#e8d5c4', groundTone: 'light', title: 'Hola' });
    expect((out.layout[0] as { products?: string[] }).products).toBeUndefined();
    expect((out.layout[0] as { look?: string }).look).toBeUndefined();
    expect(out.ground).toMatchObject({ hex: '#e8d5c4', tone: 'light' });
  });
  it('gives a big scene the full picture, a small one the half picture on its colour, and leaves non-heroes alone', async () => {
    const scene = await withHeroShape(home('cover-split') as never, 'abc', async () => ({ hex: '#556677', uniformity: .2, width: 2400, height: 1600 }));
    expect(scene.layout[0].type).toBe('cover-full');
    expect(scene.ground).toBeUndefined();
    const small = await withHeroShape(home('cover-full') as never, 'abc', async () => ({ hex: '#556677', uniformity: .2, width: 736, height: 981 }));
    expect(['cover-split', 'cover-half']).toContain(small.layout[0].type);
    expect(small.layout[0]).toMatchObject({ ground: '#556677', look: 'framed' });
    const grid = [{ type: 'products-grid', photo: '/v1/uploads/a.jpg' }];
    expect((await withHeroShape(grid as never, 'abc', async () => ({ hex: '#ffffff', uniformity: 1 }))).layout).toBe(grid);
  });
});

