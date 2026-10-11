// "Elige tu estilo" (spec 2026-10-11): proposal mode of a real generate() run, planner and hero writer mocked.
jest.setTimeout(60_000);

import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import * as styleHero from './design-engine/style-hero';
import * as styleDrawsModule from './design-engine/style-draws';
import { Logger } from '@nestjs/common';
import { SourceGenerationService } from './source-generation.service';
import * as styleDesignModule from './source-style-design';
import { validateStyleDesign } from './source-style-design';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';
import { styleProposalView, type StyleProposal } from './source-style-proposal';
import { heroFontFaces, sanitizeHeroHtml } from './design-engine/style-hero';

// Pixel sampling launches Chromium; unit tests exercise what the service does with a sample, not the decoder.
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna(),
  cardName: `${name} de barrio`, vibe: `${name} vibe paragraph.`, inspiration: ['El tostado de cada mañana', 'La esquina de la plaza', 'Tazas de cerámica local'] });
const modes = ['calm', 'calm', 'bold', 'bold'] as Array<'calm' | 'bold'>;
/** A planner result whose concepts carry the cards of exactly these slots. */
const designWith = (slots: number[]): designModule.SourceDesign => {
  const { design } = validateStyleDesign({ concepts: ['Menu', 'Window', 'Counter', 'Studio'].map(concept), selection: { index: 0, rationale: 'r' } }, modes, { narrative: true });
  return { ...design, selected: 0, concepts: design.concepts.filter(c => slots.includes(c.card!.slot)) };
};
const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(name => { const { cardName, vibe, inspiration, ...rest } = concept(name); return rest; }), selected: 0 }, 0, true, true);
const files = () => [
  { path: 'index.html', content: '<!doctype html><main><section id="menu"><h1>Menú</h1><div data-pagosya-catalog></div></section></main><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script>' },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
/** Deterministic draws, so slot 3 is always bold with the same palette. */
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const dto = { revision: 0, brief: { businessType: 'Cafetería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Menú primero' }, instruction: 'Crea la tienda de mi cafetería', assetUrls: [] } as any;

/** What a finished proposal saved on the run: four concepts, four drawn slots and a hero per card (bundle paths). */
const savedProposal = (): StyleProposal => {
  const slots = styleDrawsModule.styleDraws({ kind: 'cafe-food', brandColours: false, category: 'cafe', previous: [], recent: [], available: { photos: 0, products: 0, facts: false }, request: dto.instruction, random: seeded(7) })
    .map(slot => ({ ...slot, playbook: `PLAYBOOK slot ${slot.slot}` }));
  return { version: 1, status: 'AWAITING_STYLE', slots, design: designWith([0, 1, 2, 3]), assetMap: [],
    heroes: [0, 1, 2, 3].map(i => ({ html: `<header data-store-name>Café ${i}</header><section class="hero-${i}"><h1>Tarjeta ${i}</h1></section>`, source: 'model' as const })),
    request: { dto, imageUses: [], redesign: false }, createdAt: '2026-10-11T00:00:00.000Z' };
};

/** One lane's planner answer: the concept of that slot only, its card on the slot. */
const laneDesign = (slot: number) => designWith([slot]);
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
/** Waits (on real macrotask turns) until the service has reached a state. */
const until = async (check: () => boolean) => { for (let i = 0; i < 500 && !check(); i++) await new Promise(resolve => setImmediate(resolve)); expect(check()).toBe(true); };

function setup() {
  const prisma: any = { storeRetention: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceGeneration: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) }, store: { findFirst: jest.fn().mockResolvedValue({ slug: 'cafe' }), findUnique: jest.fn().mockResolvedValue(null) }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) } };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = { prepare: jest.fn(async value => sourceProjectSnapshot(value)), current: jest.fn().mockResolvedValue({ revision: 0, slug: 'cafe' }), save: jest.fn().mockImplementation(async (_m, _s, value) => ({ revision: 1, snapshot: sourceProjectSnapshot(value) })), version: jest.fn(), recentFrameDraws: jest.fn().mockResolvedValue([]), recentDesignFingerprints: jest.fn().mockResolvedValue([]), recentCompositionFingerprints: jest.fn().mockResolvedValue([]) };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static',
    'app.yapiStylePick': true, 'app.sep5Author': true, 'app.yapiPlaybook': true, 'app.yapiFrameDraw': true, 'app.yapiDesignDraw': true }));
  const config: any = { get: jest.fn((key: string) => values.get(key)), set: (key: string, value: unknown) => values.set(key, value) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, projects, config, metering };
}

