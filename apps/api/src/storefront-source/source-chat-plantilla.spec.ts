import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';

jest.mock('./source-master-check', () => ({ masterLayoutFindings: jest.fn().mockResolvedValue([]) }));

/** Spec 2026-10-20 Plantillas fill §5: words on a filled Plantilla store change its copy slots in one call. */
let chat: SourceChatService, generate: jest.Mock, fillPlantilla: jest.Mock, refillPlantilla: jest.Mock, decide: jest.Mock, config: Map<string, unknown>, messages: any[];
const storeData = 'export const store = {"name":"Don Kike","tagline":"","city":"","logo":"","phone":""} as const;\nexport const photos: Record<string, string> = {"hero":""};\nexport const copy: Record<string, string> = {"home_1":"Elegimos","home_2":"Cada corte, a mano."};\n';
beforeEach(() => {
  messages = [];
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Don Kike', logoUrl: null, onboarding: null, _count: { paymentLinks: 1 }, paymentLinks: [] }), update: jest.fn() },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn(), delete: jest.fn().mockResolvedValue({}) },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
  };
  generate = jest.fn().mockResolvedValue({ revision: 3, label: 'Edición' });
  decide = jest.fn();
  fillPlantilla = jest.fn();
  refillPlantilla = jest.fn().mockResolvedValue({ revision: 3, label: 'Textos actualizados' });
  config = new Map<string, unknown>([['app.yapiMasterTemplate', true], ['app.yapiPlantillasFill', true]]);
  const projects = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { templateId: 'tostado', sitePurpose: 'shop' }, files: [{ path: 'components/store-data.tsx', content: storeData }] } }) };
  const generation = { generate, newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn(), interruptedPreview: jest.fn() } as any;
  chat = new SourceChatService(prisma as any, projects as any, generation, { decide, fillPlantilla, fillMaster: jest.fn() } as any, { apply: jest.fn(), refillPlantilla } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
});
const edit = (instruction: string) => chat.send('m1', 's1', { revision: 2, instruction, requestId: uuid() }) as Promise<any>;
const decided = (editKind: string) => decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 's', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', editKind });

it('a content edit rewrites only the changed slots, through one fill call with the current words', async () => {
  decided('content');
  fillPlantilla.mockResolvedValueOnce({ home_1: 'Seleccionamos', home_2: 'Cada corte, a mano.' });
  const out = await edit('Cambia «Elegimos» por «Seleccionamos»');
  expect(fillPlantilla.mock.calls[0][1]).toMatchObject({ request: 'Cambia «Elegimos» por «Seleccionamos»', current: { home_1: 'Elegimos', home_2: 'Cada corte, a mano.' }, storeName: 'Don Kike' });
  expect(refillPlantilla).toHaveBeenCalledWith('m1', 's1', 2, { home_1: 'Seleccionamos' }, 'Textos actualizados');
  expect(generate).not.toHaveBeenCalled();
  expect(out.revision).toMatchObject({ revision: 3 });
});

it('a request the words cannot answer becomes an ordinary edit', async () => {
  decided('content');
  fillPlantilla.mockResolvedValueOnce({ home_1: 'Elegimos', home_2: 'Cada corte, a mano.' });
  await edit('Agrega una sección de horarios');
  expect(refillPlantilla).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});

it('with the flag off, a Plantilla store edits as before', async () => {
  config.set('app.yapiPlantillasFill', false);
  decided('content');
  await edit('Cambia «Elegimos» por «Seleccionamos»');
  expect(fillPlantilla).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});
