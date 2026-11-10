import { photoTint, withRowTints } from './source-row-tints';

// Spec 2026-11-10 Merienda: each product row takes its colour from the product's own photo (owner rule: colour comes from the
// product on screen), like Bake Me's peach, mint and yellow flavours.
const pixels = (list: Array<[number, number, number]>) => Buffer.from(list.flat());

describe('photoTint', () => {
  it('finds the product colour and ignores a white or black background', () => {
    const orange = Array.from({ length: 30 }, () => [240, 120, 30] as [number, number, number]);
    const white = Array.from({ length: 60 }, () => [252, 252, 250] as [number, number, number]);
    const black = Array.from({ length: 10 }, () => [8, 8, 8] as [number, number, number]);
    expect(photoTint(pixels([...white, ...orange, ...black]), 3)).toBe('#f0781e');
  });

  it('gives nothing for a grey or almost colourless photo', () => {
    expect(photoTint(pixels(Array.from({ length: 50 }, () => [128, 126, 124] as [number, number, number])), 3)).toBeNull();
    expect(photoTint(pixels(Array.from({ length: 50 }, () => [250, 250, 250] as [number, number, number])), 3)).toBeNull();
  });
});

describe('withRowTints', () => {
  it('puts each product row\'s colour on its item, keeping its line, and leaves other sections alone', async () => {
    const layout = [{ type: 'cover-mega', title: 'Hola' }, { type: 'products-rows', products: ['Cacao', 'Naranja', 'Gris'], items: [{ title: 'Naranja', text: 'Avena y miel.' }] }];
    const tints: Record<string, string | null> = { Cacao: '#5a3020', Naranja: '#f0781e', Gris: null };
    const out = await withRowTints(layout, async name => tints[name] ?? null);
    expect(out[0]).toBe(layout[0]);
    expect(out[1].items).toEqual([{ title: 'Cacao', value: '#5a3020' }, { title: 'Naranja', text: 'Avena y miel.', value: '#f0781e' }, { title: 'Gris' }]);
  });

  it('keeps the rows as they were when reading the photos fails', async () => {
    const layout = [{ type: 'products-rows', products: ['Cacao', 'Naranja'] }];
    expect(await withRowTints(layout, async () => { throw new Error('offline'); })).toEqual([{ type: 'products-rows', products: ['Cacao', 'Naranja'], items: [{ title: 'Cacao' }, { title: 'Naranja' }] }]);
  });
});
