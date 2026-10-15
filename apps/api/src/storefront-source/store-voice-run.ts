/**
 * Store voice in one generate() run (spec 2026-10-14). generate() builds one VoiceRun before the run row and hands it to every
 * stage as facts.voice. `sheet`, `photosJob` and `sheetJob` change during the run (the design stage, a tone request), so a stage
 * reads them through the object when it needs them, never from a copy kept across an await.
 */
import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { PlaybookKind } from './design-engine/playbook';
import { SHOWN_CARDS_TIMEOUT_MS, withinOr } from './design-engine/style-draws';
import { applyPhotoDescriptions, describePhotos, legendPhotos, PHOTO_DESCRIPTION_MAX_OUTPUT_TOKENS, PHOTO_DESCRIPTION_SCHEMA, PHOTO_DESCRIPTION_TIMEOUT_MS, type LegendEntry, type LegendPhoto } from './photo-descriptions';
import type { Sep5Caller } from './source-sep5-call';
import { checkCopy, copyFindingCounts, copyFindingLines, storePrices, type CopyCheckInput } from './copy-check';
import { merchantMessagesText, merchantSpecificCount, merchantTextOf, readOnboardingMaterial, readVoice, sanitizeVoice, voicesToDiffer, withOnboardingAnswers, type OnboardingMaterial, type RecentVoice, type StoreVoice } from './store-voice';
import { runVoiceSheet, voiceDeadlineMs, VOICE_MAX_OUTPUT_TOKENS, VOICE_SCHEMA } from './store-voice-design';

export type VoiceRun = {
  /** YAPI_VOICE on, on a static store. */
  on: boolean;
  /** A Sep-5 first build, or a redesign of a store without a sheet, writes a new one (the sheet call, design stage). */
  fresh: boolean;
  kind: PlaybookKind;
  onboarding: OnboardingMaterial;
  /** This store's chat messages from the merchant, latest first, at most 2,000 characters. */
  merchantMessages: string;
  /** The six most recent sibling and same-kind stores. */
  siblings: RecentVoice[];
  /** storeKnowledgeForGeneration(knowledge), set once the Store Brain has loaded. */
  brain?: unknown;
  /** The run's photos with their digests, and what each shows by digest (the cache, then this run's calls). */
  photos: LegendPhoto[];
  described: Map<string, string>;
  /** The store's sheet as this run knows it: carried, written by the design stage, or rewritten by a tone request. */
  sheet: StoreVoice | undefined;
  /** Design-stage work the author waits for; resolved when there is none. Neither ever rejects. */
  photosJob: Promise<void>;
  sheetJob: Promise<StoreVoice | null>;
};

export type VoiceRunInput = {
  on: boolean;
  sep5Author: boolean;
  storeId: string;
  merchantId: string;
  previousFiles: ReadonlyArray<{ path: string; content: string; encoding?: string }>;
  /** The picked style card's proposal sheet (execution.style.proposal.voice). */
  proposalVoice: unknown;
  kind: PlaybookKind;
  assetLegend: LegendEntry[];
  buffers: ReadonlyMap<string, Buffer | null>;
  contentType: (filename: string) => string;
  prisma: Pick<PrismaService, 'mediaAssetDescription' | 'store' | 'storeAgentMessage'>;
  recentVoices: (storeId: string, now: Date, limit: number) => Promise<RecentVoice[]>;
};

