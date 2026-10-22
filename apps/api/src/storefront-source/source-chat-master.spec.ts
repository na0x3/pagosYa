import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PERSONAL_TOUCH_BRIEF, PersonalTouchSkipped, SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';
import { sourceRequestContext } from './source-request-context';
import { sourceMerchantRequest } from './source-merchant-request';
import { sourceRequestProfile } from './source-request-profile';

jest.mock('./source-master-check', () => ({ masterLayoutFindings: jest.fn().mockResolvedValue([]) }));

/** Spec 2026-10-19 master template §2: a new shop starts from Esencial, filled by one call. */
let chat: SourceChatService, prisma: any, generate: jest.Mock, applyMaster: jest.Mock, fillMaster: jest.Mock, decide: jest.Mock, config: Map<string, unknown>, messages: any[];
const generation = () => ({ generate, newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn(), interruptedPreview: jest.fn() } as any);
beforeEach(() => {
  messages = [];
  prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Café Buna', logoUrl: null, onboarding: { what: 'Café de especialidad', story: 'Tostamos en casa', contact: { city: 'La Paz' }, photos: ['https://x/u1.jpg'] }, _count: { paymentLinks: 0 }, paymentLinks: [] }), update: jest.fn() },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn(), delete: jest.fn().mockResolvedValue({}) },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
  };
  generate = jest.fn().mockResolvedValue({ revision: 1, label: 'Diseño propio' });
  decide = jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería en Sopocachi.', generationInstruction: 'Crea la tienda.', imageUses: [], startFrom: 'scratch', editKind: 'none' });
  fillMaster = jest.fn().mockResolvedValue(null);
  applyMaster = jest.fn().mockImplementation(async (_m, _s, _r, filler) => { await filler({ storeName: 'Café Buna', products: ['Coroico'], photos: ['https://x/p1.jpg'] }); return { revision: 1, label: 'Plantilla: Esencial', filled: false }; });
  config = new Map<string, unknown>([['app.yapiMasterTemplate', true], ['app.yapiStylePick', true]]);
  chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation(), { decide, fillMaster } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
});

const send = (instruction: string) => chat.send('m1', 's1', { revision: 0, instruction, setupAction: 'generate', requestId: uuid() }) as Promise<any>;

it('a new shop is built from Esencial, never by the designer or the style cards', async () => {
  const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  // Owner 2026-10-22: the closest Plantillas preset — a specialty café starts from «horno».
  expect(applyMaster).toHaveBeenCalledWith('m1', 's1', 0, expect.any(Function), 'horno');
  expect(generate).not.toHaveBeenCalled();
  expect(out.revision).toMatchObject({ revision: 1 });
  expect(out.assistantMessage.content).toContain('Café Buna');
});

it('the filler gets the walkthrough facts and the store photos, walkthrough photos first', async () => {
  await send('Crea mi tienda.');
  expect(fillMaster).toHaveBeenCalledWith('m1', expect.objectContaining({ storeName: 'Café Buna', what: 'Café de especialidad', story: 'Tostamos en casa', city: 'La Paz', products: ['Coroico'], photos: ['https://x/u1.jpg', 'https://x/p1.jpg'] }));
});

// Owner 2026-10-22: «siempre tiene que ser desde la plantilla, yapi desde cero siempre falla». Every new shop starts from
// Esencial; what the merchant asked for (their pages, their own look) rides on the follow-up, in their own words.
it('«desde cero» starts from Esencial and the follow-up carries the request', async () => {
  const out = await send('Quiero crear mi tienda desde cero.');
  expect(applyMaster).toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
  expect(out.followUp).toMatchObject({ personalTouch: true, revision: 1 });
  expect(out.followUp.instruction).toContain('Quiero crear mi tienda desde cero.');
  expect(out.followUp.instruction).toMatch(/^Esta tienda empezó desde la plantilla/);
});

it('an earlier «desde cero» also starts from Esencial and is carried', async () => {
  messages.push({ role: 'USER', content: 'Prefiero un diseño desde cero', metadata: {}, createdAt: new Date(), id: 'x' });
  const out = await send('Listo, créala.');
  expect(applyMaster).toHaveBeenCalled();
  expect(out.followUp.instruction).toContain('Prefiero un diseño desde cero');
  expect(out.followUp.instruction).toContain('Listo, créala.');
});

