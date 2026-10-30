import { BadGatewayException } from '@nestjs/common';
import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { withoutPhotoGroups, MASTER_EDIT_RULES, MASTER_POLISH_BRIEF, OWN_REQUEST_BRIEF, PERSONAL_TOUCH_BRIEF, PersonalTouchSkipped, SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';
import { SourceProviderQuotaException } from './source-provider-error';
import { MODEL_LIMIT_MERCHANT_FAILURE as LIMIT_REPLY } from './source-validation-error';
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
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn(), delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockImplementation(async ({ where }) => messages.filter(m => m.threadId === where.threadId && m.role === where.role).reverse()) },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
  };
  generate = jest.fn().mockResolvedValue({ revision: 1, label: 'Diseño propio' });
  decide = jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería en Sopocachi.', generationInstruction: 'Crea la tienda.', imageUses: [], startFrom: 'scratch', editKind: 'none' });
  fillMaster = jest.fn().mockResolvedValue(null);
  applyMaster = jest.fn().mockImplementation(async (_m, _s, _r, filler) => { await filler({ storeName: 'Café Buna', products: ['Coroico'], photos: ['https://x/p1.jpg'] }); return { revision: 1, label: 'Plantilla: Esencial', filled: false }; });
  // Industry skeletons (owner 2026-10-27) have their own tests below; the rest of this file is about Esencial and the starters.
  // Owner 2026-10-29: the one build path is the default — polish on; redesign, personal touch and skeletons off.
  config = new Map<string, unknown>([['app.yapiMasterTemplate', true], ['app.yapiStylePick', true], ['app.yapiSkeletons', false],
    ['app.yapiMasterPolish', true], ['app.yapiPeppaRedesign', false], ['app.yapiPersonalTouch', false]]);
  chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation(), { decide, fillMaster } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
});

const send = (instruction: string) => chat.send('m1', 's1', { revision: 0, instruction, setupAction: 'generate', requestId: uuid() }) as Promise<any>;

// Tests of the follow-ups switched off on 2026-10-29 (personal touch, own-request agent, PEPPA redesign) run with the switches as
// they were before the one build path: unset.
const legacyFollowUps = () => { for (const key of ['app.yapiMasterPolish', 'app.yapiPeppaRedesign', 'app.yapiPersonalTouch']) config.delete(key); };

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
  legacyFollowUps();
  const out = await send('Quiero crear mi tienda desde cero.');
  expect(applyMaster).toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
  expect(out.followUp).toMatchObject({ personalTouch: true, revision: 1 });
  expect(out.followUp.instruction).toContain('Quiero crear mi tienda desde cero.');
  expect(out.followUp.instruction).toMatch(/^Esta tienda empezó desde la plantilla/);
});

it('a specific request without «desde cero» rides on the follow-up too (owner 2026-10-22, goodProtein #4)', async () => {
  legacyFollowUps();
  const out = await send('Diseña la tienda goodProtein. Quiero algo con mucha energía y movimiento: tú eliges la estructura. Cuenta en pocas palabras qué aporta cada marca.');
  expect(applyMaster).toHaveBeenCalled();
  expect(out.followUp.instruction).toMatch(/^Esta tienda empezó desde la plantilla/);
  expect(out.followUp.instruction).toContain('qué aporta cada marca');
});

// Energy goes in motion, type and one accent; a merchant who names their colours still gets them.
it('every design edit keeps the colours calm and the product cards normal-sized (owner 2026-10-22, goodProtein #6: «too colored everywhere»)', () => {
  expect(MASTER_EDIT_RULES).toMatch(/como mucho un color de acento/);
  expect(MASTER_EDIT_RULES).toMatch(/no pintes cada sección, bloque o tarjeta de un color distinto/);
  expect(MASTER_EDIT_RULES).toMatch(/3 o 4 por fila/);
});

it('the personal touch never invents a dark text-only band (owner 2026-10-22, NOA #3: «i dont like sections like these»)', () => {
  expect(PERSONAL_TOUCH_BRIEF).toMatch(/foto real/);
  expect(PERSONAL_TOUCH_BRIEF).toMatch(/fondo claro/);
  expect(PERSONAL_TOUCH_BRIEF).toMatch(/nunca una banda oscura o negra solo de texto/);
  expect(PERSONAL_TOUCH_BRIEF).toMatch(/detalle de firma pequeño dentro de una sección que ya existe/);
});

it('a bare «crea mi tienda» keeps the usual personal touch', async () => {
  config.set('app.yapiPersonalTouch', true);
  const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  expect(out.followUp.instruction).toBe(PERSONAL_TOUCH_BRIEF);
});

it('an earlier «desde cero» also starts from Esencial and is carried', async () => {
  legacyFollowUps();
  messages.push({ role: 'USER', content: 'Prefiero un diseño desde cero', metadata: {}, createdAt: new Date(), id: 'x' });
  const out = await send('Listo, créala.');
  expect(applyMaster).toHaveBeenCalled();
  expect(out.followUp.instruction).toContain('Prefiero un diseño desde cero');
  expect(out.followUp.instruction).toContain('Listo, créala.');
});