/** The run's voice state before its row exists. Never throws: every read that fails is an empty one. */
export async function startVoiceRun(input: VoiceRunInput): Promise<VoiceRun> {
  const empty: VoiceRun = { on: false, fresh: false, kind: input.kind, onboarding: { answers: [] }, merchantMessages: '', siblings: [], photos: [], described: new Map(), sheet: undefined, photosJob: Promise.resolve(), sheetJob: Promise.resolve(null) };
  if (!input.on) return empty;
  const previous = readVoice(input.previousFiles);
  // The merchant's material is read only when something will write from it: a Sep-5 design, or a store that has a sheet.
  const material = input.sep5Author || Boolean(previous);
  const photos = legendPhotos(input.assetLegend, input.buffers, input.contentType);
  const [cached, row, messages, siblings] = await Promise.all([
    photos.length ? Promise.resolve().then(() => input.prisma.mediaAssetDescription.findMany({ where: { merchantId: input.merchantId, digest: { in: photos.map(photo => photo.digest) } }, select: { digest: true, description: true } })).catch(() => []) : Promise.resolve([]),
    material ? Promise.resolve().then(() => input.prisma.store.findFirst({ where: { id: input.storeId }, select: { onboarding: true } })).catch(() => null) : Promise.resolve(null),
    material ? Promise.resolve().then(() => input.prisma.storeAgentMessage.findMany({ where: { thread: { storeId: input.storeId }, channel: 'source', role: 'USER' }, orderBy: { createdAt: 'desc' }, take: 30, select: { content: true } })).catch(() => []) : Promise.resolve([]),
    input.sep5Author ? withinOr(() => input.recentVoices(input.storeId, new Date(), 12), SHOWN_CARDS_TIMEOUT_MS, [] as RecentVoice[]) : Promise.resolve([] as RecentVoice[]),
  ]);
  const described = new Map<string, string>((cached as Array<{ digest: string; description: string }>).map(entry => [entry.digest, entry.description]));
  applyPhotoDescriptions(input.assetLegend, photos, described);
  const onboarding = readOnboardingMaterial((row as { onboarding?: unknown } | null)?.onboarding);
  const carried = previous ?? sanitizeVoice(input.proposalVoice);
  return {
    ...empty, on: true, fresh: input.sep5Author && !previous, onboarding,
    merchantMessages: merchantMessagesText(messages as Array<{ content: string }>),
    siblings: voicesToDiffer(siblings, input.kind),
    photos, described,
    // Answers given after the sheet was written (onboarding, or a kind question answered in chat) join it as the merchant's own.
    sheet: carried && onboarding.answers.length ? withOnboardingAnswers(carried, onboarding.answers) : carried,
  };
}

export type VoiceStageDeps = {
  voice: VoiceRun;
  assetLegend: LegendEntry[];
  sep5Call: Sep5Caller['sep5Call'];
  prisma: Pick<PrismaService, 'mediaAssetDescription'>;
  merchantId: string;
  signal: AbortSignal;
  logger: Pick<Logger, 'log' | 'warn'>;
  runId: string;
};

/** Part 1: photos the cache does not have, described once (one call at a time, 30 s in all) and saved by digest. Never rejects. */
export async function describeNewPhotos(deps: VoiceStageDeps): Promise<void> {
  const { voice } = deps;
  const fresh = voice.photos.filter(photo => !voice.described.has(photo.digest));
  if (!fresh.length) return;
  const photoSignal = AbortSignal.any([deps.signal, AbortSignal.timeout(PHOTO_DESCRIPTION_TIMEOUT_MS)]);
  try {
    const found = await describePhotos({
      photos: fresh,
      call: async (text, image) => {
        const { attempt, body } = await deps.sep5Call('photo', text, [{ type: 'input_image', image_url: image, detail: 'auto' }], 'photo_description', PHOTO_DESCRIPTION_SCHEMA, PHOTO_DESCRIPTION_TIMEOUT_MS, { signal: photoSignal, maxOutputTokens: PHOTO_DESCRIPTION_MAX_OUTPUT_TOKENS, effort: 'low' });
        return { body, used: () => { attempt.status = 'COMPLETED'; } };
      },
      save: (digest, description) => deps.prisma.mediaAssetDescription.upsert({ where: { merchantId_digest: { merchantId: deps.merchantId, digest } }, create: { merchantId: deps.merchantId, digest, description }, update: {} }),
    });
    for (const [digest, description] of found) voice.described.set(digest, description);
    applyPhotoDescriptions(deps.assetLegend, voice.photos, voice.described);
    deps.logger.log(JSON.stringify({ event: 'photo_descriptions', generationId: deps.runId, asked: fresh.length, described: found.size }));
  } catch (error) {
    if (!deps.signal.aborted) deps.logger.warn(JSON.stringify({ event: 'photo_descriptions_failed', generationId: deps.runId, reason: ((error as Error)?.message || '').slice(0, 300) }));
  }
}

