import { assembleSketch } from './sketch-assembler';
import { repairSketch } from './sketch-schema';
import { compileNextPreview } from '../source-next';
import { agentPreviewSnapshot, captureAgentDraft } from '../agent/agent-capture';
import { nextStoreFiles } from '../fixtures/next-store';

jest.setTimeout(120_000);

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const fullSketch = () => repairSketch({
  palette: { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' },
  fonts: { display: 'anton', text: 'manrope' },
  blocks: [
    { id: 'h', type: 'hero', headline: 'Algo dulce para mirar despacio', sub: 'Repostería de verdad', cta: 'Ver productos', photo: 'assets/a.jpg', bg: 'paper', size: 'l' },
    { id: 'm', type: 'marquee', text: 'Horneado · Fresco · Artesanal', bg: 'pop', size: 's' },
    { id: 'c', type: 'catalog', kicker: 'La vitrina', title: 'Nuestros productos', bg: 'paper', size: 'm' },
    { id: 's', type: 'story', title: 'El proceso', paragraphs: ['Preparación lenta.', 'Horneado al momento.'], photo: 'assets/a.jpg', bg: 'accent', size: 'l' },
    { id: 'r', type: 'reviews', title: 'Clientes felices', quotes: [{ text: 'Riquísimo', name: 'Ana' }, { text: 'Volveré', name: 'Luis' }], bg: 'paper', size: 'm' },
    { id: 'f', type: 'faq', title: 'Preguntas', items: [{ q: '¿Hacen envíos?', a: 'Sí, en toda la ciudad.' }], bg: 'paper', size: 'm' },
    { id: 'b', type: 'banner', headline: 'Haz espacio para un poco de alegría', cta: 'Comprar', bg: 'pop', size: 'xl' },
    { id: 'g', type: 'gallery', title: 'Galería', photos: ['assets/a.jpg'], bg: 'paper', size: 'm' },
    { id: 'n', type: 'newsletter', title: 'Únete al club', note: 'Novedades cada semana.', bg: 'deep', size: 'm' },
    { id: 'z', type: 'footer', tagline: 'Hecho con calma.', wordmark: 'giant', bg: 'deep', size: 'l' },
  ],
}, ctx).sketch;

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
  const files = assembleSketch(sketch, ctx);
  // A real 1×1 JPEG so the photo the sketch references actually renders in the preview.
  const tinyJpeg = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
  const base = [...nextStoreFiles().filter(file => ['config.js', 'commerce.js'].includes(file.path)), { path: 'assets/a.jpg', content: tinyJpeg, encoding: 'base64' as const }];
  const snapshot = await agentPreviewSnapshot({ brief: { businessType: 'Repostería', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Cálida' }, files: base }, files);
  for (const width of [1280, 390] as const) {
    const shot = await captureAgentDraft(snapshot, width, undefined, 'index.html', []);
    expect(shot.errors).toEqual([]);
    expect(shot.image.length).toBeGreaterThan(0);
  }
});
