import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';
import { sourceRequestContext } from './source-request-context';
import { sourceMerchantRequest } from './source-merchant-request';
import type { StyleProposal } from './source-style-proposal';

/** Spec 2026-10-11 "Elige tu estilo" Task 9: the chat proposes, waits, builds from the pick; Studio reads the cards. */
const awaitingProposal = (): StyleProposal => ({ version: 1, status: 'AWAITING_STYLE', createdAt: '2026-10-11T00:00:00.000Z', assetMap: [],
  request: { dto: { revision: 0, instruction: 'x', brief: { businessType: 'Café' } } as any, imageUses: [], redesign: false },
  slots: [0, 1, 2, 3].map(slot => ({ slot, mode: slot < 2 ? 'calm' : 'bold', kind: 'cafe-food', family: { id: 'f' }, file: { path: 'frame-draw.json', content: '{}' }, paragraph: 'p', palette: { id: 'x', name: 'x', paper: '#ffffff', ink: '#111111', accent: '#ff0000', accent2: '#eeeeee', dark: false }, draw: {}, playbook: 'pb' })) as any,
  design: { selected: 1, selection: { source: 'planner', rationale: 'r' }, concepts: [0, 1, 2, 3].map(slot => ({ name: `c${slot}`, opening: `o${slot}`, flow: 'f', premise: 'p', typography: 't', imagery: 'i', mobile: 'm', dna: { type: { display: 'outfit', text: 'manrope' } }, card: { slot, mode: slot < 2 ? 'calm' : 'bold', name: `Estilo ${slot}`, vibe: 'v', inspiration: ['a', 'b', 'c'] } })) as any },
  heroes: [null, null, null, null] });
const savedRevision = () => ({ revision: 1, label: 'Carta editorial' });

let chat: SourceChatService, prisma: any, projects: any, generate: jest.Mock, conversationDecide: jest.Mock, config: Map<string, unknown>;
const currentRevision = (revision: number) => projects.current.mockResolvedValue({ revision });
beforeEach(() => {
  const messages: any[] = [];
  prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Café Buna', logoUrl: null, _count: { paymentLinks: 0 }, paymentLinks: [] }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn() },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  projects = { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { businessType: 'Café Buna', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' } } }) };
  generate = jest.fn().mockResolvedValue(savedRevision());
  const generation: any = { generate, newBudget: jest.fn((maxCredits?: number) => new SourceRequestBudget(maxCredits)), catalog: jest.fn(), interruptedPreview: jest.fn() };
  conversationDecide = jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería de especialidad en Sopocachi.', generationInstruction: 'Crea la tienda.', imageUses: [], startFrom: 'scratch' });
  config = new Map<string, unknown>([['app.yapiStylePick', true]]);
  chat = new SourceChatService(prisma, projects, generation, { decide: conversationDecide } as any, { apply: jest.fn() } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
});

it('asks for a proposal on a new store when the flag is on, and says so in the chat', async () => {
  generate.mockResolvedValueOnce({ styleProposal: { generationId: 'g1', cards: 2 } });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Una cafetería en Sopocachi', setupAction: 'generate', requestId: uuid() });
  expect(generate.mock.calls[0][6]).toMatchObject({ styleProposal: true });
  expect(out.assistantMessage.content).toBe('Te preparo 2 estilos para Café Buna: uno tranquilo y uno atrevido. Elige uno para construir tu tienda.');
  expect(out.assistantMessage.metadata).toMatchObject({ styleProposal: { generationId: 'g1' } });
  expect(out.revision).toBeUndefined();
});

it('never asks for a proposal when the flag is off', async () => {
  config.set('app.yapiStylePick', false);
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Una cafetería', setupAction: 'generate', requestId: uuid() });
  expect(generate.mock.calls[0][6].styleProposal).toBeUndefined();
  expect(prisma.storeSourceGeneration.findFirst).not.toHaveBeenCalled();
  expect(out.assistantMessage.content.startsWith('No pude preparar')).toBe(false);
});

it('says so when it tried to prepare styles but built directly', async () => {
  generate.mockResolvedValueOnce({ ...savedRevision(), generation: { styleAttempted: true } });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Una cafetería', setupAction: 'generate', requestId: uuid() });
  expect(out.assistantMessage.content.startsWith('No pude preparar los estilos, armé uno por ti. ')).toBe(true);
  expect(out.revision).toMatchObject({ revision: 1 });
});

it('says nothing about styles when the run could not offer them (e.g. sketch-first on)', async () => {
  generate.mockResolvedValueOnce({ ...savedRevision(), generation: {} });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Una cafetería', setupAction: 'generate', requestId: uuid() });
  expect(generate.mock.calls[0][6]).toMatchObject({ styleProposal: true });
  expect(out.assistantMessage.content.startsWith('No pude preparar')).toBe(false);
});

