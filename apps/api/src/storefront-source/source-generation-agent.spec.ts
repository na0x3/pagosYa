import { completeStructuredFixture } from './fixtures/structured-response';
import { SKETCH_JSON_SCHEMA } from './sketch/sketch-request';
import { DESIGN_FIXTURES } from './design-engine/design-fixtures';
import { inferBrand, fallbackCreative } from './design-engine/design-engine';
import { sketchFreeablePaths } from '@pagosya/shared-types';
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { repairSketch } from './sketch';
import { fillsProductPagesAfterSave, SourceGenerationService } from './source-generation.service';
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
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config), projects, prisma, stores, brief: base.brief };
}
let callId = 0;
const plan = ['plan_task', { requirements: [{ id: 'r1', description: 'La página solicitada tiene contenido visible', page: 'index.html', check: 'element', selector: 'h1', expected: '1' }] }] as [string, object];
const turn = (calls: Array<[string, object]>) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 3000, output_tokens: 200 }, output: (calls.some(([name]) => ['edit_file','set_product_card_theme'].includes(name)) ? [plan, ...calls] : calls).map(([name, args]) => ({ type: 'function_call', call_id: `c${callId++}`, name, arguments: JSON.stringify(name === 'finish' ? { ...args, status: 'completed', remaining: [] } : args) })) }));
// A category exists only in `data.categories`, never on an item, so its name reaching a prompt proves the second
// argument of catalogueDigest was passed: an optional parameter the compiler cannot make anyone supply.
const cheeseStore = { storeName: 'Pausa', checkoutMode: 'PAYMENT', locations: [], categories: [{ id: 'cat-q', name: 'Quesería Artesanal' }], items: [{ id: 'p1', name: 'Queso de cabra', amount: 4500, currency: 'BOB', categoryId: 'cat-q', imageUrls: [], variants: [] }] };
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
  it('writes a policy YAPI rewrote to Ajustes when the run saves, merged with what Ajustes has now, and into the saved config', async () => {
    jest.spyOn(compositionReview, 'reviewSourceComposition').mockRejectedValue(new Error('Local edits must not spend a composition review'));
    const { service, projects, prisma, brief } = await setup();
    prisma.store = { ...(prisma.store || {}), findUnique: jest.fn().mockResolvedValue({ policies: { delivery: 'Envíos en 48 h.', returns: 'Antes.' } }), update: jest.fn().mockResolvedValue({}) };
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([plan, ['set_store_policy', { kind: 'returns', text: 'Cambios en 7 días con la boleta.' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Actualicé la política de cambios.', sections: ['Cambios y devoluciones'] }]]));
    await service.generate('m', 's', { ...input(brief), instruction: 'Cambia la política de devoluciones: 7 días con boleta' }, new SourceRequestBudget(50));
    const policies = { delivery: 'Envíos en 48 h.', returns: 'Cambios en 7 días con la boleta.' };
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: 's' }, data: { policies } });
    const config = projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'config.js').content;
    expect(JSON.parse(config.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, '')).data.policies).toEqual(policies);
  });
  it('does not rewrite product pages after a small edit, and fills them after a new store or a redesign', async () => {
    expect(fillsProductPagesAfterSave(false, false)).toBe(false);
    expect(fillsProductPagesAfterSave(true, false)).toBe(true);
    expect(fillsProductPagesAfterSave(false, true)).toBe(true);
    jest.spyOn(compositionReview, 'reviewSourceComposition').mockRejectedValue(new Error('Local edits must not spend a composition review'));
    const { service, brief } = await setup();
    const pageWriter = { fillStore: jest.fn(() => new Promise(() => {})) };
    (service as any).pageWriter = pageWriter;
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Cambié el título.', sections: ['Portada'] }]]));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50));
    expect(pageWriter.fillStore).not.toHaveBeenCalled();
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

  // 2026-10-08, store "excess": after the merchant chatted, the request key no longer matched and the next message rebuilt the template.
  it('finishes the preserved draft on "Guardar borrador" even when the request no longer matches it', async () => {
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
    prisma.storeSourceGeneration.findFirst.mockResolvedValue({ checkpoint });
    const moved = { ...request, instruction: 'Rediseña toda la tienda desde cero, versión final' };
    await expect(service.generate('m', 's', moved, new SourceRequestBudget(200), [], undefined, { resumeDraft: true })).rejects.toThrow('Falta verificar');
    expect(planner).toHaveBeenCalledTimes(1);
  });

  it('keeps the single engine when the switch says single', async () => {
    const { service, projects, brief } = await setup('single');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [] })));
    await service.generate('m', 's', input(brief), new SourceRequestBudget(50)).catch(() => undefined);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).tools).toBeUndefined();
    expect(projects.save).not.toHaveBeenCalled();
  });
});

