/// <reference lib="dom" />
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Page } from 'playwright';
import { assembleSketch } from './sketch-assembler';
import { repairSketch } from './sketch-schema';
import type { StoreSketch } from './sketch-schema';
import { applySketchComposition } from './sketch-composition';
import { drawPageStructure } from './sketch-structure-draw';
import { agentPreviewSnapshot } from '../agent/agent-capture';
import { nextStoreFiles } from '../fixtures/next-store';
import { withSourceIcons } from '../source-asset-library';
import { withVisualSandbox } from '../source-visual-capture';

/** The free layer on the real browser layout (the canvas unit tests fake every box): the built page opens in Chromium
 * with the Boceto canvas script, and real pointer events pull a part out of its box. */
jest.setTimeout(120_000);

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const tinyJpeg = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const bocetoScript = readFileSync(resolve(__dirname, '../../../../../packages/storefront-preview/src/source-preview-boceto-mode.js'), 'utf8');

async function openPage<T>(blocks: object[], visit: (page: Page) => Promise<T>): Promise<T> {
  return openSketch(repairSketch({ blocks }, ctx).sketch, visit);
}

/** Same as openPage but for a sketch that has already been built — a composed one, say. */
async function openSketch<T>(sketch: StoreSketch, visit: (page: Page) => Promise<T>): Promise<T> {
  const files = await withSourceIcons(assembleSketch(sketch, ctx));
  const base = [...nextStoreFiles().filter(file => ['config.js', 'commerce.js'].includes(file.path)), { path: 'assets/a.jpg', content: tinyJpeg, encoding: 'base64' as const }];
  const snapshot = await agentPreviewSnapshot({ brief: { businessType: 'Repostería', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Cálida' }, files: base }, files);
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); }));
    });
    return visit(page);
  });
}

