import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsInt, IsObject, IsOptional, IsPositive, IsString, Length, MaxLength } from "class-validator";

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

  @ApiPropertyOptional({ description: "Known recipient name for a directed charge." })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional({ description: "Known recipient NIT/CI for a directed charge." })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerDocument?: string;

  @ApiPropertyOptional({ description: "Known recipient email for a directed charge." })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ description: "Known recipient phone for a directed charge." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
