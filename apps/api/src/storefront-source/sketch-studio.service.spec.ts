import { SketchStudioService } from './sketch-studio.service';
import { repairSketch, assembleSketch } from './sketch';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const baseSketch = () => repairSketch({ blocks: [{ id: 'intro', type: 'hero', headline: 'Hola' }] }, ctx).sketch;

function setup(withSketch = true) {
  const sketch = baseSketch();
  const files = [
    ...(withSketch ? assembleSketch(sketch, ctx) : [{ path: 'components/home.tsx', content: 'export default function Home() { return <main id="contenido"><h1>x</h1></main>; }' }]),
    ...(withSketch ? [{ path: 'sketch.json', content: JSON.stringify(sketch) }] : []),
    { path: 'assets/a.jpg', content: 'abcd', encoding: 'base64' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' },
    { path: 'commerce.js', content: '/* runtime */' },
  ];
  const snapshot = { schemaVersion: 1, brief: { businessType: 'Repostería', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Cálida', sitePurpose: 'shop' }, files };
  const projects: any = {
    current: jest.fn().mockResolvedValue({ revision: 3, slug: 'salv' }),
    version: jest.fn().mockResolvedValue({ revision: 3, snapshot }),
    save: jest.fn().mockImplementation(async (_m: string, _s: string, input: any) => ({ revision: 4, label: input.label })),
  };
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's', name: 'salv', slug: 'salv' }) } };
  return { service: new SketchStudioService(projects, prisma), projects, sketch };
}

it('reads the current sketch with the revision and real photo paths', async () => {
  const { service } = setup();
  const result = await service.get('m', 's');
  expect(result.revision).toBe(3);
  expect(result.sketch?.blocks.some(b => b.type === 'hero')).toBe(true);
  expect(result.photos).toEqual(['assets/a.jpg']);
  expect(result.fonts).toContain('anton');
});

it('returns sketch null for a store that was not sketch-born', async () => {
  const { service } = setup(false);
  expect((await service.get('m', 's')).sketch).toBeNull();
});

it('saves a hand edit as a new revision: repaired sketch, skb files, non-source files kept', async () => {
  const { service, projects, sketch } = setup();
  const edited = { ...sketch, blocks: sketch.blocks.map(b => (b.type === 'hero' ? { ...b, headline: 'Nuevo título' } : b)) };
  const result = await service.update('m', 's', { revision: 3, sketch: edited });
  expect(result.revision).toBe(4);
  const input = projects.save.mock.calls[0][2];
  expect(input.files.find((f: any) => f.path === 'components/home.tsx').content).toContain(JSON.stringify('Nuevo título'));
  expect(input.files.find((f: any) => f.path === 'sketch.json').content).toContain('Nuevo título');
  expect(input.files.find((f: any) => f.path === 'commerce.js')).toBeDefined();
  expect(input.files.find((f: any) => f.path === 'assets/a.jpg')).toBeDefined();
});

it('repairs garbage instead of failing, and rejects a stale revision with 409', async () => {
  const { service, projects } = setup();
  const result = await service.update('m', 's', { revision: 3, sketch: 'garbage' });
  expect(result.sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
  projects.current.mockResolvedValue({ revision: 9, slug: 'salv' });
  await expect(service.update('m', 's', { revision: 3, sketch: {} })).rejects.toThrow('El boceto cambió');
});

it('a portfolio store never gets a catalog forced into its sketch (I1)', async () => {
  const { service, projects } = setup();
  const snapshot = (await projects.version()).snapshot;
  projects.version.mockResolvedValue({ revision: 3, snapshot: { ...snapshot, brief: { ...snapshot.brief, sitePurpose: 'portfolio' } } });
  const result = await service.update('m', 's', { revision: 3, sketch: { blocks: [{ id: 'h', type: 'hero', headline: 'Obras' }] } });
  expect(result.sketch.blocks.some(b => b.type === 'catalog')).toBe(false);
});

it('the photo picker omits reference and unused uploads (M1)', async () => {
  const { service, projects } = setup();
  const snapshot = (await projects.version()).snapshot;
  const files = [...snapshot.files, { path: 'assets/ref.jpg', content: 'x', encoding: 'base64' }, { path: 'visual-assets.json', content: JSON.stringify({ assets: [{ path: 'assets/ref.jpg', role: 'reference', description: '' }] }) }];
  projects.version.mockResolvedValue({ revision: 3, snapshot: { ...snapshot, files } });
  const result = await service.get('m', 's');
  expect(result.photos).toContain('assets/a.jpg');
  expect(result.photos).not.toContain('assets/ref.jpg');
});

it('bundles any referenced Lucide icon on a hand edit (2k+ catalog)', async () => {
  const { service, projects, sketch } = setup();
  const edited = { ...sketch, blocks: [
    { id: 'st', type: 'steps', title: 'Pasos', items: [{ icon: 'croissant', title: 'Elige', text: 'x' }], bg: 'paper', size: 'm' },
    ...sketch.blocks,
  ] };
  await service.update('m', 's', { revision: 3, sketch: edited });
  const files = projects.save.mock.calls[0][2].files;
  const icon = files.find((f: any) => f.path === 'assets/icons/croissant.svg');
  expect(icon?.content).toContain('<svg');
  expect(files.some((f: any) => f.path === 'assets/icons/LICENSE.txt')).toBe(true);
});