it('a part pulled out of a section it held up lands under the pointer, and the section closes the gap', async () => {
  const result = await openPage([
    { id: 'h', type: 'hero', headline: 'Algo dulce para mirar despacio', sub: 'Repostería de verdad', cta: 'Ver productos', bg: 'paper', size: 'l' },
  ], async page => {
    await page.addScriptTag({ content: bocetoScript });
    await page.evaluate(() => {
      (window as any).posted = [];
      window.addEventListener('message', event => { if (event.data?.type === 'pagosya:boceto-free') (window as any).posted.push(event.data); });
      window.postMessage({ type: 'pagosya:boceto-mode', on: true }, '*');
      window.postMessage({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'], freeable: ['copy/headline', 'copy/sub', 'copy/actions'], free: {} } } }, '*');
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-boceto-on'));
    const measure = () => page.evaluate(() => {
      const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
      return { part: box('[data-skb="h"] [data-skb-el="headline"]'), section: box('[data-skb="h"]'), column: box('[data-skb="h"] [data-skb-group="copy"]') };
    });
    const before = await measure();
    const press = { x: before.part.left + 30, y: before.part.top + before.part.height / 2 };
    // Well past the copy column's right edge (24px pulls it out), still inside the section.
    const drop = { x: before.column.left + before.column.width + 150, y: press.y + 40 };
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) await page.mouse.move(press.x + ((drop.x - press.x) * step) / 12, press.y + ((drop.y - press.y) * step) / 12);
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).posted.length > 0, undefined, { timeout: 3000 }).catch(() => undefined);
    return { before, after: await measure(), posted: await page.evaluate(() => (window as any).posted), moved: { x: drop.x - press.x, y: drop.y - press.y } };
  });
  expect(result.posted).toEqual([expect.objectContaining({ id: 'h', path: 'copy/headline' })]);
  // The section no longer holds the headline up…
  expect(result.after.section.height).toBeLessThan(result.before.section.height - 20);
  // …and the headline moved exactly as far as the pointer did, at its own width.
  expect(Math.abs(result.after.part.left - (result.before.part.left + result.moved.x))).toBeLessThan(3);
  expect(Math.abs(result.after.part.top - (result.before.part.top + result.moved.y))).toBeLessThan(3);
  expect(Math.abs(result.after.part.width - result.before.part.width)).toBeLessThan(3);
});

it('inserted elements show whole in the marquee and the footer; the giant name keeps its cut', async () => {
  const result = await openPage([
    { id: 'h', type: 'hero', headline: 'Hola', cta: 'Ver', bg: 'paper', size: 'm' },
    { id: 'm', type: 'marquee', text: 'Horneado · Fresco', glyph: '✦', bg: 'pop', size: 's', extras: [{ id: 'eab1', kind: 'photo', value: 'assets/a.jpg', x: 40, y: 20, w: 22 }, { id: 'eab2', kind: 'text', value: 'Un texto largo que no cabe en una sola línea', x: 70, y: 10, w: 12 }] },
    { id: 'g', type: 'gallery', title: 'Galería', photos: ['assets/a.jpg'], bg: 'paper', size: 'm' },
    { id: 'z', type: 'footer', tagline: 'Hecho con calma.', wordmark: 'giant', bg: 'deep', size: 'm', extras: [{ id: 'eab3', kind: 'photo', value: 'assets/a.jpg', x: 70, y: 85, w: 22 }] },
  ], page => page.evaluate(() => {
    const shownAt = (node: Element, x: number, y: number) => { const hit = document.elementFromPoint(x, y); return Boolean(hit && node.contains(hit)); };
    const marquee = document.querySelector('[data-skb="m"]')!, photo = marquee.querySelector('[data-skb-node="eab1"]')!, text = marquee.querySelector('[data-skb-node="eab2"]')!;
    window.scrollTo(0, marquee.getBoundingClientRect().top + window.scrollY - 100);
    const strip = marquee.getBoundingClientRect(), shot = photo.getBoundingClientRect();
    const inMarquee = { overhangs: shot.bottom > strip.bottom + 40, shownBelow: shownAt(photo, shot.left + shot.width / 2, strip.bottom + 20), textWraps: text.getBoundingClientRect().height > parseFloat(getComputedStyle(text).lineHeight) * 1.5 };
    window.scrollTo(0, document.documentElement.scrollHeight);
    const footer = document.querySelector('[data-skb="z"]')!, footerPhoto = footer.querySelector('[data-skb-node="eab3"]')!, wordmark = footer.querySelector('.skb-wordmark')!;
    const end = footer.getBoundingClientRect(), footerShot = footerPhoto.getBoundingClientRect(), name = wordmark.getBoundingClientRect();
    return {
      inMarquee,
      inFooter: { overhangs: footerShot.bottom > end.bottom + 40, shownBelow: shownAt(footerPhoto, footerShot.left + footerShot.width / 2, end.bottom + 20) },
      // The giant name still ends where the footer ends, as before.
      name: { aboveEnd: shownAt(wordmark, name.left + name.width / 3, end.bottom - 6), belowEnd: shownAt(wordmark, name.left + name.width / 3, end.bottom + 3) },
      scrollWidth: document.documentElement.scrollWidth,
    };
  }));
  expect(result.inMarquee).toEqual({ overhangs: true, shownBelow: true, textWraps: true });
  expect(result.inFooter).toEqual({ overhangs: true, shownBelow: true });
  expect(result.name).toEqual({ aboveEnd: true, belowEnd: false });
  expect(result.scrollWidth).toBe(1280);
});

it('a box drawn over two story paragraphs picks exactly those two', async () => {
  const result = await openPage([
    { id: 's', type: 'story', title: 'El proceso', paragraphs: ['Preparación lenta de la masa.', 'Horneado al momento.', 'Empaque a mano.'], bg: 'paper', size: 'm' },
  ], async page => {
    await page.addScriptTag({ content: bocetoScript });
    await page.evaluate(() => {
      (window as any).posted = [];
      window.addEventListener('message', event => { if (event.data?.type === 'pagosya:boceto-select-many' || event.data?.type === 'pagosya:boceto-select') (window as any).posted.push(event.data); });
      window.postMessage({ type: 'pagosya:boceto-mode', on: true }, '*');
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-boceto-on'));
    const box = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const section = r('[data-skb="s"]'), first = r('[data-skb="s"] [data-skb-group="paragraphs"] > :nth-child(1)'), second = r('[data-skb="s"] [data-skb-group="paragraphs"] > :nth-child(2)');
      return { x0: section.left + 6, y0: first.top - 4, x1: Math.max(first.right, second.right) + 6, y1: second.bottom + 4 };
    });
    await page.mouse.move(box.x0, box.y0); await page.mouse.down();
    for (let step = 1; step <= 8; step++) await page.mouse.move(box.x0 + ((box.x1 - box.x0) * step) / 8, box.y0 + ((box.y1 - box.y0) * step) / 8);
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).posted.length > 0, undefined, { timeout: 3000 }).catch(() => undefined);
    // Chromium follows the release with a click on the box's common ancestor; it must not turn into a selection.
    await page.waitForTimeout(150);
    return page.evaluate(() => (window as any).posted);
  });
  expect(result).toEqual([{ type: 'pagosya:boceto-select-many', items: [{ id: 's', path: 'copy/paragraphs/0' }, { id: 's', path: 'copy/paragraphs/1' }], add: false }]);
});

