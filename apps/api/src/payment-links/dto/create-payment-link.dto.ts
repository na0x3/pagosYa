import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class ProductVariantDto {
  @ApiPropertyOptional({ description: "Stable option id returned by the API. Include it when editing an existing option." })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  id?: string;

  @ApiProperty({ example: "Grande" })
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ description: "Option price in minor units (centavos).", example: 6500 })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    description: "Remaining units for this option. Send null for unlimited stock.",
    example: 8,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number | null;
}

export class CreatePaymentLinkDto {
  @ApiProperty({ example: "Corte de cabello" })
  @IsString()
  @IsSafeText()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: "Incluye lavado y peinado", description: "Omit to leave unchanged, or send null to clear.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    description: "Paths returned by POST /v1/uploads for product photos (JPEG/PNG/WEBP). First entry is the cover photo.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true, message: "each imageUrls entry must be a path returned by POST /v1/uploads" })
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: "Short labels shown as badges, e.g. \"Nuevo\", \"Agotado\".", type: [String], example: ["Nuevo"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @IsSafeText({ each: true })
  @MaxLength(24, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: "Remaining units. Omit to leave unchanged, or send null for unlimited (not tracked).",
    example: 10,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number | null;

  @ApiPropertyOptional({
    description:
      "Purchasable choices such as Pequeña/Grande. Each choice supplies its customer-facing price and may track its own stock.",
    type: [ProductVariantDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional({
    description: "Category (within the same store) this product belongs to. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  categoryId?: string | null;

  @ApiProperty({ description: "Amount in minor units (centavos). e.g. 1000 = 10.00 BOB", example: 5000 })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ example: "BOB", default: "BOB" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({
    description: "6-digit hex color swatch for this product, e.g. a T-shirt color. Omit to leave unchanged, or send null to clear.",
    example: "#1d4ed8",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "color must be a 6-digit hex color, e.g. #1d4ed8" })
  color?: string | null;
}
