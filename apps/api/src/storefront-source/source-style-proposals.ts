import { ConflictException, type Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiUsageService } from '../ai-usage/ai-usage.service';
import type { GenerateSourceProjectDto } from './dto/generate-source-project.dto';
import type { SourceImageUse } from './source-setup';
import { styleSlotDirection, type StyleSlot } from './design-engine/style-draws';
import type { SourceDesign, SourceDesignConcept } from './source-design';
import { numbersIn, templateHero, writeStyleHero, type HeroFacts } from './design-engine/style-hero';
import type { SourceModel } from './source-generation-policy';
import type { SourceRequestBudget } from './source-request-budget';
import type { DesignPlanningAttempt } from './source-design-planner';
import { styleDecision, type StyleDecision, type StyleProposal, type StyleProposalStatus } from './source-style-proposal';
import { distinctBoldDisplay, distinctBoldDisplays, styleOpeningKey, styleRecommendation } from './source-style-design';
import { retryProviderRejection } from './source-provider-error';
import { completedCredits } from './source-generation-run';
import type { StyleProposalResult } from './source-generation-types';
import type { StoreVoice } from './store-voice';

/** What a style proposal needs from SourceGenerationService. The service builds it when the proposal starts, so the two
 *  timings are the instance's at that moment (the specs shorten them on the instance). */
export type StyleProposalDeps = { prisma: PrismaService; metering?: AiUsageService; logger: Logger; stylePickPollMs: number; pickHeroWaitMs: number };
export type ProposeStylesInput = { runId: string; storeId: string; dto: GenerateSourceProjectDto; imageUses: SourceImageUse[]; redesign: boolean; styleSlots: Array<StyleSlot & { playbook: string }>; plan: (slot: StyleSlot & { playbook: string }) => Promise<SourceDesign>; boldAsked: boolean; assetLegend: Array<{ original: string; path: string }>; storeName: string; logoUrl: string | null; brandPalette?: HeroFacts['palette']; model: SourceModel; provider: { endpoint: string; name: string }; apiKey: string; budget: SourceRequestBudget; signal: AbortSignal; attempts: DesignPlanningAttempt[]; started: number; freeRun: boolean; maxCredits: number; onPickable?: (result: StyleProposalResult) => void; /** Spec 2026-10-14 store voice: the sheet call started beside the cards. */ voice?: Promise<StoreVoice | null> };

/**
 * Elige tu estilo in two lanes (spec 2026-10-11, amendments "four parallel lanes" and "two cards"): one calm card and one
 * bold card, so at most two model calls run at once (the ChatGPT bridge allows about two). Each slot plans its own concept,
 * shows its card at once with the template hero, then swaps in the model hero. A call the provider refused waits 3 s and
 * is tried once more; any other failure costs only its card. Two cards wait for the pick; one card or none come back to
 * the caller, which builds that card or replans as before.
 */
