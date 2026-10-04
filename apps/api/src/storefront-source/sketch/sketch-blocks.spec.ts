import { renderBlock, blockCss, SKETCH_BASE_CSS } from './sketch-blocks';
import { repairSketch } from './sketch-schema';
import { assembleSketch } from './sketch-assembler';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const hostile = '</section><script>alert(1)</script>`${x}`';
const { sketch } = repairSketch({ blocks: [{ id: 'h1', type: 'hero', headline: hostile }] }, ctx);

it('escapes hostile text via JSON.stringify expressions', () => {
  const out = renderBlock(sketch.blocks[0], sketch, ctx);
  expect(out).toContain(JSON.stringify(hostile));
  // Outside string literals the markup must stay inert: no raw script/section injection, no template interpolation.
  const withoutStrings = out.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  expect(withoutStrings).not.toContain('<script');
  expect(withoutStrings).not.toContain('${');
});

it('catalog block carries both commerce mounts', () => {
  const catalog = sketch.blocks.find(b => b.type === 'catalog')!;
  const out = renderBlock(catalog, sketch, ctx);
  expect(out).toContain('data-pagosya-product-template');
  expect(out).toContain('data-pagosya-catalog');
});

it('footer carries pages nav and giant wordmark, newsletter has no input', () => {
  const footer = sketch.blocks.at(-1)!;
  const out = renderBlock(footer, sketch, ctx);
  expect(out).toContain('data-pagosya-pages');
  expect(out).toContain('skb-wordmark');
  const news = repairSketch({ blocks: [{ id: 'n', type: 'newsletter', title: 'Únete' }] }, ctx).sketch.blocks.find(b => b.type === 'newsletter')!;
  expect(renderBlock(news, sketch, ctx)).not.toContain('<input');
});

it('every section is selectable and background-tinted', () => {
  for (const block of sketch.blocks) {
    const out = renderBlock(block, sketch, ctx);
    expect(out).toContain('data-skb=');
    expect(out).toContain(JSON.stringify(block.id));
    expect(out).toContain('--skb-bg');
  }
});

it('every type has css and base css covers sizes and reduced motion', () => {
  const types = ['hero', 'marquee', 'catalog', 'story', 'reviews', 'faq', 'banner', 'gallery', 'newsletter', 'footer'] as const;
  for (const type of types) expect(blockCss(type).length).toBeGreaterThan(0);
  expect(SKETCH_BASE_CSS).toContain('prefers-reduced-motion');
  for (const s of ['s', 'm', 'l', 'xl']) expect(SKETCH_BASE_CSS).toContain(`skb--${s}`);
});

describe('review fixes', () => {
  it('newsletter renders the runtime subscribe contract, not a checkout link (F5)', () => {
    const news = repairSketch({ blocks: [{ id: 'n', type: 'newsletter', title: 'Únete' }] }, ctx).sketch.blocks.find(b => b.type === 'newsletter')!;
    const out = renderBlock(news, sketch, ctx);
    expect(out).toContain('data-pagosya-subscribe-block');
    expect(out).toContain('data-pagosya-subscribe-open');
    expect(out).not.toContain('<input');
    expect(out).not.toContain('checkout.html');
  });
  it('mid-tone backgrounds get the higher-contrast ink (F7)', () => {
    const story = repairSketch({ blocks: [{ id: 's', type: 'story', title: 'Proceso', paragraphs: ['uno'], bg: 'accent' }] }, ctx).sketch;
    const out = renderBlock(story.blocks.find(b => b.type === 'story')!, story, ctx);
    expect(out).toContain('"#111111"');
    expect(out).not.toContain('"#ffffff"');
  });
});

