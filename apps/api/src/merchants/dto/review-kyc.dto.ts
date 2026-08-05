import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { KycStatus } from "@prisma/client";
import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewKycDto {
  @ApiProperty({ enum: [KycStatus.APPROVED, KycStatus.REJECTED] })
  @IsIn([KycStatus.APPROVED, KycStatus.REJECTED])
  decision!: typeof KycStatus.APPROVED | typeof KycStatus.REJECTED;

  @ApiPropertyOptional({ example: "Payout account holder name doesn't match legal rep." })
  @IsOptional()
  @IsString()
  note?: string;
}
