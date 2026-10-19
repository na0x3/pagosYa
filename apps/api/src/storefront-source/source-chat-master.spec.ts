import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
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
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn() },
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
  expect(applyMaster).toHaveBeenCalledWith('m1', 's1', 0, expect.any(Function));
  expect(generate).not.toHaveBeenCalled();
  expect(out.revision).toMatchObject({ revision: 1 });
  expect(out.assistantMessage.content).toContain('Café Buna');
});

it('the filler gets the walkthrough facts and the store photos, walkthrough photos first', async () => {
  await send('Crea mi tienda.');
  expect(fillMaster).toHaveBeenCalledWith('m1', expect.objectContaining({ storeName: 'Café Buna', what: 'Café de especialidad', story: 'Tostamos en casa', city: 'La Paz', products: ['Coroico'], photos: ['https://x/u1.jpg', 'https://x/p1.jpg'] }));
});

it('«desde cero» keeps the scratch flow', async () => {
  await send('Quiero crear mi tienda desde cero.');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});

it('an earlier «desde cero» keeps the scratch flow', async () => {
  messages.push({ role: 'USER', content: 'Prefiero un diseño desde cero', metadata: {}, createdAt: new Date(), id: 'x' });
  await send('Listo, créala.');
  expect(applyMaster).not.toHaveBeenCalled();
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

  it('tells the conversation step the store is a master store', async () => {
    decided('none');
    await edit('Hola');
    expect(decide.mock.calls[0][1]).toMatchObject({ masterTemplate: true });
  });
});
