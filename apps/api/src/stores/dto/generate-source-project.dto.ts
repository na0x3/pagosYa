import { SOURCE_MOTION_MODES, type SourceMotionMode } from '../source-motion';
import { IsInt, Min, Max, IsIn as IsModelIn } from 'class-validator';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../source-generation-policy';
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { SourceProjectBriefDto, SourceProjectRevisionDto } from "./save-source-project.dto";

export class GenerateSourceProjectDto extends SourceProjectRevisionDto {
  @IsOptional() @IsInt() @Min(1) baseRevision?: number;

  /** @deprecated Accepted only for older clients; never used for generation. */
  @IsOptional() @IsString() @MaxLength(80) themeId?: string;
  @IsOptional() @IsModelIn(SOURCE_MOTION_MODES) motion?: SourceMotionMode;
  @IsOptional() @IsModelIn(SOURCE_MODEL_CHOICES) model?: SourceModelChoice;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxCredits?: number;
  @IsDefined() @ValidateNested() @Type(() => SourceProjectBriefDto) brief!: SourceProjectBriefDto;
  @IsString() @MaxLength(8000) instruction!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) @MaxLength(500, { each: true }) assetUrls?: string[];
}
