import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  Matches,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class DebtRecordInputDto {
  @ApiProperty({ example: "7845123", description: "NIT or CI using digits only." })
  @IsString()
  @Matches(/^\d+$/, { message: "customerDocument must contain digits only" })
  @MaxLength(24)
  customerDocument!: string;

  @ApiProperty({ example: "María Quispe" })
  @IsString()
  @IsSafeText()
  @MaxLength(120)
  customerName!: string;

  @ApiPropertyOptional({ example: "cliente@gmail.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  customerEmail?: string;

  @ApiPropertyOptional({ example: "+591 71234567" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiProperty({ description: "Outstanding amount in centavos.", example: 12550 })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;

  @ApiPropertyOptional({ example: "Factura de agosto" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(240)
  description?: string;

  @ApiPropertyOptional({ example: "FAC-2026-0815" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  reference?: string;
}

export class CreateDebtCollectionLinkDto {
  @ApiProperty({ example: "Cobro de mensualidades" })
  @IsString()
  @IsSafeText()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: "Gmail or company inbox notified after every successful debt payment." })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  notificationEmail?: string;

  @ApiPropertyOptional({ default: "BOB" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ type: [DebtRecordInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DebtRecordInputDto)
  debts!: DebtRecordInputDto[];
}