describe('style proposal mode', () => {
  let service: SourceGenerationService, prisma: any, projects: any, config: any, metering: any;
  let explore: jest.SpyInstance, writeStyleHero: jest.SpyInstance, fetchMock: jest.SpyInstance, draws: jest.SpyInstance;
  let budget: SourceRequestBudget;
  const progress = jest.fn(async () => undefined);
  /** The Sep-5 author prompt of this run, if the author was called. */
  const authorPrompt = (): string | undefined => {
    const call = fetchMock.mock.calls.map(c => JSON.parse(c[1].body as string)).find(body => body.text?.format?.name === 'independent_storefront');
    return call?.input[0].content[0].text;
  };
  beforeEach(() => {
    ({ service, prisma, projects, config, metering } = setup());
    progress.mockClear();
    budget = new SourceRequestBudget(25);
    explore = jest.spyOn(SourceDesignPlanner.prototype, 'explore');
    draws = jest.spyOn(styleDrawsModule, 'styleDraws');
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    writeStyleHero = jest.spyOn(styleHero, 'writeStyleHero').mockResolvedValue({ html: '<header data-store-name>x</header>', source: 'model' });
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ label: 'Café', files: files(), products: [] }) }] }] })));
  });
  afterEach(() => jest.restoreAllMocks());
  /** Every proposal the run saved, in order (each save writes a fresh value). */
  const proposals = (): StyleProposal[] => prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => 'proposal' in c.data).map((c: any) => c.data.proposal);
  const finalWrite = () => prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.data.status === 'AWAITING_STYLE');
  /** Each lane's planner call answers with its own slot's concept; `fail` lanes throw. */
  const lanes = (fail: number[] = [], change: (slot: number, design: designModule.SourceDesign) => designModule.SourceDesign = (_slot, design) => design) => explore.mockImplementation(async (args: any) => {
    if (!args.styleSlots) return threeConceptDesign;
    const slot = args.styleSlots[0].slot;
    if (fail.includes(slot)) throw new Error('lane failed');
    return change(slot, laneDesign(slot));
  });
  /** The files of the one saved revision. */
  const savedFiles = (): Array<{ path: string; content: string }> => projects.save.mock.calls[0][2].files;

  it('makes a proposal instead of building: one planner lane per slot, a hero per concept, row left awaiting the pick', async () => {
    lanes();
    const result = await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect(result).toEqual({ styleProposal: { generationId: expect.any(String), cards: 4 } });
    const calls = explore.mock.calls.map(c => c[0]);
    expect(calls.map(call => call.styleSlots.map((slot: { slot: number; mode: string }) => [slot.slot, slot.mode]))).toEqual([[[0, 'calm']], [[1, 'calm']], [[2, 'bold']], [[3, 'bold']]]);
    expect(calls.every(call => call.styleSlots[0].direction.includes(`CONCEPT ${call.styleSlots[0].slot + 1} of 4`))).toBe(true);
    expect(JSON.parse(calls[0].context).designDraw).toBeUndefined();
    expect(writeStyleHero).toHaveBeenCalledTimes(4);
    expect(writeStyleHero.mock.calls.map(c => [c[0].facts.storeName, c[0].facts.mode])).toEqual([['Café', 'calm'], ['Café', 'calm'], ['Café', 'bold'], ['Café', 'bold']]);
    await writeStyleHero.mock.calls[0][0].record({ usage: null }, { model: 'gpt-5.6-luna', durationMs: 7, status: 'COMPLETED' });
    expect(metering.record).toHaveBeenCalledWith('s1', 'source-style-hero', 'gpt-5.6-luna', { usage: null }, 7, 'COMPLETED');
    const final = finalWrite();
    expect(final.data).toMatchObject({ activeStoreId: null, proposal: expect.objectContaining({ version: 1, status: 'AWAITING_STYLE' }) });
    expect(progress).toHaveBeenCalledWith('styles');
    expect(authorPrompt()).toBeUndefined();
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('saves the palette each hero was drawn with, also for a slot without one', async () => {
    draws.mockRestore();
    const real = styleDrawsModule.styleDraws;
    draws = jest.spyOn(styleDrawsModule, 'styleDraws').mockImplementation((input: any) => real(input).map((slot: any) => (slot.slot === 1 ? { ...slot, palette: undefined } : slot)));
    lanes();
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    const final = prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).find((c: any) => c.data.status === 'AWAITING_STYLE');
    const saved: StyleProposal = final.data.proposal;
    expect(saved.heroPalettes).toEqual(writeStyleHero.mock.calls.map(c => c[0].facts.palette));
    expect(saved.heroPalettes![1]).toEqual({ paper: '#ffffff', ink: '#111111', accent: '#111111', accent2: '#f2f2f2' });
    expect(saved.heroPalettes![0]).toMatchObject({ paper: saved.slots[0].palette!.paper });
  });

  /** A model hero drawn in the fonts it was given, like the real writer. */
  const fontHero = async (args: any) => ({ html: `<style>${heroFontFaces(args.facts.fonts)}</style><header data-store-name>hero ${args.concept.card.slot}</header>`, source: 'model' as const });
  /** Each saved card's hero, font line and DNA name the same display font. */
  const fontsAgree = (proposal: StyleProposal) => {
    const view = styleProposalView('run-1', proposal);
    proposal.design!.concepts.forEach((concept, i) => {
      expect(view.cards[i].fonts.display).toBe(concept.dna!.type.display);
      expect(proposal.heroes[i]!.html).toContain(`assets/${concept.dna!.type.display}.ttf`);
    });
  };
  const boldHeroFonts = () => Object.fromEntries(writeStyleHero.mock.calls.filter(c => c[0].facts.mode === 'bold').map(c => [c[0].concept.card.slot, c[0].facts.fonts.display]));

  it('gives the two bold cards different display fonts before their heroes are drawn: the second to plan takes the first catalogue display font no card uses', async () => {
    lanes();
    writeStyleHero.mockImplementation(fontHero);
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    // Every planned concept used Fraunces + Instrument; Bricolage is the first unused display/both font in the catalogue.
    expect(boldHeroFonts()).toEqual({ 2: 'fraunces', 3: 'bricolage' });
    const final: StyleProposal = finalWrite().data.proposal;
    expect(final.design!.concepts.map(c => c.dna!.type.display)).toEqual(['fraunces', 'fraunces', 'fraunces', 'bricolage']);
    expect(final.heroes.map(hero => hero!.source)).toEqual(['model', 'model', 'model', 'model']);
    fontsAgree(final);
  });

  it('moves the bold lane that plans second, whichever slot it is, and every save agrees on the fonts', async () => {
    const planned = [0, 1, 2, 3].map(() => deferred<designModule.SourceDesign>());
    explore.mockImplementation((args: any) => planned[args.styleSlots[0].slot].promise);
    writeStyleHero.mockImplementation(fontHero);
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    await until(() => explore.mock.calls.length === 4);
    planned[3].resolve(laneDesign(3));
    await until(() => writeStyleHero.mock.calls.length === 1);
    [0, 1, 2].forEach(slot => planned[slot].resolve(laneDesign(slot)));
    await run;
    expect(boldHeroFonts()).toEqual({ 3: 'fraunces', 2: 'bricolage' });
    proposals().forEach(fontsAgree);
    expect(finalWrite().data.proposal.design.concepts.map((c: any) => c.dna.type.display)).toEqual(['fraunces', 'fraunces', 'bricolage', 'fraunces']);
  });

  it('backstop: a font changed after every lane planned stops that card\'s model hero and keeps its template hero in the new font', async () => {
    const real = styleDesignModule.distinctBoldDisplays;
    jest.spyOn(styleDesignModule, 'distinctBoldDisplays').mockImplementation(design => {
      const out = real(design);
      return { ...out, concepts: out.concepts.map(c => c.card!.slot === 3 ? { ...c, dna: { ...c.dna!, type: { ...c.dna!.type, display: 'outfit' } } } : c) };
    });
    const planned = [0, 1, 2, 3].map(() => deferred<designModule.SourceDesign>());
    explore.mockImplementation((args: any) => planned[args.styleSlots[0].slot].promise);
    writeStyleHero.mockImplementation((args: any) => args.concept.card.slot === 3 ? new Promise((_ok, fail) => args.signal.addEventListener('abort', () => fail(args.signal.reason))) : fontHero(args));
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    await until(() => explore.mock.calls.length === 4);
    planned[3].resolve(laneDesign(3));
    await until(() => writeStyleHero.mock.calls.length === 1);
    [0, 1, 2].forEach(slot => planned[slot].resolve(laneDesign(slot)));
    await run;
    expect(writeStyleHero.mock.calls.find(c => c[0].concept.card.slot === 3)![0].signal.aborted).toBe(true);
    const final: StyleProposal = finalWrite().data.proposal;
    expect(final.design!.concepts[3].dna!.type.display).toBe('outfit');
    expect(final.heroes[3]).toMatchObject({ source: 'template', html: expect.stringContaining('assets/outfit.ttf') });
    expect(final.heroPending).toEqual([false, false, false, false]);
    fontsAgree(final);
  });

  it('clears every pending flag in the final save, also for a card whose lane broke before its hero landed', async () => {
    lanes();
    writeStyleHero.mockImplementation(async (args: any) => { if (args.concept.card.slot === 1) throw new Error('lane broke'); return fontHero(args); });
    expect(await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true })).toEqual({ styleProposal: { generationId: 'run-1', cards: 4 } });
    expect(proposals().some(p => p.heroPending?.[1] === true)).toBe(true);
    const final: StyleProposal = finalWrite().data.proposal;
    expect(final.heroPending).toEqual([false, false, false, false]);
    expect(final.heroes[1]!.source).toBe('template');
  });

  it('throws and leaves no proposal awaiting when the run lost its row before the proposal finished', async () => {
    lanes();
    // The stale sweep marked the row INTERRUPTED: every RUNNING-guarded write after the start matches nothing.
    prisma.storeSourceGeneration.updateMany.mockImplementation(async (args: any) => ({ count: args.data.status === 'AWAITING_STYLE' ? 0 : 1 }));
    await expect(service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true })).rejects.toThrow();
    const awaiting = prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => c.data.status === 'AWAITING_STYLE');
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].where).toEqual({ id: 'run-1', status: 'RUNNING', activeStoreId: 's1' });
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('guards every proposal write on a running row', async () => {
    lanes();
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    const writes = prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => 'proposal' in c.data);
    // Each lane saves its card with the template hero, then with the model hero; one save after every lane has its
    // concept (dedupe, recommendation), and the final AWAITING_STYLE save.
    expect(writes.length).toBe(10);
    expect(writes.every((c: any) => c.where.activeStoreId === 's1')).toBe(true);
    expect(writes.every((c: any) => c.where.status === 'RUNNING' && c.where.id === 'run-1')).toBe(true);
  });

  it('builds directly with the only card the lanes kept, on its own drawn slot, and retires the shown card', async () => {
    const planned = [0, 1, 2, 3].map(() => deferred<designModule.SourceDesign>());
    explore.mockImplementation((args: any) => args.styleSlots ? planned[args.styleSlots[0].slot].promise : Promise.resolve(threeConceptDesign));
    // The kept card's model hero is still being written when the other lanes fail: the build does not wait for it.
    writeStyleHero.mockImplementation((args: any) => new Promise((_ok, fail) => args.signal.addEventListener('abort', () => fail(args.signal.reason))));
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    await until(() => explore.mock.calls.length === 4);
    planned[2].resolve(laneDesign(2));
    await until(() => writeStyleHero.mock.calls.length === 1);
    [0, 1, 3].forEach(slot => planned[slot].reject(new Error('lane failed')));
    const result = await run;
    expect('styleProposal' in result).toBe(false);
    expect(writeStyleHero.mock.calls[0][0].signal.aborted).toBe(true);
    expect(authorPrompt()).toContain('BOLD BY DEFAULT');
    expect(explore).toHaveBeenCalledTimes(4);
    expect(proposals().at(-1)!.status).toBe('SUPERSEDED');
    expect(finalWrite()).toBeUndefined();
    expect(projects.save).toHaveBeenCalledTimes(1);
    const drawn = draws.mock.results[0].value[2].file;
    expect(projects.save.mock.calls[0][2].files).toContainEqual(drawn);
  });

  it('falls back to today when the style planner fails, and reports that styles were attempted', async () => {
    lanes([0, 1, 2, 3]);
    const result = await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect('styleProposal' in result).toBe(false);
    expect(explore).toHaveBeenCalledTimes(5);
    expect(explore.mock.calls[4][0].styleSlots).toBeUndefined();
    expect(writeStyleHero).not.toHaveBeenCalled();
    expect(proposals()).toEqual([]);
    expect((result as any).generation.styleAttempted).toBe(true);
  });

  it('runs the four lanes at once: the second lane plans while the first lane\'s hero is still being written', async () => {
    const planned = [0, 1, 2, 3].map(() => deferred<designModule.SourceDesign>());
    explore.mockImplementation((args: any) => planned[args.styleSlots[0].slot].promise);
    const heroes = [0, 1, 2, 3].map(() => deferred<{ html: string; source: 'model' }>());
    writeStyleHero.mockImplementation((args: any) => heroes[args.concept.card.slot].promise);
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    await until(() => explore.mock.calls.length >= 1);
    planned[0].resolve(laneDesign(0));
    await until(() => writeStyleHero.mock.calls.length === 1);
    // Lane 0's hero has not finished, and every other lane's planner call is already out.
    expect(explore.mock.calls.map(c => c[0].styleSlots[0].slot)).toEqual([0, 1, 2, 3]);
    // The card is on screen already, with the template hero, marked pending.
    await until(() => proposals().length >= 1);
    const first = proposals().at(-1)!;
    expect(first.status).toBe('RUNNING');
    expect(first.design!.concepts.map(c => c.card!.slot)).toEqual([0]);
    expect(first.heroes[0]!.source).toBe('template');
    expect(sanitizeHeroHtml(first.heroes[0]!.html)).not.toBeNull();
    expect(first.heroes[0]!.html).toContain('Café');
    expect(first.heroPending).toEqual([true]);
    expect(styleProposalView('run-1', first).cards[0]).toMatchObject({ slot: 0, pending: true, source: 'template' });
    heroes[0].resolve({ html: '<header data-store-name>modelo 0</header>', source: 'model' });
    await until(() => proposals().at(-1)!.heroes[0]?.source === 'model');
    expect(proposals().at(-1)!.heroPending).toEqual([false]);
    [1, 2, 3].forEach(slot => { planned[slot].resolve(laneDesign(slot)); heroes[slot].resolve({ html: `<header data-store-name>modelo ${slot}</header>`, source: 'model' }); });
    expect(await run).toEqual({ styleProposal: { generationId: 'run-1', cards: 4 } });
    expect(finalWrite().data.proposal.heroPending).toEqual([false, false, false, false]);
  });

  it('saves slot-ordered, aligned arrays when lanes finish out of order', async () => {
    const planned = [0, 1, 2, 3].map(() => deferred<designModule.SourceDesign>());
    explore.mockImplementation((args: any) => planned[args.styleSlots[0].slot].promise);
    writeStyleHero.mockImplementation(async (args: any) => ({ html: `<header data-store-name>hero ${args.concept.card.slot}</header>`, source: 'model' }));
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    await until(() => explore.mock.calls.length === 4);
    for (const slot of [3, 1, 0, 2]) {
      planned[slot].resolve(laneDesign(slot));
      await until(() => proposals().some(p => p.design?.concepts.some(c => c.card!.slot === slot)));
    }
    await run;
    const saved = proposals();
    for (const proposal of saved) {
      const slots = proposal.design!.concepts.map(c => c.card!.slot);
      expect(slots).toEqual([...slots].sort());
      expect([proposal.heroes.length, proposal.heroPalettes!.length, proposal.heroPending!.length]).toEqual([slots.length, slots.length, slots.length]);
      proposal.heroes.forEach((hero, i) => { if (hero?.source === 'model') expect(hero.html).toContain(`hero ${slots[i]}`); });
      proposal.heroPalettes!.forEach((palette, i) => expect(palette!.paper).toBe(proposal.slots[slots[i]].palette!.paper));
    }
    expect(saved.find(p => p.design!.concepts.length === 1)!.design!.concepts[0].card!.slot).toBe(3);
    expect(finalWrite().data.proposal.design.concepts.map((c: any) => c.card.slot)).toEqual([0, 1, 2, 3]);
  });

  it('drops only the card of a failed lane', async () => {
    lanes([1]);
    expect(await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true })).toEqual({ styleProposal: { generationId: 'run-1', cards: 3 } });
    expect(finalWrite().data.proposal.design.concepts.map((c: any) => c.card.slot)).toEqual([0, 2, 3]);
    expect(writeStyleHero).toHaveBeenCalledTimes(3);
  });

  it('drops a later lane whose opening repeats an earlier slot\'s', async () => {
    lanes([], (slot, design) => slot === 2 ? { ...design, concepts: [{ ...design.concepts[0], opening: '  MENU   opening ' }] } : design);
    expect(await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true })).toEqual({ styleProposal: { generationId: 'run-1', cards: 3 } });
    expect(finalWrite().data.proposal.design.concepts.map((c: any) => c.card.slot)).toEqual([0, 1, 3]);
  });

  it('recommends the first calm card with its premise\'s first sentence, or the first bold one when the merchant asked for bold', async () => {
    const premise = (slot: number, design: designModule.SourceDesign) => ({ ...design, concepts: [{ ...design.concepts[0], premise: `Premisa ${slot}: una idea clara. Segunda frase que no va.` }] });
    lanes([], premise);
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect(finalWrite().data.proposal.design).toMatchObject({ selected: 0, selection: { source: 'planner', rationale: 'Premisa 0: una idea clara.' } });
    ({ service, prisma, projects, config, metering } = setup());
    lanes([2], premise);
    await service.generate('m1', 's1', { ...dto, instruction: 'Quiero una tienda atrevida para mi cafetería' }, new SourceRequestBudget(25), [], progress, { styleProposal: true });
    const bold = finalWrite().data.proposal.design;
    expect(bold.concepts[bold.selected].card.slot).toBe(3);
    expect(bold.selection).toEqual({ source: 'planner', rationale: 'Premisa 3: una idea clara.' });
    ({ service, prisma, projects, config, metering } = setup());
    lanes([0, 1], (_slot, design) => ({ ...design, concepts: [{ ...design.concepts[0], premise: 'x'.repeat(300) }] }));
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], progress, { styleProposal: true });
    expect(finalWrite().data.proposal.design.selected).toBe(0);
    expect(finalWrite().data.proposal.design.selection.rationale).toHaveLength(200);
  });

  it('writes the heroes on the fast model while the planner keeps the run model', async () => {
    lanes();
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    const runModel = explore.mock.calls[0][0].model;
    expect(runModel).toMatch(/^gpt-/);
    expect(writeStyleHero.mock.calls.map(c => [c[0].heroModel, c[0].model])).toEqual(Array(4).fill(['gpt-5.6-luna', runModel]));
  });

  it('skips styles on an ineligible run without claiming it tried, and warns once', async () => {
    config.set('app.yapiDesignDraw', false);
    explore.mockResolvedValueOnce(threeConceptDesign);
    const result = await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect(explore.mock.calls[0][0].styleSlots).toBeUndefined();
    expect((result as any).generation.styleAttempted).toBeUndefined();
    const warns = (Logger.prototype.warn as jest.Mock).mock.calls.filter(c => String(c[0]).includes('style_proposal_ineligible'));
    expect(warns).toHaveLength(1);
  });

  it('changes nothing with the flag off', async () => {
    config.set('app.yapiStylePick', false);
    explore.mockResolvedValueOnce(threeConceptDesign);
    const result = await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true });
    expect((result as any).generation.styleAttempted).toBeUndefined();
    expect((Logger.prototype.warn as jest.Mock).mock.calls.some(c => String(c[0]).includes('style_proposal_ineligible'))).toBe(false);
    expect(explore.mock.calls[0][0].styleSlots).toBeUndefined();
    expect(explore).toHaveBeenCalledTimes(1);
    expect(progress).not.toHaveBeenCalledWith('styles');
    expect(authorPrompt()).not.toContain('BOLD BY DEFAULT');
  });

  it('builds the picked card: forced concept, its draw as the frame, its palette, bold mode and hero to Sep-5, no planner call', async () => {
    const proposal = savedProposal();
    expect([proposal.slots[3].mode, Boolean(proposal.slots[3].palette)]).toEqual(['bold', true]);
    const result = await service.generate('m1', 's1', proposal.request.dto, budget, [], progress, { style: { proposal, index: 3 } });
    expect(explore).not.toHaveBeenCalled();
    expect('styleProposal' in result).toBe(false);
    const prompt = authorPrompt()!;
    expect(prompt).toContain(proposal.slots[3].paragraph);
    expect(prompt).toContain('BOLD BY DEFAULT');
    expect(prompt).toContain('PICKED HEADER AND HERO');
    expect(prompt).toContain(proposal.heroes[3]!.html);
    expect(prompt).not.toContain(proposal.heroes[2]!.html);
    const files = savedFiles();
    expect(files.find(f => f.path === 'frame-draw.json')!.content).toBe(proposal.slots[3].file.content);
    const design = JSON.parse(files.find(f => f.path === 'design-direction.json')!.content);
    expect([design.selected, design.selection.source]).toEqual([3, 'forced']);
    expect(files.find(f => f.path === 'brand.css')!.content).toContain(proposal.slots[3].palette!.paper);
    expect(projects.recentDesignFingerprints).not.toHaveBeenCalled();
    expect(projects.recentCompositionFingerprints).not.toHaveBeenCalled();
  });

  it('builds a calm pick without the bold paragraph', async () => {
    const proposal = savedProposal();
    await service.generate('m1', 's1', proposal.request.dto, budget, [], progress, { style: { proposal, index: 0 } });
    expect(explore).not.toHaveBeenCalled();
    const prompt = authorPrompt()!;
    expect(prompt).toContain(proposal.slots[0].paragraph);
    expect(prompt).not.toContain('BOLD BY DEFAULT');
    expect(prompt).toContain(proposal.heroes[0]!.html);
  });
});
