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
  // The demo's hero and colour cards name no product (a real store's fill always sets it): give them the demo catalogue's first product.
  const config = assembled.files.find(file => file.path === 'config.js')!.content;
  const first = JSON.parse(config.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]).data.items[0].id as string;
  const files = assembled.files.map(file => file.path === 'components/store-data.tsx' ? { ...file, content: (options.patch ?? (data => data))(file.content.replace('"type":"product-hero",', `"type":"product-hero","product":${JSON.stringify(first)},`).replace('"type":"variant-cards",', `"type":"variant-cards","product":${JSON.stringify(first)},`)) } : file);
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
    // Premium landing (2026-11-03): the pills float on the split hero's photo, the buy box no longer repeats them.
    expect(html.match(/<li[^>]*><span aria-hidden="true"><\/span>[^<]+<\/li>/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('class="lb-hero-split__pills"');
    expect(html).not.toContain('data-product-pills');
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
      // The demo product has no colours: the kit hides «Colores» with the colour cards.
      const links = Array.from(header?.querySelectorAll<HTMLElement>('.es-header__links a') ?? []).filter(link => link.getClientRects().length > 0).map(link => `${link.textContent} ${link.getAttribute('href')}`);
      const colours = header?.querySelector<HTMLElement>('.es-header__links a[href="index.html#colores"]');
      return { header: !!header, buy: header?.querySelector('a.es-header__buy')?.getAttribute('href'), cart: !!header?.querySelector('[data-cart-open]'), search: !!header?.querySelector('a[href="buscar.html"]'), links, coloursHidden: colours ? colours.hidden && colours.hasAttribute('data-needs-colour-cards') : 'missing' };
    }));
    // Spec §2: a short menu of the home's own parts (Colores only where the page has colour cards).
    expect(seen).toEqual({ header: true, buy: 'index.html#comprar', cart: true, search: true, links: ['Producto index.html#comprar', 'Preguntas index.html#preguntas'], coloursHidden: true });
  });
  it('Único has one section rhythm and one button height', async () => {
    // The split hero brings the page's buttons (Task 6 makes it part of the layout).
    const hero = '{"type":"hero-split","title":"Prueba","cta":"Ver el producto","cta2":"Ver colores","photo":"data:image/gif;base64,R0lGODlhAQABAAAAACw="},';
    const seen = await onUnico({ width: 1280, patch: data => data.includes('"type":"hero-split"') ? data : data.replace('{"type":"product-hero"', `${hero}{"type":"product-hero"`) }, page => page.evaluate(() => {
      const bands = Array.from(document.querySelectorAll('main section.es-section:not([hidden])')) as HTMLElement[];
      const pads = Array.from(new Set(bands.map(el => Math.round(parseFloat(getComputedStyle(el).paddingTop)))));
      const buttons = Array.from(new Set(Array.from(document.querySelectorAll('main a.es-btn')).map(el => Math.round(el.getBoundingClientRect().height)).filter(Boolean)));
      return { pads, buttons };
    }));
    expect(seen.pads.length).toBe(1);
    expect(seen.pads[0]).toBeGreaterThanOrEqual(96);
    expect(seen.buttons).toEqual([48]);
  });
  it('opens with the split hero whose words never cover its photo, at 1280 and 390 (Review Focus 4)', async () => {
    for (const width of [1280, 390]) {
      const seen = await onUnico({ width, patch: data => data.replace(/"type":"hero-split",("eyebrow":"[^"]*",)?"title":"[^"]*"/, '"type":"hero-split","title":"El sofá cama que llega comprimido en una caja y se infla en tu sala"') }, page => page.evaluate(() => {
        const first = document.querySelector('main [data-lb]')!.getAttribute('data-lb');
        const photo = document.querySelector('.lb-hero-split__photo')!.getBoundingClientRect(), panel = document.querySelector('.lb-hero-split__panel')!.getBoundingClientRect();
        const overlap = panel.left < photo.right && panel.right > photo.left && panel.top < photo.bottom && panel.bottom > photo.top;
        const aligns = Array.from(new Set(Array.from(document.querySelectorAll('.lb-hero-split__panel > *')).map(el => getComputedStyle(el).textAlign)));
        const title = document.querySelector('.lb-hero-split .lb-title')!.textContent;
        return { first, overlap, aligns, title, scroll: document.documentElement.scrollWidth };
      }));
      expect(seen.first).toBe('hero-split');
      expect(seen.title).toMatch(/se infla en tu sala/);
      expect(seen.overlap).toBe(false);
      expect(seen.aligns).toEqual(['left']);
      expect(seen.scroll).toBe(width);
    }
  });
  it('follows the nubecorp order', async () => {
    const order = await onUnico({ width: 1280 }, page => page.evaluate(() => Array.from(document.querySelectorAll('main [data-lb]')).map(el => el.getAttribute('data-lb'))));
    const wanted = ['hero-split', 'strip-marquee', 'variant-cards', 'product-hero', 'benefits-orbit', 'chips-marquee', 'faq-split', 'closing-photo'];
    expect(order.filter(type => wanted.includes(type!))).toEqual(wanted);
  });
});