it('does not ask for a proposal on a small edit', async () => {
  currentRevision(3);
  await chat.send('m1', 's1', { revision: 3, instruction: 'Cambia el teléfono', requestId: uuid() });
  expect(generate.mock.calls[0][6]?.styleProposal).toBeFalsy();
});

it('answers without a model call while a proposal waits', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: awaitingProposal() });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: '¿y en azul?', requestId: uuid() });
  expect(out.assistantMessage.content).toBe('Primero elige un estilo; después lo ajustamos juntos.');
  expect(out.assistantMessage.metadata).toMatchObject({ styleProposal: { generationId: 'g1' } });
  expect(conversationDecide).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it('does not wait on a proposal whose run failed', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'FAILED', proposal: awaitingProposal() });
  await chat.send('m1', 's1', { revision: 0, instruction: '¿y en azul?', requestId: uuid() });
  expect(generate).toHaveBeenCalled();
});

it('builds from a pick with the saved request, marks it picked, and "Elige tú" uses the recommendation', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', proposal: awaitingProposal() });
  generate.mockResolvedValue(savedRevision());
  await chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', auto: true }, requestId: uuid() });
  const call = generate.mock.calls[0];
  expect(call[2]).toEqual(awaitingProposal().request.dto);
  expect(call[6].style.index).toBe(awaitingProposal().design!.selected);
  expect(call[6].style.proposal).toEqual(awaitingProposal());
  expect(call[6].redesign).toBeUndefined();
  expect(conversationDecide).not.toHaveBeenCalled();
  expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g1' }, data: { proposal: expect.objectContaining({ status: 'PICKED', picked: awaitingProposal().design!.selected }) } }));
});

it('builds a picked redesign as a redesign', async () => {
  const proposal = awaitingProposal();
  proposal.request.redesign = true;
  proposal.request.dto.revision = 4;
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', proposal });
  currentRevision(4);
  await chat.send('m1', 's1', { revision: 4, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 3 }, requestId: uuid() });
  expect(generate.mock.calls[0][2].revision).toBe(4);
  expect(generate.mock.calls[0][6]).toMatchObject({ redesign: true, style: { index: 3 } });
});

it('retries a failed build from the same pick without asking again', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), status: 'PICKED', picked: 2 } });
  generate.mockResolvedValue(savedRevision());
  await chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 2 }, requestId: uuid() });
  expect(generate.mock.calls[0][6]).toMatchObject({ style: { index: 2 } });
  expect(generate.mock.calls[0][6].styleProposal).toBeUndefined();
});

it('refuses a pick outside the proposal or one that is no longer offered, and says the style can be retried', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), design: { ...awaitingProposal().design!, concepts: awaitingProposal().design!.concepts.slice(0, 2) } } });
  await expect(chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 3 }, requestId: uuid() })).rejects.toThrow('Elige uno de los estilos de la propuesta.');
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), status: 'SUPERSEDED' } });
  await expect(chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 0 }, requestId: uuid() })).rejects.toThrow('Ese estilo ya no está disponible.');
  expect(generate).not.toHaveBeenCalled();
  expect(prisma.storeSourceGeneration.updateMany).not.toHaveBeenCalled();
  const failure = prisma.storeAgentMessage.create.mock.calls.at(-1)[0].data;
  expect(failure).toMatchObject({ role: 'ASSISTANT', content: 'Ese estilo ya no está disponible. Pide un nuevo diseño.', metadata: { failed: true, styleProposal: { generationId: 'g1' } } });
});

it('refuses a pick once the store moved past the revision the styles were made for', async () => {
  // e.g. a Shopify import or a template landed revision 1 while the cards waited.
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', proposal: awaitingProposal() });
  currentRevision(1);
  await expect(chat.send('m1', 's1', { revision: 1, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 0 }, requestId: uuid() })).rejects.toThrow('Ese estilo ya no está disponible. Pide un nuevo diseño.');
  expect(generate).not.toHaveBeenCalled();
  expect(prisma.storeSourceGeneration.updateMany).not.toHaveBeenCalled();
});

it('"Elige tú" explains its choice in the chat; a merchant\'s own pick does not', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', proposal: awaitingProposal() });
  const auto: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Elige tú', stylePick: { generationId: 'g1', auto: true }, requestId: uuid() });
  expect(auto.assistantMessage.content.startsWith('Elegí «Estilo 1»: r Guardé')).toBe(true);
  const own: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 2 }, requestId: uuid() });
  expect(own.assistantMessage.content.startsWith('Elegí')).toBe(false);
});