describe('bake-lab enrichment', () => {
  it('renders announce, split, hero extras and anchored sections with nav targets', () => {
    const rich = repairSketch({ blocks: [
      { id: 'top', type: 'announce', left: 'izq', right: 'der' },
      { id: 'h', type: 'hero', headline: 'Hola', badge: 'DROP', note: 'nota', sticker: 'Fresco', photo: 'assets/a.jpg' },
      { id: 'sp', type: 'split', headline: 'Mezcla', body: 'b', cta: 'Armar', pills: ['6 · Bs38'], photo: 'assets/a.jpg' },
    ] }, ctx).sketch;
    const announce = renderBlock(rich.blocks.find(b => b.type === 'announce')!, rich, ctx);
    expect(announce).toContain('skb-announce');
    const hero = renderBlock(rich.blocks.find(b => b.type === 'hero')!, rich, ctx);
    expect(hero).toContain('skb-badge');
    expect(hero).toContain('skb-sticker');
    expect(hero).toContain('skb-note');
    expect(hero).toContain('id={"skb-h"}');
    const split = renderBlock(rich.blocks.find(b => b.type === 'split')!, rich, ctx);
    expect(split).toContain('skb-split');
    expect(split).toContain('skb-pill');
    for (const type of ['announce', 'split'] as const) expect(blockCss(type).length).toBeGreaterThan(0);
  });
});

describe('inline edit markers', () => {
  it('text fields carry data-skb-field paths, including array items', () => {
    const rich = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola', sub: 'sub' },
      { id: 's', type: 'story', title: 'Proceso', paragraphs: ['uno', 'dos'] },
      { id: 'sp', type: 'split', headline: 'Mezcla', pills: ['6 · Bs38'] },
    ] }, ctx).sketch;
    const hero = renderBlock(rich.blocks.find(b => b.type === 'hero')!, rich, ctx);
    expect(hero).toContain('data-skb-field={"headline"}');
    expect(hero).toContain('data-skb-field={"sub"}');
    const story = renderBlock(rich.blocks.find(b => b.type === 'story')!, rich, ctx);
    expect(story).toContain('data-skb-field={"title"}');
    expect(story).toContain('data-skb-field={"paragraphs.0"}');
    expect(story).toContain('data-skb-field={"paragraphs.1"}');
    const split = renderBlock(rich.blocks.find(b => b.type === 'split')!, rich, ctx);
    expect(split).toContain('data-skb-field={"pills.0"}');
  });
});

