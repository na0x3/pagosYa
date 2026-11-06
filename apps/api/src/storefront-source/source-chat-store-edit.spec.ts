import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { templateStoreDataFile } from './source-templates';
import { CONTENT_PAGE_FILES } from './source-content-pages';
import type { LayoutBlock } from './source-section-library';
import { readStoreMenu } from './source-store-menu';

/** YAPI edits everything (spec 2026-11-03): the template quick edit writes the store's own data, swaps photos and edits the product
 *  page's sections in one reply. */
const home: LayoutBlock[] = [{ type: 'cover-split', title: 'Gelato de tofu', photo: '/v1/uploads/hero.jpg' }, { type: 'products-grid', card: 'classic' }];
const ficha: LayoutBlock[] = [{ type: 'steps-howto', title: 'Cómo se sirve', items: [{ title: 'Sácalo 5 minutos antes' }] }];
const files = [
  templateStoreDataFile({ name: 'DooBoo' }, { hero: '' }, { copy: { headline: 'x' } as never, look: { palette: 'mono', fonts: 'zancada' } as never, variants: { theme: 'unico' } as never, layout: home, productLayout: ficha }),
  { path: 'components/page-productos.tsx', content: '<h1 className="es-catalog-page__title">Todos los productos</h1>' },
  { path: 'components/library.tsx', content: '' },
];
const read = (over: Record<string, unknown> = {}) => ({ ops: [], store: [], rest: '', ...over });

let chat: any, prisma: any, editLayout: jest.Mock, refill: jest.Mock, messages: any[];
beforeEach(() => {
  messages = [];
  const tx = {
    store: { update: jest.fn() }, storeLink: { deleteMany: jest.fn(), createMany: jest.fn() },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ variants: [], imageUrls: ['/v1/uploads/a.jpg'], imagePositions: ['50% 20%'] }), update: jest.fn() },
  };
  prisma = {
    tx,
    $transaction: jest.fn(async (run: (client: unknown) => Promise<unknown>) => run(tx)),
    store: { findFirst: jest.fn().mockResolvedValue({ tagline: '', aboutText: '', contactPhone: '', contactEmail: '', policies: { returns: 'Siete días.' } }) },
    storeLink: { findMany: jest.fn().mockResolvedValue([]) },
    storeRetention: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    promoCode: { findFirst: jest.fn(), upsert: jest.fn().mockResolvedValue({ id: 'code1' }) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
    storeAgentMessage: { create: jest.fn(async ({ data }) => { const message = { ...data, id: String(messages.length) }; messages.push(message); return message; }) },
  };
  editLayout = jest.fn();
  refill = jest.fn().mockResolvedValue({ revision: 6, label: 'Cambios de YAPI' });
  const generation = { catalog: jest.fn().mockResolvedValue({ items: [{ id: 'p1', name: 'Gelato chocolate', amount: 3000, description: 'Cremoso.', imageUrls: ['https://api.test/v1/uploads/a.jpg'], variants: [] }] }) };
  chat = new SourceChatService(prisma, { version: jest.fn().mockResolvedValue({ snapshot: { files } }) } as any, generation as any, { editLayout } as any, { refill } as any,
    { get: () => undefined } as unknown as ConfigService);
});
const workflow = { report: jest.fn(), finish: jest.fn(), value: {} };
const edit = (instruction: string, assetUrls: string[] = []) => chat.templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction, revision: 5, assetUrls }, 5, home);

// Spec 2026-11-05 point-at: what the merchant pointed at reaches the one edit call.
const pointed = (instruction: string, extra: Record<string, unknown>) => chat.templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction, revision: 5, assetUrls: [], ...extra }, 5, home);

it('sends what the merchant pointed at, and logs an op outside it', async () => {
  editLayout.mockResolvedValue(read({ ops: [{ op: 'text', at: 1, field: 'title', item: -1, value: 'Más corto', to: -1, type: '' }] }));
  const log = jest.spyOn((chat as any).productLogger, 'log');
  await pointed('hazla más corta', { selection: { sectionId: 'lb-0', at: 0, page: 'home' } });
  expect(editLayout.mock.calls[0][1].focus).toEqual({ pagina: 'home', secciones: [0], textos: [], fotos: [], partes: [] });
  expect(log.mock.calls.map(call => String(call[0])).find(line => line.includes('template_layout_edit'))).toContain('"outsideFocus":["home:1"]');
});

