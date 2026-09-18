import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";

export class ProductImageDraftDto {
  @ApiProperty({ description: "Merchant upload returned by POST /v1/uploads." })
  @IsString()
  @Matches(UPLOADED_FILE_URL_PATTERN)
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  imageUrl!: string;

  @ApiProperty({ description: "Merchant-confirmed price in minor units (centavos).", example: 4550 })
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ description: "Merchant-confirmed storefront section/category.", example: "Cerámica" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  categoryName?: string;
}

export class ImportProductImagesDto {
  @ApiProperty({ type: [ProductImageDraftDto], description: "Product photos with prices and optional sections to interpret and create." })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProductImageDraftDto)
  products!: ProductImageDraftDto[];
}
