import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { SettlementMode } from "@prisma/client";
import { LEGAL_VERSION_PATTERN } from "../../legal/dto/accept-terms.dto";

export class CreateMerchantDto {
  @ApiProperty({ example: "Tienda Ejemplo" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "dev@tienda-ejemplo.bo" })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: SettlementMode, default: SettlementMode.AGGREGATOR })
  @IsOptional()
  @IsEnum(SettlementMode)
  settlementMode?: SettlementMode;

  @ApiPropertyOptional({ description: "Version of pagosYa's merchant terms the signer accepted (GET /v1/legal/merchant-terms).", example: "2026-10-01" })
  @IsOptional()
  @Matches(LEGAL_VERSION_PATTERN)
  termsVersion?: string;
}
