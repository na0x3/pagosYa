import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceProjectsService } from './source-projects.service';
import { templateDemoRevision } from './source-templates';
import { SourceRequestBudget } from './source-request-budget';
import { agentDraftPreviews } from './agent/agent-draft-previews';

jest.setTimeout(180_000);

const configValues = (engine: string) => ({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.anthropic.apiKey': 'sk-ant-test', 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'next', 'app.yapiEngine': engine } as Record<string, unknown>);
async function setup(engine = 'agent', extra: Record<string, unknown> = {}) {
  const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
  const snapshot = sourceProjectSnapshot({ revision: 1, label: base.label, brief: base.brief, files: base.files } as any);
  const prisma: any = { storeRetention: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceGeneration: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) }, store: { findFirst: jest.fn().mockResolvedValue({ slug: 'pausa' }) }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Pausa', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1, slug: 'pausa' }), version: jest.fn().mockResolvedValue({ revision: 1, snapshot }), save: jest.fn().mockImplementation(async (_m: string, _s: string, value: any) => ({ revision: 2, snapshot: sourceProjectSnapshot(value) })), recentDesignFingerprints: jest.fn().mockResolvedValue([]), prepare: (value: any) => new SourceProjectsService({} as any).prepare(value) };
  const config: any = { get: jest.fn((key: string) => ({ ...configValues(engine), ...extra } as Record<string, unknown>)[key]) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config), projects, prisma, brief: base.brief };
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
  describe('the product page theme', () => {
    const themeArgs = (args: object) => ({ preset: null, swatch: null, gallery: null, blocks: null, divider: null, enter: null, css: null, ...args });
    const savedDna = (projects: any) => {
      const config = projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'config.js').content;
      return JSON.parse(config.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, '')).dna;
    };
    const ficha = (brief: any) => ({ ...input(brief), instruction: 'Mejora la ficha de producto para que se vea artesanal' });

    it('saves a theme chosen for a request about the product page, even though no file changed', async () => {
      const { service, projects, brief } = await setup();
      jest.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(turn([['set_product_card_theme', themeArgs({ swatch: 'square', gallery: 'stack' })]]))
        .mockResolvedValueOnce(turn([['verify', {}]]))
        .mockResolvedValueOnce(turn([['finish', { summary: 'Ficha más artesanal.', sections: [] }]]));
      await service.generate('m', 's', ficha(brief), new SourceRequestBudget(50));
      expect(savedDna(projects)).toMatchObject({ swatch: 'square', gallery: 'stack', blocks: 'plain', divider: 'none', enter: 'none' });
    });

    it('refuses the theme tool for a request that does not concern the product page', async () => {
      const { service, projects, brief } = await setup();
      const fetchMock = jest.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(turn([['set_product_card_theme', themeArgs({ swatch: 'square' })]]))
        .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
        .mockResolvedValueOnce(turn([['verify', {}]]))
        .mockResolvedValueOnce(turn([['finish', { summary: 'Título.', sections: ['Portada'] }]]));
      await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
      expect(JSON.stringify(JSON.parse((fetchMock.mock.calls[1] as any)[1].body).input)).toContain('Este pedido no cambia la ficha de producto.');
      expect(savedDna(projects).swatch).not.toBe('square');
    });

    it('keeps a preset\'s CSS when the browser check passes and drops it, keeping the params, when it fails', async () => {
      const check = jest.spyOn(require('./product-theme-check'), 'checkProductThemeOnSnapshot').mockResolvedValue([]);
      const passing = await setup();
      jest.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(turn([['set_product_card_theme', themeArgs({ preset: 'workshop' })]]))
        .mockResolvedValueOnce(turn([['verify', {}]]))
        .mockResolvedValueOnce(turn([['finish', { summary: 'Taller.', sections: [] }]]));
      await passing.service.generate('m', 's', ficha(passing.brief), new SourceRequestBudget(50));
      expect(savedDna(passing.projects)).toMatchObject({ swatch: 'square', gallery: 'stack' });
      expect(savedDna(passing.projects).productCss).toContain('[data-pagosya-product][data-style] [data-part="gallery"]');
      expect(check).toHaveBeenCalledTimes(1);

      jest.restoreAllMocks();
      jest.spyOn(require('./product-theme-check'), 'checkProductThemeOnSnapshot').mockResolvedValueOnce([{ control: 'buy', viewport: 'mobile', reason: 'covered by another element' }]);
      const failing = await setup();
      jest.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(turn([['set_product_card_theme', themeArgs({ preset: 'workshop' })]]))
        .mockResolvedValueOnce(turn([['verify', {}]]))
        .mockResolvedValueOnce(turn([['verify', {}]]))
        .mockResolvedValueOnce(turn([['finish', { summary: 'Taller.', sections: [] }]]));
      await failing.service.generate('m', 's', ficha(failing.brief), new SourceRequestBudget(50));
      const dna = savedDna(failing.projects);
      expect(dna).toMatchObject({ swatch: 'square', gallery: 'stack' });
      expect(dna.productCss).toBeUndefined();
    });
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
  const chatgptPlan = { 'app.environment': 'development', 'app.chatgptPlan': { url: 'http://127.0.0.1:4455/v1/responses', secret: 'local-secret' } };
  const hugeBill = () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 240_000, output_tokens: 100 }, output: [{ type: 'function_call', call_id: `c${callId++}`, name: 'edit_file', arguments: JSON.stringify({ path: 'components/home.tsx', search: 'para tu cuerpo', replacement: 'para tu mente' }) }] }), { status: 200 });
  it('does not stop a ChatGPT-plan run at the credit limit, because it costs nothing', async () => {
    const { service, brief } = await setup('agent', chatgptPlan);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => hugeBill());
    // The same bill stops an API run at the credit limit (test above); here only the step limit may end it.
    const error = await service.generate('m', 's', input(brief)).catch(e => e);
    expect(String(error.message)).toMatch(/YAPI no pudo terminar/);
    expect(String(error.message)).not.toMatch(/límite de créditos/);
  });
  it('charges a ChatGPT-plan run no credits, and an API run the same work some', async () => {
    const steps = () => jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Cambié el título principal.', sections: ['Portada'] }]]));
    const plan = await setup('agent', chatgptPlan);
    steps();
    const free: any = await plan.service.generate('m', 's', input(plan.brief));
    expect(free.generation.credits).toBe(0);
    expect(free.generation.rewardCreditsCovered).toBe(0);
    jest.restoreAllMocks();
    const api = await setup('agent');
    steps();
    const paid: any = await api.service.generate('m', 's', input(api.brief), new SourceRequestBudget(50));
    expect(paid.generation.credits).toBeGreaterThan(0);
  });
  it('hands out an unmetered budget in ChatGPT-plan mode and a capped one otherwise', async () => {
    const plan = await setup('agent', chatgptPlan), api = await setup('agent');
    expect(() => plan.service.newBudget(1).reserve('gpt-5.6-sol', 240_000, 20_000, 1024)).not.toThrow();
    const capped = api.service.newBudget(1);
    expect(() => capped.reserve('gpt-5.6-sol', 240_000, 20_000, 1024)).toThrow('límite restante');
  });
  it('records which tools each turn called, so a slow or failed run can be explained', async () => {
    const { service, brief } = await setup();
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Cambié el título principal.', sections: ['Portada'] }]]));
    const result: any = await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
    expect(result.generation.attempts.filter((a: any) => a.phase === 'agent').map((a: any) => a.tools)).toEqual([['edit_file'], ['verify'], ['finish']]);
  });
  it('says the agent kept repeating itself when a loop ends a run whose draft is not clean', async () => {
    const { service, projects, brief } = await setup();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => turn([['list_files', {}]]));
    await expect(service.generate('m', 's', input(brief), new SourceRequestBudget(50))).rejects.toThrow('repitiendo');
    expect(projects.save).not.toHaveBeenCalled();
  });
  it('keeps the reason a run failed in its receipt, so a FAILED row explains itself', async () => {
    const { service, prisma, brief } = await setup();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ error: {} }), { status: 500 }));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50)).catch(() => undefined);
    const failed = prisma.storeSourceGeneration.updateMany.mock.calls.map((call: any[]) => call[0].data).find((data: any) => data.status === 'FAILED');
    expect(failed.attempts.at(-1).failureReason).toMatch(/500/);
  });
  it('builds with Claude through the agent even where the single engine is the default', async () => {
    const { service, projects, brief } = await setup('single');
    const claudeTurn = (id: string, name: string, input: object) => new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 1000, output_tokens: 100 } }));
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(claudeTurn('t1', 'edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }))
      .mockResolvedValueOnce(claudeTurn('t2', 'verify', {}))
      .mockResolvedValueOnce(claudeTurn('t3', 'finish', { summary: 'Cambié el título con Claude.', sections: ['Portada'] }));
    const result: any = await service.generate('m', 's', { ...input(brief), model: 'claude-sonnet-5' }, new SourceRequestBudget(50));
    expect((fetchMock.mock.calls[0] as any)[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).model).toBe('claude-sonnet-5');
    expect(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'components/home.tsx').content).toContain('Tu calma');
    expect(result.agent.summary).toBe('Cambié el título con Claude.');
    expect(result.generation.attempts.every((a: any) => a.model === 'claude-sonnet-5')).toBe(true);
  });

  it('keeps the single engine when the switch says single', async () => {
    const { service, projects, brief } = await setup('single');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [] })));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50)).catch(() => undefined);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).tools).toBeUndefined();
    expect(projects.save).not.toHaveBeenCalled();
  });
});
