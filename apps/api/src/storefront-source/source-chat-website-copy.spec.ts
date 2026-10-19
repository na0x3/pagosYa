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
  // The rendered home page: by default the same layout as the reference, section by section.
  service.homeMeasurer = jest.fn().mockImplementation(async (files: Array<{ path: string; content: string }>) => {
    const count = (files.find(file => file.path === 'index.html')?.content.match(/<section>/g) || []).length;
    return normalizeBlueprint({ sections: blueprint.sections.filter(section => section.role !== 'header' && section.role !== 'footer').slice(0, count) }, 'https://store.local/');
  });
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
  expect(messages.at(-1).content).toMatch(/^Copié la estructura de otra\.com: las 3 secciones con el mismo diseño, con tu marca y tu contenido\. (?!Si solo)/);
});

it('a build far from the blueprint is reported honestly, with no automatic repair run', async () => {
  const { service, generation, messages } = setup([1]);
  await service.send('m', 's', { ...request, instruction: 'hazme la web como esta https://www.otra.com/' });
  expect(generation.generate).toHaveBeenCalledTimes(1);
  expect(messages.at(-1).content).toMatch(/^Copié la estructura de otra\.com: 1 de 3 secciones con el mismo diseño; las secciones 2 y 3 quedaron distintas\. Pídeme «iguala la sección 2»/);
  // «hazme la web como esta» could mean inspiration: the reply says how to ask for that.
  expect(messages.at(-1).content).toContain('Si solo querías inspirarte en su estilo, dime «solo inspiración»');
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

it('hands the build the platform header closest to the reference header', async () => {
  const { service, generation } = setup([3]);
  (service.blueprintReader as jest.Mock).mockResolvedValue({ ok: true, blueprint: { ...blueprint, look: { ...blueprint.look, header: { logo: 'center', links: 6, split: true, below: false, menu: false, topBar: false, overlay: false } } } });
  await service.send('m', 's', { ...request, instruction: 'vendo velas, copia esta estructura https://www.otra.com/' });
  expect(generation.generate.mock.calls[0][6]).toMatchObject({ websiteCopy: true, copyHeader: 'centered-split' });
});

it('without a render, the reply only claims the number of sections', async () => {
  const { service, messages } = setup([3]);
  (service.homeMeasurer as jest.Mock).mockResolvedValue(null);
  await service.send('m', 's', { ...request, instruction: 'vendo velas, copia esta estructura https://www.otra.com/' });
  expect(messages.at(-1).content).toMatch(/^Seguí las 3 secciones de otra\.com con tu marca y tu contenido\./);
});

it('inspiration wording keeps today\'s reference and never reads a blueprint', async () => {
  const { service } = setup([3]);
  await service.send('m', 's', { ...request, instruction: 'inspírate en https://www.otra.com/' }).catch(() => undefined);
  expect(service.blueprintReader).not.toHaveBeenCalled();
});
