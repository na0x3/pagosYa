import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceProjectsService } from './source-projects.service';
import { templateDemoRevision } from './source-templates';
import { SourceRequestBudget } from './source-request-budget';
import { agentDraftPreviews } from './agent/agent-draft-previews';
import * as agentLoop from './agent/agent-loop';
import * as compositionReview from './source-composition-review';
import { SourceDesignPlanner } from './source-design-planner';
import type { SourceDesign } from './source-design';
import { sourceRuntimeDna } from './source-dna';
import { sourceHomeRegions } from './source-edit-scope';
import { validDna } from './fixtures/dna';

jest.setTimeout(180_000);

const configValues = (engine: string) => ({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.anthropic.apiKey': 'sk-ant-test', 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'next', 'app.yapiEngine': engine } as Record<string, unknown>);
async function setup(engine = 'agent', extra: Record<string, unknown> = {}) {
  const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
  const snapshot = sourceProjectSnapshot({ revision: 1, label: base.label, brief: base.brief, files: base.files } as any);
  const prisma: any = { storeRetention: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'run-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) }, store: { findFirst: jest.fn().mockResolvedValue({ slug: 'pausa' }) }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Pausa', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1, slug: 'pausa' }), version: jest.fn().mockResolvedValue({ revision: 1, snapshot }), save: jest.fn().mockImplementation(async (_m: string, _s: string, value: any) => ({ revision: 2, snapshot: sourceProjectSnapshot(value) })), recentDesignFingerprints: jest.fn().mockResolvedValue([]), prepare: (value: any) => new SourceProjectsService({} as any).prepare(value) };
  const config: any = { get: jest.fn((key: string) => ({ ...configValues(engine), ...extra } as Record<string, unknown>)[key]) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config), projects, prisma, brief: base.brief };
}
let callId = 0;
const plan = ['plan_task', { requirements: [{ id: 'r1', description: 'La página solicitada tiene contenido visible', page: 'index.html', check: 'element', selector: 'h1', expected: '1' }] }] as [string, object];
const turn = (calls: Array<[string, object]>) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 3000, output_tokens: 200 }, output: (calls.some(([name]) => ['edit_file','set_product_card_theme'].includes(name)) ? [plan, ...calls] : calls).map(([name, args]) => ({ type: 'function_call', call_id: `c${callId++}`, name, arguments: JSON.stringify(name === 'finish' ? { ...args, status: 'completed', remaining: [] } : args) })) }));
const input = (brief: any) => ({ revision: 1, brief: { ...brief, sitePurpose: 'shop' }, instruction: 'Cambia el título principal a "Tu calma"', model: 'gpt-5.6-terra', maxCredits: 50 } as any);