it('the section on screen reaches the edit only with «aquí»', async () => {
  editLayout.mockResolvedValue(read());
  await pointed('agrega una pregunta aquí', { viewing: { page: 'home', at: 1 } });
  await pointed('agrega una pregunta', { viewing: { page: 'home', at: 1 } });
  expect(editLayout.mock.calls[0][1].focus).toMatchObject({ mirando: { pagina: 'home', at: 1 } });
  expect(editLayout.mock.calls[1][1].focus).toBeUndefined();
});

const circle = { points: [0, 0, 90, 0, 90, 90], rect: { x: 0, y: 0, width: 90, height: 90 }, sections: [{ page: 'home', at: 0, label: 'Gelato' }], texts: [], photos: [], parts: [], width: 1280, pageQuery: 'index.html' };
it('a circle sends a picture of the area; a failed picture still edits, without it', async () => {
  editLayout.mockResolvedValue(read());
  const region = jest.fn().mockResolvedValueOnce(Buffer.from('jpg')).mockRejectedValueOnce(new Error('browser died'));
  (chat as any).thumbnails = { region };
  await pointed('cambia esta foto', { selection: { sectionId: 'lb-0', area: circle } });
  expect(region).toHaveBeenCalledWith('m1', 's1', 5, expect.objectContaining({ pageQuery: 'index.html', width: 1280 }));
  expect(editLayout.mock.calls[0][1].picture).toEqual(Buffer.from('jpg'));
  await pointed('cambia esta foto', { selection: { sectionId: 'lb-0', area: circle } });
  expect(editLayout.mock.calls[1][1].picture).toBeUndefined();
});

it('a picture that takes longer than 20 s is dropped', async () => {
  jest.useFakeTimers();
  try {
    editLayout.mockResolvedValue(read());
    (chat as any).thumbnails = { region: jest.fn(() => new Promise(() => undefined)) };
    const done = pointed('cambia esta foto', { selection: { sectionId: 'lb-0', area: circle } });
    await jest.advanceTimersByTimeAsync(20_001);
    await done;
    expect(editLayout.mock.calls[0][1].picture).toBeUndefined();
  } finally { jest.useRealTimers(); }
});

it('a click (no circle) never draws a picture', async () => {
  editLayout.mockResolvedValue(read());
  const region = jest.fn(); (chat as any).thumbnails = { region };
  await pointed('hazla más corta', { selection: { sectionId: 'lb-0', at: 0, page: 'home' } });
  expect(region).not.toHaveBeenCalled();
});

it('sends the store data, the product page and the photos to the one edit call', async () => {
  editLayout.mockResolvedValue(read());
  await edit('cambia la foto de la portada por esta', ['/v1/uploads/bead01.jpg']);
  const input = editLayout.mock.calls[0][1];
  expect(input.productLayout).toEqual(ficha);
  expect(input.store).toMatchObject({ policies: { returns: 'Siete días.' }, catalogTitle: 'Todos los productos', products: [{ id: 'p1', imageUrls: ['/v1/uploads/a.jpg'] }] });
  expect(input.photos.map((photo: { url: string; from: string }) => [photo.url, photo.from])).toEqual([['/v1/uploads/bead01.jpg', 'mensaje'], ['/v1/uploads/a.jpg', 'producto']]);
});

it('nothing to do with the request: the usual edit runs (null)', async () => {
  editLayout.mockResolvedValue(read({ rest: 'pon todo en verde' }));
  expect(await edit('pon todo en verde')).toBeNull();
  expect(refill).not.toHaveBeenCalled();
});