describe('abundance upgrades (SP1+SP2)', () => {
  it('hero renders dual CTAs, trust row and draggable element keys in saved order', () => {
    const rich = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola', sub: 's', cta: 'Comprar', cta2: 'Armar caja', trust: '★ 4.8 · 2.400 pedidos', badge: 'DROP', note: 'n', order: ['headline', 'badge', 'sub', 'actions', 'trust', 'note'] },
    ] }, ctx).sketch;
    const hero = renderBlock(rich.blocks.find(b => b.type === 'hero')!, rich, ctx);
    expect(hero).toContain('skb-btn--ghost');
    expect(hero).toContain('skb-trust');
    expect(hero).toContain('data-skb-el="actions"');
    expect(hero.indexOf('data-skb-el="headline"')).toBeLessThan(hero.indexOf('data-skb-el="badge"'));
  });
  it('split renders stats with editable fields and a sticker, tinted sections resolve to hex', () => {
    const rich = repairSketch({ blocks: [
      { id: 'sp', type: 'split', headline: 'Mezcla', stats: [{ value: '150g', label: 'por galleta' }], sticker: 'Ahorra 15%', photo: 'assets/a.jpg', bg: 'tint-deep' },
    ] }, ctx).sketch;
    const split = renderBlock(rich.blocks.find(b => b.type === 'split')!, rich, ctx);
    expect(split).toContain('skb-stat__value');
    expect(split).toContain('data-skb-field={"stats.0.value"}');
    expect(split).toContain('skb-sticker');
    expect(split).toMatch(/--skb-bg.*#[0-9a-f]{6}/);
  });
  it('a saved sticker drag position lands as inline left/top percentages', () => {
    const rich = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola', sticker: 'Fresco', photo: 'assets/a.jpg', stickerPos: { x: 12.5, y: 80 } },
    ] }, ctx).sketch;
    const hero = renderBlock(rich.blocks.find(b => b.type === 'hero')!, rich, ctx);
    expect(hero).toContain('"12.5%"');
    expect(hero).toContain('"80%"');
  });
  it('catalog carries badge CSS vars, seeAll, name+price row and the microcopy strip', () => {
    const rich = repairSketch({ blocks: [
      { id: 'c', type: 'catalog', title: 'Productos', badges: ['NUEVO', 'CLÁSICO'], seeAll: 'VER TODO →', stripLeft: 'Cada galleta pesa 150g', stripRight: 'Pide antes del domingo' },
    ] }, ctx).sketch;
    const catalog = renderBlock(rich.blocks.find(b => b.type === 'catalog')!, rich, ctx);
    expect(catalog).toContain('--skb-badge-1');
    expect(catalog).toContain('skb-see');
    expect(catalog).toContain('skb-card__row');
    expect(catalog).toContain('skb-strip');
    expect(catalog).toContain('data-pagosya-product-template');
    expect(catalog).toContain('data-pagosya-catalog');
  });
  it('collections renders tint-cycled cards with arrow chips; reviews renders rating, stars and handle tile', () => {
    const rich = repairSketch({ blocks: [
      { id: 'co', type: 'collections', title: 'Antojos', items: [{ title: 'Chocolate', text: 'Intensos', photo: 'assets/a.jpg' }] },
      { id: 'r', type: 'reviews', title: 'Felices', ratingValue: '4.9 / 5', ratingSource: 'Google', handle: '@salv', quotes: [{ text: 'Rico', name: 'Ana' }], photos: ['assets/a.jpg'] },
    ] }, ctx).sketch;
    const collections = renderBlock(rich.blocks.find(b => b.type === 'collections')!, rich, ctx);
    expect(collections).toContain('skb-collection__arrow');
    expect(collections).toContain('data-skb-field={"items.0.title"}');
    const reviews = renderBlock(rich.blocks.find(b => b.type === 'reviews')!, rich, ctx);
    expect(reviews).toContain('skb-rating__value');
    expect(reviews).toContain('skb-review__stars');
    expect(reviews).toContain('skb-reviews__handle');
    expect(reviews).toContain('@salv');
  });
  it('newsletter split variant renders photo + copy and keeps the subscribe contract', () => {
    const rich = repairSketch({ blocks: [{ id: 'n', type: 'newsletter', variant: 'split', title: 'Únete', photo: 'assets/a.jpg' }] }, ctx).sketch;
    const news = renderBlock(rich.blocks.find(b => b.type === 'newsletter')!, rich, ctx);
    expect(news).toContain('skb-newsletter__grid');
    expect(news).toContain('data-pagosya-subscribe-open');
    expect(news).not.toContain('<input');
  });
  it('marquee speed follows size and the glyph separates repetitions', () => {
    const rich = repairSketch({ blocks: [{ id: 'm', type: 'marquee', text: 'Fresco', glyph: '✦', size: 's' }] }, ctx).sketch;
    const marquee = renderBlock(rich.blocks.find(b => b.type === 'marquee')!, rich, ctx);
    expect(marquee).toContain('--skb-marquee-dur');
    expect(marquee).toContain('18s');
    expect(marquee).toContain('✦');
  });
  it('footer renders brand column, legal line and keeps the pages nav', () => {
    const rich = repairSketch({ blocks: [{ id: 'f', type: 'footer', tagline: 'Hecho con calma', wordmark: 'giant' }] }, ctx).sketch;
    const footer = renderBlock(rich.blocks.at(-1)!, rich, ctx);
    expect(footer).toContain('skb-footer__grid');
    expect(footer).toContain('skb-footer__legal');
    expect(footer).toContain('data-pagosya-pages');
    expect(footer).toContain('skb-wordmark');
  });
  it('collections css exists and tint vars drive the card cycling', () => {
    expect(blockCss('collections')).toContain('skb-tint-2');
    expect(blockCss('catalog')).toContain('--skb-card-badge');
    expect(blockCss('reviews')).toContain('skb-tint-3');
  });
});

