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

  // Customer fields: a value is used as typed, `null` clears the field (it wins over the CRM row),
  // and an omitted field is filled from `businessCustomerId`'s CRM row.
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @IsSafeText() @MaxLength(120)
  customerName?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "null clears it (no CRM fallback)." }) @IsOptional() @IsEmail() @MaxLength(254)
  customerEmail?: string | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @IsSafeText() @MaxLength(40)
  customerPhone?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "NIT or CI." }) @IsOptional() @IsString() @IsSafeText() @MaxLength(24)
  customerDocument?: string | null;

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

export const DOCUMENT_LIST_STATES = ["open", "overdue", "paid", "draft", "accepted", "closed"] as const;
export type DocumentListState = (typeof DOCUMENT_LIST_STATES)[number];

export class ListBusinessDocumentsQueryDto {
  @ApiPropertyOptional({ enum: BusinessDocumentKind }) @IsOptional() @IsEnum(BusinessDocumentKind)
  kind?: BusinessDocumentKind;

  @ApiPropertyOptional({ enum: BusinessDocumentStatus }) @IsOptional() @IsEnum(BusinessDocumentStatus)
  status?: BusinessDocumentStatus;

  @ApiPropertyOptional({
    enum: DOCUMENT_LIST_STATES,
    description: "Cobros: open = sent and unpaid (overdue included); overdue = past its due date. Proposals: draft, open (sent, still valid), accepted, closed (expired, voided or past validity). Computed on the server.",
  })
  @IsOptional() @IsIn(DOCUMENT_LIST_STATES)
  state?: DocumentListState;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: "The id of the last row of the previous page (newest first)." })
  @IsOptional() @IsString() @MaxLength(40)
  cursor?: string;
}

export const COBRO_REMINDER_CHANNELS = ["email", "whatsapp"] as const;
export const COBRO_SHARE_CHANNELS = ["whatsapp", "link"] as const;

export class RemindCobroDto {
  @ApiProperty({ enum: COBRO_REMINDER_CHANNELS, description: "email sends a reminder (capped per store); whatsapp only records it — the dashboard opens wa.me." })
  @IsIn(COBRO_REMINDER_CHANNELS)
  channel!: (typeof COBRO_REMINDER_CHANNELS)[number];
}

export class ShareCobroDto {
  @ApiProperty({ enum: COBRO_SHARE_CHANNELS })
  @IsIn(COBRO_SHARE_CHANNELS)
  channel!: (typeof COBRO_SHARE_CHANNELS)[number];
}

export const COBRO_MANUAL_PAYMENT_METHODS = ["cash", "transfer", "other"] as const;

export class MarkCobroPaidDto {
  @ApiProperty({ enum: COBRO_MANUAL_PAYMENT_METHODS, description: "How the customer paid outside pagosYa." })
  @IsIn(COBRO_MANUAL_PAYMENT_METHODS)
  method!: (typeof COBRO_MANUAL_PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ description: "A note for the merchant's records (receipt, transfer number)." })
  @IsOptional() @IsString() @IsSafeText() @MaxLength(200)
  reference?: string;
}

export class CobroRemindersDto {
  @ApiProperty({ description: "Email the customer on the due date and 3 days after it." })
  @IsBoolean()
  autoReminders!: boolean;
}

export class DocumentCustomersQueryDto {
  @ApiPropertyOptional({ description: "Part of a name, email or phone." })
  @IsOptional() @IsString() @MaxLength(80)
  q?: string;
}

// ── proposals (D2) ────────────────────────────────────────────────────────

export const PROPOSAL_TONES = ["formal", "cercano"] as const;

export class DraftProposalDto {
  @ApiProperty({ example: "Diseño de logo e identidad para una cafetería que abre en noviembre" })
  @IsString() @IsSafeText() @Length(10, 2000)
  brief!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsSafeText() @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254)
  customerEmail?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsSafeText() @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional({ description: "What the merchant wants to charge, in their words (only these numbers may become prices)." })
  @IsOptional() @IsString() @IsSafeText() @MaxLength(200)
  budgetHint?: string;

  @ApiPropertyOptional({ description: "A deadline in the merchant's words or a date." })
  @IsOptional() @IsString() @IsSafeText() @MaxLength(120)
  deadline?: string;

  @ApiPropertyOptional({ enum: PROPOSAL_TONES, default: "formal" })
  @IsOptional() @IsIn(PROPOSAL_TONES)
  tone?: (typeof PROPOSAL_TONES)[number];
}

export class RegenerateProposalSectionDto {
  @ApiProperty({ type: BusinessDocumentBlockDto, description: "The section as the editor has it now." })
  @ValidateNested() @Type(() => BusinessDocumentBlockDto)
  block!: BusinessDocumentBlockDto;

  @ApiPropertyOptional({ description: "e.g. \"más breve\", \"menciona el envío\"" })
  @IsOptional() @IsString() @IsSafeText() @MaxLength(300)
  instruction?: string;
}

export class AcceptProposalDto {
  @ApiProperty({ description: "The name the customer types to accept." })
  @IsString() @IsSafeText() @Length(2, 120)
  name!: string;

  @ApiProperty() @IsEmail() @MaxLength(254)
  email!: string;

  @ApiProperty({ description: "The version the customer read; a newer one must be read first." })
  @IsInt() @Min(1) @Max(100_000)
  version!: number;
}

export class RequestProposalChangesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsSafeText() @MaxLength(120)
  name?: string;

  @ApiProperty() @IsEmail() @MaxLength(254)
  email!: string;

  @ApiProperty() @IsString() @IsSafeText() @Length(3, 2000)
  message!: string;
}

export class CreateCobroFromProposalDto {
  @ApiPropertyOptional({ description: "Defaults to 7 days (end of that day in La Paz)." })
  @IsOptional() @IsDateString()
  dueAt?: string;
}
