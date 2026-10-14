// apps/api/src/storefront-source/store-look-measure.spec.ts
jest.setTimeout(120_000);
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { measureStoreLook, withMeasuredLook } from './store-look-measure';
import { lookFromReading, readConfigFile, sanitizeLook } from './store-look';
import type { SourceProjectSnapshot } from './source-project';

/** A one-page store: a stylesheet, an Anton font and three photos. Nothing leaves the sandbox. */
async function site(css: string, body: string): Promise<SourceProjectSnapshot> {
  const png = (await sharp({ create: { width: 600, height: 750, channels: 3, background: '#c08040' } }).png().toBuffer()).toString('base64');
  const font = (await readFile(kitPath('fonts/anton.ttf'))).toString('base64');
  return { brief: {}, files: [
    { path: 'index.html', content: `<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body>${body}</body></html>`, encoding: 'utf8' },
    { path: 'styles.css', content: `@font-face{font-family:Anton;src:url(anton.ttf)}body{margin:0;background:#fff}${css}`, encoding: 'utf8' },
    { path: 'anton.ttf', content: font, encoding: 'base64' },
    { path: 'p.png', content: png, encoding: 'base64' },
  ] } as unknown as SourceProjectSnapshot;
}
const photos = (wrap = (img: string) => img) => [1, 2, 3].map(() => wrap('<img class="photo" src="p.png" alt="">')).join('');

describe('measureStoreLook', () => {
  it('reads a loaded heading font, its case and tracking, and the photo corners', async () => {
    const snapshot = await site('h1{font-family:Anton,serif;font-weight:400;text-transform:uppercase;letter-spacing:.1em;font-size:60px}.photo{width:300px;height:375px;border-radius:16px;object-fit:cover}',
      `<main><section style="height:400px"><h1>Tostadero</h1></section><section>${photos()}</section></main>`);
    const look = lookFromReading((await measureStoreLook(snapshot))!)!;
    expect(look.type?.heading).toMatchObject({ family: 'Anton', case: 'upper', tracking: 0.1 });
    expect(look.shape?.photo).toBe(16);
    expect(look.photo?.aspect).toBe('portrait');
  });

  it('reads print frames and their rotation as polaroid with tilt', async () => {
    const snapshot = await site('figure{margin:20px;padding:12px 12px 36px;background:#fff;box-shadow:0 6px 18px -8px #0006;display:inline-block;rotate:3deg}figure:nth-child(2){rotate:-2deg}.photo{display:block;width:260px;height:320px;object-fit:cover}body{background:#efe7da}',
      `<main><section>${photos(img => `<figure>${img}</figure>`)}</section></main>`);
    const look = lookFromReading((await measureStoreLook(snapshot))!)!;
    expect(look.photo?.treatment).toBe('polaroid');
    expect(look.photo?.tilt).toBeGreaterThanOrEqual(2);
  });

  it('reads offset-shadow cards and pill buttons', async () => {
    const card = '<div class="card"><img class="photo" src="p.png" alt=""><p>Café de altura</p></div>';
    const snapshot = await site('.card{box-shadow:6px 6px 0 #111;border-radius:0;width:260px}.photo{width:260px;height:260px;display:block}.btn{display:inline-block;padding:14px 24px;border-radius:999px;background:#111;color:#fff}',
      `<main><section><div class="grid">${card}${card}${card}</div><a class="btn" href="#a">Comprar</a> <a class="btn" href="#b">Ver más</a></section></main>`);
    const look = lookFromReading((await measureStoreLook(snapshot))!)!;
    expect(look.edge).toBe('offset');
    expect(look.shape?.button).toBe('pill');
  });

  it("ignores the kit's own cards and the header logo", async () => {
    const snapshot = await site('.photo{width:300px;height:300px}',
      `<header><img class="photo" src="p.png" alt="Logo"></header><main><div data-pagosya-catalog>${photos(img => `<article class="menu-item">${img}<p>Producto</p></article>`)}</div></main>`);
    const reading = (await measureStoreLook(snapshot))!;
    expect(reading.photos).toEqual([]);
    expect(reading.cards).toEqual([]);
  });
});

describe('withMeasuredLook', () => {
  const input = { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe"};\n' }] };
  const reading = { heading: { families: ['Anton'], weight: 400, transform: 'none', literalUpper: false, letterSpacing: 0, fontSize: 40, italic: false }, loadedFamilies: ['Anton'], labels: [], photos: [], cards: [], buttons: [], sections: [], pageLuminance: 1 };

  it('writes the measured look into config.js', async () => {
    const result = await withMeasuredLook(input, { enabled: true, measure: async () => reading });
    expect(result.outcome).toBe('measured');
    expect(readConfigFile(result.input.files).look).toEqual({ version: 1, type: { heading: { family: 'Anton', weight: 400, case: 'none', tracking: 0, italic: false } } });
  });

  it('keeps the previous look when measuring throws, and never throws itself', async () => {
    const previousLook = { version: 1, edge: 'soft' };
    const result = await withMeasuredLook(input, { enabled: true, previousLook, measure: async () => { throw new Error('browser crashed'); } });
    expect(result.outcome).toBe('kept');
    expect(result.reason).toMatch(/browser crashed/);
    expect(readConfigFile(result.input.files).look).toEqual(previousLook);
  });

  it('keeps the previous look and does not measure when switched off', async () => {
    const measure = jest.fn();
    const result = await withMeasuredLook(input, { enabled: false, previousLook: { version: 1, edge: 'none' }, measure });
    expect(measure).not.toHaveBeenCalled();
    expect(readConfigFile(result.input.files).look).toEqual({ version: 1, edge: 'none' });
  });

  it('stores the sanitized look: a reading with NaN values never writes them (or null) into config.js', async () => {
    const noisy = { ...reading, heading: { ...reading.heading, weight: NaN, letterSpacing: NaN }, labels: [{ letterSpacing: 1, fontSize: 12, weight: NaN }, { letterSpacing: 1, fontSize: 12, weight: NaN }, { letterSpacing: 1, fontSize: 12, weight: NaN }] };
    const result = await withMeasuredLook(input, { enabled: true, measure: async () => noisy });
    expect(result.look).toEqual(sanitizeLook(lookFromReading(noisy)));
    const saved = readConfigFile(result.input.files).look;
    expect(JSON.stringify(saved)).not.toContain('null');
    expect(saved).toEqual({ version: 1, type: { heading: { family: 'Anton', case: 'none', italic: false }, label: { case: 'upper', tracking: 0.08 } } });
  });

  it('returns the input unchanged when there is no look at all', async () => {
    const result = await withMeasuredLook(input, { enabled: true, measure: async () => null });
    expect(result.input).toBe(input);
    expect(result.outcome).toBe('none');
  });
});
