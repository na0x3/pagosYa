import { SketchStudioService } from './sketch-studio.service';
import { repairSketch, assembleSketch } from './sketch';
import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';

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
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's', name: 'salv', slug: 'salv' }) }, mediaAsset: { findFirst: jest.fn().mockResolvedValue({ url: '/v1/uploads/abc-1.jpg' }) } };
  const uploads: any = { getBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-jpeg-bytes')) };
  return { service: new SketchStudioService(projects, prisma, uploads), projects, sketch, prisma, uploads };
}

it('reads the current sketch with the revision and real photo paths', async () => {
  const { service } = setup();
  const result = await service.get('m', 's');
  expect(result.revision).toBe(3);
  expect(result.sketch?.blocks.some(b => b.type === 'hero')).toBe(true);
  expect(result.photos).toEqual(['assets/a.jpg']);
  expect(result.fonts).toContain('anton');
});

it('flags a page built by an older renderer as stale, and a page the current renderer made as fresh', async () => {
  const { service, projects } = setup();
  expect((await service.get('m', 's')).stale).toBe(false);
  const snapshot = (await projects.version()).snapshot;
  const old = snapshot.files.map((file: any) => (file.path === 'components/home.tsx' ? { ...file, content: file.content.replace(/ data-skb-(group|node)=\{"[^"]*"\}/g, '') } : file));
  projects.version.mockResolvedValue({ revision: 3, snapshot: { ...snapshot, files: old } });
  expect((await service.get('m', 's')).stale).toBe(true);
});

it('a hand edit leaves the page fresh: what update saves is what get expects', async () => {
  const { service, projects, sketch } = setup();
  await service.update('m', 's', { revision: 3, sketch });
  const saved = projects.save.mock.calls[0][2];
  projects.version.mockResolvedValue({ revision: 4, snapshot: { schemaVersion: 1, brief: saved.brief, files: saved.files } });
  projects.current.mockResolvedValue({ revision: 4, slug: 'salv' });
  expect((await service.get('m', 's')).stale).toBe(false);
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

it('a hand edit writes the sketch product skin into config.js dna, preset CSS included', async () => {
  const { service, projects, sketch } = setup();
  const edited = { ...sketch, product: { preset: 'boutique', swatch: 'circle', gallery: 'mosaic', blocks: 'plain', divider: 'none', enter: 'fade-up' } };
  await service.update('m', 's', { revision: 3, sketch: edited });
  const input = projects.save.mock.calls[0][2];
  const config = JSON.parse(input.files.find((f: any) => f.path === 'config.js').content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);
  expect(config.dna).toMatchObject({ swatch: 'circle', gallery: 'mosaic', blocks: 'plain', divider: 'none', enter: 'fade-up', media: 'right' });
  expect(config.dna.productCss).toContain('[data-part="title"]');
  // The composition travels beside the dna: boutique's recipe is the editorial page.
  expect(config.productPageStyle).toBe('editorial');
});

it('assurance lines travel to config.productAssurances and clear when emptied', async () => {
  const { service, projects, sketch } = setup();
  const withLines = { ...sketch, product: { ...(sketch as any).product, assurances: [{ icon: 'coffee', title: 'Horneado del día', detail: '7am' }] } };
  await service.update('m', 's', { revision: 3, sketch: withLines });
  const parse = (call: number) => JSON.parse(projects.save.mock.calls[call][2].files.find((f: any) => f.path === 'config.js').content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);
  expect(parse(0).productAssurances).toEqual([{ icon: 'coffee', title: 'Horneado del día', detail: '7am' }]);
  projects.version.mockResolvedValue({ revision: 3, snapshot: { ...projects.version.mock.results[0].value, files: projects.save.mock.calls[0][2].files, brief: { sitePurpose: 'shop' } } });
  await service.update('m', 's', { revision: 3, sketch: { ...withLines, product: { ...(withLines as any).product, assurances: [] } } });
  expect(parse(1).productAssurances).toBeUndefined();
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

describe('addPhoto (Boceto "Subir foto")', () => {
  it('turns an owned upload into a store asset and lists it for the picker', async () => {
    const { service, projects } = setup();
    const result = await service.addPhoto('m', 's', { revision: 3, url: '/v1/uploads/abc-1.jpg' });
    expect(result.revision).toBe(4);
    expect(result.path).toMatch(/^assets\/image-[a-f0-9]{12}\.jpg$/);
    expect(result.photos).toContain(result.path);
    const saved = projects.save.mock.calls.at(-1)[2];
    expect(saved.files.find((file: any) => file.path === result.path)).toMatchObject({ encoding: 'base64' });
  });

  it('refuses uploads from another merchant, odd URLs and oversize files', async () => {
    const { service, prisma, uploads } = setup();
    await expect(service.addPhoto('m', 's', { revision: 3, url: '../../etc/passwd' })).rejects.toThrow();
    prisma.mediaAsset.findFirst.mockResolvedValueOnce(null);
    await expect(service.addPhoto('m', 's', { revision: 3, url: '/v1/uploads/abc-1.jpg' })).rejects.toThrow('no pertenece');
    uploads.getBuffer.mockResolvedValueOnce(Buffer.alloc(2_000_001));
    await expect(service.addPhoto('m', 's', { revision: 3, url: '/v1/uploads/abc-1.jpg' })).rejects.toThrow('2 MB');
    await expect(service.addPhoto('m', 's', { revision: 2, url: '/v1/uploads/abc-1.jpg' })).rejects.toThrow('cambió');
  });
});

describe('build ("Generar sitio")', () => {
  it('saves the assembled site without sketch.json, keeping assets and runtime', async () => {
    const { service, projects } = setup();
    expect(await service.build('m', 's', { revision: 3 })).toEqual({ revision: 4 });
    const input = projects.save.mock.calls[0][2];
    expect(input.label).toBe('Sitio generado desde el boceto');
    expect(input.files.some((f: any) => f.path === 'sketch.json')).toBe(false);
    expect(input.files.find((f: any) => f.path === 'components/home.tsx').content).toContain('data-skb-group');
    expect(input.files.some((f: any) => f.path === 'assets/a.jpg')).toBe(true);
    expect(input.files.some((f: any) => f.path === 'commerce.js')).toBe(true);
  });
  it('refuses a stale revision and a store that is already a site', async () => {
    const { service, projects } = setup();
    await expect(service.build('m', 's', { revision: 2 })).rejects.toThrow('El boceto cambió');
    const plain = setup(false);
    await expect(plain.service.build('m', 's', { revision: 3 })).rejects.toThrow('ya es un sitio');
    expect(projects.save).not.toHaveBeenCalled();
  });
});

describe('the home is rebuilt, so the measured look and YAPI touch go (one look per store)', () => {
  const touched = (touch: number | undefined) => `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'salv', look: { version: 1, edge: 'offset' }, dna: { version: 1, swatch: 'pill', ...(touch ? { touch } : {}), productCss: 'old-product', catalogCss: 'old-catalog', cardCss: 'old-card', cartCss: 'old-cart' } })};`;
  const withConfig = (projects: any, content: string) => projects.version.mockImplementation(async () => {
    const { snapshot } = await setup().projects.version();
    return { revision: 3, snapshot: { ...snapshot, files: snapshot.files.map((f: any) => f.path === 'config.js' ? { ...f, content } : f) } };
  });
  const savedConfig = (projects: any) => JSON.parse(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  for (const [name, act] of [
    ['Boceto editado', (service: any, sketch: any) => service.update('m', 's', { revision: 3, sketch })],
    ['regenerar', (service: any) => service.regenerate('m', 's', { revision: 3, designSeed: 'seed' })],
    ['Generar sitio', (service: any) => service.build('m', 's', { revision: 3 })],
  ] as const) it(`${name}: drops config.look and a touched store's touch CSS`, async () => {
    const { service, projects, sketch } = setup();
    withConfig(projects, touched(1));
    await act(service, sketch);
    const config = savedConfig(projects);
    expect(config).not.toHaveProperty('look');
    for (const key of ['touch', 'catalogCss', 'cardCss', 'cartCss']) expect(config.dna).not.toHaveProperty(key);
    expect(config.dna.productCss ?? '').not.toBe('old-product');
    expect(config.dna.swatch).toBe('pill');
  });
  for (const [name, act] of [
    ['Boceto editado', (service: any, sketch: any) => service.update('m', 's', { revision: 3, sketch })],
    ['regenerar', (service: any) => service.regenerate('m', 's', { revision: 3, designSeed: 'seed' })],
    ['Generar sitio', (service: any) => service.build('m', 's', { revision: 3 })],
  ] as const) it(`${name}: drops config.controls too (spec 2026-10-14 store controls)`, async () => {
    const { service, projects, sketch } = setup();
    withConfig(projects, `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'salv', controls: libraryRecord(CONTROL_LANGUAGES[0], 'general', 'bag'), dna: { version: 1, swatch: 'pill' } })};`);
    await act(service, sketch);
    expect(savedConfig(projects)).not.toHaveProperty('controls');
    expect(savedConfig(projects).dna.swatch).toBe('pill');
  });
  it('an untouched store keeps its other dna and loses only the look', async () => {
    const { service, projects, sketch } = setup();
    withConfig(projects, touched(undefined));
    await service.update('m', 's', { revision: 3, sketch });
    const config = savedConfig(projects);
    expect(config).not.toHaveProperty('look');
    expect(config.dna).toMatchObject({ swatch: 'pill', cardCss: 'old-card' });
  });
});

it('a hand edit maps the Botones choice onto the kit button form in config.js dna', async () => {
  const { service, projects, sketch } = setup();
  const edited = { ...sketch, style: { ...(sketch as any).style, buttons: 'outline' } };
  await service.update('m', 's', { revision: 3, sketch: edited });
  const input = projects.save.mock.calls[0][2];
  const config = JSON.parse(input.files.find((f: any) => f.path === 'config.js').content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);
  expect(config.dna.button).toBe('outline');
});

it('a hand edit carries the preset commerce recipe into the kit dna (cards, cart, review, motion)', async () => {
  const { service, projects, sketch } = setup();
  const edited = { ...sketch, product: { ...(sketch as any).product, preset: 'boutique', swatch: 'circle', gallery: 'strip', blocks: 'plain', divider: 'none', enter: 'fade-up', media: 'right' } };
  await service.update('m', 's', { revision: 3, sketch: edited });
  const input = projects.save.mock.calls[0][2];
  const config = JSON.parse(input.files.find((f: any) => f.path === 'config.js').content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);
  expect(config.dna).toMatchObject({ card: 'second-photo', cart: 'drawer', review: 'stacked', motion: 'calm', hover: 'shine', press: 'none', button: 'pill' });
});

describe('structured design drafts', () => {
  async function designSetup() {
    const result = setup();
    const { DESIGN_FIXTURES, generateDesignFixture } = await import('./design-engine/design-fixtures');
    const fixture = DESIGN_FIXTURES[0], sketch = generateDesignFixture(fixture.input);
    const snapshot = (await result.projects.version()).snapshot;
    const media = fixture.input.assets.map(asset => ({ path: asset.path, content: 'abcd', encoding: 'base64' }));
    const designCtx = { ...ctx, photos: media.map(asset => asset.path) };
    result.projects.version.mockResolvedValue({ revision: 3, snapshot: { ...snapshot, files: [...snapshot.files.filter((f: any) => !f.path.startsWith('components/') && !f.path.startsWith('styles/') && f.path !== 'sketch.json'), ...assembleSketch(sketch, designCtx), { path: 'sketch.json', content: JSON.stringify(sketch) }, ...media] } });
    return { ...result, sketch };
  }
  it('regenerates one section as a new draft without changing merchant content or sibling blocks', async () => {
    const { service, projects, sketch } = await designSetup();
    const hero = sketch.blocks.find(block => block.type === 'hero')!;
    const result = await service.regenerate('m', 's', { revision: 3, sectionId: hero.id, designSeed: 'repeatable-edit' });
    expect(result.revision).toBe(4);
    expect(result.sketch.design?.designSeed).toBe('repeatable-edit');
    expect(result.sketch.blocks.filter(block => block.id !== hero.id)).toEqual(sketch.blocks.filter(block => block.id !== hero.id));
    const changed = result.sketch.blocks.find(block => block.id === hero.id)!;
    expect(changed).toMatchObject({ headline: (hero as any).headline });
    expect((changed as any).photo).toBe((hero as any).photo);
    expect(changed.composition).not.toBe(hero.composition);
    expect(projects.save.mock.calls[0][2].files.filter((file: any) => file.path === 'website-design.json')).toHaveLength(1);
  });
  it('rejects unknown sections and stale drafts before saving', async () => {
    const { service, projects } = await designSetup();
    await expect(service.regenerate('m', 's', { revision: 2 })).rejects.toThrow('cambió');
    await expect(service.regenerate('m', 's', { revision: 3, sectionId: 'unknown' })).rejects.toThrow('no existe');
    expect(projects.save).not.toHaveBeenCalled();
  });
  it('retains one production design artifact after leaving the boceto phase', async () => {
    const { service, projects } = await designSetup();
    await service.build('m', 's', { revision: 3 });
    const files = projects.save.mock.calls[0][2].files;
    expect(files.filter((file: any) => file.path === 'website-design.json')).toHaveLength(1);
    expect(files.some((file: any) => file.path === 'sketch.json')).toBe(false);
  });
});
