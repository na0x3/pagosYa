import { listTemplates, templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';

jest.setTimeout(120_000);
async function unicoHome(mood?: 'colourful' | 'calm') {
  return onUnico({ mood }, page => page.content());
}

/** Único's demo home in the sandbox: `patch` edits store-data, `look` runs against the page (motion on when `motion` is set). */
async function onUnico<T>(options: { mood?: 'colourful' | 'calm'; width?: number; motion?: boolean; patch?: (data: string) => string }, look: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const { mood } = options;
  const manifest = listTemplates().find(entry => entry.id === 'unico')!;
  const resolved = resolvePresetTemplate(manifest, templateManifest);
  const preset = mood ? { ...resolved.preset, variants: { ...(resolved.preset as any).variants, mood } } : resolved.preset;
  const assembled = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), preset as never);
  // The demo's hero names no product (a real store's fill always sets it): give it the demo catalogue's first product.
  const config = assembled.files.find(file => file.path === 'config.js')!.content;
  const first = JSON.parse(config.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]).data.items[0].id as string;
  const files = assembled.files.map(file => file.path === 'components/store-data.tsx' ? { ...file, content: (options.patch ?? (data => data))(file.content.replace('"type":"product-hero",', `"type":"product-hero","product":${JSON.stringify(first)},`)) } : file);
  const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled, files });
  // The page as a shopper gets it: rendered offline in the sandbox YAPI's own checks use.
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width: options.width ?? 1280, height: 844 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await page.waitForSelector('.es');
    try { return await look(page); } finally { await page.close(); }
  }, options.motion ? 'no-preference' : 'reduce');
}

describe('Único lively home (spec 2026-11-03)', () => {
  it('is lively, calm by default, with pills, hotspots and the chip band', async () => {
    const html = await unicoHome();
    expect(html).toContain('data-pya-lively=""');
    expect(html).toContain('data-es-mood="calm"');
    expect(html).toMatch(/data-product-pills="\[&quot;/);
    expect(html.match(/class="lb-hotspots__pin"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/class="lb-chips__row"[^>]*data-pya-motion="marquee"/g)).toHaveLength(2);
    expect(html).not.toContain('es-logo__letters');
  });
  it('spells the name in letters in the colourful mood', async () => {
    const html = await unicoHome('colourful');
    expect(html).toContain('data-es-mood="colourful"');
    expect(html).toContain('es-logo__letters');
  });
});

describe('Único lively look holds up (review 2026-11-03)', () => {
  it('lets the colourful letters bob without being cut off', async () => {
    const seen = await onUnico({ mood: 'colourful', width: 390, motion: true }, page => page.evaluate(() => {
      const logo = document.querySelector('.es-logo')!, letter = document.querySelector('.es-logo__letters span')!;
      return { overflowY: getComputedStyle(logo).overflowY, animation: getComputedStyle(letter).animationName, scrollWidth: document.documentElement.scrollWidth };
    }));
    expect(seen.overflowY).toBe('visible');
    expect(seen.animation).toBe('es-letter-bob');
    expect(seen.scrollWidth).toBe(390);
  });
  it('shows a hotspot note in full even at the photo corner on a phone', async () => {
    const box = await onUnico({ width: 390, patch: data => data.replace('"x":32,"y":40', '"x":6,"y":94') }, async page => {
      const pin = page.locator('.lb-hotspots__pin').first();
      await pin.scrollIntoViewIfNeeded();
      await pin.click();
      return page.evaluate(() => {
        const note = document.querySelector('.lb-hotspots__spot[data-open] .lb-hotspots__note')!, r = note.getBoundingClientRect();
        // The note ignores the pointer, so «visible» means no clipping box above it cuts it.
        let clipped = false;
        for (let box = note.parentElement; box && box !== document.body; box = box.parentElement) {
          const style = getComputedStyle(box), b = box.getBoundingClientRect();
          if ((style.overflowX !== 'visible' || style.overflowY !== 'visible') && (r.left < b.left || r.right > b.right || r.top < b.top || r.bottom > b.bottom)) clipped = true;
        }
        return { left: r.left, right: r.right, visible: !clipped && getComputedStyle(note).opacity !== '0' };
      });
    });
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(390);
    expect(box.visible).toBe(true);
  });
  it('fills the chip band end to end on a laptop', async () => {
    const rows = await onUnico({ width: 1280 }, page => page.evaluate(() => Array.from(document.querySelectorAll('.lb-chips__row')).map(row => ({ half: row.scrollWidth / 2, box: (row.parentElement as HTMLElement).clientWidth }))));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.half).toBeGreaterThanOrEqual(row.box);
  });
});

describe('Único premium landing (spec 2026-11-03)', () => {
  it('the shop header carries search, account, cart and a «Comprar» button', async () => {
    const seen = await onUnico({ width: 1280, patch: data => data.replace('"header":"minimal"', '"header":"shop"') }, page => page.evaluate(() => {
      const header = document.querySelector('header[data-es-header="shop"]');
      const links = Array.from(header?.querySelectorAll('.es-header__links a') ?? []).map(link => `${link.textContent} ${link.getAttribute('href')}`);
      return { header: !!header, buy: header?.querySelector('a.es-header__buy')?.getAttribute('href'), cart: !!header?.querySelector('[data-cart-open]'), search: !!header?.querySelector('a[href="buscar.html"]'), links };
    }));
    // Spec §2: a short menu of the home's own parts (Colores only where the page has colour cards).
    expect(seen).toEqual({ header: true, buy: 'index.html#comprar', cart: true, search: true, links: ['Producto index.html#comprar', 'Preguntas index.html#preguntas'] });
  });
});
