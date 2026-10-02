import { renderBlock, blockCss, SKETCH_BASE_CSS } from './sketch-blocks';
import { repairSketch } from './sketch-schema';

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