it('writes the about page, a question and a price, saves one revision with the live data, and says what changed', async () => {
  editLayout.mockResolvedValue(read({ store: [
    { part: 'about', field: 'text', at: -1, title: '', value: 'Empezamos en 2021 en Cochabamba.' },
    { part: 'faq', field: 'add', at: -1, title: '¿Tiene lactosa?', value: 'No, es de tofu.' },
    { part: 'product', field: 'price', at: 0, title: '', value: '35' },
  ], rest: 'pon todo en verde' }));
  const out = await edit('escribe nuestra historia, agrega la pregunta de la lactosa, sube el gelato a 35 y pon todo en verde');
  expect(prisma.tx.store.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { aboutText: 'Empezamos en 2021 en Cochabamba.', policies: { returns: 'Siete días.', faq: [{ q: '¿Tiene lactosa?', a: 'No, es de tofu.' }] } } });
  expect(prisma.tx.paymentLink.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { amount: 3500 } });
  expect(refill).toHaveBeenCalledWith('m1', 's1', 5, {}, 'Cambios de YAPI', { refreshData: true });
  expect(out.assistantMessage.content).toMatch(/^Listo: escribí tu página «Nosotros», agregué la pregunta «¿Tiene lactosa\?» a tus preguntas frecuentes y «Gelato chocolate» ahora cuesta Bs 35\./);
  expect(out.assistantMessage.content).toContain('Ahora sigo con lo demás');
  expect(out.followUp).toMatchObject({ instruction: 'pon todo en verde', revision: 6, layoutRest: true });
});

it('swaps the cover photo, edits the ficha and the announcement in the files, and renames the catalogue page', async () => {
  editLayout.mockResolvedValue(read({
    ops: [{ op: 'photo', at: 0, field: 'photo', item: -1, value: 'f0', to: -1, type: '' }, { op: 'text', at: 0, field: 'title', item: -1, value: 'Así se sirve', to: -1, type: '', page: 'product' }],
    store: [{ part: 'announcement', field: 'text', at: -1, title: '', value: 'Envío gratis desde Bs 200' }, { part: 'catalog', field: 'title', at: -1, title: '', value: 'Nuestros gelatos' }],
  }));
  const out = await edit('cambia la foto de la portada por esta, el título de la ficha, pon una cinta y llama a la página Nuestros gelatos', ['/v1/uploads/bead01.jpg']);
  const [, , , change, label, options] = refill.mock.calls[0];
  expect(change.layout[0].photo).toBe('/v1/uploads/bead01.jpg');
  expect(change.productLayout[0].title).toBe('Así se sirve');
  expect(change.copy).toEqual({ announcement: 'Envío gratis desde Bs 200' });
  expect(label).toBe('Cambios de YAPI');
  expect(options.files([{ path: 'components/page-productos.tsx', content: '<h1 className="es-catalog-page__title">Todos los productos</h1>' }])[0].content).toContain('Nuestros gelatos');
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(out.assistantMessage.content).toContain('ficha de producto');
});

it('a refused change is said, and nothing is saved', async () => {
  editLayout.mockResolvedValue(read({ store: [{ part: 'contact', field: 'phone', at: -1, title: '', value: 'llámame' }] }));
  const out = await edit('cambia el teléfono a llámame');
  expect(refill).not.toHaveBeenCalled();
  expect(out.assistantMessage.content).toContain('no parece un número');
});

it('a failed database write is said honestly, never «Listo»', async () => {
  prisma.$transaction.mockRejectedValue(new Error('db down'));
  editLayout.mockResolvedValue(read({ store: [{ part: 'about', field: 'tagline', at: -1, title: '', value: 'Gelato sin lactosa' }] }));
  const out = await edit('cambia la frase');
  expect(out.assistantMessage.content).not.toContain('Listo');
  expect(out.assistantMessage.content).toContain('No pude guardar');
  expect(refill).not.toHaveBeenCalled();
});

it('switches the popup on with a welcome code', async () => {
  editLayout.mockResolvedValue(read({ store: [{ part: 'popup', field: 'discount', at: -1, title: '', value: '10' }] }));
  await edit('pon un popup con 10% de descuento');
  expect(prisma.promoCode.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ code: 'BIENVENIDA10', discountValue: 10 }) }));
  expect(prisma.storeRetention.upsert.mock.calls[0][0].update.settings).toMatchObject({ signupEnabled: true, popupPromoCodeId: 'code1' });
});

