import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsPositive, IsString, MaxLength, Matches } from "class-validator";

export class CreateRefundDto {
  @ApiProperty({ example: "pi_abc123" })
  @IsString()
  @Matches(/^pi_[0-9a-z]+$/)
  @MaxLength(64)
  paymentIntentId!: string;

  @ApiPropertyOptional({ description: "Partial refund amount in minor units. Omit to refund in full." })
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
