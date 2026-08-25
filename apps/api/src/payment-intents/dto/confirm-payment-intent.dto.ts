import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsEnum, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { PaymentMethodType } from "@prisma/client";

export class PaymentMethodInputDto {
  @ApiProperty({ enum: PaymentMethodType })
  @IsEnum(PaymentMethodType)
  type!: PaymentMethodType;

  @ApiProperty({
    description: "Opaque rail token. In test mode, use documented test tokens (e.g. tok_visa_success).",
    example: "tok_visa_success",
  })
  @IsString()
  @MaxLength(512)
  token!: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ConfirmPaymentIntentDto {
  @ApiProperty({ type: PaymentMethodInputDto })
  @ValidateNested()
  @Type(() => PaymentMethodInputDto)
  paymentMethod!: PaymentMethodInputDto;

  @ApiPropertyOptional({
    description: "Buyer name for the Factura Electrónica, if the merchant has invoicing configured. Defaults to \"SIN NOMBRE\".",
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional({
    description: "Buyer NIT/CI for the Factura Electrónica, if the merchant has invoicing configured. Defaults to \"0\".",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerDocument?: string;

  @ApiPropertyOptional({
    description: "Buyer email, so the merchant can contact them about this order.",
  })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({
    description: "Buyer phone number, so the merchant can contact them about this order.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional({ description: "Whether the buyer asked the merchant to arrange delivery." })
  @IsOptional()
  @IsBoolean()
  deliveryRequested?: boolean;

  @ApiPropertyOptional({ description: "Buyer-entered delivery address or reference." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: "Latitude captured with the buyer's explicit browser permission." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-90)
  @Max(90)
  customerLatitude?: number;

  @ApiPropertyOptional({ description: "Longitude captured with the buyer's explicit browser permission." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-180)
  @Max(180)
  customerLongitude?: number;

  @ApiPropertyOptional({ description: "Browser-reported location accuracy in metres." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  customerLocationAccuracy?: number;
}
