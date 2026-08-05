import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
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
  customerName?: string;

  @ApiPropertyOptional({
    description: "Buyer NIT/CI for the Factura Electrónica, if the merchant has invoicing configured. Defaults to \"0\".",
  })
  @IsOptional()
  @IsString()
  customerDocument?: string;
}