describe('generate() with the agent engine', () => {
  afterEach(() => jest.restoreAllMocks());
  it('edits, verifies, finishes and saves through the normal pipeline with the summary and sections', async () => {
    const review = jest.spyOn(compositionReview, 'reviewSourceComposition').mockRejectedValue(new Error('Local edits must not spend a composition review'));
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
    expect(review).not.toHaveBeenCalled();
  });
  it.each(['gpt-5.6-terra', 'claude-sonnet-5'])('wires independent review for a redesign with %s using the shared budget and vision provider', async model => {
    const { service, projects, brief } = await setup();
    const baseline = (await projects.version()).snapshot;
    const configOf = (source: Array<{ path: string; content: string }>) => JSON.parse(source.find(file => file.path === 'config.js')!.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, ''));
    const oldStyle = configOf(baseline.files).productPageStyle;
    const newStyle = oldStyle === 'dense' ? 'image-led' : 'dense';
    const committed: SourceDesign = { selected: 0, concepts: ['Comparison', 'Campaign', 'Collection'].map(name => ({ name, premise: name, opening: name, flow: name, typography: 'System sans', imagery: 'Real catalog', mobile: 'Readable catalog', layout: { sections: ['menu'], catalogSection: 'menu', productsInOpening: true, standaloneIntro: false, productPage: newStyle }, dna: { ...validDna(), motifs: [] } })) };
    // Isolate provider wiring while retaining a real committed commerce direction different from the old store.
    jest.spyOn(service as any, 'exploreDesign').mockReturnValue({ selected: 0 });
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(committed);
    const budget = new SourceRequestBudget(50);
    const review = jest.spyOn(compositionReview, 'reviewSourceComposition').mockResolvedValue({ findings: [], summary: 'Coherent design.' });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No provider call is permitted in this wiring test'));
    jest.spyOn(agentLoop, 'runAgent').mockImplementation(async ({ toolbox }) => {
      const context = (toolbox as any).ctx;
      expect(context.reviewComposition).toEqual(expect.any(Function));
      const previewConfig = configOf(context.base.files);
      expect(previewConfig.productPageStyle).toBe(newStyle);
      expect(previewConfig.productPageStyle).not.toBe(oldStyle);
      expect(previewConfig.dna).toEqual(sourceRuntimeDna(committed.concepts[committed.selected].dna, 's', newStyle));
      expect(JSON.parse(context.base.files.find((file: any) => file.path === 'design-direction.json').content)).toEqual(committed);
      expect(JSON.parse(context.base.files.find((file: any) => file.path === 'visual-system.json').content).productPage.style).toBe(newStyle);
      await context.reviewComposition({ snapshot: context.base, captures: [{ page: 'index.html', width: 390, image: 'data:image/jpeg;base64,YQ==' }] });
      return { status: 'failed', reason: 'intentional wiring-test stop' };
    });
    await expect(service.generate('m', 's', { ...input(brief), model }, budget, [], undefined, { redesign: true })).rejects.toThrow('intentional wiring-test stop');
    expect(review).toHaveBeenCalledTimes(1);
    expect(review.mock.calls[0][1]).toMatchObject({ model: 'gpt-5.6-terra', budget, provider: { endpoint: 'https://api.openai.com/v1/responses', apiKey: 'test-server-key' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(projects.save).not.toHaveBeenCalled();
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
  it('never infers a protected section from the wording of the request, only from an explicit selection', async () => {
    const asked = async (extra: object) => {
      const { service, brief } = await setup();
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]));
      await service.generate('m', 's', { ...input(brief), instruction: 'Reduce el espacio en blanco de una seccion a otra y mejora el título', ...extra }, new SourceRequestBudget(50)).catch(() => undefined);
      const body = String((fetchMock.mock.calls[0] as any)[1].body);
      fetchMock.mockRestore();
      return body;
    };
    expect(await asked({})).not.toContain('ENFORCED SECTION SCOPE');
    const { projects } = await setup();
    const sectionId = sourceHomeRegions((await projects.version()).snapshot.files.filter((f: any) => f.path === 'components/home.tsx'))[0].id;
    expect(await asked({ selection: { sectionId } })).toContain('ENFORCED SECTION SCOPE');
  });
  it('saves a draft that builds when the agent stops at a limit before verifying it', async () => {
    const { service, projects, brief } = await setup();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => turn([['edit_file', { path: 'components/home.tsx', search: 'para tu cuerpo', replacement: 'para tu mente' }]]));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
    expect(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'components/home.tsx').content).toContain('para tu mente');
  });
  it('still fails without saving when the draft the agent left does not compile', async () => {
    const { service, projects, brief } = await setup();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => turn([['edit_file', { path: 'components/home.tsx', search: 'para tu cuerpo', replacement: '{<Missing />' }]]));
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
    expect(result.generation.attempts.filter((a: any) => a.phase === 'agent').map((a: any) => a.tools)).toEqual([['plan_task', 'edit_file'], ['verify'], ['finish']]);
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
    const claudeTurn = (id: string, name: string, input: object) => new Response(JSON.stringify({ stop_reason: 'tool_use', content: [...(name === 'edit_file' ? [{ type: 'tool_use', id: 'plan', name: plan[0], input: plan[1] }] : []), { type: 'tool_use', id, name, input: name === 'finish' ? { ...input, status: 'completed', remaining: [] } : input }], usage: { input_tokens: 1000, output_tokens: 100 } }));
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

  it('retains an incomplete private draft and resumes only the matching request', async () => {
    const {service,projects,prisma,brief}=await setup();
    jest.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(turn([['edit_file',{path:'components/home.tsx',search:'Un respiro',replacement:'Tu calma'}]]))
      .mockResolvedValueOnce(new Response(JSON.stringify({status:'completed',output:[{type:'function_call',call_id:'blocked',name:'finish',arguments:JSON.stringify({status:'partial',summary:'Falta verificar el resultado.',sections:[],remaining:['r1']})}]})));
    await expect(service.generate('m','s',input(brief),new SourceRequestBudget(50))).rejects.toThrow('Falta verificar');
    expect(projects.save).not.toHaveBeenCalled();
    const savedCheckpoint=prisma.storeSourceGeneration.updateMany.mock.calls.map((call:any[])=>call[0].data.checkpoint).find((value:any)=>value?.key);
    expect(savedCheckpoint.files.find((f:any)=>f.path==='components/home.tsx').content).toContain('Tu calma');
    expect(prisma.storeSourceGeneration.updateMany.mock.calls.some((call:any[])=>call[0].data.status==='PARTIAL')).toBe(true);
    prisma.storeSourceGeneration.findFirst.mockResolvedValue({checkpoint:savedCheckpoint});
    jest.restoreAllMocks();
    jest.spyOn(globalThis,'fetch').mockResolvedValueOnce(turn([['verify',{}]])).mockResolvedValueOnce(turn([['finish',{summary:'Cambié el título.',sections:['Portada']}]]));
    await service.generate('m','s',input(brief),new SourceRequestBudget(50));
    expect(projects.save.mock.calls[0][2].files.find((f:any)=>f.path==='components/home.tsx').content).toContain('Tu calma');
  });

  it('reuses the committed concept only when resuming the same failed request', async () => {
    const { service, prisma, brief } = await setup();
    const concept = { name: 'Quiet', premise: 'A focused store', opening: 'Brand', flow: 'Catalog', typography: 'Sans', imagery: 'Existing photos', mobile: 'Stack', layout: { sections: ['hero', 'catalog'], catalogSection: 'catalog', standaloneIntro: true, productsInOpening: false, productPage: 'editorial' } };
    const design = { selected: 0, concepts: ['Quiet', 'Air', 'Grid'].map(name => ({ ...concept, name, opening: name + ' opening', flow: name + ' flow' })) };
    const planner = jest.spyOn((service as any).designPlanner, 'explore').mockResolvedValue(design);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', output: [
      { type: 'function_call', call_id: 'plan', name: plan[0], arguments: JSON.stringify(plan[1]) },
      { type: 'function_call', call_id: 'edit', name: 'edit_file', arguments: JSON.stringify({ path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }) },
      { type: 'function_call', call_id: 'stop', name: 'finish', arguments: JSON.stringify({ status: 'partial', summary: 'Falta verificar.', sections: [], remaining: ['r1'] }) },
    ] })));
    const request = { ...input(brief), instruction: 'Rediseña toda la tienda desde cero' };
    await expect(service.generate('m', 's', request, new SourceRequestBudget(200))).rejects.toThrow('Falta verificar');
    const checkpoint = prisma.storeSourceGeneration.updateMany.mock.calls.map((call: any[]) => call[0].data.checkpoint).find((value: any) => value?.design);
    expect(checkpoint.design).toEqual(design);
    prisma.storeSourceGeneration.findFirst.mockResolvedValue({ checkpoint });
    await expect(service.generate('m', 's', request, new SourceRequestBudget(200))).rejects.toThrow('Falta verificar');
    expect(planner).toHaveBeenCalledTimes(1);
    await expect(service.generate('m', 's', { ...request, instruction: 'Rediseña toda la tienda en azul desde cero' }, new SourceRequestBudget(200))).rejects.toThrow('Falta verificar');
    expect(planner).toHaveBeenCalledTimes(2);
  });

  it('keeps the single engine when the switch says single', async () => {
    const { service, projects, brief } = await setup('single');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [] })));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50)).catch(() => undefined);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).tools).toBeUndefined();
    expect(projects.save).not.toHaveBeenCalled();
  });
});

