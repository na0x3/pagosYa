import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from "@nestjs/swagger";
import { BusinessDocumentKind, BusinessDocumentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { DOCUMENT_BLOCK_TYPES, type DocumentBlockType } from "../business-document-snapshot";

export const DOCUMENT_CURRENCIES = ["BOB", "USD"] as const;

export class BusinessDocumentItemDto {
  @ApiProperty({ example: "Diseño de logo" })
  @IsString() @IsSafeText() @Length(1, 500)
  description!: string;

  @ApiProperty({ example: 1, description: "Whole units, 1–100000." })
  @IsInt() @Min(1) @Max(100_000)
  quantity!: number;

  @ApiProperty({ example: 150000, description: "Unit price in minor units (centavos)." })
  @IsInt() @Min(0) @Max(1_000_000_000)
  unitAmount!: number;

  @ApiPropertyOptional({ description: "A product of the same store this line sells." })
  @IsOptional() @IsString() @MaxLength(40)
  paymentLinkId?: string;
}

export class BusinessDocumentBlockDto {
  @ApiProperty({ enum: DOCUMENT_BLOCK_TYPES })
  @IsIn(DOCUMENT_BLOCK_TYPES)
  type!: DocumentBlockType;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @IsSafeText() @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @IsSafeText() @MaxLength(5000)
  text?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @IsSafeText({ each: true }) @MaxLength(500, { each: true })
  items?: string[];
}

export class CreateBusinessDocumentDto {
  @ApiProperty({ enum: BusinessDocumentKind })
  @IsEnum(BusinessDocumentKind)
  kind!: BusinessDocumentKind;

  @ApiProperty({ example: "Diseño de identidad" })
  @IsString() @IsSafeText() @Length(1, 200)
  title!: string;

  @ApiPropertyOptional({ enum: DOCUMENT_CURRENCIES, default: "BOB" })
  @IsOptional() @IsIn(DOCUMENT_CURRENCIES)
  currency?: (typeof DOCUMENT_CURRENCIES)[number];

  @ApiPropertyOptional({ description: "A customer of the same store; its details fill any customer field not given." })
  @IsOptional() @IsString() @MaxLength(40)
  businessCustomerId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsSafeText() @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254)
  customerEmail?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsSafeText() @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional({ description: "NIT or CI." }) @IsOptional() @IsString() @IsSafeText() @MaxLength(24)
  customerDocument?: string;

  @ApiPropertyOptional({ description: "Document-level discount in minor units." })
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000)
  discountAmount?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ type: [BusinessDocumentBlockDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => BusinessDocumentBlockDto)
  content?: BusinessDocumentBlockDto[];

  @ApiPropertyOptional({ type: [BusinessDocumentItemDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BusinessDocumentItemDto)
  items?: BusinessDocumentItemDto[];

  @ApiPropertyOptional({ default: true, description: "Cobros: email the customer on the due date and 3 days after it." })
  @IsOptional() @IsBoolean()
  autoReminders?: boolean;
}

export class UpdateBusinessDocumentDto extends PartialType(OmitType(CreateBusinessDocumentDto, ["kind"] as const)) {}

export class SendBusinessDocumentDto {
  @ApiPropertyOptional({ default: true, description: "Email the customer (HTML + PDF) when the document has a customer email." })
  @IsOptional() @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ description: "A short note shown above the document in the email." })
  @IsOptional() @IsString() @IsSafeText() @MaxLength(1000)
  message?: string;
}

export class VoidBusinessDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsSafeText() @MaxLength(500)
  reason?: string;
}

export class ListBusinessDocumentsQueryDto {
  @ApiPropertyOptional({ enum: BusinessDocumentKind }) @IsOptional() @IsEnum(BusinessDocumentKind)
  kind?: BusinessDocumentKind;

  @ApiPropertyOptional({ enum: BusinessDocumentStatus }) @IsOptional() @IsEnum(BusinessDocumentStatus)
  status?: BusinessDocumentStatus;
}