describe('a merchant who wants their own design or pages (stress test 2026-10-21) starts from Esencial too', () => {
  it('«nada de tienda genérica ni plantilla» gets Esencial and the follow-up transforms it', async () => {
    const out = await send('Quiero una casa de moda de lujo, editorial; nada de tienda genérica ni plantilla.');
    expect(applyMaster).toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(out.followUp.instruction).toMatch(/transforma/i);
  });
  it('a brief that lists its own pages gets Esencial and the follow-up builds the pages', async () => {
    const out = await send('Soy diseñadora. Necesito estas páginas: (1) INICIO con 3 piezas, (2) NOVIAS, (3) NOCHE, (4) ACCESORIOS.');
    expect(applyMaster).toHaveBeenCalled();
    expect(out.followUp.instruction).toContain('(2) NOVIAS');
  });
  it('the Studio\'s separate-pages choice gets Esencial', async () => {
    await send('Vendo vestidos de novia en La Paz.\n\nNavegación elegida: enlaces visibles a páginas separadas dentro del mismo sitio, en la misma pestaña del navegador.');
    expect(applyMaster).toHaveBeenCalled();
  });
  it('pages named in passing still get Esencial, with the usual personal touch', async () => {
    const out = await send('Vendemos con nuestras páginas de Facebook e Instagram. Crea mi tienda.');
    expect(applyMaster).toHaveBeenCalled();
    expect(out.followUp?.instruction ?? PERSONAL_TOUCH_BRIEF).toBe(PERSONAL_TOUCH_BRIEF);
  });
  it('carries the request even with the personal touch switched off', async () => {
    config.set('app.yapiPersonalTouch', false);
    const out = await send('Quiero crear mi tienda desde cero.');
    expect(out.followUp).toMatchObject({ personalTouch: true });
  });
});

it('a business no preset fits keeps the usual roll', async () => {
  prisma.store.findFirst.mockResolvedValue({ name: 'Tienda X', logoUrl: null, onboarding: { what: 'Cosas varias', story: '', contact: {}, photos: [] }, _count: { paymentLinks: 0 }, paymentLinks: [] });
  await send('Crea mi tienda.');
  expect(applyMaster.mock.calls[0][4]).toBeUndefined();
});

it('a story that bakes «desde cero» still gets Esencial (review fix 1)', async () => {
  await send('Mi negocio se llama Café Buna.\nLo que quiero que sepas de mi negocio:\nHorneamos todo desde cero y queremos ofrecer algo único.\nCrea mi tienda.');
  expect(applyMaster).toHaveBeenCalled();
});

it('products typed with prices in a chat-only setup keep the flow that creates them (review fix 7)', async () => {
  prisma.store.findFirst.mockResolvedValue({ name: 'Café Buna', logoUrl: null, onboarding: null, _count: { paymentLinks: 0 }, paymentLinks: [] });
  await send('Vendo tortas: chocolate 80 Bs y vainilla 70 Bs. Créala.');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});

it('photos attached in chat reach the fill call after the walkthrough ones (review fix 7)', async () => {
  decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 's', generationInstruction: 'x', imageUses: [{ url: 'https://x/chat.jpg', role: 'product', description: 'torta' }], startFrom: 'scratch', editKind: 'none' });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Crea mi tienda.', assetUrls: ['https://x/chat.jpg'], setupAction: 'generate', requestId: uuid() });
  expect(fillMaster.mock.calls[0][1].photos).toEqual(['https://x/u1.jpg', 'https://x/chat.jpg', 'https://x/p1.jpg']);
});

it('a walkthrough store goes straight to Esencial without the conversation step (variety spec §1)', async () => {
  await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  expect(decide).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalled();
});

it('a walkthrough store that pastes a site to copy keeps the website-copy flow (craverly test 2026-10-19)', async () => {
  // The conversation step answers with a question, so the test ends before the page would be read in a browser.
  decide.mockResolvedValueOnce({ action: 'reply', reply: '¿Qué vendes?', summary: '', generationInstruction: '', imageUses: [] });
  await send('Mi negocio se llama Café Buna.\nHazme la tienda como esta: https://craverly.co/\nCrea mi tienda.');
  expect(decide).toHaveBeenCalled();
  expect(applyMaster).not.toHaveBeenCalled();
});

