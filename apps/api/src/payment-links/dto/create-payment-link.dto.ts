import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsPositive, IsString, Length, Matches, MaxLength } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";

export class CreatePaymentLinkDto {
  @ApiProperty({ example: "Corte de cabello" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: "Incluye lavado y peinado" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: "Path returned by POST /v1/uploads for a product photo (JPEG/PNG/WEBP)." })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "imageUrl must be a path returned by POST /v1/uploads" })
  imageUrl?: string;

  @ApiProperty({ description: "Amount in minor units (centavos). e.g. 1000 = 10.00 BOB", example: 5000 })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ example: "BOB", default: "BOB" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
