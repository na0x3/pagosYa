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