it('steps render numbered cards with icon images and editable fields', () => {
  const rich = repairSketch({ blocks: [{ id: 'st', type: 'steps', title: 'Así de simple', items: [
    { icon: 'cookie', title: 'Elige', text: 'Tu antojo' },
    { icon: 'package', title: 'Horneamos', text: 'Al momento' },
  ] }] }, ctx).sketch;
  const out = renderBlock(rich.blocks.find(b => b.type === 'steps')!, rich, ctx);
  expect(out).toContain('assets/icons/cookie.svg');
  expect(out).toContain('data-skb-field={"items.0.title"}');
  expect(out).toContain('data-skb-field={"items.1.text"}');
  expect(out).toContain('01');
  expect(blockCss('steps').length).toBeGreaterThan(0);
});

import { sketchNodeTree } from '@pagosya/shared-types';

describe('structured selection markers', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
  const sketchWith = (blocks: object[]) => repairSketch({ blocks }, ctx).sketch;
  const marker = (attrs: string, name: string) => attrs.match(new RegExp(`data-skb-${name}=(?:\\{"([^"]+)"\\}|"([^"]+)")`))?.slice(1).find(Boolean);
  /** Full paths of the marked nodes, read from the markup's nesting exactly as the canvas does: a node's path is its
   * nearest marked ancestor's path plus its own key (group, then node, then el). */
  const renderedPaths = (markup: string) => {
    const found = new Set<string>(); const stack: string[] = [''];
    for (const [, closing, attrs, selfClosing] of markup.matchAll(/<(\/?)[A-Za-z][\w.]*((?:"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\}|[^>"{}])*?)(\/?)>/g)) {
      if (closing) { stack.pop(); continue; }
      const parent = stack[stack.length - 1];
      const key = marker(attrs, 'group') ?? marker(attrs, 'node') ?? marker(attrs, 'el');
      const path = key ? (parent ? `${parent}/${key}` : key) : parent;
      if (key) found.add(path);
      if (!selfClosing) stack.push(path);
    }
    return found;
  };
  const all = (nodes: ReturnType<typeof sketchNodeTree>): string[] => nodes.flatMap(node => [node.path, ...all(node.children)]);
  it('every node of the shared tree is stamped in the rendered block at its full path', () => {
    const sketch = sketchWith([
      { id: 'h', type: 'hero', headline: 'H', sub: 's', cta: 'a', cta2: 'b', trust: 't', caption: 'c', sticker: 'x', photo: 'assets/a.jpg' },
      { id: 'sp', type: 'split', kicker: 'k', headline: 'H', body: 'b', cta: 'a', pills: ['1', '2'], stats: [{ value: '1', label: 'l' }], boxes: [{ title: 't', text: '' }], tag: 'tg', photo: 'assets/a.jpg' },
      { id: 'st', type: 'story', kicker: 'k', title: 'T', paragraphs: ['a', 'b'], photo: 'assets/a.jpg' },
      { id: 'n', type: 'newsletter', variant: 'split', kicker: 'k', title: 'T', note: 'n', photo: 'assets/a.jpg' },
      { id: 'b', type: 'banner', kicker: 'k', headline: 'H', cta: 'c', sticker: 's' },
      { id: 'se', type: 'steps', kicker: 'k', title: 'T', note: 'n', items: [{ icon: 'gift', title: 'a', text: '' }] },
      { id: 'r', type: 'reviews', title: 'T', ratingValue: '4.9', quotes: [{ text: 'a', name: 'b' }] },
      { id: 'f', type: 'faq', title: 'T', items: [{ q: 'q', a: 'a' }] },
      { id: 'g', type: 'gallery', title: 'T', photos: ['assets/a.jpg'] },
      { id: 'a', type: 'announce', left: 'l', right: 'r' },
    ]);
    for (const block of sketch.blocks) {
      const found = renderedPaths(renderBlock(block, sketch, ctx));
      for (const path of all(sketchNodeTree(block))) expect([block.type, path, found.has(path)]).toEqual([block.type, path, true]);
    }
  });
  it('emits saved group layout as data attributes and story copy in saved order', () => {
    const sketch = sketchWith([{ id: 'st', type: 'story', title: 'T', paragraphs: ['a'], order: ['paragraphs', 'title'], layout: { copy: { gap: 'l', valign: 'end' }, paragraphs: { gap: 's' } } }]);
    const html = renderBlock(sketch.blocks[0], sketch, ctx);
    expect(html).toMatch(/data-skb-group=\{"copy"\} data-skb-gap=\{"l"\} data-skb-valign=\{"end"\}/);
    expect(html.indexOf('data-skb-el="paragraphs"')).toBeLessThan(html.indexOf('data-skb-el="title"'));
  });
  it('base css styles every layout attribute and keeps rows wrapping on phones', () => {
    for (const rule of ['[data-skb-gap="s"]', '[data-skb-dir="column"]', '[data-skb-galign="center"]', '[data-skb-valign="end"]']) expect(SKETCH_BASE_CSS).toContain(rule);
  });
});

