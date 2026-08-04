import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsObject, IsOptional, IsPositive, IsString, Length } from "class-validator";

export class CreatePaymentIntentDto {
  @ApiProperty({ description: "Amount in minor units (centavos). e.g. 1000 = 10.00 BOB", example: 1000 })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ description: "ISO currency code", example: "BOB", default: "BOB" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: "Order #1234" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