describe('sketch-first design orchestration', () => {
  afterEach(() => jest.restoreAllMocks());
  const rawSketch = completeStructuredFixture({
    palette: { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' }, fonts: { display: 'anton', text: 'manrope' }, scale: 'm',
    blocks: [{ id: 's1', type: 'hero', variant: 'photo-right', headline: 'Algo dulce', cta: 'Ver', bg: 'paper', size: 'l' }, { id: 's2', type: 'catalog', title: 'Productos', bg: 'pop', size: 'm' }, { id: 's3', type: 'footer', wordmark: 'giant', bg: 'deep', size: 'm' }],
  }, SKETCH_JSON_SCHEMA);
  const response = (payload: unknown) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 300 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }));
  const direction = inferBrand(DESIGN_FIXTURES[0].input);
  const creative = { ...fallbackCreative(DESIGN_FIXTURES[0].input, direction), sections: [{ type: 'hero', composition: 'statement', intent: 'Introduce' }, { type: 'catalog', composition: 'rail', intent: 'Shop the catalog' }, { type: 'footer', composition: 'statement', intent: 'Navigate' }] };
  const mockPipeline = (overrides: Record<string, unknown | (() => Response)> = {}) => jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, request) => {
    const name = JSON.parse(String(request?.body)).text?.format?.name;
    const payload = name in overrides ? overrides[name] : { website_brand: direction, website_creative: creative, store_sketch: rawSketch, website_critic: { summary: 'Coherent', patches: [] } }[name as string];
    if (typeof payload === 'function') return payload();
    if (payload === undefined) throw new Error('Provider unavailable');
    return response(payload);
  });
  const fresh = (projects: any) => projects.current.mockResolvedValue({ revision: 0, slug: 'pausa' });
  const savedSketch = (projects: any) => JSON.parse(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'sketch.json').content);

  it('separates brand, creative planning, boceto and critic before deterministic rendering', async () => {
    const { service, projects, brief } = await setup(); fresh(projects);
    const fetchMock = mockPipeline();
    const result = await service.generate('m', 's', { ...input(brief), revision: 0, designSeed: 'seed-1' }, new SourceRequestBudget(50));
    expect(fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).text.format.name)).toEqual(['website_brand', 'website_creative', 'store_sketch', 'website_critic']);
    const sketch = savedSketch(projects);
    expect(sketch.design.designSeed).toBe('seed-1'); expect(sketch.design.brand).toEqual(direction);
    expect(sketch.blocks.find((b: any) => b.type === 'catalog').composition).toBe('rail');
    expect(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'website-design.json')).toBeDefined();
    expect(result.generation.attempts.every(a => a.status === 'COMPLETED')).toBe(true);
  });
  it('applies only bounded critic layout fixes while preserving copy', async () => {
    const { service, projects, brief } = await setup(); fresh(projects);
    mockPipeline({ website_critic: { summary: 'A more spacious opening', patches: [{ sectionId: 's1', composition: 'poster', width: 'wide', alignment: 'start', size: 'xl', reason: 'Hierarchy' }] } });
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(savedSketch(projects).blocks[0]).toMatchObject({ headline: 'Algo dulce', composition: 'poster', size: 'xl' });
  });
  it('schema-retries invalid brand output once and retains a valid draft', async () => {
    const { service, projects, brief } = await setup(); fresh(projects);
    const fetchMock = mockPipeline({ website_brand: {} });
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(fetchMock.mock.calls.filter(call => JSON.parse(String(call[1]?.body)).text.format.name === 'website_brand')).toHaveLength(2);
    expect(savedSketch(projects).design.generation.mode).toBe('fallback');
  });
  it('does one critic pass even when its structured response is invalid', async () => {
    const { service, projects, brief } = await setup(); fresh(projects);
    const fetchMock = mockPipeline({ website_critic: { patches: 'invalid' } });
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(fetchMock.mock.calls.filter(call => JSON.parse(String(call[1]?.body)).text.format.name === 'website_critic')).toHaveLength(1);
    expect(savedSketch(projects).blocks.find((b: any) => b.type === 'catalog')).toBeDefined();
  });
  it('keeps default generation in registered compositions without free-positioning copy', async () => {
    const { service, projects, brief } = await setup(); fresh(projects);
    const fetchMock = mockPipeline();
    const result = await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(savedSketch(projects).blocks.every((b: any) => !b.free)).toBe(true);
    expect(savedSketch(projects).blocks.every((b: any) => !b.extras?.length)).toBe(true);
    expect(result.generation.attempts.some(a => a.phase === 'composition')).toBe(false);
    expect(fetchMock.mock.calls).toHaveLength(4);
  });
  it('does not call composition or critic after invalid boceto output', async () => {
    const { service, projects, brief } = await setup(); fresh(projects);
    const fetchMock = mockPipeline({ store_sketch: { blocks: 'invalid' } });
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(savedSketch(projects).blocks.some((b: any) => b.type === 'catalog')).toBe(true);
  });
  it('fails provider stages honestly but still assembles a recoverable default draft', async () => {
    const { service, projects, brief } = await setup(); fresh(projects);
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));
    const result = await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(savedSketch(projects).design.generation.mode).toBe('fallback');
    expect(result.generation.attempts.every(a => a.status === 'FAILED')).toBe(true);
    expect(result.generation.credits).toBe(0);
  });
  it('carries catalog categories and product facts into brand and boceto planning', async () => {
    const { service, projects, stores, brief } = await setup(); fresh(projects); stores.getStorePublic.mockResolvedValue(cheeseStore);
    const fetchMock = mockPipeline();
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('Quesería Artesanal');
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain('Queso de cabra');
    expect(savedSketch(projects).blocks.find((b: any) => b.type === 'catalog').productRefs).toEqual(['p1']);
  });
  it('a Claude choice keeps the companion structured provider', async () => {
    const { service, projects, brief } = await setup(); fresh(projects); const fetchMock = mockPipeline();
    await service.generate('m', 's', { ...input(brief), revision: 0, model: 'claude-sonnet-5' }, new SourceRequestBudget(50));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('gpt-5.6-terra');
  });
  it('keeps the explicit sketch opt-out and existing-source paths', async () => {
    const { service, projects, brief } = await setup('agent', { 'app.yapiSketchFirst': false }); fresh(projects);
    const planner = jest.spyOn((service as any).designPlanner, 'explore').mockRejectedValue(new Error('planner-reached'));
    await expect(service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50))).rejects.toThrow('planner-reached');
    expect(planner).toHaveBeenCalled();
  });
});

