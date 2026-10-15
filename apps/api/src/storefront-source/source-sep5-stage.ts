import { BadGatewayException } from '@nestjs/common';
import { sourceMotionPlan } from './source-motion-plan';
import { sep5AuthorableFiles, sep5PreviousSource } from './source-authorable';
import { sep5AuthorPrompt, sep5BoldDefault, sep5FilesSchema, sep5FontDirection, sep5ProjectIsUsable, sep5Products, sep5ResponseSchema, SEP5_AUTHOR_VERSION } from './design-engine/sep5-author';
import { sourceSignatureAuthorDirection } from './source-signature';
import { framePlatformHeader } from './design-engine/frame-draw';
import { SEP5_CLIENT_TIMEOUT_MS, SEP5_MAX_OUTPUT_TOKENS } from './source-generation-run';
import { sourceResponseJson } from './source-response';
import { withStaticStandardPages } from './source-static-pages';
import type { Evidence, PlaybookEntry } from './design-engine/playbook';
import type { Sep5Caller } from './source-sep5-call';
import { createSep5Review, type AssembleSave, type ReviewControls } from './source-sep5-review';
import type { GenerationLive, GenerationRunFacts } from './source-generation-types';

export type Sep5StageContext = {
  facts: Pick<GenerationRunFacts, 'config' | 'logger' | 'runId' | 'slug' | 'dto' | 'progress' | 'apiUrl' | 'data' | 'assetLegend' | 'images' | 'ownedUrls' | 'sitePurpose' | 'scrollFeel' | 'motion' | 'primaryAction' | 'oldFiles' | 'creative' | 'autoRepairs' | 'signatureOn' | 'voice'>;
  live: GenerationLive;
  sep5SelfReview: boolean; playbookOn: boolean;
  playbookEntry: PlaybookEntry | undefined; playbookEvidence: Record<Evidence, boolean>;
  pickedHero: string; pickedCard: string;
  acceptCandidate: () => Promise<void>;
  sep5Call: Sep5Caller['sep5Call']; touchCall: Sep5Caller['touchCall'];
  /** Store controls (spec 2026-10-14, part 4): YAPI's controls call beside the review, and its guard; absent when off. */
  controls?: ReviewControls;
  /** Lazy: generate() declares assembleSave after the engine branch; the review calls it only after revision N is saved. */
  assembleSave: AssembleSave;
};

/** Sep-5 authors the whole static store in one call (the pinned 26f889c8 prompt), adds the standard pages, and arms the
 *  background review (live.sep5Review) that saves N+1 after revision N is shown. */
