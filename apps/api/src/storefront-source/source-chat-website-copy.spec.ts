// Spec 2026-10-18 website copy: «copia esta estructura» with a link builds the home page from the page's blueprint.
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';
import { normalizeBlueprint } from './website-copy/copy-blueprint';

const blueprint = normalizeBlueprint({ sections: [
  { role: 'header', height: 80, columns: 3 }, { role: 'hero', height: 700, columns: 2, images: 1, placement: 'right' },
  { role: 'section', height: 500, columns: 3 }, { role: 'section', height: 400, columns: 1 }, { role: 'footer', height: 300, columns: 4 },
], look: { background: '#ffffff', text: '#111111' } }, 'https://www.otra.com/', [{ index: 1, image: 'data:image/jpeg;base64,AAA' }])!;
const home = (sections: number) => ({ path: 'index.html', content: `<body><header></header><main>${'<section></section>'.repeat(sections)}</main><footer></footer></body>` });

function setup(revisionSections: number[] = [3]) {
  const messages: any[] = [];
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Velas Luz', logoUrl: null, _count: { paymentLinks: 0 } }) },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn() },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(0) },
    mediaAsset: { create: jest.fn() },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn().mockImplementation(async (_m: string, _s: string, revision: number) => ({ snapshot: { files: [home(revisionSections[revision - 1] ?? 0)] } })) };
  let next = 0;
  const generation: any = { generate: jest.fn().mockImplementation(async () => ({ revision: ++next, label: 'Velas Luz' })), newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn().mockResolvedValue({ storeName: 'Velas Luz', items: [] }), interruptedPreview: jest.fn().mockResolvedValue({ at: null }) };
  const dialogue: any = { decide: jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Velas artesanales.', generationInstruction: 'Crea la tienda.', imageUses: [], startFrom: 'scratch' }) };
  const service = new SourceChatService(prisma, projects, generation, dialogue, {} as any, { get: (key: string) => key === 'app.yapiStylePick' } as any, {} as any);
  service.blueprintReader = jest.fn().mockResolvedValue({ ok: true, blueprint });
  return { service, generation, dialogue, messages };
}
const request = { revision: 0, assetUrls: [] as string[] };

it('builds from the blueprint, with its section screenshots and no style cards, and says how close it came', async () => {
  const { service, generation, messages } = setup([3]);
  await service.send('m', 's', { ...request, instruction: 'vendo velas, copia esta estructura https://www.otra.com/' });
  expect(service.blueprintReader).toHaveBeenCalledWith('https://www.otra.com/');
  const [, , dto, , , , execution] = generation.generate.mock.calls[0];
  expect(dto.instruction).toContain('COPY BLUEPRINT (the merchant asked to copy the structure and look of otra.com');
  expect(execution).toMatchObject({ websiteCopy: true, referenceCaptures: [{ url: 'https://www.otra.com/', viewport: 'desktop', y: 80, image: 'data:image/jpeg;base64,AAA' }] });
  expect(execution.styleProposal).toBeUndefined();
  expect(generation.generate).toHaveBeenCalledTimes(1);
  expect(messages.at(-1).content).toMatch(/^Copié la estructura de otra\.com: 3 de 3 secciones, con tu marca y tu contenido\./);
});

it('a build far from the blueprint gets one repair run', async () => {
  const { service, generation, messages } = setup([1, 3]);
  await service.send('m', 's', { ...request, instruction: 'hazme la web como esta https://www.otra.com/' });
  expect(generation.generate).toHaveBeenCalledTimes(2);
  expect(generation.generate.mock.calls[1][2]).toMatchObject({ revision: 1 });
  expect(generation.generate.mock.calls[1][2].instruction).toMatch(/^La página de inicio tiene 1 secciones y la estructura de otra\.com tiene 3/);
  expect(messages.at(-1).content).toMatch(/^Copié la estructura de otra\.com: 3 de 3 secciones/);
});

it('a question first keeps the copy for the next message, and the page is read only when the store is built', async () => {
  const { service, dialogue, generation, messages } = setup([3]);
  dialogue.decide.mockResolvedValueOnce({ action: 'reply', reply: '¿Qué vendes?', summary: '', generationInstruction: '', imageUses: [], startFrom: 'unknown' });
  await service.send('m', 's', { ...request, instruction: 'copia esta estructura https://www.otra.com/' });
  expect(service.blueprintReader).not.toHaveBeenCalled();
  expect(messages.at(-1).metadata.sourceSetup.websiteCopyUrl).toBe('https://www.otra.com/');
  await service.send('m', 's', { ...request, instruction: 'vendo velas de soya' });
  expect(service.blueprintReader).toHaveBeenCalledWith('https://www.otra.com/');
  expect(generation.generate.mock.calls[0][2].instruction).toContain('COPY BLUEPRINT');
});

it('a page that cannot be read builds the store anyway and says so', async () => {
  const { service, generation, messages } = setup([3]);
  (service.blueprintReader as jest.Mock).mockResolvedValue({ ok: false, reason: 'blocked' });
  await service.send('m', 's', { ...request, instruction: 'clona esta página https://www.otra.com/' });
  expect(generation.generate.mock.calls[0][2].instruction).not.toContain('COPY BLUEPRINT (');
  expect(messages.at(-1).content).toMatch(/^No pude leer esa página para copiarla/);
});

it('inspiration wording keeps today\'s reference and never reads a blueprint', async () => {
  const { service } = setup([3]);
  await service.send('m', 's', { ...request, instruction: 'inspírate en https://www.otra.com/' }).catch(() => undefined);
  expect(service.blueprintReader).not.toHaveBeenCalled();
});
