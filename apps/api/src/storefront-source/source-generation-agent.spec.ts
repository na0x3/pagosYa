import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceProjectsService } from './source-projects.service';
import { templateDemoRevision } from './source-templates';
import { SourceRequestBudget } from './source-request-budget';
import { agentDraftPreviews } from './agent/agent-draft-previews';

jest.setTimeout(180_000);

const configValues = (engine: string) => ({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'next', 'app.yapiEngine': engine } as Record<string, unknown>);
async function setup(engine = 'agent') {
  const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
  const snapshot = sourceProjectSnapshot({ revision: 1, label: base.label, brief: base.brief, files: base.files } as any);
  const prisma: any = { storeRetention: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceGeneration: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) }, store: { findFirst: jest.fn().mockResolvedValue({ slug: 'pausa' }) }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Pausa', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1, slug: 'pausa' }), version: jest.fn().mockResolvedValue({ revision: 1, snapshot }), save: jest.fn().mockImplementation(async (_m: string, _s: string, value: any) => ({ revision: 2, snapshot: sourceProjectSnapshot(value) })), recentDesignFingerprints: jest.fn().mockResolvedValue([]), prepare: (value: any) => new SourceProjectsService({} as any).prepare(value) };
  const config: any = { get: jest.fn((key: string) => configValues(engine)[key]) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config), projects, brief: base.brief };
}
let callId = 0;
const turn = (calls: Array<[string, object]>) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 3000, output_tokens: 200 }, output: calls.map(([name, args]) => ({ type: 'function_call', call_id: `c${callId++}`, name, arguments: JSON.stringify(args) })) }));
const input = (brief: any) => ({ revision: 1, brief: { ...brief, sitePurpose: 'shop' }, instruction: 'Cambia el título principal a "Tu calma"', model: 'gpt-5.6-terra', maxCredits: 50 } as any);

describe('generate() with the agent engine', () => {
  afterEach(() => jest.restoreAllMocks());
  it('edits, verifies, finishes and saves through the normal pipeline with the summary and sections', async () => {
    const { service, projects, brief } = await setup();
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Cambié el título principal.', sections: ['Portada'] }]]));
    const result: any = await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).tools.map((t: any) => t.name)).toContain('screenshot');
    const saved = projects.save.mock.calls[0][2];
    expect(saved.files.find((f: any) => f.path === 'components/home.tsx').content).toContain('Tu calma');
    expect(saved.label).toBe('Cambié el título principal.');
    expect(result.agent).toEqual(expect.objectContaining({ summary: 'Cambié el título principal.', sections: ['Portada'] }));
    expect(result.generation.attempts.filter((a: any) => a.phase === 'agent')).toHaveLength(3);
  });
  it('publishes each clean draft for the live preview without resending saved photos, and clears it when the run ends', async () => {
    const { service, brief } = await setup();
    const published = jest.spyOn(agentDraftPreviews, 'set');
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Listo.', sections: ['Portada'] }]]));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
    expect(published).toHaveBeenCalledWith('s', expect.any(Array));
    const files = published.mock.calls[0][1];
    expect(files.find(f => f.path === '_compiled/home.js')!.content).toContain('Tu calma');
    expect(files.some(f => f.encoding === 'base64')).toBe(false);
    expect(agentDraftPreviews.get('s')).toEqual({ at: null });
  });
  it('fails without saving when the agent stops at a limit with an unverified draft', async () => {
    const { service, projects, brief } = await setup();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => turn([['edit_file', { path: 'components/home.tsx', search: 'para tu cuerpo', replacement: 'para tu mente' }]]));
    await expect(service.generate('m', 's', input(brief), new SourceRequestBudget(50))).rejects.toThrow('YAPI no pudo terminar');
    expect(projects.save).not.toHaveBeenCalled();
  });
  it('lets the single engine save a local edit of a Plantilla store, whose fonts live in styles/globals.css', async () => {
    const { service, projects, brief } = await setup('single');
    const answer = { label: 'Título', edits: [{ path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }], files: [], appends: [], products: [], productOperations: [] };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] })));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'components/home.tsx').content).toContain('Tu calma');
  });
  it('explains a provider failure in one sentence', async () => {
    const { service, brief } = await setup();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ error: {} }), { status: 500 }));
    await expect(service.generate('m', 's', input(brief), new SourceRequestBudget(50))).rejects.toThrow(/respondió 500\. Tu revisión/);
  });
  it('runs the agent on an evaluation candidate with the merchant instruction and saves nothing', async () => {
    const { service, projects, brief } = await setup();
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Cambié el título principal.', sections: ['Portada'] }]]));
    const result: any = await service.generate('m', 's', input(brief), new SourceRequestBudget(50), [], undefined, { candidate: true, free: true, evaluate: true, snapshot: (await projects.version()).snapshot });
    expect(JSON.stringify(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).input)).toContain('Tu calma');
    expect(result.candidate.files.find((f: any) => f.path === 'components/home.tsx').content).toContain('Tu calma');
    expect(projects.save).not.toHaveBeenCalled();
  });
  it('names the credit limit when it stops a run before the draft is clean', async () => {
    const { service, projects, brief } = await setup();
    // One turn that reports a huge bill leaves no room for the next reservation.
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 240_000, output_tokens: 100 }, output: [{ type: 'function_call', call_id: `c${callId++}`, name: 'edit_file', arguments: JSON.stringify({ path: 'components/home.tsx', search: 'para tu cuerpo', replacement: 'para tu mente' }) }] })));
    await expect(service.generate('m', 's', input(brief), new SourceRequestBudget(50))).rejects.toThrow('límite de créditos');
    expect(projects.save).not.toHaveBeenCalled();
  });
  it('keeps the single engine when the switch says single', async () => {
    const { service, projects, brief } = await setup('single');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [] })));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50)).catch(() => undefined);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).tools).toBeUndefined();
    expect(projects.save).not.toHaveBeenCalled();
  });
});
