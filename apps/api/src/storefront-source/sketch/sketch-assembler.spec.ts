import { assembleSketch } from './sketch-assembler';
import { repairSketch } from './sketch-schema';
import { nextSourceFile, validateNextSources } from '../source-next';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const full = repairSketch({ blocks: [
  { id: 'h', type: 'hero', headline: 'Algo dulce', sub: 'sub', cta: 'Ver', photo: 'assets/a.jpg' },
  { id: 'm', type: 'marquee', text: 'Horneado · Fresco' },
  { id: 's', type: 'story', title: 'Proceso', paragraphs: ['uno'] },
  { id: 'r', type: 'reviews', title: 'Clientes', quotes: [{ text: 'rico', name: 'Ana' }] },
  { id: 'f', type: 'faq', items: [{ q: '¿Envíos?', a: 'Sí' }] },
  { id: 'b', type: 'banner', headline: 'Haz espacio', cta: 'Comprar' },
  { id: 'g', type: 'gallery', photos: ['assets/a.jpg'] },
  { id: 'n', type: 'newsletter', title: 'Únete' },
] }, ctx).sketch;

it('emits only next-source paths with all mounts and fonts', () => {
  const files = assembleSketch(full, ctx);
  expect(files.every(f => nextSourceFile(f.path))).toBe(true);
  const all = files.map(f => f.content).join('\n');
  for (const mount of ['data-pagosya-catalog', 'data-pagosya-product-template', 'data-pagosya-cart', 'data-pagosya-status', 'data-cart-open', 'data-pagosya-pages']) expect(all).toContain(mount);
  const css = files.find(f => f.path === 'styles/globals.css')!.content;
  expect(css).toContain(`assets/${full.fonts.display}.ttf`);
  expect(css).toContain('font-display: swap');
});

it('references only allowlisted photos and is deterministic', () => {
  const files = assembleSketch(full, ctx);
  const refs = files.map(f => f.content).join('\n').match(/assets\/[\w.-]+\.(?:jpg|jpeg|png|webp|avif)/g) || [];
  expect(new Set(refs)).toEqual(new Set(['assets/a.jpg']));
  expect(assembleSketch(full, ctx)).toEqual(files);
});

it('passes validateNextSources for a shop', () => {
  expect(() => validateNextSources(assembleSketch(full, ctx), 'shop')).not.toThrow();
});

describe('review fixes', () => {
  it('a hero-less sketch still saves: first heading block becomes the h1 (F1)', () => {
    const storyOnly = repairSketch({ blocks: [{ id: 's', type: 'story', title: 'Proceso', paragraphs: ['uno'] }] }, ctx).sketch;
    const files = assembleSketch(storyOnly, ctx);
    expect(() => validateNextSources(files, 'shop')).not.toThrow();
    const home = files.find(f => f.path === 'components/home.tsx')!.content;
    expect(home.match(/<h1/g)).toHaveLength(1);
  });
  it('two heroes yield exactly one h1 (F1)', () => {
    const two = repairSketch({ blocks: [
      { id: 'a', type: 'hero', headline: 'Uno' },
      { id: 'b', type: 'hero', headline: 'Dos' },
    ] }, ctx).sketch;
    const home = assembleSketch(two, ctx).find(f => f.path === 'components/home.tsx')!.content;
    expect(home.match(/<h1/g)).toHaveLength(1);
  });
  it('services stores validate: contact mount present, no cart button (F3)', () => {
    const services = { ...ctx, purpose: 'service' as const };
    const sketch = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Estudio' }] }, services).sketch;
    const files = assembleSketch(sketch, services);
    expect(() => validateNextSources(files, 'service')).not.toThrow();
    const all = files.map(f => f.content).join('\n');
    expect(all).toContain('data-pagosya-contact');
    expect(all).not.toContain('data-cart-open');
  });
  it('the product page styles its grid (F4)', () => {
    const css = assembleSketch(full, ctx).find(f => f.path === 'styles/globals.css')!.content;
    expect(css).toContain('.skb-pdp__grid');
  });
  it('assembleSketch is total: raw garbage input still assembles (F9)', () => {
    const files = assembleSketch(null as never, ctx);
    expect(files.every(f => nextSourceFile(f.path))).toBe(true);
    expect(() => validateNextSources(files, 'shop')).not.toThrow();
  });
});

describe('bake-lab enrichment', () => {
  it('the header links to the sections the sketch actually has', () => {
    const rich = repairSketch({ blocks: [
      { id: 'h', type: 'hero', headline: 'Hola' },
      { id: 'g', type: 'gallery', title: 'Galería', photos: ['assets/a.jpg'] },
      { id: 'f', type: 'faq', title: 'Preguntas', items: [{ q: 'q', a: 'a' }] },
    ] }, ctx).sketch;
    const shell = assembleSketch(rich, ctx).find(f => f.path === 'components/Shell.tsx')!.content;
    expect(shell).toContain('#skb-');
    expect(shell).toContain('Preguntas');
    expect(shell).toContain('Galería');
    expect(shell).toContain('Productos');
  });
});
