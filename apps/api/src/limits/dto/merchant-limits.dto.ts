import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, Min, ValidateIf } from "class-validator";

export class MerchantLimitsDto {
  @ApiPropertyOptional({ enum: [0, 1, 2, 3] }) @IsOptional() @IsIn([0, 1, 2, 3]) level?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) monthlyLimitOverride?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) perPaymentLimitOverride?: number | null;
}
