import { ApiProperty } from '@nestjs/swagger';
import { MerchantPlan } from '@prisma/client';
import { IsEnum, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsSafeText } from '../common/validation/safe-text.decorator';

export class PlanDto {
  @ApiProperty({ enum: MerchantPlan }) @IsEnum(MerchantPlan)
  plan!: MerchantPlan;
}

export class GrantCreditsDto {
  @ApiProperty({ example: 500 }) @IsInt() @Min(1) @Max(100_000)
  credits!: number;

  @ApiProperty({ example: 'Compensación por un error de YAPI' }) @IsString() @MinLength(3) @MaxLength(200) @IsSafeText()
  reason!: string;
}