it('a picked style whose build failed waits for Reintentar: no new cards, no model call', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), status: 'PICKED', picked: 2 } });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Hola, ¿sigues ahí?', requestId: uuid() });
  expect(out.assistantMessage.content).toBe('Tu estilo «Estilo 2» quedó elegido; toca Reintentar para construir la tienda.');
  expect(out.assistantMessage.metadata).toMatchObject({ styleProposal: { generationId: 'g1' } });
  expect(conversationDecide).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it('a picked style yields to a full redesign request, and is ignored once the store moved on', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), status: 'PICKED', picked: 2 } });
  generate.mockResolvedValueOnce({ styleProposal: { generationId: 'g2', cards: 2 } });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Rediseña mi tienda desde cero', requestId: uuid() });
  expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g1' }, data: { proposal: expect.objectContaining({ status: 'SUPERSEDED' }) } }));
  expect(generate.mock.calls[0][6]).toMatchObject({ styleProposal: true });
  currentRevision(1);
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), status: 'PICKED', picked: 2 } });
  await chat.send('m1', 's1', { revision: 1, instruction: 'Cambia el teléfono', requestId: uuid() });
  expect(generate).toHaveBeenCalledTimes(2);
});

it('offers the same style again when the build itself fails', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', proposal: awaitingProposal() });
  generate.mockRejectedValueOnce(new Error('provider down'));
  await expect(chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 0 }, requestId: uuid() })).rejects.toThrow();
  expect(prisma.storeAgentMessage.create.mock.calls.at(-1)[0].data).toMatchObject({ content: 'No pude completar tu pedido. Puedes reintentar con el mismo estilo.', metadata: { failed: true, styleProposal: { generationId: 'g1' } } });
});

it('builds a pick inside the request that asked for the styles, keeping the pick job\'s fence', async () => {
  const askedFor = { revision: 0, instruction: 'Una cafetería en Sopocachi, colorida', setupAction: 'generate' as const, requestId: uuid() };
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', requestJobId: 'job-proposal', proposal: awaitingProposal() });
  prisma.storeSourceChatJob.findFirst.mockResolvedValue({ input: { ...askedFor, merchantRequest: sourceMerchantRequest(askedFor) } });
  let seen: any;
  generate.mockImplementation(async () => { seen = sourceRequestContext.getStore(); return savedRevision(); });
  const pick = { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 1 }, requestId: uuid() };
  const assertLease = jest.fn();
  await sourceRequestContext.run({ signal: new AbortController().signal, jobId: 'job-pick', request: sourceMerchantRequest(pick), assertLease }, () => chat.send('m1', 's1', pick));
  expect(prisma.storeSourceChatJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'job-proposal', storeId: 's1' } }));
  expect(seen.request.instruction).toBe('Una cafetería en Sopocachi, colorida');
  expect(seen.request.profile).toEqual(sourceMerchantRequest(askedFor).profile);
  expect(seen).toMatchObject({ jobId: 'job-pick', assertLease });
});

it('builds a pick in its own context when the job that asked for the styles is gone', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValue({ id: 'g1', status: 'AWAITING_STYLE', requestJobId: 'job-gone', proposal: awaitingProposal() });
  let seen: any;
  generate.mockImplementation(async () => { seen = sourceRequestContext.getStore(); return savedRevision(); });
  const pick = { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 1 }, requestId: uuid() };
  await sourceRequestContext.run({ signal: new AbortController().signal, jobId: 'job-pick', request: sourceMerchantRequest(pick), assertLease: jest.fn() }, () => chat.send('m1', 's1', pick));
  expect(seen.request.instruction).toBe('Usar este estilo');
});

it('supersedes a waiting proposal when the merchant asks for another full redesign', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: awaitingProposal() });
  generate.mockResolvedValueOnce({ styleProposal: { generationId: 'g2', cards: 2 } });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Rediseña mi tienda desde cero', requestId: uuid() });
  expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'g1' }, data: { proposal: expect.objectContaining({ status: 'SUPERSEDED' }) } }));
  expect(generate.mock.calls[0][6]).toMatchObject({ styleProposal: true });
});

it('serves the newest running or waiting proposal as cards, and nothing when its run failed', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: awaitingProposal() });
  expect((await chat.styleProposal('m1', 's1')).proposal!.cards).toHaveLength(4);
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: { ...awaitingProposal(), status: 'RUNNING' } });
  expect((await chat.styleProposal('m1', 's1')).proposal!.status).toBe('RUNNING');
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'FAILED', proposal: { ...awaitingProposal(), status: 'RUNNING' } });
  expect((await chat.styleProposal('m1', 's1')).proposal).toBeNull();
  expect(prisma.storeSourceGeneration.findFirst.mock.calls[0][0].select).toMatchObject({ id: true, status: true, proposal: true });
});

it('keeps serving a picked proposal with its pick until the store moves past its revision, so the pick can be retried', async () => {
  const picked = { id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), status: 'PICKED', picked: 2 } };
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce(picked);
  expect((await chat.styleProposal('m1', 's1')).proposal).toMatchObject({ generationId: 'g1', status: 'PICKED', picked: 2 });
  currentRevision(1);
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce(picked);
  expect((await chat.styleProposal('m1', 's1')).proposal).toBeNull();
});
