import { SOURCE_MOTION_MODES, SOURCE_SCROLL_FEELS, type SourceMotionMode, type SourceScrollFeel } from '../source-motion';
import { IsInt, Min, Max, IsIn as IsModelIn } from 'class-validator';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../source-generation-policy';
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDefined, Matches, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { SourceSelectionDto } from "./source-selection.dto";
import { SourceProjectBriefDto, SourceProjectRevisionDto } from "./save-source-project.dto";

export class GenerateSourceProjectDto extends SourceProjectRevisionDto {
  @IsOptional() @IsInt() @Min(1) baseRevision?: number;

  /** @deprecated Accepted only for older clients; never used for generation. */
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]{1,160}$/) designSeed?: string;
  @IsOptional() @IsString() @MaxLength(80) themeId?: string;
  @IsOptional() @IsModelIn(SOURCE_MOTION_MODES) motion?: SourceMotionMode;
  @IsOptional() @IsModelIn(SOURCE_SCROLL_FEELS) scrollFeel?: SourceScrollFeel;
  @IsOptional() @IsModelIn(SOURCE_MODEL_CHOICES) model?: SourceModelChoice;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxCredits?: number;
  @IsDefined() @ValidateNested() @Type(() => SourceProjectBriefDto) brief!: SourceProjectBriefDto;
  @IsString() @MaxLength(8000) instruction!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(500, { each: true }) assetUrls?: string[];
  @IsOptional() @ValidateNested() @Type(() => SourceSelectionDto) selection?: SourceSelectionDto;
  /** Preview context for phrases such as 'this page'; does not override an explicit global request. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,63}\.html$/) currentPage?: string;
}
