import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SubmitKycDto {
  @ApiPropertyOptional({ enum: [1, 2], default: 2 })
  @IsOptional()
  @IsIn([1, 2])
  targetLevel?: 1 | 2;

  @ApiProperty({ example: "Tienda Ejemplo S.R.L." })
  @IsString()
  @MinLength(2)
  legalName!: string;

  @ApiPropertyOptional({ example: "1023456028", description: "NIT" })
  @IsOptional()
  @IsString()
  @MinLength(5)
  taxId?: string;

  @ApiPropertyOptional({ example: "Maria Fernanda Rojas" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  legalRepName?: string;

  @ApiPropertyOptional({ example: "7654321 LP", description: "Legal representative's CI" })
  @IsOptional()
  @IsString()
  @MinLength(5)
  legalRepDocumentId?: string;

  @ApiProperty({ example: "BNB 4012345678", description: "Payout bank account" })
  @IsString()
  @MinLength(5)
  payoutBankAccount!: string;

  @ApiPropertyOptional({ description: "USD account (bank, account number, SWIFT/ABA) for international payouts." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  payoutUsdBankAccount?: string;

  @ApiPropertyOptional({ description: "Identity document id for the front of the CI (Task 5 upload)." })
  @IsOptional()
  @IsString()
  ciFrontDocId?: string;

  @ApiPropertyOptional({ description: "Identity document id for the back of the CI (Task 5 upload)." })
  @IsOptional()
  @IsString()
  ciBackDocId?: string;

  @ApiPropertyOptional({ description: "Identity document id for the selfie holding the CI (Task 5 upload)." })
  @IsOptional()
  @IsString()
  selfieDocId?: string;
}