it('a chat-only new store still goes through the conversation step', async () => {
  prisma.store.findFirst.mockResolvedValue({ name: 'Café Buna', logoUrl: null, onboarding: null, _count: { paymentLinks: 0 }, paymentLinks: [] });
  await send('Quiero una tienda para mi café');
  expect(decide).toHaveBeenCalled();
});

it('the flag off returns to today’s flow', async () => {
  config.set('app.yapiMasterTemplate', false);
  await send('Crea mi tienda.');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});

it('queues one personal touch after a new master store (variety spec §5)', async () => {
  config.set('app.yapiPersonalTouch', true);
  const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  // The store's job is still active here (one active job per store): the job runner queues the touch once it closes it.
  expect(out.followUp).toMatchObject({ personalTouch: true, revision: 1, instruction: PERSONAL_TOUCH_BRIEF });
  expect(out.assistantMessage.content).toContain('toque personal');
});

it('no personal touch when the flag is off', async () => {
  config.set('app.yapiPersonalTouch', false);
  const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  expect(out.followUp).toBeUndefined();
  expect(out.assistantMessage.content).not.toContain('toque personal');
});

describe('edits on a master store', () => {
  let refill: jest.Mock;
  const storeData = 'export const store = {"name":"Café Buna","tagline":"","city":"","logo":"","phone":""} as const;\nexport const photos: Record<string, string> = {"hero":"https://x/h.jpg","story":""};\nexport const copy = {"headline":"Hecho con cuidado"} as const;\nexport const look = {"palette":"terracotta","fonts":"classic","colors":{}} as const;\n';
  let homeTsx = "import { copy, photos } from './store-data';\n";
  beforeEach(() => {
    homeTsx = "import { copy, photos } from './store-data';\n";
    refill = jest.fn().mockResolvedValue({ revision: 3, label: 'Textos y estilo actualizados' });
    const projects = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: [{ path: 'components/store-data.tsx', content: storeData }, { path: 'components/home.tsx', get content() { return homeTsx; } }] } }) };
    chat = new SourceChatService(prisma, projects as any, generation(), { decide, fillMaster } as any, { apply: jest.fn(), applyMaster, refill } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
  });
  const edit = (instruction: string) => chat.send('m1', 's1', { revision: 2, instruction, requestId: uuid() }) as Promise<any>;
  const decided = (editKind: string) => decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 's', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', editKind });

  it('a content edit changes data only, through one fill call', async () => {
    decided('content');
    fillMaster.mockResolvedValueOnce({ headline: 'Café de altura', changed: ['headline'], values: [], palette: 'terracotta', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1 });
    const out = await edit('Cambia el título a «Café de altura»');
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { copy: { headline: 'Café de altura' } }, expect.any(String));
    expect(generate).not.toHaveBeenCalled();
    expect(out.revision).toMatchObject({ revision: 3 });
    expect(fillMaster.mock.calls[0][1]).toMatchObject({ request: 'Cambia el título a «Café de altura»', current: { copy: { headline: 'Hecho con cuidado' } } });
  });

  it('a word change Esencial has no field for goes to a design edit instead of a dead end (review fix 8)', async () => {
    decided('content');
    fillMaster.mockResolvedValueOnce({ changed: [], values: [], palette: 'terracotta', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1 });
    await edit('Cambia «Lo que dicen nuestros clientes» por «Opiniones»');
    expect(refill).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][2].instruction).toContain('Edita el componente que ya existe');
  });

  it('a design edit reads its request profile from the merchant\'s words only (review fix 2)', async () => {
    decided('design');
    let profile: unknown;
    generate.mockImplementationOnce(async () => { profile = sourceRequestContext.getStore()?.request.profile; return { revision: 3, label: 'x' }; });
    const dto = { revision: 2, instruction: 'Mueve las reseñas arriba de los productos', requestId: uuid() };
    await sourceRequestContext.run({ signal: new AbortController().signal, jobId: 'j1', request: sourceMerchantRequest(dto), assertLease: jest.fn() } as any, () => chat.send('m1', 's1', dto));
    expect(profile).toEqual(sourceRequestProfile(dto.instruction, true));
    expect(generate.mock.calls[0][2].instruction).not.toContain('conservar la plantilla');
  });

  it('a full redesign leaves Esencial behind, so later edits are not data refills (review fix 3)', async () => {
    decided('redesign');
    await edit('Rediseña todo, quiero algo único');
    expect(generate.mock.calls[0][2].brief.templateId).toBeUndefined();
  });

  it('a store whose home no longer reads store-data is not refilled (review fix 3)', async () => {
    homeTsx = 'export default function Home() { return <main />; }';
    decided('content');
    await edit('Cambia el título');
    expect(fillMaster).not.toHaveBeenCalled();
    expect(refill).not.toHaveBeenCalled();
  });

  it('a design edit goes to the agent with the minimal-edit rules', async () => {
    decided('design');
    generate.mockResolvedValueOnce({ revision: 3, label: 'Reseñas arriba' });
    await edit('Mueve las reseñas arriba de los productos');
    expect(generate.mock.calls[0][2].instruction).toContain('Edita el componente que ya existe');
  });

  const touch = () => chat.send('m1', 's1', { revision: 2, instruction: PERSONAL_TOUCH_BRIEF, personalTouch: true, requestId: uuid() }) as Promise<any>;

  it('a personal touch runs as a design edit with the touch brief, without the conversation step', async () => {
    generate.mockResolvedValueOnce({ revision: 3, label: 'Toque personal' });
    await touch();
    expect(decide).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][2].instruction).toContain('Edita el componente que ya existe');
    expect(generate.mock.calls[0][2].instruction).toContain('Toque personal');
    expect(messages.find(message => message.role === 'USER')?.content).toBe('Toque personal');
  });

  it('a personal touch is skipped when the store moved on', async () => {
    await expect(chat.send('m1', 's1', { revision: 1, instruction: PERSONAL_TOUCH_BRIEF, personalTouch: true, requestId: uuid() })).rejects.toBeInstanceOf(PersonalTouchSkipped);
    expect(generate).not.toHaveBeenCalled();
    expect(messages).toHaveLength(0);
  });

  it('a failed personal touch keeps the first version and says nothing', async () => {
    generate.mockRejectedValueOnce(new Error('model down'));
    await expect(touch()).rejects.toBeInstanceOf(PersonalTouchSkipped);
    expect(messages.filter(message => message.role === 'ASSISTANT')).toHaveLength(0);
    expect(prisma.storeAgentMessage.delete).toHaveBeenCalled();
  });

  it('tells the conversation step the store is a master store', async () => {
    decided('none');
    await edit('Hola');
    expect(decide.mock.calls[0][1]).toMatchObject({ masterTemplate: true });
  });
});