it('two parts dragged together keep their distance after both come out', async () => {
  const result = await openPage([
    { id: 'h', type: 'hero', headline: 'Hola', sub: 'Repostería de verdad', trust: '★ 4.8 · 2.400 pedidos', note: 'Pide antes del domingo.', cta: 'Ver productos', cta2: 'Armar caja', bg: 'paper', size: 'l' },
  ], async page => {
    await page.addScriptTag({ content: bocetoScript });
    await page.evaluate(() => {
      (window as any).posted = [];
      window.addEventListener('message', event => { if (event.data?.type === 'pagosya:boceto-free-many') (window as any).posted.push(event.data); });
      window.postMessage({ type: 'pagosya:boceto-mode', on: true }, '*');
      window.postMessage({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: '', others: [{ id: 'h', path: 'copy/trust' }] }, blocks: { h: { movable: [], freeable: ['copy/sub', 'copy/trust'], free: {} } } }, '*');
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-boceto-on'));
    const measure = () => page.evaluate(() => ['[data-skb-el="sub"]', '[data-skb-el="trust"]'].map(selector => { const r = document.querySelector(`[data-skb="h"] ${selector}`)!.getBoundingClientRect(); return { left: r.left, top: r.top }; }));
    const before = await measure();
    const press = { x: before[0].left + 30, y: before[0].top + 10 };
    await page.mouse.move(press.x, press.y); await page.mouse.down();
    for (let step = 1; step <= 10; step++) await page.mouse.move(press.x + 30 * step, press.y + 4 * step);
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).posted.length > 0, undefined, { timeout: 3000 }).catch(() => undefined);
    return { before, after: await measure(), posted: await page.evaluate(() => (window as any).posted) };
  });
  expect(result.posted).toHaveLength(1);
  expect(result.posted[0].moves.map((move: any) => move.path)).toEqual(['copy/sub', 'copy/trust']);
  for (const i of [0, 1]) {
    expect(Math.abs(result.after[i].left - result.before[i].left - 300)).toBeLessThan(3);
    expect(Math.abs(result.after[i].top - result.before[i].top - 40)).toBeLessThan(3);
  }
});