describe('sketch-first new stores', () => {
  afterEach(() => jest.restoreAllMocks());
  const sketchJson = JSON.stringify({
    palette: { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' },
    fonts: { display: 'anton', text: 'manrope' }, scale: 'm',
    blocks: [
      { id: 'h', type: 'hero', variant: 'photo-right', headline: 'Algo dulce', sub: '', cta: 'Ver', bg: 'paper', size: 'l' },
      { id: 'c', type: 'catalog', kicker: '', title: 'Productos', bg: 'pop', size: 'm' },
      { id: 'z', type: 'footer', tagline: '', wordmark: 'giant', bg: 'deep', size: 'l' },
    ],
  });
  const sketchResponse = () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 300 }, output: [{ content: [{ type: 'output_text', text: sketchJson }] }] }));
  const newStore = (projects: any) => { projects.current.mockResolvedValue({ revision: 0, slug: 'pausa' }); };

  it('builds a brand-new store from one sketch call, saving the assembled files and sketch.json', async () => {
    const { service, projects, brief } = await setup();
    newStore(projects);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sketchResponse());
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const saved = projects.save.mock.calls[0][2];
    expect(saved.files.find((f: any) => f.path === 'components/home.tsx').content).toContain('skb-hero');
    expect(saved.files.find((f: any) => f.path === 'sketch.json')).toBeDefined();
    expect(saved.label).toContain('Boceto');
  });
  it('still saves a default sketch when the provider fails', async () => {
    const { service, projects, brief } = await setup();
    newStore(projects);
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    const home = projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'components/home.tsx').content;
    expect(home).toContain('data-pagosya-catalog');
    expect(home).toContain('skb-footer');
  });
  it('a Claude pick still sketches through the OpenAI companion model (F1)', async () => {
    const { service, projects, brief } = await setup();
    newStore(projects);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sketchResponse());
    await service.generate('m', 's', { ...input(brief), revision: 0, model: 'claude-sonnet-5' }, new SourceRequestBudget(50));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).model).toMatch(/^gpt-/);
    expect(projects.save).toHaveBeenCalled();
  });
  it('YAPI_SKETCH_FIRST=off keeps the agent path for new stores (F8)', async () => {
    const { service, projects, brief } = await setup('agent', { 'app.yapiSketchFirst': false });
    newStore(projects);
    jest.spyOn((service as any).designPlanner, 'explore').mockRejectedValue(new Error('planner-reached'));
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sketchResponse());
    await expect(service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50))).rejects.toThrow('planner-reached');
  });
  it('a single-engine new store keeps its design planner (F2)', async () => {
    const { service, projects, brief } = await setup('single');
    newStore(projects);
    jest.spyOn((service as any).designPlanner, 'explore').mockRejectedValue(new Error('planner-reached'));
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sketchResponse());
    await expect(service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50))).rejects.toThrow('planner-reached');
  });
  it('a failed budget reserve still saves the default sketch (F8)', async () => {
    const { service, projects, brief } = await setup();
    newStore(projects);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sketchResponse());
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(projects.save).toHaveBeenCalled();
  });
  it('a garbage response is a FAILED, metered attempt that still saves (F4)', async () => {
    const { service, projects, prisma, brief } = await setup();
    newStore(projects);
    const metering = { record: jest.fn() };
    const stores = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Pausa', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
    const rebuilt = new (service.constructor as any)(prisma, stores, projects, { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') }, (service as any).config, undefined, metering);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 500, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: 'not json' }] }] })));
    const result: any = await rebuilt.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    const attempt = result.generation.attempts.find((a: any) => a.phase === 'sketch');
    expect(attempt.status).toBe('FAILED');
    expect(attempt.responseStatus).toBe('completed');
    expect(metering.record).toHaveBeenCalled();
    expect(result.generation.autoRepairs.join(' ')).toContain('boceto base');
  });
  it('an existing store keeps the agent loop', async () => {
    const { service, projects, brief } = await setup();
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Listo.', sections: [] }]]));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).tools).toBeDefined();
    expect(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'sketch.json')).toBeUndefined();
  });
});
