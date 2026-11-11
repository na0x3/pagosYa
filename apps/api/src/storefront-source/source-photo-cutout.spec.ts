import { CUTOUT_SECTIONS, usableCover, withCutouts } from './source-photo-cutout';

// Owner 2026-11-10 («model on our server»): product photos float as cut-outs in the styles that draw them (Merienda, Oliva, Mimo).
describe('photo cut-outs', () => {
  it('uses a cut-out only when the model kept a clear product', () => {
    expect(usableCover(0.02)).toBe(false);
    expect(usableCover(0.3)).toBe(true);
    expect(usableCover(0.95)).toBe(false);
  });

  it('swaps each photo of the floating sections for its cut-out, once per photo, and lists the cut-outs', async () => {
    const cutOf = jest.fn(async (url: string) => url === '/v1/uploads/scene.jpg' ? null : url.replace('.jpg', '-cut.webp'));
    const layout: Array<{ type: string; photo?: string; items?: Array<{ title: string; photo: string }>; cut?: string[] }> = [
      { type: 'cover-mega', photo: '/v1/uploads/a.jpg' },
      { type: 'names-list', items: [{ title: 'A', photo: '/v1/uploads/a.jpg' }, { title: 'B', photo: '/v1/uploads/scene.jpg' }] },
      { type: 'faq-split', photo: '/v1/uploads/b.jpg' },
    ];
    const out = await withCutouts(layout, cutOf);
    expect(out[0]).toEqual({ type: 'cover-mega', photo: '/v1/uploads/a-cut.webp', cut: ['/v1/uploads/a-cut.webp'] });
    expect(out[1].items).toEqual([{ title: 'A', photo: '/v1/uploads/a-cut.webp' }, { title: 'B', photo: '/v1/uploads/scene.jpg' }]);
    expect(out[1].cut).toEqual(['/v1/uploads/a-cut.webp']);
    expect(out[2]).toBe(layout[2]);
    expect(cutOf).toHaveBeenCalledTimes(2);
    expect(CUTOUT_SECTIONS.has('faq-split')).toBe(false);
  });

  it('keeps the photos when the model fails', async () => {
    const layout = [{ type: 'statement-sticker', photo: '/v1/uploads/a.jpg', photo2: '/v1/uploads/b.jpg' }];
    expect(await withCutouts(layout, async () => { throw new Error('model missing'); })).toEqual(layout);
  });
});
