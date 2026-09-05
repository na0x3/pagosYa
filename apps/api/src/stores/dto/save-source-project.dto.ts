import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class SourceProjectBriefDto {
  @IsString() @MinLength(1) @MaxLength(120) businessType!: string;
  @IsString() @MinLength(1) @MaxLength(500) audience!: string;
  @IsString() @MinLength(1) @MaxLength(500) primaryAction!: string;
  @IsString() @MinLength(1) @MaxLength(2000) visualDirection!: string;
}

export class SourceProjectFileDto {
  @IsString() @MinLength(1) @MaxLength(200) path!: string;
  @IsString() @MaxLength(180_000) content!: string;
  @IsOptional() @IsIn(["utf8", "base64"]) encoding?: "utf8" | "base64";
}

export class SourceProjectRevisionDto {
  @IsInt() @Min(0) @Max(2_147_483_646) revision!: number;
}

export class SaveSourceProjectDto extends SourceProjectRevisionDto {
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsDefined() @ValidateNested() @Type(() => SourceProjectBriefDto) brief!: SourceProjectBriefDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => SourceProjectFileDto) files!: SourceProjectFileDto[];
}