describe('chat-on-sketch edits', () => {
  afterEach(() => jest.restoreAllMocks());
  const bornSketch = {
    palette: { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' },
    fonts: { display: 'anton', text: 'manrope' }, scale: 'm',
    blocks: [
      { id: 'h', type: 'hero', variant: 'photo-right', headline: 'Algo dulce', sub: '', cta: 'Ver', badge: '', note: '', sticker: '', bg: 'paper', size: 'l' },
      { id: 'c', type: 'catalog', kicker: '', title: 'Productos', bg: 'pop', size: 'm' },
      { id: 'z', type: 'footer', tagline: '', wordmark: 'giant', bg: 'deep', size: 'l' },
    ],
  };
  const sketchBorn = async (engine = 'agent') => {
    const context = await setup(engine);
    const snapshot = (await context.projects.version()).snapshot;
    context.projects.version.mockResolvedValue({ revision: 1, snapshot: { ...snapshot, files: [...snapshot.files, { path: 'sketch.json', content: JSON.stringify(bornSketch) }] } });
    return context;
  };
  const editedResponse = () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 800, output_tokens: 200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(completeStructuredFixture({ ...bornSketch, blocks: bornSketch.blocks.map(b => (b.id === 'h' ? { ...b, headline: 'Titular juguetón' } : b)) }, SKETCH_JSON_SCHEMA)) }] }] }));

  it('an ordinary edit updates the sketch with one small call, no agent loop', async () => {
    const { service, projects, brief } = await sketchBorn();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => editedResponse());
    await service.generate('m', 's', { ...input(brief), instruction: 'haz el titular más juguetón' }, new SourceRequestBudget(50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).tools).toBeUndefined();
    const saved = projects.save.mock.calls[0][2];
    expect(saved.files.find((f: any) => f.path === 'sketch.json').content).toContain('Titular juguetón');
    expect(saved.files.find((f: any) => f.path === 'components/home.tsx').content).toContain(JSON.stringify('Titular juguetón'));
  });
  // Review Focus 5: the merchant's first chat message must not flatten the page YAPI composed, and an edit
  // must not pay for a composition call of its own.
  it('a chat edit makes no composition call and keeps the spots it inherited', async () => {
    const path = sketchFreeablePaths(repairSketch(JSON.parse(JSON.stringify(bornSketch)), { storeName: 'pausa', purpose: 'shop', photos: [] }).sketch.blocks.find(b => b.id === 'h')!)[0];
    const composed = { ...bornSketch, blocks: bornSketch.blocks.map(b => (b.id === 'h' ? { ...b, free: { [path]: { x: 55, y: 30, w: 46 } } } : b)) };
    const context = await setup('agent');
    const snapshot = (await context.projects.version()).snapshot;
    context.projects.version.mockResolvedValue({ revision: 1, snapshot: { ...snapshot, files: [...snapshot.files, { path: 'sketch.json', content: JSON.stringify(composed) }] } });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => editedResponse());
    await context.service.generate('m', 's', { ...input(context.brief), instruction: 'haz el titular más juguetón' }, new SourceRequestBudget(50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(context.projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'sketch.json').content);
    expect(saved.blocks.find((b: any) => b.id === 'h').free).toEqual({ [path]: { x: 55, y: 30, w: 46 } });
  });
  it('hands the catalogue digest, categories included, to the chat-edit prompt', async () => {
    const { service, stores, brief } = await sketchBorn();
    stores.getStorePublic.mockResolvedValue(cheeseStore);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => editedResponse());
    await service.generate('m', 's', { ...input(brief), instruction: 'haz el titular más juguetón' }, new SourceRequestBudget(50));
    const prompt = JSON.parse((fetchMock.mock.calls[0] as any)[1].body).input[0].content[0].text;
    expect(prompt).toContain('Quesería Artesanal');
    expect(prompt).toContain('Queso de cabra');
  });
  it('a garbage reply keeps the previous revision and reports a retryable failure', async () => {
    const { service, projects, brief } = await sketchBorn();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'nope' }] }] })));
    await expect(service.generate('m', 's', { ...input(brief), instruction: 'haz el titular más juguetón' }, new SourceRequestBudget(50))).rejects.toThrow(/sigue (igual|guardada)/);
    expect(projects.save).not.toHaveBeenCalled();
  });
  it('a redesign request gets a fresh sketch, not an edit', async () => {
    const { service, projects, brief } = await sketchBorn();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => editedResponse());
    await service.generate('m', 's', { ...input(brief), instruction: 'Rediseña toda la tienda desde cero' }, new SourceRequestBudget(200));
    const body = String((fetchMock.mock.calls[0] as any)[1].body);
    expect(body).toContain('Analyze the merchant');
    expect(body).not.toContain('Boceto actual');
    expect(projects.save).toHaveBeenCalled();
  });
});