it('a freed part escapes a narrow column on desktop and rejoins it on a phone', async () => {
  const { sketch } = repairSketch({ blocks: [{ id: 's1', type: 'story', title: 'Historia', paragraphs: ['Uno'], width: 'narrow' }] }, ctx);
  const composed = applySketchComposition(sketch, { blocks: [
    { id: 's1', free: [{ path: 'copy/title', x: 82, y: 10, w: 0, r: 0 }], extras: [], order: [], layout: [] },
  ] }, ctx).sketch;
  await openSketch(composed, async page => {
    const desktop = await page.evaluate(() => {
      const section = document.querySelector('[data-skb="s1"]')!.getBoundingClientRect();
      const title = document.querySelector('[data-skb="s1"] [data-skb-free]')!.getBoundingClientRect();
      const column = document.querySelector('[data-skb="s1"] > :not(.skb-extras)')!.getBoundingClientRect();
      return { past: title.left > column.right, inside: title.left >= section.left && title.right <= section.right + 1 };
    });
    // The freed part leaves the narrow column but never leaves the band: that is the editorial overlap.
    expect(desktop.past).toBe(true);
    expect(desktop.inside).toBe(true);

    await page.setViewportSize({ width: 390, height: 900 });
    const phone = await page.evaluate(() => getComputedStyle(document.querySelector('[data-skb="s1"] [data-skb-free]')!).position);
    expect(phone).toBe('static');
  });
});

it('an offset band centres on a phone', async () => {
  await openPage([{ id: 's2', type: 'story', title: 'Historia', paragraphs: ['Uno'], width: 'offset-right' }], async page => {
    await page.setViewportSize({ width: 390, height: 900 });
    const gaps = await page.evaluate(() => {
      const section = document.querySelector('[data-skb="s2"]')!.getBoundingClientRect();
      const column = document.querySelector('[data-skb="s2"] > :not(.skb-extras)')!.getBoundingClientRect();
      return { left: column.left - section.left, right: section.right - column.right };
    });
    expect(Math.abs(gaps.left - gaps.right)).toBeLessThan(2);
  });
});

// mulberry32, not a bare LCG: an LCG's first draw is linear in the seed, so every seed drew the same page length.
const seeded = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// One superset of every field a block type reads, in the shapes the schema takes (q/a pairs, quote objects, photo paths):
// a model that fills its slots honestly fills these. Strings like items: ['uno'] are dropped by the repair and would make
// every list band look empty for a reason that has nothing to do with the page.
const modelCopy = {
  headline: 'Pan de verdad', title: 'Pan de verdad', kicker: 'Hecho a mano', sub: 'Cada mañana', body: 'Horneamos cada día con harina local.', cta: 'Ver productos', note: 'Pedidos hasta las 6',
  left: 'Envío gratis', right: 'Desde Bs 50', text: 'Pan de verdad', glyph: '*', tagline: 'Pan de verdad', paragraphs: ['Empezó en una cocina pequeña.', 'Hoy seguimos igual.'], photo: 'assets/a.jpg', photos: ['assets/a.jpg'],
  items: [{ q: '¿Hacen envíos?', a: 'Sí, en toda la ciudad.', title: 'Pedí', text: 'Elegí lo que querés', icon: 'check' }, { q: '¿Cómo pago?', a: 'Con QR.', title: 'Pagá', text: 'Con QR o tarjeta', icon: 'check' }],
  quotes: [{ text: 'El mejor pan del barrio.', name: 'Ana', place: 'La Paz' }, { text: 'Siempre fresco.', name: 'Luis', place: 'El Alto' }],
  stats: [{ value: '10', label: 'años' }], boxes: [{ title: 'Fresco', text: 'Todos los días' }], pills: ['Artesanal'],
};
const fullStore = { products: 40, photos: 6, categories: 5, briefWords: 60 };

it('the ten seeds draw pages of different lengths, so the browser cases are not ten copies of one page', () => {
  const lengths = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(seed => drawPageStructure(fullStore, seeded(seed)).slots.length));
  expect(lengths.size).toBeGreaterThan(2);
});