export type VoiceSheetDeps = VoiceStageDeps & { storeName: string; brief: unknown; products: Array<{ name: string; description?: string }> };
/** Part 2: the sheet call, after the photos are described, on its own deadline. Null when it fails or answers nothing usable;
 *  the attempt is billed only for a kept sheet. Never rejects: the style proposal and the author await it. */
export async function writeVoiceSheet(deps: VoiceSheetDeps): Promise<StoreVoice | null> {
  const { voice } = deps;
  await voice.photosJob;
  const voiceSignal = AbortSignal.any([deps.signal, AbortSignal.timeout(voiceDeadlineMs())]);
  try {
    const written = await runVoiceSheet({
      material: {
        storeName: deps.storeName, kind: voice.kind, merchantMessages: voice.merchantMessages, onboarding: voice.onboarding, brief: deps.brief, products: deps.products,
        photos: deps.assetLegend.flatMap(entry => (entry.description ? [{ path: entry.path, description: entry.description }] : [])),
        ...(voice.brain ? { brain: voice.brain } : {}),
        differFrom: voice.siblings.flatMap(row => (row.voice ? [row.voice] : [])),
      },
      call: async text => {
        const { attempt, body } = await deps.sep5Call('voice', text, [], 'store_voice', VOICE_SCHEMA, voiceDeadlineMs(), { signal: voiceSignal, maxOutputTokens: VOICE_MAX_OUTPUT_TOKENS, effort: 'low' });
        return { body, used: () => { attempt.status = 'COMPLETED'; } };
      },
    });
    if (!written) {
      deps.logger.warn(JSON.stringify({ event: 'voice_sheet_dropped', generationId: deps.runId, reason: 'unusable answer' }));
      return null;
    }
    written.used();
    deps.logger.log(JSON.stringify({ event: 'voice_sheet_written', generationId: deps.runId, specifics: written.voice.specifics.length, merchant: merchantSpecificCount(written.voice), assumed: written.voice.assumed.length }));
    return written.voice;
  } catch (error) {
    if (!deps.signal.aborted) deps.logger.warn(JSON.stringify({ event: 'voice_sheet_dropped', generationId: deps.runId, reason: voiceSignal.aborted ? 'deadline' : ((error as Error)?.message || '').slice(0, 300) }));
    return null;
  }
}

/** What the copy check reads in this run (spec part 4): the merchant's words and the brief that repeats them, every other source
 *  of fact (the public store data, the Store Brain, photo descriptions), the real prices and the sibling stores' sentences. */
export function voiceCopyInput(voice: VoiceRun, run: { data: { items: ReadonlyArray<unknown> }; assetLegend: readonly LegendEntry[]; brief: unknown }, files: CopyCheckInput['files']): CopyCheckInput {
  const brief = (run.brief && typeof run.brief === 'object' ? run.brief : {}) as { businessInformation?: unknown; visualDirection?: unknown };
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    files, voice: voice.sheet, kind: voice.kind,
    merchantText: [...merchantTextOf(voice.merchantMessages, voice.onboarding), text(brief.businessInformation), text(brief.visualDirection)].filter(Boolean),
    sources: [JSON.stringify({ ...run.data, items: run.data.items.slice(0, 60) }), ...(voice.brain ? [JSON.stringify(voice.brain)] : []), ...run.assetLegend.flatMap(entry => (entry.description ? [entry.description] : []))],
    prices: storePrices(run.data.items),
    siblings: voice.siblings.flatMap(row => row.sentences),
  };
}
/** One log line (event copy_findings): the findings still on the pages, counted by kind, with the review's notes beside them. */
export function copyFindingsLog(runId: string, input: CopyCheckInput, notes: readonly string[]): string {
  const found = checkCopy(input);
  return JSON.stringify({ event: 'copy_findings', generationId: runId, counts: copyFindingCounts(found), findings: copyFindingLines(found, 12), notes });
}
