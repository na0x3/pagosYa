import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { SettlementMode } from "@prisma/client";

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
}
