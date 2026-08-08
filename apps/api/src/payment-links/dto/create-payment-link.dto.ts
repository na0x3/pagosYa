import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";

export class CreatePaymentLinkDto {
  @ApiProperty({ example: "Corte de cabello" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: "Incluye lavado y peinado", description: "Omit to leave unchanged, or send null to clear.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    description: "Paths returned by POST /v1/uploads for product photos (JPEG/PNG/WEBP). First entry is the cover photo.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true, message: "each imageUrls entry must be a path returned by POST /v1/uploads" })
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: "Short labels shown as badges, e.g. \"Nuevo\", \"Agotado\".", type: [String], example: ["Nuevo"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(24, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: "Remaining units. Omit to leave unchanged, or send null for unlimited (not tracked).",
    example: 10,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number | null;

  @ApiPropertyOptional({
    description: "Category (within the same store) this product belongs to. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  categoryId?: string | null;

  @ApiProperty({ description: "Amount in minor units (centavos). e.g. 1000 = 10.00 BOB", example: 5000 })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ example: "BOB", default: "BOB" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({
    description: "6-digit hex color swatch for this product, e.g. a T-shirt color. Omit to leave unchanged, or send null to clear.",
    example: "#1d4ed8",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "color must be a 6-digit hex color, e.g. #1d4ed8" })
  color?: string | null;
}
