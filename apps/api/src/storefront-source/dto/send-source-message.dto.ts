import { SOURCE_MOTION_MODES, SOURCE_SCROLL_FEELS, type SourceMotionMode, type SourceScrollFeel } from '../source-motion';
import { IsInt, Min, Max, IsIn as IsModelIn } from 'class-validator';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../source-generation-policy';
import { IsIn, IsUUID, ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SourceProjectRevisionDto } from './save-source-project.dto';
export class SendSourceMessageDto extends SourceProjectRevisionDto {
  @IsOptional() @IsIn(['shop', 'service', 'portfolio', 'editorial']) sitePurpose?: 'shop' | 'service' | 'portfolio' | 'editorial';
  @IsOptional() @IsUUID() requestId?: string;
  /** @deprecated Accepted only for older clients; never used for generation. */
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
}
