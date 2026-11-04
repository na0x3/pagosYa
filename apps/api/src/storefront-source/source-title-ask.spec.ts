import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';

/** Chunky colour titles (spec 2026-11-03 §6): «títulos más tranquilos / más divertidos / cambia los títulos» on a Único store. */
const storeData = (titles: string) => `export const look = {"palette":"ink","fonts":"poster","colors":{}} as const;\nexport const variants: Record<string, string | string[]> = {"theme":"unico","titles":"${titles}","sections":[]};\n`;

let chat: SourceChatService, refill: jest.Mock, generate: jest.Mock, conversationDecide: jest.Mock;
beforeEach(() => {
  const messages: any[] = [];
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Nube', logoUrl: null, _count: { paymentLinks: 1 }, paymentLinks: [] }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn() },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(2) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { businessType: 'Sofás' }, files: [{ path: 'components/store-data.tsx', content: storeData('redonda') }] } }) };
  generate = jest.fn().mockResolvedValue({ revision: 3, label: 'x' });
  const generation: any = { generate, newBudget: jest.fn((maxCredits?: number) => new SourceRequestBudget(maxCredits)), catalog: jest.fn(), interruptedPreview: jest.fn() };
  conversationDecide = jest.fn().mockResolvedValue({ action: 'reply', reply: 'ok', summary: '', generationInstruction: '', imageUses: [] });
  refill = jest.fn().mockResolvedValue({ revision: 3, label: 'Títulos más tranquilos' });
  chat = new SourceChatService(prisma, projects, generation, { decide: conversationDecide } as any, { apply: jest.fn(), refill } as any, { get: () => undefined } as unknown as ConfigService);
});

it('«títulos más tranquilos» moves a rounded store to firme titles and says so', async () => {
  const out: any = await chat.send('m1', 's1', { revision: 2, instruction: 'títulos más tranquilos', requestId: uuid() });
  expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { variants: { titles: 'firme' } }, 'Títulos más tranquilos');
  expect(out.assistantMessage.content).toBe('Listo: tus títulos ahora son más tranquilos. Revisa la vista previa.');
});

it('«un título más divertido y cambia el precio» is not a title ask (Review Focus 4)', async () => {
  await chat.send('m1', 's1', { revision: 2, instruction: 'un título más divertido y cambia el precio', requestId: uuid() }).catch(() => undefined);
  expect(refill.mock.calls.some(call => (call[3] as any)?.variants?.titles)).toBe(false);
});
