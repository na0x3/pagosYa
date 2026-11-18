import { CUTOUT_SECTIONS, cleanMask, usableCover, withCutouts } from './source-photo-cutout';

// Owner 2026-11-10 («model on our server»): product photos float as cut-outs in the styles that draw them (Merienda, Oliva, Mimo).
describe('photo cut-outs', () => {
  it('uses a cut-out only when the model kept a clear product', () => {
    expect(usableCover(0.02)).toBe(false);
    expect(usableCover(0.3)).toBe(true);
    expect(usableCover(0.95)).toBe(false);
  });

  // Owner 2026-11-15 («sometimes it cuts it out not good»): the showcase cut-outs are cleaned and refused when the frame cuts them.
  describe('cleanMask', () => {
    const W = 100, H = 100;
    const mask = (paint: (x: number, y: number) => number) => { const a = Buffer.alloc(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = paint(x, y); return a; };
    const box = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;

    it('keeps a product standing on the bottom edge and drops a loose sticker beside it', () => {
      const product = box(30, 20, 70, 100), sticker = box(5, 5, 9, 9);
      const out = cleanMask(mask((x, y) => product(x, y) || sticker(x, y) ? 255 : 0), W, H);
      expect(out.reject).toBeUndefined();
      expect(out.alpha[50 * W + 50]).toBe(255);
      expect(out.alpha[6 * W + 6]).toBe(0);
    });

    it('refuses legs cut by the top edge and a hand coming in from a side', () => {
      expect(cleanMask(mask((x, y) => box(40, 0, 60, 90)(x, y) ? 255 : 0), W, H).reject).toBe('top');
      expect(cleanMask(mask((x, y) => box(30, 30, 70, 80)(x, y) || box(70, 40, 100, 55)(x, y) ? 255 : 0), W, H).reject).toBe('side');
    });

    it('refuses a see-through cut-out', () => {
      // A faded shelf row: thin solid lines with half-transparent glass between them.
      expect(cleanMask(mask((x, y) => box(20, 20, 80, 90)(x, y) ? (y % 6 === 0 ? 255 : 120) : 0), W, H).reject).toBe('ghost');
    });
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
