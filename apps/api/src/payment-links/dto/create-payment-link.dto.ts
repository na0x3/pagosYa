import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
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
import { PRODUCT_HIGHLIGHT_ICONS } from "../product-highlights";

const PRODUCT_IMAGE_POSITION_PATTERN = /^(?:0|[1-9]\d?|100)% (?:0|[1-9]\d?|100)%$/;

export class ProductOptionValueDto {
  @IsString() @IsSafeText() @Length(1, 40)
  name!: string;

  @IsString() @IsSafeText() @Length(1, 40)
  value!: string;
}

export class ProductSpecificationDto {
  @IsString() @IsSafeText() @Length(1, 40)
  label!: string;

  @IsString() @IsSafeText() @Length(1, 120)
  value!: string;
}

export class ProductHighlightDto {
  @ApiProperty({ description: "Icon name drawn by the storefront.", enum: PRODUCT_HIGHLIGHT_ICONS })
  @IsIn(PRODUCT_HIGHLIGHT_ICONS as unknown as string[])
  icon!: string;

  @IsString() @IsSafeText() @Length(1, 24)
  label!: string;

  @IsOptional() @IsString() @IsSafeText() @Length(1, 40)
  detail?: string;
}

export class ProductVariantDto {
  @IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => ProductOptionValueDto)
  options?: ProductOptionValueDto[];

  @IsOptional() @IsString() @Matches(UPLOADED_FILE_URL_PATTERN) @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  imageUrl?: string | null;
  @ApiPropertyOptional({ description: "Stable option id returned by the API. Include it when editing an existing option." })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  id?: string;

  @ApiProperty({ example: "Grande" })
  @IsString()
  @IsSafeText()
  @MaxLength(260)
  name!: string;

  @ApiProperty({ description: "Option price in minor units (centavos).", example: 6500 })
  @IsInt()
  @Min(0)
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

export class ProductExtraDto {
  @ApiPropertyOptional({ description: "Stable extra id returned by the API. Include it when editing." })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  id?: string;

  @ApiProperty({ example: "Queso extra" })
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ description: "Additional price in minor units (centavos).", example: 500 })
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ description: "Optional choice group, e.g. Guarniciones." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  groupName?: string;

  @ApiPropertyOptional({ description: "Selections from this group included at no charge before extra prices apply.", example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  freeAllowance?: number;

  @ApiPropertyOptional({ description: "Customer must select this extra before adding the product.", default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: "Shared inventory name. Extras with the same name in this store consume one common stock pool.",
    example: "Queso cottage",
  })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  inventoryName?: string;

  @ApiPropertyOptional({ description: "Remaining units in the shared inventory pool.", example: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;
}

export class CreatePaymentLinkDto {
  @IsOptional() @IsInt() @Min(0) @Max(100000000) shippingWeightGrams?: number;
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
  @ArrayMaxSize(10)
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true, message: "each imageUrls entry must be a path returned by POST /v1/uploads" })
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: "Crop focus for each product photo as an x/y percentage pair, aligned with imageUrls.",
    type: [String],
    example: ["50% 35%"],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(PRODUCT_IMAGE_POSITION_PATTERN, { each: true, message: "each imagePositions entry must use the format x% y% from 0 to 100" })
  imagePositions?: string[];

  @ApiPropertyOptional({ description: "Short labels shown as badges, e.g. \"Nuevo\", \"Agotado\".", type: [String], example: ["Nuevo"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @IsSafeText({ each: true })
  @MaxLength(24, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Ordered specification rows shown on the product page, e.g. Material: Algodón.", type: [ProductSpecificationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationDto)
  specifications?: ProductSpecificationDto[];

  @ApiPropertyOptional({ description: "Up to four approved highlights with an icon shown on the product page.", type: [ProductHighlightDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ProductHighlightDto)
  highlights?: ProductHighlightDto[];

  @ApiPropertyOptional({
    description: "Ordered Payment Link ids shown as recommendations on this product's detail page.",
    type: [String],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  recommendedProductIds?: string[];

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
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional({
    description: "Additive extras charged on top of the product or selected option price.",
    type: [ProductExtraDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProductExtraDto)
  extras?: ProductExtraDto[];

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
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: "BOB", default: "BOB" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: "Percentage deducted while the scheduled campaign is active.", example: 20, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(99)
  discountPercent?: number | null;

  @ApiPropertyOptional({ description: "ISO-8601 campaign start time.", example: "2026-08-21T14:00:00.000Z", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  discountStartsAt?: string | null;

  @ApiPropertyOptional({ description: "ISO-8601 campaign end time.", example: "2026-08-28T14:00:00.000Z", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  discountEndsAt?: string | null;

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

  @ApiPropertyOptional({
    description: "Merchant/PagosYa product code (codigoProducto in SIN XML), distinct from codigoProductoSin.",
    example: "NIKE-AM90",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: "codigoProducto may contain letters, numbers, dot, underscore, and hyphen" })
  codigoProducto?: string;

  @ApiPropertyOptional({ description: "Merchant NIT activity from sincronizarActividades.", example: "477210" })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: "actividadEconomica must be a synchronized numeric activity code" })
  actividadEconomica?: string;

  @ApiPropertyOptional({ description: "SIN generic product/service classification for the selected activity." })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: "codigoProductoSin must be a synchronized numeric product code" })
  codigoProductoSin?: string;

  @ApiPropertyOptional({ description: "Unit classifier from sincronizarParametricaUnidadMedida.", example: 58 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  unidadMedida?: number;
}