describe('review fixes (layout controls take effect)', () => {
  it('row alignment beats the block alignment rule and gap containers are grids', () => {
    const css = SKETCH_BASE_CSS + (['story', 'faq'] as const).map(type => blockCss(type)).join('\n');
    // .skb + attribute selectors: specificity above `.skb[data-skb-align] :is(.skb-actions…)` (0,3,0).
    expect(css).toContain('.skb :is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-galign="start"]');
    expect(css).toContain('.skb :is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-galign="center"]');
    expect(css).toContain(':is(.skb-story__copy, .skb-story__paragraphs, .skb-faq__list)[data-skb-gap] { display: grid; }');
  });
});

describe('follow-ups', () => {
  it('right alignment moves only the text of banners and centred newsletters, never their stacked items', () => {
    const endRules = SKETCH_BASE_CSS.split('\n').filter(line => line.startsWith('.skb[data-skb-align="end"]'));
    expect(endRules.length).toBeGreaterThan(0);
    for (const rule of endRules) for (const stack of ['.skb-banner__copy', '.skb-newsletter__stack']) expect(rule).not.toContain(stack);
    expect(endRules.join('\n')).toContain('.skb-hero__copy');
  });
});

describe('band width rendering', () => {
  const render = (width?: string) => {
    const { sketch: s } = repairSketch({ blocks: [{ id: 'w1', type: 'story', title: 'Hola', paragraphs: ['Uno'], ...(width ? { width } : {}) }] }, ctx);
    return renderBlock(s.blocks.find(b => b.id === 'w1')!, s, ctx);
  };
  it('emits the attribute for a contained band', () => {
    expect(render('narrow')).toContain('data-skb-width={"narrow"}');
  });
  // Review Focus 1: bleed is absence, so an old sketch's markup cannot change.
  it('emits nothing for bleed or for a sketch without the field', () => {
    expect(render('bleed')).not.toContain('data-skb-width');
    expect(render()).not.toContain('data-skb-width');
  });
  it('contains the content without narrowing the background, and never touches the extras layer', () => {
    // The rules target the section's children, so --skb-bg still paints the full band.
    expect(SKETCH_BASE_CSS).toContain('.skb[data-skb-width="narrow"] > :not(.skb-extras)');
    expect(SKETCH_BASE_CSS).not.toMatch(/\.skb\[data-skb-width="[a-z-]+"\]\s*\{/);
    // Offsets must collapse to centred on phones, so a narrow screen never gets a column beside dead space.
    expect(SKETCH_BASE_CSS).toContain('@media (max-width: 899px)');
  });
});

describe('component choices render (task 12)', () => {
  const page = (style: object, blocks: object[] = [{ id: 'h', type: 'hero', headline: 'Hola', cta: 'Comprar', badge: 'Nuevo' }, { id: 'n', type: 'newsletter', title: 'Novedades', cta: 'Quiero' }]) => {
    const sketch = repairSketch({ style, blocks }, ctx).sketch;
    const files = assembleSketch(sketch, ctx);
    return { all: files.map(f => f.content).join('\n'), shell: files.find(f => f.path === 'components/Shell.tsx')!.content, home: files.find(f => f.path === 'components/home.tsx')!.content, css: files.find(f => f.path === 'styles/globals.css')!.content };
  };

  it('stamps every style choice onto the page root, generated from the style object', () => {
    const { shell } = page({ buttons: 'hard-shadow', icons: 'circle', dividers: 'rule', badges: 'tag', fields: 'pill', links: 'arrow', buttonIcon: 'bag' });
    for (const [key, value] of [['buttons', 'hard-shadow'], ['icons', 'circle'], ['dividers', 'rule'], ['badges', 'tag'], ['fields', 'pill'], ['links', 'arrow']]) expect(shell).toContain(`data-skb-${key}={"${value}"}`);
  });

  it('carries CSS for every non-default value of every new choice', () => {
    const css = SKETCH_BASE_CSS;
    for (const value of ['ghost', 'underline', 'hard-shadow']) expect(css).toContain(`[data-skb-buttons="${value}"]`);
    for (const value of ['circle', 'square', 'tinted']) expect(css).toContain(`[data-skb-icons="${value}"]`);
    for (const value of ['hairline', 'rule', 'notch']) expect(css).toContain(`[data-skb-dividers="${value}"]`);
    for (const value of ['box', 'pill']) expect(css).toContain(`[data-skb-fields="${value}"]`);
    for (const value of ['square', 'tag']) expect(css).toContain(`[data-skb-badges="${value}"]`);
    for (const value of ['underline', 'arrow']) expect(css).toContain(`[data-skb-links="${value}"]`);
  });

  it('puts an icon on the primary button only when one was chosen, mapped to a real icon', () => {
    for (const [choice, icon] of [['arrow', 'arrow-right'], ['bag', 'shopping-bag'], ['plus', 'plus']]) expect(page({ buttonIcon: choice }).home).toContain(`assets/icons/${icon}.svg`);
    for (const icon of ['arrow-right', 'shopping-bag', 'plus']) expect(page({ buttonIcon: 'none' }).home).not.toContain(`assets/icons/${icon}.svg`);
  });

  it('renders the default style exactly as before: no icon markup and no rule for a default value', () => {
    const { home, css } = page({});
    expect(home).not.toContain('skb-btn__icon');
    expect(home).not.toContain('skb-btn--icon');
    for (const rule of ['[data-skb-icons="bare"]', '[data-skb-dividers="none"]', '[data-skb-fields="underline"]', '[data-skb-links="plain"]', '[data-skb-badges="pill"]', '[data-skb-buttonIcon="none"]']) expect(css).not.toContain(rule);
  });

  it('gives the elements the new rules reach the classes they select', () => {
    const { all } = page({}, [{ id: 'h', type: 'hero', headline: 'Hola', cta: 'Comprar', badge: 'Nuevo' }, { id: 'p', type: 'split', title: 'Hecho a mano', body: 'Cada día.', photo: 'assets/a.jpg', boxes: [{ title: 'Fresco', icon: 'check' }] }, { id: 'c', type: 'catalog', title: 'Productos', seeAll: 'Ver todo', badges: ['Nuevo'] }, { id: 'n', type: 'newsletter', title: 'Novedades', cta: 'Quiero' }, { id: 's', type: 'steps', title: 'Pasos', items: [{ title: 'Uno', text: 'a', icon: 'check' }, { title: 'Dos', text: 'b', icon: 'check' }] }]);
    for (const cls of ['skb-icon', 'skb-badge', 'skb-field', 'skb-link']) expect(all).toMatch(new RegExp(`className="[^"]*\\b${cls}\\b`));
  });

  it('never throws on a style value it does not know', () => {
    expect(() => page({ buttons: 'zzz', icons: 7, dividers: null, buttonIcon: 'rocket', links: {} })).not.toThrow();
  });
});