// Spec 2026-10-08-store-built-in-account-pages: the account pages' theme is saved and carried over like the store's other choices.
describe('account pages theme', () => {
  it('saves what YAPI chose as config.accountTheme and keeps it through a later edit', async () => {
    const { service, projects, brief } = await setup();
    const request = { ...input(brief), instruction: 'Cambia el título principal a "Tu calma" y haz el login con un panel' };
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Un respiro', replacement: 'Tu calma' }], ['set_account_theme', { layout: 'panel', photo: null, css: null }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Cambié el título y la cuenta.', sections: ['Portada'] }]]));
    await service.generate('m', 's', request, new SourceRequestBudget(50));
    const config = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, ''));
    expect(config(projects.save.mock.calls[0]).accountTheme).toEqual({ layout: 'panel' });
    // The next run starts from what was saved and does not touch the account pages.
    const saved = projects.save.mock.calls[0][2];
    projects.current.mockResolvedValue({ revision: 2, slug: 's' });
    projects.version.mockResolvedValue({ snapshot: { brief: saved.brief, files: saved.files } });
    jest.restoreAllMocks();
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(turn([['edit_file', { path: 'components/home.tsx', search: 'Tu calma', replacement: 'Tu pausa' }]]))
      .mockResolvedValueOnce(turn([['verify', {}]]))
      .mockResolvedValueOnce(turn([['finish', { summary: 'Cambié el título.', sections: ['Portada'] }]]));
    await service.generate('m', 's', { ...input(brief), revision: 2 }, new SourceRequestBudget(50));
    expect(config(projects.save.mock.calls[1]).accountTheme).toEqual({ layout: 'panel' });
  });
});
