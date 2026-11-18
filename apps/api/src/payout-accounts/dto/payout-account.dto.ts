import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PayoutAccountOwner } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from "class-validator";
import { BOLIVIAN_BANKS } from "../bolivian-banks";

export class CreatePayoutAccountDto {
  @ApiProperty() @IsIn(BOLIVIAN_BANKS.map((bank) => bank.code)) bankCode!: string;
  @ApiProperty() @IsString() @MaxLength(40) accountNumber!: string;
  @ApiProperty() @IsString() @Length(3, 120) holderName!: string;
  /** ISO M-09: the authenticator code, asked when this changes an approved account. */
  @ApiPropertyOptional() @IsOptional() @Matches(/^\s*\d{3}\s?\d{3}\s*$/) mfaCode?: string;
}

class ChecksDto {
  @IsBoolean() nameMatches!: boolean;
  @IsBoolean() numberMatches!: boolean;
  @IsBoolean() bankMatches!: boolean;
}

export class ApprovePayoutAccountDto {
  @ApiProperty() @ValidateNested() @Type(() => ChecksDto) checks!: ChecksDto;
  @ApiProperty({ enum: PayoutAccountOwner }) @IsEnum(PayoutAccountOwner) ownerType!: PayoutAccountOwner;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class RejectPayoutAccountDto {
  @ApiProperty() @IsString() @Length(8, 500) reason!: string;
}
