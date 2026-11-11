import { SOURCE_MOTION_MODES, SOURCE_SCROLL_FEELS, type SourceMotionMode, type SourceScrollFeel } from '../source-motion';
import { IsInt, Min, Max, IsIn as IsModelIn } from 'class-validator';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../source-generation-policy';
import { IsBoolean, IsIn, IsUUID, ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { SourceSelectionDto, SourceViewingDto } from './source-selection.dto';
import { SourceProjectRevisionDto } from './save-source-project.dto';
export class SourceStylePickDto {
  @IsString() @Matches(/^[a-z0-9]{8,40}$/i) generationId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(3) index?: number;
  @IsOptional() @IsBoolean() auto?: boolean;
}
export class SendSourceMessageDto extends SourceProjectRevisionDto {
  @IsOptional() @IsIn(['shop', 'service', 'portfolio', 'editorial']) sitePurpose?: 'shop' | 'service' | 'portfolio' | 'editorial';
  @IsOptional() @IsUUID() requestId?: string;
  /** @deprecated Accepted only for older clients; never used for generation. */
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]{1,160}$/) designSeed?: string;
  @IsOptional() @IsString() @MaxLength(80) themeId?: string;
  @IsOptional() @IsModelIn(SOURCE_MOTION_MODES) motion?: SourceMotionMode;
  @IsOptional() @IsModelIn(SOURCE_SCROLL_FEELS) scrollFeel?: SourceScrollFeel;
  @IsOptional() @IsModelIn(SOURCE_MODEL_CHOICES) model?: SourceModelChoice;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxCredits?: number;
  @IsString() @MinLength(1) @MaxLength(12000) instruction!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(500, { each: true }) assetUrls?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(500, { each: true }) browserReview?: string[];
  @IsOptional() @IsIn(['conversation', 'logo', 'brand', 'audience', 'business', 'products', 'delivery', 'colors', 'review']) setupStep?: string;
  @IsOptional() @IsIn(['generate', 'restart', 'quick', 'product-photo']) setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo';
  /** A Plantilla card the merchant tapped in YAPI's message (spec 2026-09-26); must be one the last message offered. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,40}$/) templateId?: string;
  /** A design direction card the merchant tapped (sub-project 2); only valid against the last set YAPI offered. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,40}$/) directionId?: string;
  /** "Guardar borrador": finish the run whose draft was preserved on this revision instead of starting over from the
   * saved revision. Sent with that run's original request; the conversation step is skipped when its decision was kept. */
  @IsOptional() @IsBoolean() resumeDraft?: boolean;
  /** A section the merchant picked in the preview (visual selection editor); scopes the edit to it. */
  @IsOptional() @ValidateNested() @Type(() => SourceSelectionDto) selection?: SourceSelectionDto;
  /** What the merchant had on screen when nothing is selected (spec 2026-11-05 point-at). */
  @IsOptional() @ValidateNested() @Type(() => SourceViewingDto) viewing?: SourceViewingDto;
  /** Preview context for phrases such as 'this page'; does not override an explicit global request. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,63}\.html$/) currentPage?: string;
  /** "Elige tu estilo" (spec 2026-10-11): build from this saved proposal's card, or YAPI's recommendation when auto. */
  @IsOptional() @ValidateNested() @Type(() => SourceStylePickDto) stylePick?: SourceStylePickDto;
  /** YAPI plan card (spec 2026-10-22): build the plan YAPI showed in this message. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9]{8,40}$/i) planId?: string;
}

/** A message as the chat service runs it. personalTouch (variety spec §5) is set only by the job runner's own follow-up: it is
 *  not on the DTO, so the API rejects it from clients (review fix). A class field here would reach every request body. */
export type SourceMessageInput = SendSourceMessageDto & { personalTouch?: boolean;
  /** YAPI tour (spec 2026-11-09): this request answers «¿Qué le cambio?» for that step; the job asks «¿Así está bien?» after. */
  tourStepId?: string;
  /** The merchant's own words of a tour reply (the request itself names the part); the chat shows these. */
  tourWords?: string;
  /** Spec 2026-11-09 A/B tests: a design test ask — the edit builds B, and the job posts the test card with the saved revision. */
  abRequest?: string;
  /** The follow-up carries the merchant's own request (pages, look) rather than a touch of YAPI's: it fails out loud. */
  ownRequest?: boolean;
  /** «sigue» after an unfinished request: what the merchant typed, shown in the chat while the kept request runs. */
  resumeWords?: string;
  /** The PEPPA recipe (owner 2026-10-23): the follow-up is a full redesign of the new template store, not a minimal edit. */
  redesign?: boolean;
  /** Spec 2026-10-28: the redesign that follows a new store's template build; the merchant sees only its result. */
  firstDesign?: boolean;
  /** Set by the job runner, never by a client: a spent quota on this first-design try sends it back to the queue. */
  quotaRetry?: boolean;
  /** Owner 2026-10-27 (ported to Oct-24): the follow-up is the data-only polish of a new master store. */ polish?: boolean;
  /** Owner 2026-10-27 («more accurateness»): the merchant's first message, checked point by point after the last build step. */
  checklistWords?: string;
  /** The check itself: 1 after the polish (may queue a fix), 2 after the fix (says what is left). */
  briefCheck?: 1 | 2;
  /** The capped edit that adds what the check found missing; the final check follows it. */
  checklistFix?: boolean;
  /** What that edit was asked to add, named in the chat when it could not. */
  checklistMissing?: string[];
  /** Spec 2026-10-29: the home page writer that follows the polish of a new master store. */
  homeWriter?: boolean;
  /** Spec 2026-10-31: the home composed from the section library, after the polish of a new master store. */
  sectionLibrary?: boolean;
  /** «sigue» after a library call that failed (2026-11-10): the revision whose template sections to fill (the store now shows a bare home). */
  sectionLibraryFrom?: number;
  /** Owner 2026-10-27: the follow-up is a guarded personal touch (source-guarded-touch.ts). */
  guardedTouch?: boolean;
  /** Spec 2026-11-01 template quick edits: the part of a request the layout edit could not do, run after it as its own edit. */
  layoutRest?: boolean;
  /** Fix 4 (2026-11-02): the part of a message left after its shipping price was set, run as its own edit. */
  shippingRest?: boolean;
  /** Fix 6 (2026-11-02): a template switch's fill — the merchant's earlier asks (words only, no check) and the sections the old home
   *  had that the new template lacks (types and words, no photos). */
  earlierAsks?: string;
  carry?: Array<{ type: string; [key: string]: unknown }> };
