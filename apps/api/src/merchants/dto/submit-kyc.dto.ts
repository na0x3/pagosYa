import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class SubmitKycDto {
  @ApiProperty({ example: "Tienda Ejemplo S.R.L." })
  @IsString()
  @MinLength(2)
  legalName!: string;

  @ApiProperty({ example: "1023456028", description: "NIT" })
  @IsString()
  @MinLength(5)
  taxId!: string;

  @ApiProperty({ example: "Maria Fernanda Rojas" })
  @IsString()
  @MinLength(2)
  legalRepName!: string;

  @ApiProperty({ example: "7654321 LP", description: "Legal representative's CI" })
  @IsString()
  @MinLength(5)
  legalRepDocumentId!: string;

  @ApiProperty({ example: "BNB 4012345678", description: "Payout bank account" })
  @IsString()
  @MinLength(5)
  payoutBankAccount!: string;
}