it('builds the Nosotros page from template sections and leaves the home alone (spec 2026-11-05)', async () => {
  const libraryFacts = { storeName: 'DooBoo', what: 'Gelato de tofu', story: 'Empezamos en 2021.', city: 'La Paz', request: '', tone: 'calm', products: [{ id: 'p1', name: 'Gelato chocolate' }],
    categories: [], photos: [0, 1, 2, 3].map(index => ({ url: `/v1/uploads/0000000${index}-aaaa.jpg` })), codes: [], services: [], reviews: 0 };
  chat.libraryFacts = jest.fn().mockResolvedValue(libraryFacts);
  chat.dialogue.composeLibrary = jest.fn(async (_merchant: string, input: { template: Array<{ type: string }> }) => ({ blocks: [{
    type: input.template[0].type, eyebrow: '', title: input.template[0].type === 'cover-centered' ? 'Somos DooBoo' : 'Nuestra historia', text: 'Gelato de tofu hecho en La Paz desde 2021.',
    cta: '', link: '', cta2: '', link2: '', photo: 0, photo2: -1, items: [], products: [], product: '', code: '', look: '', band: '', card: '', endsAt: '' }] }));
  const add = (type: string) => ({ op: 'add', at: -1, field: '', item: -1, value: 'quiénes somos', to: -1, type, page: 'about' });
  editLayout.mockResolvedValue(read({ ops: [add('story-split'), add('cover-centered')] }));
  const out = await edit('cambia nosotros a algo más bonito');
  const input = editLayout.mock.calls[0][1];
  expect(input.pages).toEqual({ about: [], contact: [], faq: [], shipping: [] });
  expect(input.templateTypes).toEqual(['cover-split', 'products-grid']);
  const [, , , change, label, options] = refill.mock.calls[0];
  expect(change.layout).toBeUndefined();
  expect(change.pageLayouts.about.map((block: LayoutBlock) => block.type)).toEqual(['cover-centered', 'story-split']);
  expect(change.pageLayouts.about[1].title).toBe('Nuestra historia');
  expect(label).toBe('Cambios de YAPI');
  const pageFiles = options.files([{ path: 'components/library.tsx', content: '' }, CONTENT_PAGE_FILES.find(file => file.path === 'components/pages/about.tsx')!, { path: 'components/pages/faq.tsx', content: 'old' }]);
  expect(pageFiles[1].content).toContain('<LibraryHome');
  expect(pageFiles[2].content).toBe('old');
  expect(out.assistantMessage.content).toContain('a tu página «Nosotros»');
});

it('tells each new section the titles already on the page, so they do not repeat one another (live BOXY 2026-11-05)', async () => {
  const libraryFacts = { storeName: 'DooBoo', what: 'Gelato de tofu', story: '', city: 'La Paz', request: '', tone: 'calm', products: [{ id: 'p1', name: 'Gelato chocolate' }],
    categories: [], photos: [0, 1, 2, 3].map(index => ({ url: `/v1/uploads/0000000${index}-aaaa.jpg` })), codes: [], services: [], reviews: 0 };
  chat.libraryFacts = jest.fn().mockResolvedValue(libraryFacts);
  const compose = jest.fn(async (_merchant: string, input: { template: Array<{ type: string }>; facts: { request: string } }) => ({ blocks: [{
    type: input.template[0].type, eyebrow: '', title: input.template[0].type === 'cover-centered' ? 'Gelato para todos' : 'Gelato para compartir', text: 'Gelato de tofu hecho en La Paz.',
    cta: '', link: '', cta2: '', link2: '', photo: 0, photo2: -1, items: [], products: [], product: '', code: '', look: '', band: '', card: '', endsAt: '' }] }));
  chat.dialogue.composeLibrary = compose;
  const add = (type: string) => ({ op: 'add', at: -1, field: '', item: -1, value: '', to: -1, type, page: 'about' });
  editLayout.mockResolvedValue(read({ ops: [add('cover-centered'), add('story-split')] }));
  await edit('cambia nosotros a algo más bonito');
  expect(compose.mock.calls[0][1].facts.request).not.toContain('Títulos que ya están');
  expect(compose.mock.calls[1][1].facts.request).toContain('«Gelato para todos»');
});

it('never draws sections over a Nosotros page the store\'s own design wrote, and says so (review 2026-11-05)', async () => {
  files.push({ path: 'components/pages/about.tsx', content: '// @pagosya-page\nexport default function About() { return <h1>Mi historia</h1>; }\n' });
  try {
    chat.dialogue.composeLibrary = jest.fn();
    editLayout.mockResolvedValue(read({ ops: [{ op: 'add', at: -1, field: '', item: -1, value: '', to: -1, type: 'story-split', page: 'about' }] }));
    const out = await edit('cambia nosotros a algo más bonito');
    expect(chat.dialogue.composeLibrary).not.toHaveBeenCalled();
    expect(refill).not.toHaveBeenCalled();
    expect(out.assistantMessage.content).toContain('diseño propio');
  } finally { files.pop(); }
});

