import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";

export class CreateCategoryDto {
  @ApiProperty({ example: "Bebidas" })
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ description: "Lower sorts first on the storefront. Defaults to the end of the list.", example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true, description: "Merchant-owned image used as this category's storefront banner." })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN)
  bannerUrl?: string | null;

  @ApiPropertyOptional({ type: [String], description: "Up to four merchant-authored informational labels shown on the category banner." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  @IsSafeText({ each: true })
  @MaxLength(40, { each: true })
  highlights?: string[];
}
