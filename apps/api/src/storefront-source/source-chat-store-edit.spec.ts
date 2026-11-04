import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { templateStoreDataFile } from './source-templates';
import type { LayoutBlock } from './source-section-library';

/** YAPI edits everything (spec 2026-11-03): the template quick edit writes the store's own data, swaps photos and edits the product
 *  page's sections in one reply. */
const home: LayoutBlock[] = [{ type: 'cover-split', title: 'Gelato de tofu', photo: '/v1/uploads/hero.jpg' }, { type: 'products-grid', card: 'classic' }];
const ficha: LayoutBlock[] = [{ type: 'steps-howto', title: 'Cómo se sirve', items: [{ title: 'Sácalo 5 minutos antes' }] }];
const files = [
  templateStoreDataFile({ name: 'DooBoo' }, { hero: '' }, { copy: { headline: 'x' } as never, look: { palette: 'mono', fonts: 'zancada' } as never, variants: { theme: 'unico' } as never, layout: home, productLayout: ficha }),
  { path: 'components/page-productos.tsx', content: '<h1 className="es-catalog-page__title">Todos los productos</h1>' },
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