it('a question YAPI needs answered is asked, and nothing is saved (live 2026-11-05)', async () => {
  editLayout.mockResolvedValue(read({ ask: '¿Qué respuesta le pongo a la pregunta «¿Hacen arreglos de vestidos?»?' }));
  const out = await edit('agrega una pregunta sobre arreglos de vestidos');
  expect(out.assistantMessage.content).toBe('¿Qué respuesta le pongo a la pregunta «¿Hacen arreglos de vestidos?»?');
  expect(refill).not.toHaveBeenCalled();
});

it('the answer of the merchant is read with the question it answers (live 2026-11-05)', async () => {
  editLayout.mockResolvedValueOnce(read({ ask: '¿Qué respuesta le pongo a «¿Hacen vestidos para hombres?»?' }));
  const asked = await edit('agrega una pregunta sobre si hacen vestidos para hombres');
  expect(asked.assistantMessage.metadata.storeAsk).toEqual({ request: 'agrega una pregunta sobre si hacen vestidos para hombres', ask: '¿Qué respuesta le pongo a «¿Hacen vestidos para hombres?»?' });
  prisma.storeAgentMessage.findFirst = jest.fn().mockResolvedValue(asked.assistantMessage);
  editLayout.mockResolvedValueOnce(read());
  await edit('No, solo vestidos de mujer');
  expect(editLayout.mock.calls[1][1].request).toBe('agrega una pregunta sobre si hacen vestidos para hombres\n(El comercio responde a «¿Qué respuesta le pongo a «¿Hacen vestidos para hombres?»?»: No, solo vestidos de mujer)');
});

// YAPI creates anything (spec 2026-11-05): pages YAPI makes, their sections, their link in the menu.
describe('extra pages through the quick edit', () => {
  const novias = { slug: 'novias', name: 'Novias', menu: '', layout: [{ type: 'story-list', title: 'Cómo es', items: [{ title: 'Uno' }, { title: 'Dos' }, { title: 'Tres' }] }] };
  const configFile = { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"header":{"menu":{"style":"dropdowns","groups":[{"label":"Colecciones","links":[{"to":"all"}]}]}}};\n' };
  const storeFiles = (extraPages: unknown[]) => [
    templateStoreDataFile({ name: 'DooBoo' }, { hero: '' }, { copy: { headline: 'x' } as never, look: { palette: 'mono', fonts: 'zancada' } as never, variants: { theme: 'unico' } as never, layout: home, productLayout: ficha, extraPages } as never),
    { path: 'components/library.tsx', content: '' }, configFile];
  const chatOn = (list: Array<{ path: string; content: string }>): any => new SourceChatService(prisma, { version: jest.fn().mockResolvedValue({ snapshot: { files: list } }) } as any,
    { catalog: jest.fn().mockResolvedValue({ items: [] }) } as any, { editLayout } as any, { refill } as any, { get: () => undefined } as unknown as ConfigService);
  const pageOp = (over: Record<string, unknown>) => ({ op: 'page-add', at: -1, field: '', item: -1, value: '', to: -1, type: '', ...over });
  const written = (base: Array<{ path: string; content: string }>) => refill.mock.calls[0][5].files(base) as Array<{ path: string; content: string }>;

  it('creates a page with its menu link in one revision and tells the edit which dropdowns there are', async () => {
    const list = storeFiles([]);
    editLayout.mockResolvedValue(read({ ops: [pageOp({ value: 'Novias' })] }));
    const out = await chatOn(list).templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction: 'crea una página Novias', revision: 5, assetUrls: [] }, 5, home);
    expect(editLayout.mock.calls[0][1]).toMatchObject({ menuGroups: ['Colecciones'] });
    expect(refill.mock.calls[0][3].extraPages).toEqual([{ slug: 'novias', name: 'Novias', menu: '', layout: [] }]);
    const files = written(list);
    expect(files.some(file => file.path === 'components/pages/novias.tsx')).toBe(true);
    expect(files.find(file => file.path === 'config.js')!.content).toContain('extra:novias');
    expect(out.assistantMessage.content).toContain('creé la página «Novias»');
  });

  it('adds a step on a page YAPI made', async () => {
    editLayout.mockResolvedValue(read({ ops: [{ op: 'item-add', at: 0, field: '', item: -1, value: 'Cuatro', to: -1, type: '', page: 'novias' }] }));
    await chatOn(storeFiles([novias])).templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction: 'agrega un paso en Novias', revision: 5, assetUrls: [] }, 5, home);
    expect(editLayout.mock.calls[0][1].extraPages).toEqual([{ slug: 'novias', nombre: 'Novias', layout: novias.layout }]);
    expect(refill.mock.calls[0][3].extraPages[0].layout[0].items.map((item: { title: string }) => item.title)).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro']);
  });

  it('removes a page, its file and its link', async () => {
    const list = [...storeFiles([novias]).filter(file => file.path !== 'config.js'), { path: 'components/pages/novias.tsx', content: '// @pagosya-extra-page\n' },
      { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"header":{"menu":{"style":"dropdowns","groups":[{"label":"Novias","direct":true,"links":[{"label":"Novias","to":"extra:novias"}]}]}}};\n' }];
    editLayout.mockResolvedValue(read({ ops: [pageOp({ op: 'page-remove', page: 'novias' })] }));
    await chatOn(list).templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction: 'quita la página Novias', revision: 5, assetUrls: [] }, 5, home);
    expect(refill.mock.calls[0][3].extraPages).toEqual([]);
    const files = written(list);
    expect(files.some(file => file.path === 'components/pages/novias.tsx')).toBe(false);
    expect(files.find(file => file.path === 'config.js')!.content).not.toContain('extra:novias');
  });
});