describe('a merchant who wants their own design or pages (stress test 2026-10-21) starts from Esencial too', () => {
  it('«nada de tienda genérica ni plantilla» gets Esencial and the follow-up transforms it', async () => {
    legacyFollowUps();
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
  it('pages named in passing still get Esencial', async () => {
    const out = await send('Vendemos con nuestras páginas de Facebook e Instagram. Crea mi tienda.');
    expect(applyMaster).toHaveBeenCalled();
    // Its words ride on the follow-up like any specific message; what matters is that it is not read as its own pages.
    expect(out.followUp?.instruction ?? '').not.toContain('Navegación elegida');
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

// Owner 2026-10-29: the only follow-up of a new store is the polish — never a redesign, a first design or a personal touch brief.
it('a new store\'s only follow-up is the data-only polish', async () => {
  const out = await send('Mi negocio se llama Café Buna.\nQuiero una página de recetas y un estilo propio.\nCrea mi tienda.');
  expect(out.followUp).toMatchObject({ polish: true, revision: 1 });
  expect(out.followUp.redesign).toBeUndefined();
  expect(out.followUp.firstDesign).toBeUndefined();
  expect(out.followUp.instruction.startsWith(MASTER_POLISH_BRIEF)).toBe(true);
});

// Owner 2026-10-27: the agent redesign rewrote the base and failed 3 of 4; a cheap data-only polish follows the base instead.
it('with the polish on, a new master store queues one polish carrying the merchant\'s words', async () => {
  config.set('app.yapiPersonalTouch', false);
  config.set('app.yapiPeppaRedesign', false);
  config.set('app.yapiMasterPolish', true);
  const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  expect(out.followUp).toMatchObject({ personalTouch: true, polish: true, revision: 1 });
  expect(out.followUp.instruction.startsWith(MASTER_POLISH_BRIEF)).toBe(true);
  expect(out.followUp.instruction).toContain('Mi negocio se llama Café Buna.');
  expect(out.followUp.redesign).toBeUndefined();
  expect(out.assistantMessage.content).not.toContain('rediseñando');
});

it('with the polish on, a merchant\'s own wishes ride on the polish, not on the agent (owner 2026-10-27)', async () => {
  config.set('app.yapiPersonalTouch', false);
  config.set('app.yapiPeppaRedesign', false);
  config.set('app.yapiMasterPolish', true);
  const out = await send('Quiero crear mi tienda desde cero, con una página de recetas.');
  expect(out.followUp).toMatchObject({ personalTouch: true, polish: true });
  expect(out.followUp.instruction.startsWith(MASTER_POLISH_BRIEF)).toBe(true);
  expect(out.followUp.instruction).toContain('página de recetas');
  expect(out.assistantMessage.content).toContain('pídemelas aquí');
  expect(out.assistantMessage.content).not.toContain('Ahora estoy aplicando lo que me pediste');
});

it('the polish never replaces a touch or redesign that is switched on', async () => {
  config.set('app.yapiPersonalTouch', true);
  config.set('app.yapiMasterPolish', true);
  const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  expect(out.followUp.polish).toBeUndefined();
  expect(out.followUp.instruction).toBe(PERSONAL_TOUCH_BRIEF);
});

it('no personal touch when the flag is off', async () => {
  legacyFollowUps();
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

  // Owner 2026-10-27 (B): the PEPPA please redesign, only when the merchant asks for it.
  it('an explicit redesign of a master store runs on a written brief with expressive motion', async () => {
    const redesignBrief = jest.fn().mockResolvedValue('Rediseña la tienda atrevida y divertida. Sigue esta estructura:\n- Portada con la foto grande');
    const projects = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: [{ path: 'components/store-data.tsx', content: storeData }, { path: 'components/home.tsx', content: homeTsx }] } }) };
    chat = new SourceChatService(prisma, projects as any, generation(), { decide, fillMaster, redesignBrief } as any, { apply: jest.fn(), applyMaster, refill } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
    decided('redesign');
    generate.mockResolvedValueOnce({ revision: 3, label: 'Rediseño' });
    await edit('Rediseña la tienda con más estilo, que se sienta como mi marca');
    expect(redesignBrief).toHaveBeenCalledWith('m1', expect.objectContaining({ storeId: 's1', request: 'Rediseña la tienda con más estilo, que se sienta como mi marca' }));
    expect(generate.mock.calls[0][2]).toMatchObject({ motion: 'expressive' });
    expect(generate.mock.calls[0][2].instruction).toContain('Rediseña la tienda atrevida y divertida');
  });

  // Live check 2026-10-28 (PEPPA l8iq7eqp): the follow-up's own decision never said «rework», so the Shell lock and the logo
  // never reached the agent.
  it('a first design reaches the agent as a locked redesign', async () => {
    generate.mockResolvedValueOnce({ revision: 3, label: 'Diseño' });
    await chat.send('m1', 's1', { revision: 2, instruction: 'Rediseña la tienda con la misma sensación que la marca', personalTouch: true, ownRequest: true, redesign: true, firstDesign: true, requestId: uuid() });
    const execution = generate.mock.calls[0].find((arg: unknown) => arg && typeof arg === 'object' && 'referenceCaptures' in (arg as object));
    expect(execution).toMatchObject({ redesign: true, firstDesign: true });
    // Owner 2026-10-28 («they eat the gpt credits»): a first design stops after a capped number of steps; 15 left three of three
    // overnight designs out of steps (2026-10-29), 30 finished two of them.
    expect(execution.agentToolCalls).toBe(30);
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

  it('a vague edit shows a «Hacer cambios» card and changes nothing yet (plan card, 2026-10-22)', async () => {
    const plans = { draft: jest.fn().mockResolvedValue({ plan: { version: 1, card: ['Portada con el nombre en grande'], revision: 2 }, applied: { variants: { hero: 'type' }, sections: [], palette: 'linen', fonts: 'grotesk', dna: {} }, exhausted: false }), followUpBrief: jest.fn() };
    chat = new SourceChatService(prisma, (chat as any).projects, generation(), { decide, fillMaster } as any, (chat as any).templates, (chat as any).config, undefined, plans as any);
    decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 's', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', editKind: 'design', vague: true });
    const out = await edit('Ponlo más bonito');
    expect(plans.draft.mock.calls[0][2]).toMatchObject({ revision: 2, request: 'Ponlo más bonito', current: { palette: expect.any(String) } });
    expect(generate).not.toHaveBeenCalled();
    expect(refill).not.toHaveBeenCalled();
    expect(out.assistantMessage.metadata.planKind).toBe('edit');
    expect(out.assistantMessage.content).toMatch(/Esto es lo que voy a cambiar/);
  });

  it('«Hacer cambios» saves the plan as data in one refill (plan card, 2026-10-22)', async () => {
    const plans = { draft: jest.fn(), followUpBrief: jest.fn().mockReturnValue(null) };
    chat = new SourceChatService(prisma, (chat as any).projects, generation(), { decide, fillMaster } as any, (chat as any).templates, (chat as any).config, undefined, plans as any);
    messages.push({ id: 'plan2bbbb', threadId: 't1', channel: 'source', role: 'ASSISTANT', content: 'plan', metadata: { plan: { version: 1, card: ['Cambio'], revision: 2, custom: [] }, appliedPlan: { variants: { hero: 'type' }, sections: ['faq'], palette: 'linen', fonts: 'grotesk', dna: {} }, planKind: 'edit' }, createdAt: new Date() });
    const out: any = await chat.send('m1', 's1', { revision: 2, instruction: 'Hacer cambios', planId: 'plan2bbbb', requestId: uuid() });
    expect(refill.mock.calls[0][3]).toMatchObject({ variants: { hero: 'type' }, look: { palette: 'linen', fonts: 'grotesk' } });
    // A section the store lacks needs words: the follow-up writes it (final review 2026-10-22).
    expect(out.followUp?.instruction).toMatch(/«faq»/);
    expect(out.assistantMessage.content).toMatch(/^Listo: hice los cambios del plan/);
  });

  it('F7: a vague word on a selected section stays a scoped edit, never a whole-store plan', async () => {
    const plans = { draft: jest.fn(), followUpBrief: jest.fn() };
    chat = new SourceChatService(prisma, (chat as any).projects, generation(), { decide, fillMaster } as any, (chat as any).templates, (chat as any).config, undefined, plans as any);
    decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 's', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', editKind: 'design', vague: true });
    await chat.send('m1', 's1', { revision: 2, instruction: 'mejóralo', selection: { sectionId: 'hero' }, requestId: uuid() });
    expect(plans.draft).not.toHaveBeenCalled();
  });

  it('F2: «Hacer cambios» keeps the store\'s colours beside the new accent, saves the swatches and hands new sections to the follow-up', async () => {
    const plans = { draft: jest.fn(), followUpBrief: jest.fn().mockReturnValue(null) };
    chat = new SourceChatService(prisma, (chat as any).projects, generation(), { decide, fillMaster } as any, (chat as any).templates, (chat as any).config, undefined, plans as any);
    const projects = (chat as any).projects;
    const saved = await projects.version();
    projects.version.mockResolvedValue({ snapshot: { ...saved.snapshot, files: saved.snapshot.files.map((f: any) => f.path === 'components/store-data.tsx' ? { ...f, content: storeData.replace('"colors":{}', '"colors":{"paper":"#fbf7ef","ink":"#1a1a1a"}') } : f) } });
    messages.push({ id: 'plan3cccc', threadId: 't1', channel: 'source', role: 'ASSISTANT', content: 'plan', metadata: { plan: { version: 1, card: ['Cambio'], revision: 2, custom: [] }, appliedPlan: { variants: { hero: 'type' }, sections: ['faq', 'journal'], palette: 'linen', fonts: 'grotesk', accent: '#f26b1d', dna: { card: 'swatch-swap' } }, planKind: 'edit' }, createdAt: new Date() });
    const out: any = await chat.send('m1', 's1', { revision: 2, instruction: 'Hacer cambios', planId: 'plan3cccc', requestId: uuid() });
    const change = refill.mock.calls[0][3];
    expect(Object.keys(change.look.colors).length).toBeGreaterThan(1);
    expect(change.look.colors.accent).toBe('#f26b1d');
    expect(change.dna).toEqual({ card: 'swatch-swap' });
    expect(out.followUp?.instruction).toMatch(/journal/);
  });

  it('a design edit goes to the agent with the minimal-edit rules', async () => {
    decided('design');
    generate.mockResolvedValueOnce({ revision: 3, label: 'Reseñas arriba' });
    await edit('Mueve las reseñas arriba de los productos');
    expect(generate.mock.calls[0][2].instruction).toContain('Edita el componente que ya existe');
  });

  const touch = () => chat.send('m1', 's1', { revision: 2, instruction: PERSONAL_TOUCH_BRIEF, personalTouch: true, requestId: uuid() }) as Promise<any>;

  const polish = (revision = 2) => chat.send('m1', 's1', { revision, instruction: `${MASTER_POLISH_BRIEF}\n\nMensaje del comercio:\nCafé de altura`, personalTouch: true, polish: true, requestId: uuid() } as any) as Promise<any>;
  const read = (extra: Record<string, unknown>) => ({ changed: [], values: [], palette: 'oscuro', fonts: 'moderna', colors: { accent: '#ff0000' }, heroPhoto: -1, storyPhoto: -1, ...extra });

  it('a polish refills words only, from the merchant\'s facts, without the conversation step or the agent', async () => {
    fillMaster.mockResolvedValueOnce(read({ headline: 'Café de altura, tostado en casa', changed: ['headline', 'palette', 'fonts', 'colors'] }));
    const out = await polish();
    expect(decide).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(fillMaster.mock.calls[0][1]).toMatchObject({ what: 'Café de especialidad', story: 'Tostamos en casa', current: { copy: { headline: 'Hecho con cuidado' } } });
    expect(fillMaster.mock.calls[0][1].request).toContain('Café de altura');
    // The look, the variants and the menu are the base's: a polish changes words and photo choices only.
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { copy: { headline: 'Café de altura, tostado en casa' } }, expect.any(String));
    expect(out.revision).toMatchObject({ revision: 3 });
    expect(messages.find(message => message.role === 'USER')?.content).toBe('Toque personal');
  });

  it('a polish with nothing to change, or a failed fill, keeps the base and says nothing', async () => {
    fillMaster.mockResolvedValueOnce(read({ changed: ['palette'] }));
    await expect(polish()).rejects.toBeInstanceOf(PersonalTouchSkipped);
    fillMaster.mockResolvedValueOnce(null);
    await expect(polish()).rejects.toBeInstanceOf(PersonalTouchSkipped);
    expect(refill).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(messages.filter(message => message.role === 'ASSISTANT')).toHaveLength(0);
  });

  // Gramiyaa 2026-10-27: the polish read named no usable photo and the refill saved none, so the store lost its hero and story.
  it('a polish never takes a photo away, and never offers a video as a photo', async () => {
    prisma.mediaAsset.findMany.mockResolvedValueOnce([{ url: 'https://x/clip.mp4' }, { url: 'https://x/b.jpg' }]);
    fillMaster.mockResolvedValueOnce(read({ headline: 'Café de altura', changed: ['headline', 'heroPhoto', 'storyPhoto'], heroPhoto: -1, storyPhoto: 9 }));
    await polish();
    expect(fillMaster.mock.calls[0][1].photos).toEqual(['https://x/h.jpg', 'https://x/b.jpg']);
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { copy: { headline: 'Café de altura' } }, expect.any(String));
    refill.mockClear();
    fillMaster.mockResolvedValueOnce(read({ changed: ['storyPhoto'], storyPhoto: 0 }));
    await polish();
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { storyPhoto: 'https://x/h.jpg' }, expect.any(String));
  });

  it('a polish is skipped when the store moved on or left Esencial', async () => {
    await expect(polish(1)).rejects.toBeInstanceOf(PersonalTouchSkipped);
    homeTsx = 'export default function Home() { return <main />; }';
    await expect(polish()).rejects.toBeInstanceOf(PersonalTouchSkipped);
    expect(fillMaster).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('a personal touch runs as a design edit with the touch brief, without the conversation step', async () => {
    generate.mockResolvedValueOnce({ revision: 3, label: 'Toque personal' });
    await touch();
    expect(decide).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][2].instruction).toContain('Edita el componente que ya existe');
    expect(generate.mock.calls[0][2].instruction).toContain('Toque personal');
    expect(messages.find(message => message.role === 'USER')?.content).toBe('Toque personal');
  });

  // Owner 2026-10-23: «the model that made PEPPA please back». PEPPA's second step was a full redesign, free to rework the
  // template, not a minimal edit of its components.
  it('the PEPPA recipe: a redesign follow-up runs as a full redesign, not a minimal template edit', async () => {
    generate.mockResolvedValueOnce({ revision: 3, label: 'Rediseño' });
    await chat.send('m1', 's1', { revision: 2, instruction: 'Rediseña la tienda con una sensación cálida y chunky. Sigue esta estructura: …', personalTouch: true, ownRequest: true, redesign: true, motion: 'expressive', requestId: uuid() } as any);
    expect(decide).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][2].instruction).not.toContain('Edita el componente que ya existe');
    expect(generate.mock.calls[0][2].instruction).toContain('Rediseña la tienda');
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

  it('the merchant\'s own request on the follow-up fails out loud and is kept for «sigue» (owner 2026-10-22)', async () => {
    generate.mockRejectedValueOnce(new Error('model down'));
    await expect(chat.send('m1', 's1', { revision: 2, instruction: 'Mensajes del comercio: una sección por marca', personalTouch: true, ownRequest: true, requestId: uuid() })).rejects.not.toBeInstanceOf(PersonalTouchSkipped);
    const note = messages.find(message => message.role === 'ASSISTANT');
    expect(note?.content).toMatch(/No terminé de aplicar lo que me pediste.*«sigue»/);
    expect(note?.metadata).toMatchObject({ failed: true, pendingRequest: { instruction: 'Mensajes del comercio: una sección por marca', direct: true } });
  });

  // Review fix 2026-10-28 (I2): a first-design try the job runner will retry after the quota leaves no note; the last one does.
  it('a first design cut by a spent quota leaves no note while it will be retried', async () => {
    const { MODEL_LIMIT_MERCHANT_FAILURE } = jest.requireActual('./source-validation-error');
    const design = { revision: 2, instruction: 'Rediseña', personalTouch: true, ownRequest: true, redesign: true, firstDesign: true };
    generate.mockRejectedValueOnce(new BadGatewayException(MODEL_LIMIT_MERCHANT_FAILURE));
    await expect(chat.send('m1', 's1', { ...design, quotaRetry: true, requestId: uuid() })).rejects.toThrow(MODEL_LIMIT_MERCHANT_FAILURE);
    expect(messages.filter(message => message.role === 'ASSISTANT')).toHaveLength(0);
    generate.mockRejectedValueOnce(new BadGatewayException(MODEL_LIMIT_MERCHANT_FAILURE));
    await expect(chat.send('m1', 's1', { ...design, requestId: uuid() })).rejects.toThrow(MODEL_LIMIT_MERCHANT_FAILURE);
    expect(messages.filter(message => message.role === 'ASSISTANT')).toHaveLength(1);
  });

  it('«sigue» runs the kept request with the merchant\'s words in the chat', async () => {
    generate.mockResolvedValueOnce({ revision: 3, label: 'Tu pedido' });
    await chat.send('m1', 's1', { revision: 2, instruction: 'Mensajes del comercio: una sección por marca', personalTouch: true, ownRequest: true, resumeWords: 'sigue', requestId: uuid() });
    expect(decide).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][2].instruction).toContain('una sección por marca');
    expect(messages.find(message => message.role === 'USER')?.content).toBe('sigue');
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

/** YAPI plan card (spec 2026-10-22): short and vague requests show a plan; Construir builds the saved one. */
describe('the plan card', () => {
  const PLAN: any = { version: 1, parts: {}, sections: [], custom: [], colour: { palette: 'linen', from: '' }, fonts: { id: 'grotesk', why: '' }, brands: [], card: ['Portada con el nombre en grande'], revision: 0 };
  const APPLIED = { variants: { hero: 'type' }, sections: ['faq'], palette: 'linen', fonts: 'grotesk', dna: {} };
  let plans: { draft: jest.Mock; followUpBrief: jest.Mock; freeBrief: jest.Mock };
  const withPlans = (projects: any, templates: any) => new SourceChatService(prisma, projects, generation(), { decide, fillMaster } as any, templates, { get: (key: string) => config.get(key) } as unknown as ConfigService, undefined, plans as any);
  beforeEach(() => {
    plans = { draft: jest.fn(), followUpBrief: jest.fn().mockReturnValue(null), freeBrief: jest.fn().mockReturnValue('Diseña esta tienda desde cero') };
    config.set('app.yapiFreeFirst', false);
    chat = withPlans({ current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() }, { apply: jest.fn(), applyMaster });
  });
  const tapped = (revision: number) => {
    messages.push({ id: 'plan1aaaa', threadId: 't1', channel: 'source', role: 'ASSISTANT', content: 'plan', metadata: { plan: PLAN, appliedPlan: APPLIED, planKind: 'new' }, createdAt: new Date() });
    return chat.send('m1', 's1', { revision, instruction: 'Construir', planId: 'plan1aaaa', requestId: uuid() }) as Promise<any>;
  };

  it('a short first request shows the plan card and builds nothing', async () => {
    plans.draft.mockResolvedValueOnce({ plan: PLAN, applied: APPLIED, exhausted: false });
    const out = await send('Hazme una tienda de velas');
    expect(applyMaster).not.toHaveBeenCalled();
    expect(out.assistantMessage.metadata).toMatchObject({ plan: PLAN, appliedPlan: APPLIED, planKind: 'new' });
    expect(out.assistantMessage.content).toMatch(/Esto es lo que voy a hacer/);
    expect(out.revision).toBeUndefined();
  });

  it('the PEPPA recipe: Construir queues a full redesign from the brief YAPI wrote, with expressive motion', async () => {
    legacyFollowUps();
    const redesignBrief = jest.fn().mockResolvedValue('Rediseña la tienda con una sensación fresca y deportiva. Sigue esta estructura:\n- Portada con una sola foto');
    plans.followUpBrief.mockReturnValue('Construye sobre esta tienda las secciones propias del plan');
    chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation(), { decide, fillMaster, redesignBrief } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService, undefined, plans as any);
    // Oh Belly 2026-10-23: the attached video rode only on the build's fill, so the redesign could not bundle it and the hero
    // pointed at /v1/uploads, which the preview cannot load. The follow-up carries what the merchant attached.
    messages.push({ id: 'ask1', threadId: 't1', channel: 'source', role: 'USER', content: 'Crea mi tienda', metadata: { assetUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.mp4'] }, createdAt: new Date() });
    const out = await tapped(0);
    expect(redesignBrief).toHaveBeenCalledWith('m1', expect.objectContaining({ storeId: 's1', plan: PLAN.card, recent: expect.any(Array) }));
    // Spec 2026-10-28: the first redesign of a new store is marked, so the Studio shows only its result and the header stays.
    expect(out.followUp).toMatchObject({ personalTouch: true, ownRequest: true, redesign: true, firstDesign: true, motion: 'expressive', assetUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.mp4'] });
    expect(out.followUp.instruction).toMatch(/^Rediseña la tienda con una sensación fresca/);
  });

  it('the first redesign gets the chosen cover photo, and the logo the merchant attached becomes the store logo (2026-10-28)', async () => {
    legacyFollowUps();
    const redesignBrief = jest.fn().mockResolvedValue('Rediseña la tienda con una sensación fresca y deportiva. Sigue esta estructura:\n- Portada con una sola foto');
    const pickCoverAndLogo = jest.fn().mockResolvedValue({ cover: '/v1/uploads/scene.jpg', logo: '/v1/uploads/logo.png' });
    chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation(), { decide, fillMaster, redesignBrief, pickCoverAndLogo } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService, undefined, plans as any);
    messages.push({ id: 'ask2', threadId: 't1', channel: 'source', role: 'USER', content: 'Crea mi tienda', metadata: { assetUrls: ['/v1/uploads/logo.png', '/v1/uploads/scene.jpg'] }, createdAt: new Date() });
    const out = await tapped(0);
    expect(pickCoverAndLogo).toHaveBeenCalledWith('m1', expect.objectContaining({ storeId: 's1', photos: expect.arrayContaining(['/v1/uploads/logo.png', '/v1/uploads/scene.jpg']) }));
    expect(redesignBrief).toHaveBeenCalledWith('m1', expect.objectContaining({ cover: '/v1/uploads/scene.jpg', logo: '/v1/uploads/logo.png' }));
    expect(prisma.store.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' }, data: { logoUrl: '/v1/uploads/logo.png' } }));
    expect(out.followUp.instruction).toMatch(/Foto de portada: \/v1\/uploads\/scene\.jpg/);
  });

  it('without a written brief the follow-up keeps the plan\'s own brief', async () => {
    legacyFollowUps();
    const redesignBrief = jest.fn().mockResolvedValue(null);
    plans.followUpBrief.mockReturnValue('Construye sobre esta tienda las secciones propias del plan');
    chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation(), { decide, fillMaster, redesignBrief } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService, undefined, plans as any);
    const out = await tapped(0);
    expect(out.followUp.redesign).toBeUndefined();
    expect(out.followUp.instruction).toMatch(/^Construye sobre esta tienda/);
  });

  it('Construir builds from the saved plan without a new plan call', async () => {
    const out = await tapped(0);
    expect(plans.draft).not.toHaveBeenCalled();
    expect(applyMaster.mock.calls[0][5]).toEqual(APPLIED);
    expect(applyMaster.mock.calls[0][4]).toBeUndefined();
    expect(out.assistantMessage.content).toMatch(/^Esto es lo que hice:\n• Portada con el nombre en grande/);
  });

  it('an outdated plan is refused in plain words', async () => {
    chat = withPlans({ current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn() }, { apply: jest.fn(), applyMaster });
    const out = await tapped(2);
    expect(out.assistantMessage.content).toMatch(/La tienda cambió desde este plan/);
    expect(applyMaster).not.toHaveBeenCalled();
  });

  it('a failed plan call keeps the request for «sigue»', async () => {
    plans.draft.mockResolvedValueOnce(null);
    const out = await send('Hazme una tienda de velas');
    expect(out.assistantMessage.metadata).toMatchObject({ failed: true, pendingRequest: { instruction: 'Hazme una tienda de velas', direct: false } });
    expect(applyMaster).not.toHaveBeenCalled();
  });

  it('a detailed first request builds the plan at once, its own sections on the follow-up', async () => {
    legacyFollowUps();
    plans.draft.mockResolvedValueOnce({ plan: PLAN, applied: APPLIED, exhausted: false });
    plans.followUpBrief.mockReturnValueOnce('Construye sobre esta tienda las secciones propias');
    const out = await send('Diseña la tienda goodProtein. Quiero algo con mucha energía y movimiento: tú eliges la estructura. Cuenta en pocas palabras qué aporta cada marca.');
    expect(applyMaster.mock.calls[0][5]).toEqual(APPLIED);
    expect(out.followUp).toMatchObject({ personalTouch: true, ownRequest: true });
    expect(out.followUp.instruction).toMatch(/^Construye sobre esta tienda las secciones propias[\s\S]*qué aporta cada marca/);
  });

  it('YAPI_PLAN_CARD=off keeps today\'s path', async () => {
    config.set('app.yapiPlanCard', false);
    await send('Hazme una tienda de velas');
    expect(plans.draft).not.toHaveBeenCalled();
    expect(applyMaster).toHaveBeenCalled();
  });

  it('F6: answering a card re-plans with the previous plan and shows the card again', async () => {
    messages.push({ id: 'plan4dddd', threadId: 't1', channel: 'source', role: 'ASSISTANT', content: 'plan', metadata: { plan: { ...PLAN, revision: 0 }, appliedPlan: APPLIED, planKind: 'new' }, createdAt: new Date() });
    plans.draft.mockResolvedValueOnce({ plan: { ...PLAN, card: ['Colores tierra'] }, applied: APPLIED, exhausted: false });
    const out = await send('quiero colores tierra y una sección de preguntas');
    expect(plans.draft.mock.calls[0][2]).toMatchObject({ previous: expect.objectContaining({ card: PLAN.card }), request: 'quiero colores tierra y una sección de preguntas' });
    expect(applyMaster).not.toHaveBeenCalled();
    expect(out.assistantMessage.metadata.planKind).toBe('new');
  });

  it('«dale» answering the newest card builds it', async () => {
    messages.push({ id: 'plan5eeee', threadId: 't1', channel: 'source', role: 'ASSISTANT', content: 'plan', metadata: { plan: { ...PLAN, revision: 0 }, appliedPlan: APPLIED, planKind: 'new' }, createdAt: new Date() });
    await send('dale');
    expect(plans.draft).not.toHaveBeenCalled();
    expect(applyMaster.mock.calls[0][5]).toEqual(APPLIED);
  });

  it('free-first: Construir on a new store designs freely from the plan, no template', async () => {
    config.set('app.yapiFreeFirst', true);
    plans.freeBrief = jest.fn().mockReturnValue('Diseña esta tienda desde cero siguiendo el plan aprobado');
    await tapped(0);
    expect(applyMaster).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalled();
    expect(generate.mock.calls[0][2].instruction).toContain('Diseña esta tienda desde cero siguiendo el plan aprobado');
  });

  it('free-first: a failed free build falls back to the template with the same plan', async () => {
    config.set('app.yapiFreeFirst', true);
    plans.freeBrief = jest.fn().mockReturnValue('Diseña esta tienda desde cero');
    generate.mockRejectedValueOnce(new Error('model down'));
    await tapped(0);
    expect(applyMaster.mock.calls[0][5]).toEqual(APPLIED);
  });

  it('free-first: a detailed first request also waits for the card', async () => {
    config.set('app.yapiFreeFirst', true);
    plans.draft.mockResolvedValueOnce({ plan: PLAN, applied: APPLIED, exhausted: false });
    const out = await send('Diseña la tienda goodProtein. Quiero algo con mucha energía y movimiento: tú eliges la estructura. Cuenta en pocas palabras qué aporta cada marca.');
    expect(applyMaster).not.toHaveBeenCalled();
    expect(out.assistantMessage.metadata.planKind).toBe('new');
  });
});


// Starters (spec 2026-10-24) were hidden 2026-10-29 (owner: «esencial only»): no new store starts from one, so their first-build tests
// went with them. Stores already built from a starter keep their files and chat edits.

// Owner 2026-10-15 / 2026-10-27: no row of photos unless the merchant asks for one or the store already has it.
it('offers the gallery section only when the merchant asks for one or the store has it', () => {
  const all = ['steps', 'gallery', 'faq'];
  expect(withoutPhotoGroups(all, 'Crea mi tienda de hoodies.')).toEqual(['steps', 'faq']);
  expect(withoutPhotoGroups(all, 'Quiero una galería con mis fotos.')).toEqual(all);
  expect(withoutPhotoGroups(all, 'Nada de galería, por favor.')).toEqual(['steps', 'faq']);
  expect(withoutPhotoGroups(all, 'Cambia el título', true)).toEqual(all);
});
describe('owner 2026-10-25: a shirt shop gets its sizes on the first build without asking', () => {
  beforeEach(() => {
    prisma.paymentLink = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'Polera Andina', amount: 12000, variants: [] },
        { id: 'p2', name: 'Buzo Illimani', amount: 20000, variants: [{ id: 'v', name: 'Única', amount: 20000 }] },
        { id: 'p3', name: 'Gorra bordada', amount: 6000, variants: [] },
      ]),
      update: jest.fn().mockResolvedValue({}),
    };
  });
  it('adds S–XL to a clothing product with no options, leaves products with options or without sizes alone, and says so', async () => {
    const out = await send('Crea mi tienda.');
    expect(prisma.paymentLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 's1', status: 'ACTIVE' }) }));
    expect(prisma.paymentLink.update).toHaveBeenCalledTimes(1);
    const { where, data } = prisma.paymentLink.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'p1' });
    expect(data.variants.map((v: any) => [v.name, v.amount, v.stock])).toEqual([['S', 12000, null], ['M', 12000, null], ['L', 12000, null], ['XL', 12000, null]]);
    expect(prisma.paymentLink.update.mock.invocationCallOrder[0]).toBeLessThan(applyMaster.mock.invocationCallOrder[0]);
    expect(out.assistantMessage.content).toContain('Agregué las tallas de siempre a Polera Andina');
  });
  it('a failed write never stops the build, and the reply claims nothing', async () => {
    prisma.paymentLink.update.mockRejectedValue(new Error('db down'));
    const out = await send('Crea mi tienda.');
    expect(out.revision).toMatchObject({ revision: 1 });
    expect(out.assistantMessage.content).not.toContain('Agregué las tallas');
  });
});

