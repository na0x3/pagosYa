import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsPositive, IsString } from "class-validator";

export class CreateRefundDto {
  @ApiProperty({ example: "pi_abc123" })
  @IsString()
  paymentIntentId!: string;

  @ApiPropertyOptional({ description: "Partial refund amount in minor units. Omit to refund in full." })
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