export async function runStyleProposal(deps: StyleProposalDeps, input: ProposeStylesInput): Promise<StyleProposalResult | { design?: SourceDesign }> {
  // Lanes finish out of order, so everything is kept by drawn slot and compacted, in slot order, on each save.
  const slotConcepts: Array<SourceDesignConcept | undefined> = [];
  const slotHeroes: StyleProposal['heroes'] = [];
  const slotPalettes: Array<HeroFacts['palette']> = [];
  const slotPending: boolean[] = [];
  // Both cards planned: choosable while their heroes are still being drawn (spec 2026-10-12 faster generation).
  let pickable = false;
  const laneControllers = new Map(input.styleSlots.map(slot => [slot.slot, new AbortController()]));
  // Heroes are offered the fast model; writeStyleHero writes the intense one on the run model, and falls back to the run
  // model when the provider refuses the fast one.
  const heroModel: SourceModel = input.model.startsWith('gpt-') ? 'gpt-5.6-luna' : input.model;
  const createdAt = new Date().toISOString();
  // Spec 2026-10-14 store voice: the sheet written beside the cards travels on the proposal; the final writes wait for it.
  let voiceSheet: StoreVoice | undefined;
  void input.voice?.then(sheet => { if (sheet) voiceSheet = sheet; });
  const photo = input.imageUses.find(use => use.role === 'business') ?? input.imageUses.find(use => use.role === 'product');
  const photoPath = photo ? input.assetLegend.find(entry => entry.original === photo.url)?.path : undefined;
  const logoPath = input.logoUrl ? input.assetLegend.find(entry => entry.original === input.logoUrl)?.path : undefined;
  // Real numbers for the numbers device come from the merchant's own business text only.
  const businessText = (input.dto.brief as { businessInformation?: unknown } | undefined)?.businessInformation;
  const briefNumbers = typeof businessText === 'string' ? numbersIn(businessText) : [];
  const factsFor = (concept: SourceDesignConcept, slot: StyleSlot): HeroFacts => ({ storeName: input.storeName, logoPath, photoPath, eyebrow: concept.story?.eyebrow || undefined, headline: concept.story?.headline || concept.name, line: concept.story?.support || concept.premise, action: concept.story?.primaryAction || 'Ver productos', palette: slotPalettes[slot.slot], fonts: { display: concept.dna?.type?.display ?? 'bricolage', text: concept.dna?.type?.text ?? 'instrument' }, mode: slot.mode, buttons: slot.family.buttons, radius: slot.family.radius,
    frame: { header: slot.draw.header, hero: slot.draw.hero }, ...(slot.device ? { device: slot.device } : {}), ...(briefNumbers.length ? { numbers: briefNumbers } : {}) });
  const live = () => input.styleSlots.filter(slot => slotConcepts[slot.slot]);
  const proposal = (status: StyleProposalStatus): StyleProposal => {
    const order = live(), concepts = order.map(slot => slotConcepts[slot.slot]!);
    return { version: 1, status, slots: input.styleSlots, design: concepts.length ? { concepts, ...styleRecommendation(concepts, input.boldAsked) } : null,
      heroes: order.map(slot => slotHeroes[slot.slot] ?? null), heroPalettes: order.map(slot => slotPalettes[slot.slot] ?? null), heroPending: order.map(slot => status === 'RUNNING' && slotPending[slot.slot] === true),
      assetMap: input.assetLegend, request: { dto: input.dto, imageUses: input.imageUses, redesign: input.redesign }, createdAt, ...(pickable ? { pickable: true } : {}), ...(voiceSheet ? { voice: voiceSheet } : {}) };
  };
  // Saves run one after another and each writes the state at its own turn, so a slow write never lands an older proposal.
  // Once the outcome is decided (closed), lane saves stop. Only a row this run still holds is written: after a sweep or
  // a lost lease the writes match nothing and the proposal is never revived.
  let queue: Promise<unknown> = Promise.resolve(), closed = false, shown = false;
  // From the offer on, a pick may land on the row (the chat writes PICKED into the proposal), so every later write needs
  // the proposal still running: a slow lane never turns a pick back into a running proposal.
  const save = (status: StyleProposalStatus = 'RUNNING', data: Record<string, unknown> = {}) => {
    // The guard is read when the write runs, like the proposal it writes: a save queued before the offer can run after it.
    const write = queue.catch(() => undefined).then(() => closed && status === 'RUNNING' ? { count: 0 }
      : deps.prisma.storeSourceGeneration.updateMany({ where: { id: input.runId, status: 'RUNNING', activeStoreId: input.storeId, ...(pickable ? { proposal: { path: ['status'], equals: 'RUNNING' } } : {}) }, data: { proposal: proposal(status) as unknown as Prisma.InputJsonValue, ...data } }));
    queue = write;
    return write;
  };
  const planned: Array<Promise<void>> = [];
  const lanes = input.styleSlots.map(slot => {
    let ready!: () => void;
    planned.push(new Promise<void>(resolve => { ready = resolve; }));
    const lane = laneControllers.get(slot.slot)!;
    return (async () => {
      try {
        // A refusal from the provider (two lanes reached the bridge at the same second) or a call that broke off on the way
        // (a cut ChatGPT stream) is planned once more after 3 s.
        const concept = (await retryProviderRejection(() => input.plan(slot), { signal: AbortSignal.any([input.signal, lane.signal]) })).concepts[0];
        if (!concept?.card) return;
        // A bold lane moves off another bold card's display font before its hero is drawn (a no-op with one bold card).
        const others = input.styleSlots.flatMap(other => other.slot !== slot.slot && slotConcepts[other.slot] ? [slotConcepts[other.slot]!] : []);
        slotConcepts[slot.slot] = distinctBoldDisplay({ ...concept, card: { ...concept.card, slot: slot.slot, mode: slot.mode } }, others);
        slotPalettes[slot.slot] = slot.palette ?? input.brandPalette ?? { paper: '#ffffff', ink: '#111111', accent: '#111111', accent2: '#f2f2f2' };
        slotHeroes[slot.slot] = { html: templateHero(factsFor(slotConcepts[slot.slot]!, slot)), source: 'template' };
        slotPending[slot.slot] = true;
      } catch (error) {
        if (!input.signal.aborted) deps.logger.warn(JSON.stringify({ event: 'style_lane_failed', generationId: input.runId, slot: slot.slot, reason: error instanceof Error ? error.message.slice(0, 300) : 'unknown' }));
        return;
      } finally { ready(); }
      shown = true;
      await save();
      const concept = slotConcepts[slot.slot];
      if (!concept || lane.signal.aborted) return;
      const hero = await writeStyleHero({ facts: factsFor(concept, slot), concept, direction: styleSlotDirection(slot, slot.playbook), model: input.model, heroModel, provider: input.provider, apiKey: input.apiKey, budget: input.budget, signal: AbortSignal.any([input.signal, lane.signal]), attempts: input.attempts,
        record: async (body, attempt) => deps.metering?.record(input.storeId, 'source-style-hero', attempt.model, body, attempt.durationMs, attempt.status) });
      const current = slotConcepts[slot.slot];
      if (!current || lane.signal.aborted) return;
      slotHeroes[slot.slot] = hero;
      slotPending[slot.slot] = false;
      await save();
    })().catch(error => { if (!input.signal.aborted && !lane.signal.aborted) deps.logger.warn(JSON.stringify({ event: 'style_lane_failed', generationId: input.runId, slot: slot.slot, stage: 'hero', reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' })); });
  });
  await Promise.all(planned);
  input.signal.throwIfAborted();
  // Every lane has its concept. Lanes plan apart: a repeated opening keeps the lower slot's card. Bold fonts were already
  // kept apart as each lane planned; this pass is the backstop (with one bold card, nothing moves).
  const openings = new Set<string>();
  for (const slot of live()) {
    const key = styleOpeningKey(slotConcepts[slot.slot]!.opening);
    if (openings.has(key)) { slotConcepts[slot.slot] = undefined; laneControllers.get(slot.slot)!.abort(); } else openings.add(key);
  }
  const order = live();
  const deduped = distinctBoldDisplays({ concepts: order.map(slot => slotConcepts[slot.slot]!), selected: 0 });
  order.forEach((slot, index) => {
    const concept = deduped.concepts[index];
    if (concept === slotConcepts[slot.slot]) return;
    // Its model hero was drawn (or is being drawn) in the old font: the card keeps a template hero in the new one, so
    // the hero, the card's font line and the built store agree.
    slotConcepts[slot.slot] = concept;
    laneControllers.get(slot.slot)!.abort();
    slotHeroes[slot.slot] = { html: templateHero(factsFor(concept, slot)), source: 'template' };
    slotPending[slot.slot] = false;
  });
  if (order.length < 2) {
    // One card is built straight away and none falls back to the joint planner: neither waits for a hero.
    closed = true;
    for (const controller of laneControllers.values()) controller.abort();
    if (shown) await save('SUPERSEDED');
    const only = order[0] && slotConcepts[order[0].slot];
    return { design: only ? { concepts: [only], selected: 0, selection: { source: 'forced', rationale: null } } : undefined };
  }
  // Both cards are planned: choosable now, while their heroes are still being drawn (spec 2026-10-12). The caller answers
  // the merchant at once; this run keeps the store until the heroes land, the merchant picks, or a new request retires them.
  pickable = true;
  const offered = await save() as { count: number };
  if (offered.count === 1) input.onPickable?.({ styleProposal: { generationId: input.runId, cards: live().length } });
  const watch = new AbortController();
  let decision = await Promise.race([Promise.all(lanes).then(() => null), watchStyleDecision(deps, input.runId, watch.signal)]);
  watch.abort();
  input.signal.throwIfAborted();
  const finished = () => ({ status: 'AWAITING_STYLE', activeStoreId: null, credits: completedCredits(input.attempts, input.maxCredits, input.freeRun), attempts: input.attempts as unknown as Prisma.InputJsonValue, durationMs: Date.now() - input.started, completedAt: new Date() });
  if (!decision) {
    await input.voice;
    closed = true;
    const completed = await save('AWAITING_STYLE', finished()) as { count: number };
    if (completed.count === 1) return { styleProposal: { generationId: input.runId, cards: live().length } };
    // The guarded write matched nothing: a pick or a new request reached the row between the last hero and this write.
    decision = styleDecision((await deps.prisma.storeSourceGeneration.findFirst({ where: { id: input.runId }, select: { proposal: true } }).catch(() => null))?.proposal);
    if (!decision) throw new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
  }
  const pickedSlot = decision.status === 'PICKED' ? live()[decision.picked]?.slot : undefined;
  for (const [slot, controller] of laneControllers) if (slot !== pickedSlot) controller.abort();
  if (pickedSlot !== undefined && slotPending[pickedSlot]) {
    // The picked card's model hero may still land; past pickHeroWaitMs the build goes on with the card's design instead.
    const waitStarted = Date.now();
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([lanes[input.styleSlots.findIndex(slot => slot.slot === pickedSlot)], new Promise(resolve => { timer = setTimeout(resolve, deps.pickHeroWaitMs); })]);
    clearTimeout(timer);
    if (slotPending[pickedSlot]) {
      laneControllers.get(pickedSlot)!.abort();
      slotPending[pickedSlot] = false;
      deps.logger.warn(JSON.stringify({ event: 'style_hero_skipped', generationId: input.runId, slot: pickedSlot, waitedMs: Date.now() - waitStarted }));
    }
  }
  await input.voice;
  closed = true;
  // The pick's build waits for this release, then reads the heroes written here.
  const released = await deps.prisma.storeSourceGeneration.updateMany({ where: { id: input.runId, status: 'RUNNING', activeStoreId: input.storeId }, data: {
    ...(decision.status === 'PICKED' ? { proposal: { ...proposal('PICKED'), picked: decision.picked } as unknown as Prisma.InputJsonValue } : {}), ...finished() } });
  if (released.count !== 1) throw new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
  return { styleProposal: { generationId: input.runId, cards: live().length } };
}

/** Reads the run's own row every stylePickPollMs for the merchant's decision on choosable cards, until `stop` aborts. */
export async function watchStyleDecision(deps: Pick<StyleProposalDeps, 'prisma' | 'stylePickPollMs'>, runId: string, stop: AbortSignal): Promise<StyleDecision | null> {
  while (!stop.aborted) {
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); stop.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, deps.stylePickPollMs);
      stop.addEventListener('abort', done);
    });
    if (stop.aborted) return null;
    const row = await deps.prisma.storeSourceGeneration.findFirst({ where: { id: runId }, select: { proposal: true } }).catch(() => null);
    const decision = styleDecision(row?.proposal);
    if (decision) return decision;
  }
  return null;
}
