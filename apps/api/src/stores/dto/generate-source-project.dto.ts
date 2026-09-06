import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { SourceProjectBriefDto, SourceProjectRevisionDto } from "./save-source-project.dto";

export class GenerateSourceProjectDto extends SourceProjectRevisionDto {
  @IsDefined() @ValidateNested() @Type(() => SourceProjectBriefDto) brief!: SourceProjectBriefDto;
  @IsString() @MaxLength(8000) instruction!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(500, { each: true }) assetUrls?: string[];
}