describe('the catalog through the quick edit (spec 2026-11-05 creates anything part 2)', () => {
  const cat = (fields: Record<string, unknown>) => ({ kind: '', at: -1, name: '', price: '', stock: '', text: '', category: '', photo: '', option: '', value: '', ...fields });
  const linked: LayoutBlock[] = [{ type: 'cover-split', title: 'Gelato de tofu', cta: 'Ver helados', link: 'category:Helados' }, { type: 'products-grid', card: 'classic' }];
  const editOn = (blocks: LayoutBlock[], instruction: string) => chat.templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction, revision: 5, assetUrls: [] }, 5, blocks);
  beforeEach(() => {
    prisma.paymentLink = { findMany: jest.fn(async ({ where }: any) => where.status === 'ARCHIVED' ? [{ id: 'p9', name: 'Torta de limón' }]
      : [{ id: 'p1', stock: null, categoryId: 'c1', currency: 'BOB', variants: [] }]) };
    prisma.category = { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Helados', _count: { paymentLinks: 1 } }]) };
    prisma.promoCode.findMany = jest.fn().mockResolvedValue([]);
    Object.assign(prisma.tx, {
      category: { count: jest.fn().mockResolvedValue(1), create: jest.fn(async ({ data }: any) => ({ id: `cat-${data.name}` })), updateMany: jest.fn(), deleteMany: jest.fn() },
      promoCode: { create: jest.fn(), updateMany: jest.fn() }, $queryRaw: jest.fn(),
    });
    prisma.tx.paymentLink.create = jest.fn();
  });

  it('sends categories, codes and archived products, and makes a category, a product in it and a code in one revision', async () => {
    editLayout.mockResolvedValue(read({ ops: [{ op: 'text', at: 0, field: 'title', item: -1, value: 'Gelato y más', to: -1, type: '' }], catalog: [
      cat({ kind: 'category-add', name: 'Paletas' }), cat({ kind: 'product-add', name: 'Paleta de mango', price: '15', text: 'De mango.', category: 'Paletas' }),
      cat({ kind: 'code-add', name: 'PALETA10', value: '10 %' })] }));
    const result = await edit('crea la categoría Paletas con la Paleta de mango a Bs 15, un código PALETA10 de 10 % y cambia el título');
    const sentState = editLayout.mock.calls[0][1].store;
    expect(sentState.categories).toEqual([{ id: 'c1', name: 'Helados', count: 1 }]);
    expect(sentState.archived).toEqual([{ id: 'p9', name: 'Torta de limón' }]);
    expect(sentState.products[0]).toMatchObject({ id: 'p1', stock: null, categoryId: 'c1' });
    expect(prisma.tx.category.create).toHaveBeenCalledWith({ data: { storeId: 's1', name: 'Paletas', sortOrder: 1 }, select: { id: true } });
    expect(prisma.tx.paymentLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Paleta de mango', amount: 1500, categoryId: 'cat-Paletas' }) });
    expect(prisma.tx.promoCode.create).toHaveBeenCalledWith({ data: { storeId: 's1', code: 'PALETA10', discountType: 'PERCENT', discountValue: 10 } });
    expect(refill).toHaveBeenCalledTimes(1);
    expect(refill.mock.calls[0][5]).toMatchObject({ refreshData: true });
    expect(result.assistantMessage.content).toContain('creé «Paleta de mango» en Paletas a Bs 15');
    expect(result.assistantMessage.content).toContain('el código PALETA10 da 10 % de descuento');
    expect(result.assistantMessage.content).toContain('Mándame la foto de «Paleta de mango» cuando la tengas.');
  });

  it('a renamed category takes its section links along', async () => {
    editLayout.mockResolvedValue(read({ catalog: [cat({ kind: 'category-rename', at: 0, name: 'Gelatos' })] }));
    await editOn(linked, 'renombra Helados a Gelatos');
    expect(prisma.tx.category.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', storeId: 's1' }, data: { name: 'Gelatos' } });
    expect(refill.mock.calls[0][3].layout[0].link).toBe('category:Gelatos');
  });

  it('a removed category sends its links to all products and leaves the menu', async () => {
    editLayout.mockResolvedValue(read({ catalog: [cat({ kind: 'category-remove', at: 0 })] }));
    await editOn(linked, 'borra la categoría Helados');
    expect(prisma.tx.category.deleteMany).toHaveBeenCalledWith({ where: { storeId: 's1', id: { in: ['c1'] } } });
    expect(refill.mock.calls[0][3].layout[0].link).toBe('products');
    const config = { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ header: { menu: { style: 'dropdowns', groups: [
      { label: 'Helados', links: [{ to: 'category:c1' }] }, { label: 'Info', links: [{ to: 'page:about' }] }] } } })};` };
    expect(readStoreMenu(refill.mock.calls[0][5].files([config]))?.groups?.map((group: { label: string }) => group.label)).toEqual(['Info']);
  });

  it('a failed catalog write is said honestly, and no link is rewritten', async () => {
    prisma.$transaction = jest.fn().mockRejectedValue(new Error('db down'));
    editLayout.mockResolvedValue(read({ catalog: [cat({ kind: 'category-rename', at: 0, name: 'Gelatos' })] }));
    const result = await editOn(linked, 'renombra Helados a Gelatos');
    expect(result.assistantMessage.content).toContain('No pude guardar los cambios del catálogo');
    expect(refill).not.toHaveBeenCalled();
  });

  it('a product without its price is asked while the rest is done, and the answer never makes a twin', async () => {
    editLayout.mockResolvedValueOnce(read({ catalog: [cat({ kind: 'product-add', name: 'Paleta de mango', price: '15' })], ask: '¿A cuánto vendes la Paleta de coco?' }));
    const first = await edit('agrega Paleta de mango a Bs 15 y Paleta de coco');
    expect(first.assistantMessage.content).toContain('¿A cuánto vendes la Paleta de coco?');
    expect(first.assistantMessage.metadata.storeAsk).toEqual({ request: 'agrega Paleta de mango a Bs 15 y Paleta de coco', ask: '¿A cuánto vendes la Paleta de coco?' });
    prisma.storeAgentMessage.findFirst = jest.fn().mockResolvedValue({ metadata: { storeAsk: { request: 'agrega Gelato chocolate a Bs 30 y Paleta de coco', ask: '¿A cuánto vendes la Paleta de coco?' } } });
    prisma.tx.paymentLink.create.mockClear();
    editLayout.mockResolvedValueOnce(read({ catalog: [cat({ kind: 'product-add', name: 'Gelato chocolate', price: '30' }), cat({ kind: 'product-add', name: 'Paleta de coco', price: '12' })] }));
    const second = await edit('a Bs 12');
    expect(prisma.tx.paymentLink.create).toHaveBeenCalledTimes(1);
    expect(second.assistantMessage.content).not.toContain('Ya tienes');
  });
});
