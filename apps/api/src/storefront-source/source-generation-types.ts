import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiUsageService } from '../ai-usage/ai-usage.service';
import type { BrandProfileService } from '../brand/brand-profile.service';
import type { GenerateSourceProjectDto } from './dto/generate-source-project.dto';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceProgressReporter } from './source-progress';
import type { sourceGenerationPlan } from './source-generation-policy';
import type { sourceProvider } from './source-provider';
import type { LegendEntry } from './photo-descriptions';
import type { VoiceRun } from './store-voice-run';
import type { SourceRequestBudget } from './source-request-budget';
import type { sourceStoreConfigData } from './source-store-config';
import type { SourceImageUse } from './source-setup';
import type { SourcePhotoFacts } from './source-photo-facts';
import type { SourceDesign } from './source-design';
import type { SourceVisualSystem } from './source-visual-system';
import type { sourceSectionScope } from './source-edit-scope';
import type { SourceSitePurpose } from './source-site-purpose';
import type { SourceMotionMode, SourceScrollFeel } from './source-motion';
import type { resolveStoreAction } from './source-primary-action';
import type { SourceProjectSnapshot } from './source-project';
import type { StyleProposal } from './source-style-proposal';
import type { KitTouchCss } from './kit-touch';
import type { StoreLook } from './store-look';
import type { StoreControls } from './store-controls';
import type { frameForRun } from './design-engine/frame-draw';
import type { AgentStep, AgentToolbox } from './agent/agent-tools';
import type { PendingPolicies } from './source-agent-policies';
import type { requestedSourceProducts } from './source-products';
import type { SourceModel, sourceUsage } from './source-generation-policy';
import type { SaveSourceProjectDto } from './dto/save-source-project.dto';

// Types shared by SourceGenerationService and the modules split out of generate() (2026-10-15). This module imports
// types only and must never import the service: the service re-exports what its importers already use.

/** What a proposal-mode generate returns: the run now waits for the merchant to pick a card. */
export type StyleProposalResult = { styleProposal: { generationId: string; cards: number } };
/** One provider call of a run (or of its background review), as the row's attempts record it. */
export type SourceGenerationAttempt = { model: SourceModel; phase?: 'design' | 'source' | 'agent' | 'visual' | 'sketch' | 'composition' | 'brand' | 'creative' | 'critic' | 'author' | 'review' | 'touch' | 'controls' | 'photo' | 'voice' | 'tone'; durationMs: number; status: string; usage: ReturnType<typeof sourceUsage>; responseStatus?: string; incompleteReason?: string; reasoningTokens?: number; reasoningEffort?: string; failureReason?: string; tools?: string[]; diagnostics?: Array<{ tool: string; digest: string; durationMs: number; output: string }> };
/** The Sep-5 self-review as generate() hands it to startSep5Review: null when it has nothing to change. `deadline` is when
 * the stage's own signal times out (epoch ms), so a step inside it can keep time for the N+1 save. */
export type Sep5Review = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[]; deadline: number }) => Promise<{ saveInput: SaveSourceProjectDto; notes: string[] } | null>;
/** One image input of a Responses API request, as generate() builds them. */
export type SourceInputImage = { type: 'input_image'; image_url: string; detail: 'auto' };

/** generate()'s `execution` argument (unchanged; named so the stages can refer to it). */
export type GenerateExecution = { candidate?: boolean; free?: boolean; /** Who pays instead of the merchant (spec 2026-09-27 §3); recorded on the run. */ sponsor?: 'shopify-import'; redesign?: boolean; /** The chat kept the store on its template: the agent may rewrite whole components, not the stylesheet. */ keepTemplate?: boolean; /** "Guardar borrador": continue the preserved draft of this revision's latest unfinished run, whatever the chat said since. */ resumeDraft?: boolean; /** Evaluation script only: a candidate that keeps the merchant instruction and may use the agent. */ evaluate?: boolean; snapshot?: SourceProjectSnapshot; findings?: unknown; referenceCaptures?: Array<{ image: string; viewport: string; y: number; url?: string }>; signal?: AbortSignal; onDispatch?: () => void; onAttempts?: (attempts: unknown[]) => void; /** Elige tu estilo: a fresh design saves two style cards (one calm, one bold) on the run and returns before building. */ styleProposal?: boolean; /** Elige tu estilo: called once both cards are planned and choosable, before their heroes finish (spec 2026-10-12). */ onPickable?: (result: StyleProposalResult) => void; /** Elige tu estilo: build the card the merchant picked from a saved proposal. */ style?: { proposal: StyleProposal; index: number } };

