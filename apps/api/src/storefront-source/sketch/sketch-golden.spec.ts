import { assembleSketch } from './sketch-assembler';
import { repairSketch } from './sketch-schema';
import { applySketchComposition } from './sketch-composition';
import { compileNextPreview } from '../source-next';
import { agentPreviewSnapshot, captureAgentDraft } from '../agent/agent-capture';
import { nextStoreFiles } from '../fixtures/next-store';
import { withSourceIcons } from '../source-asset-library';

jest.setTimeout(120_000);

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const fullSketch = () => repairSketch({
  palette: { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' },
  fonts: { display: 'anton', text: 'manrope' },
  blocks: [
    { id: 'h', type: 'hero', headline: 'Algo dulce para mirar despacio', sub: 'Repostería de verdad', cta: 'Ver productos', cta2: 'Armar mi caja', trust: '★ 4.8 · 2.400 pedidos', badge: 'EL DROP SEMANAL', sticker: 'Recién horneado', photo: 'assets/a.jpg', stickerPos: { x: 70, y: 5 }, layout: { copy: { gap: 'l', valign: 'start' }, actions: { dir: 'column', align: 'center' } }, free: { 'copy/headline': { x: 4, y: 8, w: 46, r: -8 }, 'copy/actions/cta': { x: 6, y: 78 } }, bg: 'paper', size: 'l' },
    { id: 'm', type: 'marquee', text: 'Horneado · Fresco · Artesanal', glyph: '✦', bg: 'pop', size: 's' },
    { id: 'c', type: 'catalog', kicker: 'La vitrina', title: 'Nuestros productos', seeAll: 'VER TODO →', badges: ['NUEVO', 'CLÁSICO', 'FAVORITO'], stripLeft: 'Cada pieza sale del horno el mismo día.', stripRight: 'Pide antes del domingo.', bg: 'tint-pop', size: 'm' },
    { id: 'co', type: 'collections', title: 'Un antojo para cada día', items: [{ title: 'Chocolate', text: 'Los intensos.', photo: 'assets/a.jpg' }, { title: 'Frutales', text: 'Los frescos.' }], layout: { items: { gap: 'm' } }, bg: 'paper', size: 'm' },
    { id: 's', type: 'story', title: 'El proceso', paragraphs: ['Preparación lenta.', 'Horneado al momento.'], order: ['paragraphs', 'title'], layout: { paragraphs: { gap: 'l' } }, align: 'end', flip: true, photo: 'assets/a.jpg', bg: 'accent', size: 'l' },
    { id: 'sp', type: 'split', headline: 'Mezcla y combina', body: 'Arma tu caja.', cta: 'Armar caja', cta2: 'Ver sabores', pills: ['6 · Bs38'], stats: [{ value: '150g', label: 'por pieza' }, { value: '24h', label: 'de reposo' }], boxes: [{ title: 'Caja', text: 'Seis piezas' }], sticker: 'Ahorra 15%', photo: 'assets/a.jpg', align: 'center', layout: { copy: { gap: 's', valign: 'center' }, pills: { dir: 'column', align: 'end' }, stats: { gap: 'l', align: 'start' }, boxes: { align: 'center' } }, extras: [{ id: 'eab1', kind: 'emoji', value: '🍪', x: 80, y: 6, w: 8 }, { id: 'eab2', kind: 'text', value: 'Hecho hoy', x: 70, y: 40 }, { id: 'eab3', kind: 'button', value: 'Escríbenos', href: 'https://wa.me/59170000000', x: 60, y: 80 }, { id: 'eab4', kind: 'photo', value: 'assets/a.jpg', x: 40, y: 60, w: 22, r: 8 }, { id: 'eab5', kind: 'icon', value: 'gift', x: 90, y: 90, w: 6 }], bg: 'deep', size: 'l' },
    { id: 'r', type: 'reviews', title: 'Clientes felices', ratingValue: '4.9 / 5', ratingSource: 'En Google', handle: '@salv', quotes: [{ text: 'Riquísimo', name: 'Ana' }, { text: 'Volveré', name: 'Luis' }], photos: ['assets/a.jpg'], free: { 'items/1': { x: 60, y: 10, w: 30, r: 8 } }, bg: 'tint-accent', size: 'm' },
    { id: 'f', type: 'faq', title: 'Preguntas', items: [{ q: '¿Hacen envíos?', a: 'Sí, en toda la ciudad.' }], layout: { items: { gap: 's' } }, bg: 'paper', size: 'm' },
    { id: 'b', type: 'banner', headline: 'Haz espacio para un poco de alegría', cta: 'Comprar', sticker: 'Hoy', align: 'end', layout: { copy: { gap: 'l' } }, bg: 'pop', size: 'xl' },
    { id: 'g', type: 'gallery', title: 'Galería', photos: ['assets/a.jpg'], bg: 'paper', size: 'm' },
    { id: 'n', type: 'newsletter', variant: 'split', title: 'Únete al club', note: 'Novedades cada semana.', photo: 'assets/a.jpg', flip: true, layout: { copy: { valign: 'end' } }, bg: 'deep', size: 'm' },
    { id: 'nc', type: 'newsletter', variant: 'center', title: 'Avisos', note: 'Una vez al mes.', align: 'end', bg: 'paper', size: 'm' },
    { id: 'a', type: 'announce', left: 'Envíos gratis', right: 'Hecho a mano', layout: { row: { dir: 'row', gap: 's', align: 'center' } }, bg: 'pop', size: 's' },
    { id: 'z', type: 'footer', tagline: 'Hecho con calma.', wordmark: 'giant', bg: 'deep', size: 'l' },
  ],
}, ctx).sketch;

it('the screenshot fixture exercises every layout setting and the rendered page keeps them', () => {
  const sketch = fullSketch();
  const settings = new Set(sketch.blocks.flatMap(block => Object.values(block.layout ?? {}).flatMap(entry => Object.entries(entry).map(([field, value]) => `${field}=${value}`))));
  expect([...settings].sort()).toEqual(['align=center', 'align=end', 'align=start', 'dir=column', 'dir=row', 'gap=l', 'gap=m', 'gap=s', 'valign=center', 'valign=end', 'valign=start']);
  expect(new Set(sketch.blocks.map(block => block.align).filter(Boolean))).toEqual(new Set(['center', 'end']));
  expect(sketch.blocks.filter(block => block.flip).map(block => block.id)).toEqual(['s', 'n']);
  const markup = assembleSketch(sketch, ctx).map(file => file.content).join('\n');
  for (const attr of ['data-skb-gap', 'data-skb-dir', 'data-skb-galign', 'data-skb-valign', 'data-skb-align', 'data-skb-flip']) expect(markup).toContain(attr);
});

it('the screenshot fixture frees parts and inserts every kind of element', () => {
  const sketch = fullSketch();
  expect(Object.keys(sketch.blocks.find(block => block.id === 'h')!.free!)).toEqual(['copy/headline', 'copy/actions/cta']);
  expect(sketch.blocks.find(block => block.id === 'sp')!.extras!.map(extra => extra.kind)).toEqual(['emoji', 'text', 'button', 'photo', 'icon']);
  const markup = assembleSketch(sketch, ctx).map(file => file.content).join('\n');
  expect(markup.match(/data-skb-free="on"/g)).toHaveLength(8);
  expect(markup).toContain('skb-extras');
});

it('the full 10-block sketch compiles', async () => {
  await expect(compileNextPreview(assembleSketch(fullSketch(), ctx), 'shop')).resolves.toBeDefined();
});

it('a hostile sketch still compiles', async () => {
  const hostile = repairSketch({ blocks: [
    { id: 'h', type: 'hero', headline: '</main>{' + '`'.repeat(3) + '${boom}', sub: '🍪'.repeat(200) },
    { id: 's', type: 'story', paragraphs: ['`${process.exit(1)}`', '"></section><script>x</script>'] },
  ] }, { ...ctx, photos: [] }).sketch;
  await expect(compileNextPreview(assembleSketch(hostile, { ...ctx, photos: [] }), 'shop')).resolves.toBeDefined();
});

it('screenshots index.html at desktop and mobile without page errors', async () => {
  const sketch = fullSketch();
  const files = await withSourceIcons(assembleSketch(sketch, ctx));
  // A real 1×1 JPEG so the photo the sketch references actually renders in the preview.
  const tinyJpeg = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
  const base = [...nextStoreFiles().filter(file => ['config.js', 'commerce.js'].includes(file.path)), { path: 'assets/a.jpg', content: tinyJpeg, encoding: 'base64' as const }];
  const snapshot = await agentPreviewSnapshot({ brief: { businessType: 'Repostería', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Cálida' }, files: base }, files);
  for (const width of [1280, 390] as const) for (const page of ['index.html', 'product.html'] as const) {
    const shot = await captureAgentDraft(snapshot, width, undefined, page, []);
    expect(shot.errors).toEqual([]);
    expect(shot.image.length).toBeGreaterThan(0);
  }
});

it('a composed sketch assembles with its free stamps and its band widths', () => {
  const { sketch } = repairSketch({ blocks: [
    { id: 'h1', type: 'hero', headline: 'Pan de verdad', photo: 'assets/a.jpg', width: 'offset-left' },
    { id: 's1', type: 'story', title: 'Historia', paragraphs: ['Uno'], width: 'narrow' },
  ] }, ctx);
  const composed = applySketchComposition(sketch, { blocks: [
    { id: 'h1', free: [{ path: 'copy/headline', x: 52, y: 24, w: 48, r: -4 }], extras: [{ id: 'e1a', kind: 'emoji', value: '🥐', href: '', x: 86, y: 8, w: 9, r: 0 }], order: [], layout: [] },
  ] }, ctx).sketch;
  const page = assembleSketch(composed, ctx).find(f => f.path === 'components/home.tsx')!.content;
  expect(page).toContain('data-skb-width={"offset-left"}');
  expect(page).toContain('data-skb-width={"narrow"}');
  expect(page).toContain('data-skb-free="on"');
  expect(page).toContain('"--skb-fr"');
  expect(page).toContain('🥐');
});
