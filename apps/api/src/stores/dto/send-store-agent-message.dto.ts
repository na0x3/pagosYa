import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength, IsIn, IsInt, Min, Max, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";

export class StoreAgentSelectionDto {
  @IsIn(["section", "section-media", "section-item", "section-block", "animation", "animation-media", "hero-slide", "editorial-image", "visual-setting"])
  entity!: string;

  @IsString() @MaxLength(64)
  targetId!: string;

  @IsString() @MaxLength(64)
  parentId!: string;

  @IsString() @MaxLength(48)
  field!: string;

  @IsInt() @Min(-1) @Max(200)
  position!: number;

  @IsString() @MaxLength(48)
  pageId!: string;
}

export class SendStoreAgentMessageDto {
  @ApiProperty({ description: "Saved private website revision used by this request." })
  @IsInt() @Min(0)
  revision!: number;

  @ApiPropertyOptional({ type: StoreAgentSelectionDto })
  @IsOptional() @ValidateNested() @Type(() => StoreAgentSelectionDto)
  selection?: StoreAgentSelectionDto | null;
  @ApiProperty({
    description: "A merchant instruction for the current private storefront proposal.",
    example: "Mantén el catálogo, pero haz la apertura más cálida.",
  })
  @IsString()
  @IsSafeText()
  @MaxLength(1200)
  instruction!: string;

  @ApiPropertyOptional({ description: "Private proposal that this revision must inherit." })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  proposalId?: string;

  @ApiPropertyOptional({ description: "Merchant-owned visual references for a new storefront direction.", type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true, message: "Every asset URL must come from POST /v1/uploads" })
  assetUrls?: string[];
}