it('a new store\'s fill call gets the menu targets', async () => {
  applyMaster.mockImplementationOnce(async (_m, _s, _r, filler) => { await filler({ storeName: 'Noa', products: [], photos: [], categoryCount: 2, menuTargets: [{ target: 'all', label: 'Todos los productos' }] }); return { revision: 1, label: 'Plantilla: Esencial', filled: false }; });
  await send('Crea mi tienda.');
  expect(fillMaster.mock.calls[0][1].menuTargets).toEqual([{ target: 'all', label: 'Todos los productos' }]);
});

/** Dropdown menu spec 2026-10-21: the fill call builds and edits the menu; the merchant's clear words always count. */
describe('the store menu on a master store', () => {
  let refill: jest.Mock, catalog: jest.Mock, configJs: string;
  const storeData = 'export const store = {"name":"Noa","tagline":"","city":"","logo":"","phone":""} as const;\nexport const photos: Record<string, string> = {"hero":"","story":""};\nexport const copy = {"headline":"Hecho a mano"} as const;\nexport const look = {"palette":"terracotta","fonts":"classic","colors":{}} as const;\n';
  const data = { categories: [{ id: 'c1', name: 'Vestidos' }, { id: 'c2', name: 'Seda' }], items: [{ categoryId: 'c1', imageUrls: [] }, { categoryId: 'c2', imageUrls: [] }] };
  const read = { changed: [], values: [], palette: 'terracotta', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1, menuStyle: 'none', menuGroups: [] };
  beforeEach(() => {
    configJs = `window.PAGOSYA_CONFIG = ${JSON.stringify({ data })};\n`;
    refill = jest.fn().mockResolvedValue({ revision: 3, label: 'Textos y estilo actualizados' });
    const projects = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockImplementation(async () => ({ snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: [{ path: 'components/store-data.tsx', content: storeData }, { path: 'components/home.tsx', content: "import { copy, photos } from './store-data';\n" }, { path: 'config.js', content: configJs }] } })) };
    catalog = jest.fn().mockResolvedValue(undefined);
    chat = new SourceChatService(prisma, projects as any, { ...generation(), catalog }, { decide, fillMaster } as any, { apply: jest.fn(), applyMaster, refill } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
  });
  const edit = (instruction: string) => chat.send('m1', 's1', { revision: 2, instruction, requestId: uuid() }) as Promise<any>;
  const decided = (editKind: string) => decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 's', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', editKind });

  it('menu words go to the fill call even when the decision says design; the menu turns on though the read missed it', async () => {
    decided('design');
    fillMaster.mockResolvedValueOnce(read);
    await edit('quiero un menú desplegable con mis categorías');
    expect(fillMaster.mock.calls[0][1]).toMatchObject({ current: { menu: null }, menuTargets: expect.arrayContaining([{ target: 'all', label: 'Todos los productos' }, { target: 'category:c1', label: 'Vestidos' }]) });
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { menu: { style: 'panel', groups: [] } }, expect.any(String));
    expect(generate).not.toHaveBeenCalled();
  });

  it('the read\'s own menu wins when it changed it', async () => {
    decided('content');
    fillMaster.mockResolvedValueOnce({ ...read, changed: ['menu'], menuStyle: 'dropdowns', menuGroups: [{ label: 'Mujer', links: [{ label: '', target: 'category:c1' }], tilesTitle: '', tiles: [], footerLabel: '', footerTarget: '' }] });
    await edit('quiero menús desplegables arriba');
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { menu: { style: 'dropdowns', groups: [{ label: 'Mujer', links: [{ to: 'category:c1' }] }] } }, expect.any(String));
  });

  it('«quita el menú desplegable» turns it off even when the read says nothing', async () => {
    configJs = `window.PAGOSYA_CONFIG = ${JSON.stringify({ data, header: { menu: { style: 'panel' } } })};\n`;
    decided('design');
    fillMaster.mockResolvedValueOnce(read);
    await edit('quita el menú desplegable');
    expect(fillMaster.mock.calls[0][1].current.menu).toEqual({ style: 'panel' });
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { menu: { style: 'none', groups: [] } }, expect.any(String));
  });

  it('«agrega Accesorios al menú» reaches the fill call only when the store has a menu', async () => {
    configJs = `window.PAGOSYA_CONFIG = ${JSON.stringify({ data, header: { menu: { style: 'panel' } } })};\n`;
    decided('design');
    fillMaster.mockResolvedValueOnce(read);
    await edit('agrega Accesorios al menú');
    expect(fillMaster).toHaveBeenCalled();
  });

  it('a design request that also asks for the menu runs the design edit, then saves the menu (final review 2026-10-21)', async () => {
    decided('design');
    await edit('agrega una sección de reseñas y un menú desplegable');
    expect(fillMaster).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalled();
    expect(refill).toHaveBeenCalledWith('m1', 's1', 1, { menu: { style: 'panel', groups: [] } }, expect.any(String));
  });

  it('a redesign that names the menu stays a redesign (final review 2026-10-21)', async () => {
    decided('redesign');
    await edit('rediseña todo y ponle un menú desplegable');
    expect(fillMaster).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalled();
  });

  it('the merchant\'s clear ask wins over a read that says none (final review 2026-10-21)', async () => {
    decided('content');
    fillMaster.mockResolvedValueOnce({ ...read, changed: ['menu'], menuStyle: 'none', menuGroups: [] });
    await edit('quiero un menú desplegable');
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { menu: { style: 'panel', groups: [] } }, expect.any(String));
  });

  it('the fill sees categories made after the last build (final review 2026-10-21)', async () => {
    catalog.mockResolvedValueOnce({ ...data, categories: [...data.categories, { id: 'c3', name: 'Accesorios' }], items: [...data.items, { categoryId: 'c3', imageUrls: [] }] });
    decided('content');
    fillMaster.mockResolvedValueOnce(read);
    await edit('quiero un menú desplegable');
    expect(fillMaster.mock.calls[0][1].menuTargets).toEqual(expect.arrayContaining([{ target: 'category:c3', label: 'Accesorios' }]));
  });

  it('«agrega postres al menú» on a store without a menu stays a design edit', async () => {
    decided('design');
    await edit('agrega postres al menú');
    expect(fillMaster).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalled();
  });

});
