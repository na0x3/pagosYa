import { SOURCE_MOTION_MODES, SOURCE_SCROLL_FEELS, type SourceMotionMode, type SourceScrollFeel } from '../source-motion';
import { IsInt, Min, Max, IsIn as IsModelIn } from 'class-validator';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../source-generation-policy';
import { IsBoolean, IsIn, IsUUID, ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { SourceSelectionDto } from './source-selection.dto';
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
  /** Preview context for phrases such as 'this page'; does not override an explicit global request. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,63}\.html$/) currentPage?: string;
  /** "Elige tu estilo" (spec 2026-10-11): build from this saved proposal's card, or YAPI's recommendation when auto. */
  @IsOptional() @ValidateNested() @Type(() => SourceStylePickDto) stylePick?: SourceStylePickDto;
}