/** A band can have height and still be broken: a heading and its padding render over an empty body ("Preguntas" with no
 * questions). "Visually empty" here: the section has a heading, and outside that heading (and the extras layer) holds no
 * visible element that is media, interactive, a list item, a quote, a paragraph or a table cell with real size. */
const bandProblems = () => Array.from(document.querySelectorAll('section[data-skb]')).flatMap(section => {
  const id = section.getAttribute('data-skb');
  const inflow = Array.from(section.children).filter(child => !child.classList.contains('skb-extras') && getComputedStyle(child).position !== 'absolute');
  const tallest = inflow.reduce((max, child) => Math.max(max, child.getBoundingClientRect().height), 0);
  const heading = section.querySelector('h1, h2, h3, h4');
  const content = Array.from(section.querySelectorAll('img, svg, video, button, a, li, details, input, blockquote, figure, p, dd, td'))
    .filter(el => !el.closest('h1, h2, h3, h4') && !el.closest('.skb-extras'))
    .filter(el => { const r = el.getBoundingClientRect(); const style = getComputedStyle(el); return r.width >= 8 && r.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none'; });
  return [...(tallest === 0 ? [`${id}: collapsed`] : []), ...(heading && content.length === 0 ? [`${id}: only a heading`] : [])];
});

it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('renders drawn structure %i with every band standing and none empty', async seed => {
  const structure = drawPageStructure(fullStore, seeded(seed));
  const response = { blocks: structure.slots.map(slot => ({ id: slot.id, type: slot.type, ...modelCopy })) };
  const { sketch } = repairSketch(response, ctx, { structure });
  await openSketch(sketch, async page => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect({ width, problems: await page.evaluate(bandProblems) }).toEqual({ width, problems: [] });
    }
  });
});

// The model sends every list as malformed items (bare strings, paths that are not photos): the repair discards them,
// so each list band arrives present but empty. The page must lose those bands rather than ship a heading over nothing.
it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('renders drawn structure %i with every list malformed and no band left empty', async seed => {
  const structure = drawPageStructure(fullStore, seeded(seed));
  const malformed = { ...modelCopy, items: ['uno', 'dos'], quotes: ['uno'], photos: ['no-es-una-foto'], paragraphs: [], left: '', right: '' };
  const response = { blocks: structure.slots.map(slot => ({ id: slot.id, type: slot.type, ...malformed })) };
  const { sketch } = repairSketch(response, ctx, { structure });
  await openSketch(sketch, async page => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect({ width, problems: await page.evaluate(bandProblems) }).toEqual({ width, problems: [] });
    }
  });
});

// The one test that proves the new component CSS does something in a real browser: every loud choice at once, on a page
// that carries each element the rules select, at desktop and phone width.
it('renders the loudest component combination without overflow or a collapsed button', async () => {
  const sketch = repairSketch({
    style: { buttons: 'hard-shadow', icons: 'circle', dividers: 'notch', badges: 'tag', fields: 'pill', links: 'arrow', buttonIcon: 'bag' },
    blocks: [
      { id: 'h', type: 'hero', headline: 'Pan de verdad', sub: 'Todos los días', cta: 'Comprar', cta2: 'Ver más', badge: 'Nuevo', photo: 'assets/a.jpg' },
      { id: 'p', type: 'split', title: 'Hecho a mano', body: 'Cada día.', photo: 'assets/a.jpg', boxes: [{ title: 'Fresco', text: 'Todos los días', icon: 'check' }] },
      { id: 's', type: 'steps', title: 'Cómo pedir', items: [{ title: 'Pedí', text: 'Elegí', icon: 'check' }, { title: 'Pagá', text: 'Con QR', icon: 'check' }] },
      { id: 'n', type: 'newsletter', title: 'Novedades', cta: 'Quiero enterarme' },
      { id: 'f', type: 'footer', tagline: 'Hecho con calma.' },
    ],
  }, ctx).sketch;
  await openSketch(sketch, async page => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate(() => {
        const heights = Array.from(document.querySelectorAll('.skb-btn')).map(button => button.getBoundingClientRect().height);
        const icon = document.querySelector('.skb-btn__icon');
        const seam = document.querySelector('.skb + .skb');
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          collapsed: heights.filter(height => height < 20).length,
          buttons: heights.length,
          iconWidth: icon ? icon.getBoundingClientRect().width : 0,
          shadow: getComputedStyle(document.querySelector('.skb-btn:not(.skb-subscribe)')!).boxShadow,
          notch: seam ? getComputedStyle(seam, '::before').content : '',
          circle: getComputedStyle(document.querySelector('.skb-box__icon')!).borderRadius,
        };
      });
      expect({ width, overflow: result.overflow, collapsed: result.collapsed }).toEqual({ width, overflow: false, collapsed: 0 });
      // Proof the rules matched something: the icon span has size, the shadow and notch exist, the plain icon is framed round.
      expect(result.buttons).toBeGreaterThan(1);
      expect(result.iconWidth).toBeGreaterThan(8);
      expect(result.shadow).not.toBe('none');
      expect(result.notch).toBe('""');
      expect(result.circle).toBe('50%');
    }
  });
});

