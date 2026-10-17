import { importBrandImages } from './brand-source-import';

const jpeg = (w: number, h: number) => ({ body: Buffer.from(`${w}x${h}`), contentType: 'image/jpeg' });
const deps = (responses: Record<string, any>) => ({
  fetch: jest.fn(async (url: string) => { const r = responses[url]; if (r instanceof Error) throw r; return r; }),
  size: (body: Buffer) => { const [w, h] = body.toString().split('x').map(Number); return w ? { width: w, height: h } : null; },
  save: jest.fn(async () => ({ url: `/v1/uploads/${Math.random().toString(16).slice(2)}.jpg` })),
});

it('imports real photos and the logo, skipping small, wrong-type, oversize and failing ones, at most 12', async () => {
  const candidates = [
    { url: 'https://x.bo/big.jpg', kind: 'photo' as const }, { url: 'https://x.bo/small.jpg', kind: 'photo' as const },
    { url: 'https://x.bo/logo.png', kind: 'logo' as const }, { url: 'https://x.bo/page.html', kind: 'photo' as const },
    { url: 'https://x.bo/down.jpg', kind: 'photo' as const }, { url: 'https://x.bo/huge.jpg', kind: 'photo' as const },
  ];
  const d = deps({
    'https://x.bo/big.jpg': jpeg(1600, 1000), 'https://x.bo/small.jpg': jpeg(300, 200),
    'https://x.bo/logo.png': { body: Buffer.from('120x120'), contentType: 'image/png' }, 'https://x.bo/page.html': { body: Buffer.from(''), contentType: 'text/html' },
    'https://x.bo/down.jpg': new Error('timeout'), 'https://x.bo/huge.jpg': { body: Buffer.alloc(11 * 1024 * 1024), contentType: 'image/jpeg' },
  });
  const { images, notes } = await importBrandImages(candidates, d, new AbortController().signal);
  expect(images.map(i => [i.source, i.kind])).toEqual([['https://x.bo/big.jpg', 'photo'], ['https://x.bo/logo.png', 'logo']]);
  expect(d.save).toHaveBeenCalledTimes(2);
  expect(notes.join(' ')).toMatch(/4 im[aá]genes/);
  const many = Array.from({ length: 20 }, (_, i) => ({ url: `https://x.bo/${i}.jpg`, kind: 'photo' as const }));
  const all = Object.fromEntries(many.map(c => [c.url, jpeg(800, 800)]));
  expect((await importBrandImages(many, deps(all), new AbortController().signal)).images).toHaveLength(12);
  expect(await importBrandImages([], deps({}), new AbortController().signal)).toEqual({ images: [], notes: [] });
});

it('imports no more than the room left under the request\'s image limit, and says so when nothing could be imported', async () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ url: `https://x.bo/${i}.jpg`, kind: 'photo' as const }));
  const all = Object.fromEntries(many.map(c => [c.url, jpeg(800, 800)]));
  expect((await importBrandImages(many, deps(all), new AbortController().signal, 4)).images).toHaveLength(4);
  expect((await importBrandImages(many, deps(all), new AbortController().signal, 0)).images).toHaveLength(0);
});

// Deferred minors (final review 2026-10-16): the 2 MB reference limit dropped large hero JPEGs, and a PNG served as
// image/jpeg failed saveBuffer's content sniff.
it('fetches up to its own size limit and saves an image under the type its bytes show', async () => {
  const d = { ...deps({ 'https://x.bo/hero.jpg': { body: Buffer.from('1600x1000'), contentType: 'image/jpeg' } }), sniff: () => 'image/png' };
  const { images } = await importBrandImages([{ url: 'https://x.bo/hero.jpg', kind: 'photo' }], d, new AbortController().signal);
  expect(images).toHaveLength(1);
  expect(d.fetch).toHaveBeenCalledWith('https://x.bo/hero.jpg', expect.anything(), 8_000_000);
  expect(d.save).toHaveBeenCalledWith(expect.any(Buffer), 'image/png');
});
