import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsPositive, IsString, Length, Matches, MaxLength } from "class-validator";

// ~2MB of image, base64-inflated (~4/3x) plus the "data:image/...;base64," prefix.
const MAX_IMAGE_DATA_URL_LENGTH = 2_900_000;

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

  @ApiPropertyOptional({ description: "Base64 data URL of a product photo (JPEG/PNG/WEBP, max ~2MB)." })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IMAGE_DATA_URL_LENGTH)
  @Matches(/^data:image\/(png|jpeg|jpg|webp);base64,/, {
    message: "imageUrl must be a base64 data URL (data:image/png|jpeg|webp;base64,...)",
  })
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
