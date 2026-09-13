import { SOURCE_MOTION_MODES, type SourceMotionMode } from '../source-motion';
import { IsInt, Min, Max, IsIn as IsModelIn } from 'class-validator';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../source-generation-policy';
import { IsIn, ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SourceProjectRevisionDto } from './save-source-project.dto';
export class SendSourceMessageDto extends SourceProjectRevisionDto {
  /** @deprecated Accepted only for older clients; never used for generation. */
  @IsOptional() @IsString() @MaxLength(80) themeId?: string;
  @IsOptional() @IsModelIn(SOURCE_MOTION_MODES) motion?: SourceMotionMode;
  @IsOptional() @IsModelIn(SOURCE_MODEL_CHOICES) model?: SourceModelChoice;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxCredits?: number;
  @IsString() @MinLength(1) @MaxLength(12000) instruction!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(500, { each: true }) assetUrls?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(500, { each: true }) browserReview?: string[];
  @IsOptional() @IsIn(['conversation', 'logo', 'brand', 'audience', 'business', 'products', 'delivery', 'colors', 'review']) setupStep?: string;
  @IsOptional() @IsIn(['generate', 'restart', 'quick', 'product-photo']) setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo';
}
