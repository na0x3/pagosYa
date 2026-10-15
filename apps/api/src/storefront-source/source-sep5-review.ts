import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { currentSourceRuntime } from './source-runtime';
import type { SourceProjectSnapshot } from './source-project';
import { captureSep5Draft, sep5MeasuredFacts } from './design-engine/sep5-review-capture';
import { contractMisses, craftFacts, type Evidence, type PlaybookEntry } from './design-engine/playbook';
import { applySep5Edits, sep5ProjectIsUsable, sep5ReviewPrompt, sep5ReviewSchema, SEP5_REVIEW_RESPONSE_SCHEMA, type sep5AuthorPrompt, type Sep5Files } from './design-engine/sep5-author';
import { SEP5_CLIENT_TIMEOUT_MS } from './source-generation-run';
import { sourceResponseJson } from './source-response';
import { sep5AuthorableFiles } from './source-authorable';
import { readConfigFile, sanitizeLook, type StoreLook } from './store-look';
import { chatTouchKept, instructionConcernsKitSurfaces, MERCHANT_MARKER, pickTouch, runKitTouch, touchBudgetMs } from './kit-touch';
import type { assembleSourceSave, LookChoice } from './source-save-assembly';
import type { Sep5Caller } from './source-sep5-call';
import type { GenerationLive, GenerationRunFacts, Sep5Review, SourceGenerationAttempt } from './source-generation-types';
import type { StoreControls } from './store-controls';
import { reviewControlsGuardBudgetMs, type ControlsDesign } from './store-controls-design';

/** The review stage keeps this much of its time for assembling and saving N+1 after a touch. */
export const REVIEW_SAVE_MARGIN_MS = 90_000;

/** generate()'s assembleSave. Stages receive it wrapped, `(…a) => assembleSave(…a)`, because it is declared after them.
 *  `controlsChoice.use` saves that control language instead of generate()'s own pick (spec 2026-10-14 store controls). */
export type AssembleSave = (assembleSignal?: AbortSignal, lookChoice?: LookChoice, controlsChoice?: { use?: StoreControls }) => ReturnType<typeof assembleSourceSave>;
type SaveInput = Awaited<ReturnType<AssembleSave>>;

/** Store controls (spec 2026-10-14, part 4), built by generate(): YAPI's controls call, started beside the review call, and the
 *  browser guard on the N+1 candidate. */