/** The run's generated files as the acceptance chain sees them. */
export type GeneratedSource = { label: string; files: SourceProjectFileDto[]; products?: unknown; productOperations?: unknown; design?: SourceDesign };
/** What the agent reports with its revision. */
export type AgentOutcome = { summary: string; sections: string[]; steps: Array<Omit<AgentStep, 'thumbnail'>>; requirements: AgentToolbox['requirements']; evidence: AgentToolbox['evidence'] };

/** A generate() run's fixed values, built once inside generate() after its last `let` is declared. Every field is a `const`
 *  (or a parameter never reassigned after that point), so a stage may destructure it. */
export type GenerationRunFacts = {
  prisma: PrismaService; config: ConfigService; logger: Logger; metering?: AiUsageService;
  storeId: string; runId: string; slug: string;
  dto: GenerateSourceProjectDto; execution?: GenerateExecution; progress?: SourceProgressReporter;
  plan: ReturnType<typeof sourceGenerationPlan>; claude: boolean; chatgptPlan: boolean;
  provider: ReturnType<typeof sourceProvider>; apiKey: ReturnType<typeof sourceProvider>['apiKey']; agentProvider: ReturnType<typeof sourceProvider> | null;
  budget: SourceRequestBudget; signal: AbortSignal; attempts: SourceGenerationAttempt[]; autoRepairs: string[];
  started: number; runTimeout: number; stablePrompt: string; signatureOn: boolean;
  brand: Awaited<ReturnType<BrandProfileService['get']>> | undefined; apiUrl: URL; data: ReturnType<typeof sourceStoreConfigData>;
  images: SourceInputImage[]; assets: SourceProjectFileDto[]; retainedAssets: SourceProjectFileDto[];
  assetLegend: LegendEntry[]; assetUrls: string[]; ownedUrls: Set<string>;
  imageUses: SourceImageUse[]; photoFacts: Record<string, SourcePhotoFacts>; fontPaths: Record<string, string>;
  previous: { snapshot: unknown } | null; previousFiles: SourceProjectFileDto[]; oldFiles: SourceProjectFileDto[];
  previousDesign: SourceDesign | null; previousScene: SourceVisualSystem['scene'] | null; sectionScope: ReturnType<typeof sourceSectionScope>;
  sitePurpose: SourceSitePurpose; scrollFeel: SourceScrollFeel; motion: SourceMotionMode; primaryAction: ReturnType<typeof resolveStoreAction> | undefined;
  creative: boolean; redesign: boolean; useNext: boolean; editExisting: boolean;
  /** Store voice (spec 2026-10-14, store-voice-run.ts): read `voice.sheet` and the jobs through the object, never from a copy. */
  voice: VoiceRun;
};

/** generate()'s mutable run state, seen live: each property is a getter (and, where a stage writes it, a setter) onto
 *  generate()'s own `let`. Never destructure it or keep a property value past one synchronous step. That is how a
 *  stage would end up holding a stale copy. */
export type GenerationLive = {
  generated: GeneratedSource;
  products: ReturnType<typeof requestedSourceProducts>;
  unusedImagePaths: string[];
  motifFiles: SourceProjectFileDto[];
  lenient: boolean;
  reviewing: boolean;
  sep5Review: Sep5Review | undefined;
  kitTouch: KitTouchCss | undefined;
  readonly revisionLook: StoreLook | undefined;
  /** Store controls (spec 2026-10-14): the language revision N was saved with, the review stage's fallback. */
  readonly revisionControls: StoreControls | undefined;
  acceptedPreviewFiles: SourceProjectFileDto[];
  readonly committedDesign: SourceDesign | undefined;
  readonly boldAsked: boolean;
  readonly frame: ReturnType<typeof frameForRun>;
  readonly playbookText: string;
  readonly styleBold: boolean;
  visualSystem: SourceVisualSystem;
  readonly sketchFile: SourceProjectFileDto | null;
  readonly websiteDesignFile: SourceProjectFileDto | null;
  readonly compiledNext: SourceProjectFileDto[];
  agentTheme: AgentToolbox['pendingTheme'];
  agentAccountTheme: AgentToolbox['pendingAccountTheme'];
  agentMotifPack: AgentToolbox['pendingMotifPack'];
  agentPolicies: PendingPolicies;
  agentOutcome: AgentOutcome | undefined;
  unfinishedStatus: 'PARTIAL' | 'BLOCKED' | null;
  taskPrompt: string;
  readonly model: SourceModel;
};
