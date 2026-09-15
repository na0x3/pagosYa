import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const CURRENCIES = ["BOB", "USD"] as const;

export class CreateBusinessCustomerDto {
  @ApiProperty({ example: "María Pérez" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: "maria@example.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: "+591 71234567" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: "7845123" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  document?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class AdjustLoyaltyDto {
  @ApiProperty({ example: 25 })
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  points!: number;

  @ApiProperty({ example: "Compra de agosto" })
  @IsString()
  @MaxLength(160)
  reason!: string;
}

export class CreateAutomationDto {
  @ApiProperty({ example: "Recuperar pagos pendientes" })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: ["PAYMENT_RECOVERY", "DEBT_REMINDER", "LOW_STOCK", "APPOINTMENT_REMINDER"] })
  @IsIn(["PAYMENT_RECOVERY", "DEBT_REMINDER", "LOW_STOCK", "APPOINTMENT_REMINDER"])
  kind!: string;

  @ApiPropertyOptional({ enum: ["EMAIL", "WHATSAPP"], default: "EMAIL" })
  @IsOptional()
  @IsIn(["EMAIL", "WHATSAPP"])
  channel?: string;

  @ApiPropertyOptional({ default: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8_760)
  delayHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(140)
  subject?: string;

  @ApiProperty({ example: "Hola {{name}}, tienes una operación pendiente en {{store}}." })
  @IsString()
  @MaxLength(1_500)
  message!: string;
}

export class CreateDeliveryZoneDto {
  @IsOptional() @IsArray() @ArrayMaxSize(250) @Matches(/^[A-Z]{2}$/, { each: true }) countryCodes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @Matches(/^[A-Z0-9]{1,12}$/, { each: true }) postalPrefixes?: string[];
  @IsOptional() @IsIn(['BOB', 'USD']) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) freeAbove?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) maximumOrder?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000000) minimumWeightGrams?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000000) maximumWeightGrams?: number;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsInt()
  @Min(0)
  fee!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumOrder?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(500)
  radiusKm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_440)
  estimatedMinutes?: number;
}

export class CreateCourierDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle?: string;
}

export class AssignDeliveryDto {
  @IsOptional()
  @IsString()
  courierId?: string;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsIn(["UNASSIGNED", "ASSIGNED", "PICKED_UP", "DELIVERED", "CANCELED"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsDateString()
  estimatedAt?: string;
}

export class CreateSupplierDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  notes?: string;
}

export class PurchaseOrderItemDto {
  @IsOptional()
  @IsString()
  paymentLinkId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId!: string;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class AdjustInventoryDto {
  @IsString()
  paymentLinkId!: string;

  @IsIn(["SET", "DELTA"])
  mode!: string;

  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  quantity!: number;

  @IsString()
  @MaxLength(160)
  reason!: string;
}

export class ReconciliationEntryDto {
  @IsString()
  @MaxLength(120)
  externalId!: string;

  @IsDateString()
  occurredAt!: string;

  @IsInt()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  railReference?: string;
}

export class CreateReconciliationImportDto {
  @IsString()
  @MaxLength(80)
  source!: string;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2_000)
  @ValidateNested({ each: true })
  @Type(() => ReconciliationEntryDto)
  entries!: ReconciliationEntryDto[];
}

export class CreateReturnRequestDto {
  @IsString()
  orderId!: string;

  @IsString()
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  details?: string;
}

export class ResolveReturnRequestDto {
  @IsIn(["APPROVED", "REJECTED", "REFUNDED", "RECEIVED"])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  resolution?: string;
}

export class CreatePosSessionDto {
  @IsString()
  @MaxLength(80)
  cashierName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  openingFloat?: number;
}

export class PosSaleItemDto {
  @IsString()
  paymentLinkId!: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity!: number;
}

export class CreatePosSaleDto {
  @IsString()
  sessionId!: string;

  @IsIn(["CASH", "QR", "TRANSFER"])
  paymentMethod!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items!: PosSaleItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}

export class ClosePosSessionDto {
  @IsInt()
  @Min(0)
  closingAmount!: number;
}

export class CreateIntegrationDto {
  @IsIn(["CUSTOM_DATABASE", "SHOPIFY", "WOOCOMMERCE", "POS", "ACCOUNTING", "OTHER"])
  kind!: string;

  @IsString()
  @MaxLength(80)
  name!: string;
}

export class CreateProductMappingDto {
  @IsString()
  paymentLinkId!: string;

  @ApiPropertyOptional({ description: "Required when the product has option combinations: the combination this SKU counts." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;

  @IsString()
  @MaxLength(120)
  externalSku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalName?: string;
}

export class InboundStockItemDto {
  @IsString()
  @MaxLength(120)
  externalSku!: string;

  @ApiPropertyOptional({ description: "Absolute units counted by your system. Send stock or delta, not both." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  @ApiPropertyOptional({ description: "When your count was taken. pagosYa subtracts units it sold after this moment so they are not overwritten." })
  @IsOptional()
  @IsDateString()
  asOf?: string;

  @ApiPropertyOptional({ description: "Units to add (positive) or remove (negative), e.g. a delivery or an in-store sale." })
  @IsOptional()
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  delta?: number;
}

export class InboundStockSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1_000)
  @ValidateNested({ each: true })
  @Type(() => InboundStockItemDto)
  items!: InboundStockItemDto[];
}

export class CreateSubscriptionPlanMappingDto {
  @IsString()
  subscriptionPlanId!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: "externalPlanCode solo admite letras, números, punto, guion y guion bajo" })
  externalPlanCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalName?: string;
}

export class InboundSubscriptionItemDto {
  @IsString()
  @MaxLength(120)
  externalSubscriptionId!: string;

  @IsString()
  @MaxLength(120)
  externalCustomerId!: string;

  @IsString()
  @MaxLength(120)
  externalPlanCode!: string;

  @IsString()
  @MaxLength(120)
  customerName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsIn(["ACTIVE", "PAUSED", "CANCELED"])
  status!: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsDateString()
  nextBillingAt!: string;

  @IsOptional()
  @IsDateString()
  canceledAt?: string;
}

export class InboundSubscriptionSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1_000)
  @ValidateNested({ each: true })
  @Type(() => InboundSubscriptionItemDto)
  items!: InboundSubscriptionItemDto[];
}

export class CreateAppointmentOfferingDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(5)
  @Max(1_440)
  durationMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}

export class CreateAppointmentDto {
  @IsString()
  serviceOfferingId!: string;

  @IsString()
  @MaxLength(120)
  customerName!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsIn(["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELED"])
  status?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}

export class CreatePublicAppointmentPaymentDto {
  @IsString()
  offeringId!: string;

  @IsString()
  @MaxLength(120)
  customerName!: string;

  @IsEmail()
  @MaxLength(254)
  customerEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsDateString()
  startsAt!: string;
}

export class CreateSubscriptionPlanDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsIn(["WEEKLY", "MONTHLY", "YEARLY"])
  interval?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  intervalCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  reminderHoursBefore?: number;
}

export class CreateSubscriptionDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  @MaxLength(120)
  customerName!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountOverride?: number;

  @IsDateString()
  nextBillingAt!: string;
}

export class UpdateSubscriptionStatusDto {
  @IsIn(["ACTIVE", "PAUSED", "CANCELED"])
  status!: string;
}

export class UpdateSubscriptionPlanDto {
  @IsIn(["NEXT_ONLY", "FUTURE"])
  scope!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsIn(["WEEKLY", "MONTHLY", "YEARLY"])
  interval?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  intervalCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  reminderHoursBefore?: number;
}

export class RetrySubscriptionInvoiceDto {
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}