// Owner 2026-10-29 («esencial only not families»): the first build is the Oct 22 Esencial — no family, effect, module or animated look,
// whatever the business sells or the merchant writes. Platform features (sizes, collections, menu) are untouched.
it('a first build carries no family, effects, module or animated look, even for a bakery that asks for «animada»', async () => {
  const reads: any[] = [];
  applyMaster.mockImplementation(async (_m, _s, _r, filler) => { reads.push(await filler({ storeName: 'Dulce Horno', products: ['Torta de chocolate', 'Galletas'], photos: ['https://x/p1.jpg'] })); return { revision: 1, label: 'Plantilla: Esencial' }; });
  const out = await send('Mi negocio se llama Dulce Horno.\nQué hacemos: pastelería y galletas.\nQuiero una tienda muy animada, como un menú.\nCrea mi tienda.');
  expect(reads[0]).not.toHaveProperty('family');
  expect(reads[0]).not.toHaveProperty('effects');
  expect(reads[0]).not.toHaveProperty('module');
  expect(reads[0]).not.toHaveProperty('animated');
  expect(out.assistantMessage.content).not.toContain('hazla animada');
});

// Spec 2026-10-29 home page writer: after the polish, a small agent rewrites only the home; a failed writer keeps the template.
describe('the home page writer', () => {
  let refill: jest.Mock, projects: any, briefChecklist: jest.Mock;
  const shell = 'export default function Shell() { return null; }';
  const storeData = 'export const store = {"name":"Café Buna","tagline":"","city":"","logo":"","phone":""} as const;\nexport const photos: Record<string, string> = {"hero":"https://x/h.jpg","story":""};\nexport const copy = {"headline":"Hecho con cuidado"} as const;\nexport const look = {"palette":"terracotta","fonts":"classic","colors":{}} as const;\n';
  const files = (home: string, shellFile = shell) => [{ path: 'components/store-data.tsx', content: storeData },
    { path: 'components/home.tsx', content: `import { copy, photos } from './store-data';\n${home}` }, { path: 'components/Shell.tsx', content: shellFile }, { path: 'styles/globals.css', content: 'body{}' }];
  const snapshot = (home: string, shellFile?: string) => ({ snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: files(home, shellFile) } });
  beforeEach(() => {
    refill = jest.fn().mockResolvedValue({ revision: 3, label: 'Pulido de YAPI' });
    briefChecklist = jest.fn();
    projects = { current: jest.fn().mockResolvedValue({ revision: 3 }), restore: jest.fn().mockResolvedValue({ revision: 5 }),
      version: jest.fn().mockImplementation(async (_m: string, _s: string, revision: number) => revision >= 4 ? snapshot('export default function Home() { return 1; }') : snapshot('export default function Home() { return 0; }')) };
    config.set('app.yapiBriefChecklist', true);
    config.set('app.yapiHomeWriter', true);
    chat = new SourceChatService(prisma, projects, generation(), { decide, fillMaster, briefChecklist } as any, { apply: jest.fn(), applyMaster, refill } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
  });
  const polish = () => chat.send('m1', 's1', { revision: 3, instruction: `${MASTER_POLISH_BRIEF}\n\nMensaje del comercio:\nCafé de altura`, personalTouch: true, polish: true, checklistWords: 'Café de altura', requestId: uuid() } as any) as Promise<any>;
  const writer = () => chat.send('m1', 's1', { revision: 3, instruction: 'Diseña la portada', personalTouch: true, homeWriter: true, firstDesign: true, redesign: true, checklistWords: 'Café de altura', requestId: uuid(), model: 'gpt-5.6-terra' } as any) as Promise<any>;
  const read = { headline: 'Café de altura, tostado en casa', changed: ['headline'], values: [], palette: 'oscuro', fonts: 'moderna', colors: {}, heroPhoto: -1, storyPhoto: -1 };

  it('with the switch on, the polish hands the store to the writer, which carries the merchant\'s words', async () => {
    fillMaster.mockResolvedValueOnce(read);
    const out = await polish();
    expect(out.followUp).toMatchObject({ homeWriter: true, firstDesign: true, redesign: true, revision: 3, model: 'gpt-5.6-terra', checklistWords: 'Café de altura' });
    expect(out.followUp.briefCheck).toBeUndefined();
  });
  it('with the switch off, the polish goes straight to the check as before', async () => {
    config.set('app.yapiHomeWriter', false);
    fillMaster.mockResolvedValueOnce(read);
    const out = await polish();
    expect(out.followUp).toMatchObject({ briefCheck: 1, revision: 3 });
    expect(out.followUp.homeWriter).toBeUndefined();
  });
  it('the writer runs generate() as the home writer, with no conversation step, and hands its revision to the check', async () => {
    generate.mockResolvedValueOnce({ revision: 4, label: 'Portada de YAPI' });
    const out = await writer();
    expect(decide).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][6]).toMatchObject({ homeWriter: true, redesign: true, firstDesign: true });
    expect(out.revision).toMatchObject({ revision: 4 });
    expect(out.followUp).toMatchObject({ briefCheck: 1, revision: 4 });
    expect(messages.filter(message => message.role === 'ASSISTANT')).toHaveLength(1);
  });
  it('a writer that fails keeps the polished store, says nothing and still queues the check', async () => {
    generate.mockRejectedValueOnce(new Error('YAPI no pudo terminar la portada: steps'));
    await expect(writer()).rejects.toMatchObject({ followUp: { briefCheck: 1, revision: 3 } });
    await expect(Promise.resolve()).resolves.toBeUndefined();
    expect(prisma.storeAgentMessage.delete).toHaveBeenCalled();
    expect(messages.filter(message => message.role === 'ASSISTANT')).toHaveLength(0);
  });
  it('a polish with nothing to change still hands the store to the check (its follow-up survives the outer catch)', async () => {
    config.set('app.yapiHomeWriter', false);
    fillMaster.mockResolvedValueOnce({ ...read, changed: ['palette'] });
    await expect(polish()).rejects.toMatchObject({ followUp: { briefCheck: 1, revision: 3 } });
  });
  it('a spent quota is not swallowed, so the job runner retries the first design', async () => {
    generate.mockRejectedValueOnce(new SourceProviderQuotaException());
    await expect(writer()).rejects.toBeInstanceOf(SourceProviderQuotaException);
  });
  it('a writer run that changed the header is undone, the template stays, and the check runs on the restored revision', async () => {
    generate.mockResolvedValueOnce({ revision: 4, label: 'Portada de YAPI' });
    let restored = false;
    projects.restore.mockImplementation(async () => { restored = true; return { revision: 5 }; });
    projects.current.mockImplementation(async () => ({ revision: restored ? 5 : 3 }));
    projects.version.mockImplementation(async (_m: string, _s: string, revision: number) => revision >= 4 ? snapshot('export default function Home() { return 1; }', 'export default function Shell() { return 2; }') : snapshot('export default function Home() { return 0; }'));
    await expect(writer()).rejects.toMatchObject({ followUp: { briefCheck: 1, revision: 5 } });
    expect(projects.restore).toHaveBeenCalledWith('m1', 's1', 3, 4);
  });
  // Review 2026-10-29 (I4): the product page, cart, checkout and account look live in config.js, brand.css and frame-draw.json.
  it('a writer run that redrew the product page or the brand frame is undone too', async () => {
    const withPlatform = (home: string, style: string) => { const snap = snapshot(home); snap.snapshot.files.push({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ productPageStyle: style, dna: { button: 'pill' }, data: { items: [] } })};\n` } as any); return snap; };
    generate.mockResolvedValueOnce({ revision: 4, label: 'Portada de YAPI' });
    projects.version.mockImplementation(async (_m: string, _s: string, revision: number) => revision >= 4 ? withPlatform('export default function Home() { return 1; }', 'fashion') : withPlatform('export default function Home() { return 0; }', 'classic'));
    await expect(writer()).rejects.toBeInstanceOf(PersonalTouchSkipped);
    expect(projects.restore).toHaveBeenCalledWith('m1', 's1', 3, 4);
  });
  // Review 2026-10-29 (I1): the real quota failure reaches chat as generate()'s merchant-facing BadGatewayException, not the quota class.
  it('a spent quota as generate() really reports it goes back to the queue, without leaving a message behind', async () => {
    generate.mockRejectedValueOnce(new BadGatewayException(LIMIT_REPLY));
    const failure = await writer().catch(error => error);
    expect(failure).not.toBeInstanceOf(PersonalTouchSkipped);
    expect(failure.message).toBe(LIMIT_REPLY);
    expect(prisma.storeAgentMessage.delete).toHaveBeenCalled();
  });
  // Review 2026-10-29 (I2): a cancelled or shut-down run is not a failed writer; the job runner requeues or stops it.
  it('a cancelled run is not turned into a skip with a check', async () => {
    const controller = new AbortController();
    controller.abort();
    generate.mockRejectedValueOnce(new Error('cancelled'));
    const failure = await sourceRequestContext.run({ signal: controller.signal, jobId: 'j1', request: sourceMerchantRequest({ instruction: 'x' } as any), assertLease: jest.fn() } as any,
      () => writer()).catch(error => error);
    expect(failure).not.toBeInstanceOf(PersonalTouchSkipped);
  });
});