export type ReviewControls = {
  /** Never rejects: null when the call fails, times out or answers nothing usable. */
  design: (review: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => Promise<ControlsDesign | null>;
  /** The record drawn into the candidate and guarded; a failing guard puts revision N's language back (kept: false). */
  keep: (input: SaveInput, designed: ControlsDesign, signal: AbortSignal) => Promise<{ input: SaveInput; kept: boolean }>;
};

export type Sep5ReviewContext = {
  facts: Pick<GenerationRunFacts, 'config' | 'logger' | 'runId' | 'slug' | 'dto' | 'apiUrl' | 'data' | 'sitePurpose' | 'scrollFeel'>;
  live: GenerationLive;
  sep5SelfReview: boolean; kitTouchOn: boolean;
  playbookEntry: PlaybookEntry | undefined; playbookEvidence: Record<Evidence, boolean>;
  authorInput: Parameters<typeof sep5AuthorPrompt>[0];
  draftFiles: Sep5Files['files']; draftPreview: SourceProjectFileDto[];
  addSep5StandardPages: () => Promise<void>;
  acceptCandidate: () => Promise<void>;
  sep5Call: Sep5Caller['sep5Call']; touchCall: Sep5Caller['touchCall'];
  controls?: ReviewControls;
  assembleSave: AssembleSave;
};

/** Self-review after the save (spec 2026-10-12 faster generation) plus the kit touch (spec 2026-10-14). The author writes
 *  blind; the review is shown the draft once, at desktop and phone widths, with what the browser measured, and the
 *  corrected project lands as N+1 only if it passes the same acceptance and the store is still on N. */
export function createSep5Review(context: Sep5ReviewContext): Sep5Review {
  const { facts, live, sep5SelfReview, kitTouchOn, playbookEntry, playbookEvidence, authorInput, draftFiles, draftPreview, addSep5StandardPages, acceptCandidate, sep5Call, touchCall, controls, assembleSave } = context;
  // The ConfigService is `appConfig` here: the review builds its own `config` (the draft's config.js object).
  const { config: appConfig, logger, runId, slug, dto, apiUrl, data, sitePurpose, scrollFeel } = facts;
  return async review => {
    const notes: string[] = [];
    let changed = false;
    // YAPI's controls (spec 2026-10-14) are designed beside the review call: the ChatGPT bridge serves about two calls at once.
    const controlsJob = controls ? controls.design(review) : null;
    if (sep5SelfReview) {
      // The same config a new store saves with, so the runtime renders the live catalog into the draft.
      const config = { sitePurpose, scrollFeel, demo: false, slug: slug, apiBaseUrl: apiUrl.href.replace(/\/$/, ''), checkoutOrigin: appConfig.get<string>('app.checkoutOrigin'), productPage: 'product.html', checkoutPage: 'checkout.html', data };
      const preview = await currentSourceRuntime({ brief: dto.brief, files: [
        ...draftPreview.filter(file => !['config.js', 'commerce.js'].includes(file.path)),
        { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` },
        { path: 'commerce.js', content: '' },
      ] } as unknown as SourceProjectSnapshot);
      const { shots, facts } = await captureSep5Draft(preview, review.signal);
      // Playbook facts: type sizes against the kind's craft profile, and contract sections missing from the page.
      const playbookFacts = playbookEntry ? facts.flatMap(fact => [...(live.boldAsked ? [] : craftFacts(playbookEntry.profile, fact.width, fact.h1Size ?? 0, fact.bodySize ?? 0)), ...(fact.width === 1280 && fact.pageText ? contractMisses(playbookEntry, fact.pageText, playbookEvidence).map(label => `Falta en la página: ${label} (solo con datos reales del brief; nunca lo inventes).`) : [])]) : [];
      const measured = [...sep5MeasuredFacts(facts), ...playbookFacts];
      const reviewed = await sep5Call('review', sep5ReviewPrompt({ ...authorInput, draft: draftFiles, measured }), shots.map(shot => ({ type: 'input_image' as const, image_url: shot.image, detail: 'auto' as const })), 'storefront_self_review', SEP5_REVIEW_RESPONSE_SCHEMA, SEP5_CLIENT_TIMEOUT_MS, review);
      const result = sep5ReviewSchema.safeParse(sourceResponseJson(reviewed.body));
      if (!result.success) throw new Error(`la revisión no devolvió un resultado válido (${reviewed.attempt.responseStatus || 'sin estado'}${reviewed.attempt.incompleteReason ? `: ${reviewed.attempt.incompleteReason}` : ''})`);
      logger.log(JSON.stringify({ event: 'sep5_self_review', generationId: runId, measured, changed: result.data.edits.length > 0, edits: result.data.edits.length, notes: result.data.notes.length }));
      // Edits on the draft the review was shown; one that does not apply cleanly is skipped, never fatal.
      const edited = applySep5Edits(draftFiles, result.data.edits);
      if (edited.files.every((file, index) => file.content === draftFiles[index]?.content)) reviewed.attempt.status = 'COMPLETED';
      else {
        if (!sep5ProjectIsUsable(edited.files, sitePurpose)) throw new Error(sitePurpose === 'shop' ? 'la revisión dejó el proyecto sin catálogo, carrito o estilos' : 'la revisión dejó el sitio sin su acción principal o sin estilos');
        const kept = sep5AuthorableFiles(edited.files);
        live.reviewing = true;
        live.generated = { label: result.data.label.slice(0, 120) || live.generated.label, files: kept.files };
        live.lenient = true;
        try { await acceptCandidate(); } finally { live.lenient = false; }
        await addSep5StandardPages();
        reviewed.attempt.status = 'COMPLETED';
        notes.push(...result.data.notes);
        changed = true;
      }
    }
    // The touch reads the home as the review left it; a kept touch does not change the home, so the final save reuses
    // the look that base measured instead of measuring a third time.
    let touchedLook: { look: StoreLook | undefined } | undefined;
    if (kitTouchOn) {
      // Its own deadline, like the chat re-run (T8-I2): the review's cancellation still aborts it, but a slow touch is
      // dropped in time for N+1 to save the review's own edits; with too little time left it is skipped.
      const budget = touchBudgetMs(review.deadline - Date.now(), REVIEW_SAVE_MARGIN_MS);
      if (!budget) logger.warn(JSON.stringify({ event: 'kit_touch_dropped', generationId: runId, reason: 'deadline', skipped: true }));
      else {
        const touchSignal = AbortSignal.any([review.signal, AbortSignal.timeout(budget)]);
        try {
          const base = await assembleSave(touchSignal, { fallback: live.revisionLook });
          const touch = await runKitTouch({ files: base.files, brief: dto.brief, storeName: (data as { storeName?: string }).storeName || slug, signature: live.committedDesign?.concepts[live.committedDesign.selected]?.signature, signal: touchSignal, call: touchCall({ signal: touchSignal, attempts: review.attempts }) });
          const surfaces = Object.keys(touch?.css ?? {});
          if (touch && surfaces.length) { live.kitTouch = touch.css; touch.used(); notes.push(...touch.notes); changed = true; touchedLook = { look: sanitizeLook(readConfigFile(base.files).look) }; }
          logger.log(JSON.stringify({ event: surfaces.length ? 'kit_touch_saved' : 'kit_touch_dropped', generationId: runId, surfaces, dropped: (touch?.dropped ?? []).slice(0, 12), ...(touch ? {} : { reason: 'unusable answer' }) }));
        } catch (error) {
          review.signal.throwIfAborted();
          logger.warn(JSON.stringify({ event: 'kit_touch_dropped', generationId: runId, reason: touchSignal.aborted ? 'deadline' : ((error as Error)?.message || '').slice(0, 300) }));
        }
      }
    }
    // YAPI's controls, guarded on the N+1 candidate: a failing guard keeps revision N's language, never the review's edits.
    const designed = controlsJob ? await controlsJob : null;
    review.signal.throwIfAborted();
    // Nothing changed: revision N stays the store and no empty «Revisión de YAPI» is saved.
    if (!changed && !designed) return null;
    let saveInput = await assembleSave(review.signal, touchedLook ? { reuse: touchedLook } : { fallback: live.revisionLook }, { use: live.revisionControls });
    if (designed && controls) {
      // The guard runs only with time for it and the N+1 save before the stage's deadline, on its own signal: a guard that runs out
      // of time drops only YAPI's record (review CD fix 5), never the review's edits or touch.
      const guardBudget = reviewControlsGuardBudgetMs(review.deadline - Date.now());
      let kept = false;
      if (!guardBudget) logger.warn(JSON.stringify({ event: 'controls_dropped', generationId: runId, source: 'yapi', reason: 'deadline', skipped: true }));
      else {
        const guardSignal = AbortSignal.any([review.signal, AbortSignal.timeout(guardBudget)]);
        try {
          const guarded = await controls.keep(saveInput, designed, guardSignal);
          if (guarded.kept) { designed.used(); notes.push(designed.note); saveInput = guarded.input; kept = true; }
        } catch (error) {
          review.signal.throwIfAborted();
          logger.warn(JSON.stringify({ event: 'controls_dropped', generationId: runId, source: 'yapi', reason: guardSignal.aborted ? 'deadline' : ((error as Error)?.message || '').slice(0, 300) }));
        }
      }
      if (!kept && !changed) return null;
    }
    return { saveInput, notes };
  };
}

export type ChatKitTouchContext = {
  facts: Pick<GenerationRunFacts, 'config' | 'logger' | 'runId' | 'slug' | 'dto' | 'claude' | 'data' | 'sitePurpose' | 'creative' | 'started' | 'runTimeout' | 'signal' | 'attempts'>;
  live: Pick<GenerationLive, 'agentTheme' | 'kitTouch'>;
  touchCall: Sep5Caller['touchCall'];
  assembleSave: AssembleSave;
};

/** A chat request about the kit pages (spec 2026-10-14) re-runs only the touch step, with the merchant's words. The new
 *  CSS replaces the surfaces it covers; surfaces it leaves empty keep the store's earlier touch. It runs before the
 *  receipt so a used attempt is billed, on its own deadline (the touch never fails an edit), and an agent theme chosen
 *  in this same request wins over it on the surfaces the theme set. */
export async function runChatKitTouch(context: ChatKitTouchContext): Promise<void> {
  const { facts, live, touchCall, assembleSave } = context;
  const { config, logger, runId, slug, dto, claude, data, sitePurpose, creative, started, runTimeout, signal, attempts } = facts;
  const touchBudget = touchBudgetMs(started + runTimeout - Date.now());
  if (!creative && !claude && sitePurpose === 'shop' && config.get<boolean>('app.yapiKitTouch') === true && instructionConcernsKitSurfaces(dto.instruction) && touchBudget > 0) {
    const touchSignal = AbortSignal.any([signal, AbortSignal.timeout(touchBudget)]);
    try {
      const base = await assembleSave(touchSignal);
      const touch = await runKitTouch({ files: base.files, brief: dto.brief, storeName: (data as { storeName?: string }).storeName || slug, instruction: (dto.instruction.split(MERCHANT_MARKER).at(-1) ?? dto.instruction).trim().slice(0, 400), signal: touchSignal, call: touchCall({ signal: touchSignal, attempts }) });
      // The agent's theme of this same request wins on the surfaces it set; only CSS that is kept is billed.
      const { css: chosen, bill } = chatTouchKept(touch?.css ?? {}, live.agentTheme);
      if (touch && bill) touch.used();
      const before = readConfigFile(base.files).dna;
      if (Object.keys(chosen).length) live.kitTouch = { ...(before?.touch === 1 ? pickTouch(before) : {}), ...chosen };
      logger.log(JSON.stringify({ event: Object.keys(chosen).length ? 'kit_touch_saved' : 'kit_touch_dropped', generationId: runId, surfaces: Object.keys(chosen), request: true }));
    } catch (error) {
      signal.throwIfAborted();
      logger.warn(JSON.stringify({ event: 'kit_touch_dropped', generationId: runId, reason: touchSignal.aborted ? 'deadline' : ((error as Error)?.message || '').slice(0, 300), request: true }));
    }
  }
}
