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

  /** Legacy free-text account; ignored. The account now comes from a proven PayoutAccount (payoutAccountId). */
  @ApiPropertyOptional({ description: "Legacy, ignored" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  payoutBankAccount?: string;

  @ApiProperty({ description: "A payout account sent with its proof (POST /v1/dashboard/payout_accounts), waiting or approved" })
  @IsString()
  @MaxLength(40)
  payoutAccountId!: string;

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

  @ApiPropertyOptional({ description: "Identity document id for the SIN certificate of non-registration in the NIT. Required for level 1." })
  @IsOptional()
  @IsString()
  nitCertificateDocId?: string;
}
