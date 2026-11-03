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
  it('drops «Ver colores» from the hero when the page has no colour cards (review 2026-11-03)', async () => {
    const seen = await onUnico({ width: 1280, patch: data => data.replace('"type":"variant-cards"', '"type":"variant-cards-gone"') }, page => page.evaluate(() => ({
      hero: !!document.querySelector('.lb-hero-split'), colours: !!document.querySelector('.lb-hero-split a[href="#colores"]'),
    })));
    expect(seen).toEqual({ hero: true, colours: false });
  });
  it('keeps the shop header\'s «Comprar» and short menu to a one-product page (review 2026-11-03)', async () => {
    const seen = await onUnico({ width: 1280, patch: data => data.replace('"type":"product-hero"', '"type":"product-hero-gone"') }, page => page.evaluate(() => ({
      buy: !!document.querySelector('header .es-header__buy'), links: Array.from(document.querySelectorAll('header .es-header__links a')).map(link => link.getAttribute('href')),
    })));
    expect(seen.buy).toBe(false);
    expect(seen.links).not.toContain('index.html#comprar');
  });
  it('keeps «Comprar» on one line in the phone header (live check 2026-11-03: «COMPRA / R»)', async () => {
    // A store name as long as the live one squeezes the header.
    const seen = await onUnico({ width: 390, patch: data => data.split('"Tu marca"').join('"Nube Sofá Test"') }, page => page.evaluate(() => {
      const buy = document.querySelector('header .es-header__buy') as HTMLElement;
      if (!document.querySelector('.es-logo')?.textContent?.includes('Nube Sofá Test')) return { lines: -1, scroll: 0 };
      const range = document.createRange(); range.selectNodeContents(buy);
      return { lines: new Set(Array.from(range.getClientRects()).map(rect => Math.round(rect.top))).size, scroll: document.documentElement.scrollWidth };
    }));
    expect(seen).toEqual({ lines: 1, scroll: 390 });
  });
  it('writes the closing photo\'s title in white over its darkened photo (live check 2026-11-03: olive on dark)', async () => {
    const colour = await onUnico({ width: 1280 }, page => page.evaluate(() => getComputedStyle(document.querySelector('[data-lb="closing-photo"] .lb-title')!).color));
    expect(colour).toBe('rgb(255, 255, 255)');
  });
});

describe('chunky colour titles (spec 2026-11-03)', () => {
  const burbuja = (data: string) => data.includes('"titles":') ? data.replace(/"titles":"[a-z]+"/, '"titles":"burbuja"') : data.replace('"theme":"unico"', '"theme":"unico","titles":"burbuja"');
  it('draws a chunky title style from the theme variables', async () => {
    const seen = await onUnico({ width: 1280, patch: burbuja }, page => page.evaluate(() => {
      const root = document.querySelector('.es') as HTMLElement, title = document.querySelector('main h2.lb-title') as HTMLElement;
      return { attr: root.dataset.esTitles, weight: getComputedStyle(title).fontWeight, family: getComputedStyle(title).fontFamily, line: parseFloat(getComputedStyle(title).lineHeight) / parseFloat(getComputedStyle(title).fontSize) };
    }));
    expect(seen.attr).toBe('burbuja');
    expect(seen.weight).toBe('800');
    expect(seen.family.length).toBeGreaterThan(0);
    expect(seen.line).toBeLessThanOrEqual(1.06);
  });
  const contrast = (a: string, b: string) => { const lum = (c: string) => { const [r, g, bl] = c.match(/\d+/g)!.slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * bl; }; const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  it('colours the hero word by word, one coloured word per section title, readable', async () => {
    const seen = await onUnico({ width: 1280, patch: burbuja }, page => page.evaluate(() => {
      const paper = getComputedStyle(document.body).backgroundColor;
      const words = Array.from(document.querySelectorAll('.lb-hero-split .lb-title .lb-tw')).map(el => getComputedStyle(el).color);
      const sections = Array.from(document.querySelectorAll('main section.es-section h2.lb-title')).map(el => el.querySelectorAll('.lb-em').length);
      return { paper, words, sections, swoosh: !!document.querySelector('.lb-hero-split .lb-swoosh') };
    }));
    expect(new Set(seen.words).size).toBeGreaterThanOrEqual(2);
    for (const colour of seen.words) expect(contrast(colour, seen.paper)).toBeGreaterThanOrEqual(3);
    for (const count of seen.sections) expect(count).toBeLessThanOrEqual(1);
    expect(seen.swoosh).toBe(true);
  });
  it('draws no underline for a hero with no marked word (Review Focus 1)', async () => {
    const seen = await onUnico({ width: 1280, patch: data => burbuja(data).replace(/("type":"hero-split"[^}]*?"title":")([^"]*)"/, (_m, head, title) => `${head}${title.replace(/\*/g, '')}"`) }, page => page.evaluate(() => ({
      words: document.querySelectorAll('.lb-hero-split .lb-tw').length, swoosh: document.querySelectorAll('.lb-hero-split .lb-swoosh').length,
    })));
    expect(seen.words).toBeGreaterThan(1);
    expect(seen.swoosh).toBe(0);
  });
  it('wraps a 70-character chunky hero at 390 with no sideways scroll', async () => {
    const scroll = await onUnico({ width: 390, patch: data => burbuja(data).replace(/"type":"hero-split",("eyebrow":"[^"]*",)?"title":"[^"]*"/, '"type":"hero-split","title":"El sofá cama que llega comprimido en una caja y se infla en tu sala"') }, page => page.evaluate(() => document.documentElement.scrollWidth));
    expect(scroll).toBe(390);
  });
  it('Único starts with rounded titles in Fredoka, its font bundled', async () => {
    const seen = await onUnico({ width: 1280 }, page => page.evaluate(async () => {
      await document.fonts.ready;
      const title = document.querySelector('.lb-hero-split .lb-title') as HTMLElement;
      return { attr: (document.querySelector('.es') as HTMLElement).dataset.esTitles, family: getComputedStyle(title).fontFamily, loaded: document.fonts.check('600 40px Fredoka') };
    }));
    expect(seen.attr).toBe('redonda');
    expect(seen.family).toMatch(/^"?Fredoka/);
    expect(seen.loaded).toBe(true);
  });
  it('keeps a marked word white on the closing photo and in the band\'s own colour on a deep band (review 2026-11-03)', async () => {
    const seen = await onUnico({ width: 1280, patch: data => burbuja(data).replace(/("type":"closing-photo"[^}]*?"title":")([^"]*)"/, '$1Llévalo *hoy*"').replace(/("type":"benefits-orbit",)"band":"muted"/, '$1"band":"deep"') }, page => page.evaluate(() => {
      const closing = document.querySelector('[data-lb="closing-photo"] .lb-title .lb-em') as HTMLElement | null;
      const bandTitle = document.querySelector('[data-lb="benefits-orbit"] .lb-title') as HTMLElement | null;
      const bandWord = bandTitle?.querySelector('.lb-em') as HTMLElement | null;
      return { closing: closing ? getComputedStyle(closing).color : 'missing', band: bandWord ? getComputedStyle(bandWord).color === getComputedStyle(bandTitle!).color : 'missing' };
    }));
    expect(seen).toEqual({ closing: 'rgb(255, 255, 255)', band: true });
  });
});