// The unit tests only prove a rule's text is in the stylesheet, which cannot see a rule lose the cascade. These read the
// computed result, because two rules were written correctly and still lost to older, more specific ones.
const variantPage = (style: object) => repairSketch({
  style,
  blocks: [
    { id: 'h', type: 'hero', headline: 'Pan de verdad', sub: 'Todos los días', cta: 'Comprar', photo: 'assets/a.jpg' },
    { id: 's', type: 'steps', title: 'Cómo pedir', items: [1, 2, 3].map(n => ({ title: `Paso ${n}`, text: 'Elegí', icon: 'check' })) },
    { id: 'p', type: 'split', title: 'Hecho a mano', body: 'Cada día.', photo: 'assets/a.jpg', boxes: [{ title: 'Fresco', text: 'Todos los días', icon: 'check' }] },
  ],
}, ctx).sketch;

it('a chosen button icon replaces the default arrow instead of sitting beside it', async () => {
  await openSketch(variantPage({ buttonIcon: 'arrow' }), async page => {
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('.skb-btn--icon')!, '::after').content);
    expect(after).toBe('none');
  });
});

it('hairline and rule dividers draw a line, and a square icon takes the radius token', async () => {
  for (const dividers of ['hairline', 'rule']) {
    await openSketch(variantPage({ dividers, icons: 'square' }), async page => {
      const seen = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.borderRadius = 'var(--skb-r-sm)';
        document.querySelector('.skb-site')!.append(probe);
        return {
          line: parseFloat(getComputedStyle(document.querySelectorAll('.skb + .skb')[0]).borderTopWidth),
          radius: getComputedStyle(document.querySelector('.skb-box__icon')!).borderRadius,
          token: getComputedStyle(probe).borderRadius,
        };
      });
      expect({ dividers, drawn: seen.line > 0 }).toEqual({ dividers, drawn: true });
      expect(seen.radius).toBe(seen.token);
    });
  }
});

it('tinted step icons use one colour on every step and keep a glyph that shows against it', async () => {
  await openSketch(variantPage({ icons: 'tinted' }), async page => {
    const seen = await page.evaluate(() => Array.from(document.querySelectorAll('.skb-step__icon-wrap')).map(wrap => ({
      background: getComputedStyle(wrap).backgroundColor, filter: getComputedStyle(wrap.querySelector('img')!).filter,
    })));
    expect(seen.length).toBe(3);
    // Untinted, steps 2 and 3 cycle to the deep and ink colours; tinted, the tint must beat that cycle.
    expect(new Set(seen.map(item => item.background)).size).toBe(1);
    // The glyph is inverted to white for the filled wrapper; stripping that on a dark wrapper hides the icon.
    for (const item of seen) expect(item.filter).toContain('invert');
  });
});
