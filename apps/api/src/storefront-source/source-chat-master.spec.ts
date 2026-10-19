import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';

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

it('the flag off returns to today’s flow', async () => {
  config.set('app.yapiMasterTemplate', false);
  await send('Crea mi tienda.');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});

describe('edits on a master store', () => {
  let refill: jest.Mock;
  const storeData = 'export const store = {"name":"Café Buna","tagline":"","city":"","logo":"","phone":""} as const;\nexport const photos: Record<string, string> = {"hero":"https://x/h.jpg","story":""};\nexport const copy = {"headline":"Hecho con cuidado"} as const;\nexport const look = {"palette":"terracotta","fonts":"classic","colors":{}} as const;\n';
  beforeEach(() => {
    refill = jest.fn().mockResolvedValue({ revision: 3, label: 'Textos y estilo actualizados' });
    const projects = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: [{ path: 'components/store-data.tsx', content: storeData }] } }) };
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

  it('a content edit that changes nothing saves nothing and says so', async () => {
    decided('content');
    fillMaster.mockResolvedValueOnce({ changed: [], values: [], palette: 'terracotta', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1 });
    const out = await edit('Déjalo bonito');
    expect(refill).not.toHaveBeenCalled();
    expect(out.assistantMessage.content).toMatch(/qué cambiar/);
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