export async function runSep5AuthorStage(context: Sep5StageContext): Promise<void> {
  const { facts, live, sep5SelfReview, playbookOn, playbookEntry, playbookEvidence, pickedHero, pickedCard, acceptCandidate, sep5Call, touchCall, controls, assembleSave } = context;
  const { config, logger, runId, slug, dto, progress, data, assetLegend, images, ownedUrls, sitePurpose, motion, primaryAction, oldFiles, creative, autoRepairs, signatureOn } = facts;
  // The Sep-5 commit (26f889c8) wrote the store instead of filling a schema, and that is where its voice
  // came from. The prompt is pinned verbatim and the request matches the measured run exactly: one
  // attempt, high effort, 18k output tokens. What it writes is the store; nothing re-renders it.
  await progress?.('building');
  // The authored files ARE the store here, so the choreography is actionable: Sep-5 writes its own CSS
  // and site.js. The engine's own motion plan is reused rather than reinvented, in its non-React form.
  // Not passed on the translation branch below, where only palette, copy and section order survive and
  // authored motion would be output tokens spent on CSS nothing renders.
  // Store voice (spec 2026-10-14): the Bundled images legend carries what each photo shows before the author reads it.
  await facts.voice.photosJob;
  const motionPlan = sourceMotionPlan({ creative, instruction: dto.instruction, motion, react: false });
  // A redesign shows the model the previous store, minus its standard pages: those are copies of its own
  // index.html, rebuilt below from the new one, and would spend the 24-file budget on pages nobody designs.
  const authorInput = { products: sitePurpose === 'shop', purpose: sitePurpose, action: primaryAction, brief: dto.brief, instruction: dto.instruction, data, assetLegend, previousSource: sep5PreviousSource(oldFiles), motionPlan, storeShell: true, boldDefault: (live.styleBold && creative) || sep5BoldDefault({ creative, motion, instruction: dto.instruction, brief: dto.brief, playbook: playbookOn }), playbook: live.playbookText, fonts: sep5FontDirection(live.committedDesign), signature: sourceSignatureAuthorDirection(live.committedDesign?.concepts[live.committedDesign.selected], signatureOn), frame: framePlatformHeader(live.frame.paragraph), hero: pickedHero, card: pickedCard };
  const prompt = sep5AuthorPrompt(authorInput);
  const { attempt, body } = await sep5Call('author', prompt, images, 'independent_storefront', sep5ResponseSchema(sitePurpose === 'shop'), SEP5_CLIENT_TIMEOUT_MS);
  const authored = sep5FilesSchema.safeParse(sourceResponseJson(body));
  // Sep-5's own guard. There is deliberately no fallback to the engine here: a store rendered from a
  // plan is the output this path exists to avoid, so a failed author stage fails the generation and the
  // merchant's previous revision stays untouched.
  if (!authored.success || !sep5ProjectIsUsable(authored.data.files, sitePurpose)) {
    attempt.failureReason ??= `la respuesta no incluyó un proyecto utilizable (${attempt.responseStatus || 'sin estado'}${attempt.incompleteReason ? `: ${attempt.incompleteReason}` : ''})`;
    logger.warn(JSON.stringify({ event: 'sep5_author_unusable', generationId: runId, status: attempt.responseStatus, reason: attempt.incompleteReason, outputTokens: body?.usage?.output_tokens, reasoningTokens: attempt.reasoningTokens, maxOutputTokens: SEP5_MAX_OUTPUT_TOKENS }));
    throw new BadGatewayException('La generación no devolvió una tienda completa. Vuelve a intentarlo.');
  }
  attempt.status = 'COMPLETED';
  // The products the merchant listed with their prices go to the real catalog; a rejected list never fails the store.
  // A showcase sells nothing online: it never creates products, whatever the author returned.
  const listed: { products: GenerationLive['products']; note?: string } = sitePurpose === 'shop' ? sep5Products(authored.data.products, dto.instruction, ownedUrls) : { products: [] };
  live.products = listed.products;
  if (listed.note) autoRepairs.push(listed.note);
  // `motion` says whether the choreography was actually sent, so a store that came out static can be
  // told apart from a run that was never asked for movement.
  logger.log(JSON.stringify({ event: 'sep5_author_published', generationId: runId, files: authored.data.files.length, version: SEP5_AUTHOR_VERSION, motion: motionPlan ? motion : 'none', bold: authorInput.boldDefault }));
  const authorable = sep5AuthorableFiles(authored.data.files);
  if (authorable.dropped.length) autoRepairs.push(`dropped platform files the author returned: ${authorable.dropped.join(', ')}`);
  live.generated = { label: authored.data.label.slice(0, 120) || `Tienda de ${slug}`, files: authorable.files };
  // The Sep-5 run validated only the project contract (apps/api/sep5-run.mjs). The presentation and
  // visual-system contracts were written later, against engine output; holding authored source to them
  // would reject the designs this path exists to reproduce. The project contract still applies.
  live.lenient = true;
  try { await acceptCandidate(); } finally { live.lenient = false; }
  // The standard pages (Buscar, Nosotros, Contacto, the policies) and the footer slot that links them, on
  // every authored store instead of only when the merchant later asks. Built from the final index.html, so
  // they share its header, footer and stylesheet; a store whose markup declines the surgery keeps without.
  const addSep5StandardPages = async () => {
    const pages = withStaticStandardPages(live.generated.files, sitePurpose);
    if (!pages.added.length && !pages.refreshed.length && !pages.slotAdded) return;
    const before = { generated: live.generated, repairs: autoRepairs.length, motifs: live.motifFiles, preview: live.acceptedPreviewFiles, unused: live.unusedImagePaths };
    live.generated = { ...live.generated, files: pages.files };
    live.lenient = true;
    try { await acceptCandidate(); }
    catch (error) {
      live.generated = before.generated; autoRepairs.length = before.repairs; live.motifFiles = before.motifs; live.acceptedPreviewFiles = before.preview; live.unusedImagePaths = before.unused;
      logger.warn(JSON.stringify({ event: 'sep5_standard_pages_declined', generationId: runId, reason: ((error as Error)?.message || '').slice(0, 300) }));
    } finally { live.lenient = false; }
  };
  // Self-review after the save (spec 2026-10-12 faster generation). The author writes blind, never seeing its own CSS
  // render; the review is shown the draft once, at desktop and phone widths, with what the browser measured. The draft
  // that just passed is saved as revision N and shown first; startSep5Review runs this afterwards and saves the corrected
  // project as N+1 only if it passes the same acceptance and the store is still on N.
  // Kit touches (spec 2026-10-14 one look per store) ride the same background stage: after the review's edits, on the
  // final home page, saved in the same N+1. A shop only: showcases have no kit pages.
  const kitTouchOn = config.get<boolean>('app.yapiKitTouch') === true && sitePurpose === 'shop';
  // Store controls (spec 2026-10-14, part 4): YAPI's controls call arms the review stage on its own too.
  if (sep5SelfReview || kitTouchOn || controls) {
    const draftFiles = authored.data.files, draftPreview = live.acceptedPreviewFiles;
    live.sep5Review = createSep5Review({ facts, live, sep5SelfReview, kitTouchOn, playbookEntry, playbookEvidence, authorInput, draftFiles, draftPreview, addSep5StandardPages, acceptCandidate, sep5Call, touchCall, controls, assembleSave });
  }
  await addSep5StandardPages();
}
