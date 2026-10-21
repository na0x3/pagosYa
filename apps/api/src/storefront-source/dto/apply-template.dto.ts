import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { SourceProjectRevisionDto } from './save-source-project.dto';

/** Applies a template over this revision; a stale revision is refused like every other save. */
export class ApplyTemplateDto extends SourceProjectRevisionDto {}

/** A curated Plantilla filled for the business (spec 2026-10-20 §4): what the merchant told us and photos they added. */
export class ApplyFilledTemplateDto extends SourceProjectRevisionDto {
  @IsOptional() @IsString() @MaxLength(2000) about?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(500, { each: true }) assetUrls?: string[];
}
