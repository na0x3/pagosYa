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

it('an announce-first sketch still gets its h1 on the first heading block', () => {
  const rich = repairSketch({ blocks: [
    { id: 'top', type: 'announce', left: 'izq', right: 'der' },
    { id: 'h', type: 'hero', headline: 'Hola' },
  ] }, ctx).sketch;
  const files = assembleSketch(rich, ctx);
  expect(() => validateNextSources(files, 'shop')).not.toThrow();
  expect(files.find(f => f.path === 'components/home.tsx')!.content.match(/<h1/g)).toHaveLength(1);
});

it('shops get designed login and sign-up pages that wrap the trusted gate and never draw an input', () => {
  const sketch = repairSketch({ account: { layout: 'split', kicker: '✦ TU CUENTA', title: 'Bienvenido al laboratorio', lead: 'Pedidos y direcciones en un lugar.', perks: [{ icon: 'truck', text: 'Sigue tus envíos' }] }, blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }] }, { storeName: 'salv', purpose: 'shop', photos: [] }).sketch;
  const files = assembleSketch(sketch, { storeName: 'salv', purpose: 'shop', photos: [] });
  for (const [path, view] of [['components/auth/login.tsx', 'login'], ['components/auth/register.tsx', 'register']] as const) {
    const page = files.find(file => file.path === path)!.content;
    expect(page.startsWith('// @pagosya-page')).toBe(true);
    expect(page).toContain(`<AccountGatePage view={"${view}"} />`);
    expect(page).toContain('Bienvenido al laboratorio');
    expect(page).toContain('assets/icons/truck.svg');
    expect(page).not.toMatch(/<input|<form|password/i);
  }
  expect(assembleSketch(sketch, { storeName: 'salv', purpose: 'service', photos: [] }).some(file => file.path.startsWith('components/auth/'))).toBe(false);
});

it('the product template carries the sketch composition and photo side (themed-card program)', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: [] };
  const craft = repairSketch({ product: { preset: 'craft' }, blocks: [] }, ctx).sketch;
  const page = assembleSketch(craft, ctx).find(file => file.path === 'components/product.tsx')!.content;
  expect(page).toContain('data-layout="story-led"');
  expect(page).toContain('data-media="left"');
  const mirrored = repairSketch({ product: { preset: 'boutique', media: 'right' }, blocks: [] }, ctx).sketch;
  const mirroredPage = assembleSketch(mirrored, ctx).find(file => file.path === 'components/product.tsx')!.content;
  expect(mirroredPage).toContain('data-media="right"');
  const css = assembleSketch(mirrored, ctx).find(file => file.path === 'styles/globals.css')!.content;
  expect(css).toContain('.skb-pdp[data-media="right"]');
  expect(css).toContain('.skb-pdp[data-layout="story-led"]');
});

it('exports the kit store tokens so the platform purchase controls follow the palette and Botones', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: [] };
  const sketch = repairSketch({ palette: { accent: '#c85c3d' }, style: { buttons: 'pill' }, blocks: [] }, ctx).sketch;
  const css = assembleSketch(sketch, ctx).find(file => file.path === 'styles/globals.css')!.content;
  expect(css).toContain('--store-accent: #c85c3d');
  expect(css).toContain('--store-radius: 999px');
  expect(css).toMatch(/--store-accent-foreground: #[0-9a-f]{6}/);
  const square = repairSketch({ style: { buttons: 'square' }, blocks: [] }, ctx).sketch;
  expect(assembleSketch(square, ctx).find(file => file.path === 'styles/globals.css')!.content).toContain('--store-radius: 6px');
});

// Until 2026-10-06 the navigation came from a six-entry map keyed by block type, so every store ever drawn
// said Productos / Colecciones / Nosotros. An authored label is how a store sounds like itself in the one
// place a shopper reads first; the map stays as the fallback for a block that does not name itself.
it('uses the authored navigation label and falls back to the default', () => {
  const sketch = repairSketch({ blocks: [
    { id: 'h', type: 'hero', headline: 'Mantecate', sub: 'sub', cta: 'Ver', photo: 'assets/a.jpg' },
    { id: 'c', type: 'catalog', title: 'La carta', nav: 'CÓMO DISFRUTARLA' },
    { id: 's', type: 'story', title: 'Proceso', paragraphs: ['uno'] },
  ] }, ctx).sketch;
  // Scoped to the header's own nav element: 'Productos' legitimately appears elsewhere, such as the
  // catalogue page, and the point here is the word a shopper reads in the navigation.
  const shell = assembleSketch(sketch, ctx).find(file => /Shell/.test(file.path))!.content;
  const navLinks = shell.match(/<nav className="skb-nav"[\s\S]*?<\/nav>/)![0];
  expect(navLinks).toContain('CÓMO DISFRUTARLA');
  expect(navLinks).not.toContain('Productos');
  expect(navLinks).toContain('Nosotros');
});
