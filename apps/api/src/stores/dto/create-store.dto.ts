import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";

export class CreateStoreDto {
  @ApiProperty({ example: "Mi Tienda de Ropa" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: "Ropa urbana hecha en Bolivia, envíos a todo el país.",
    description: "Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  tagline?: string | null;

  @ApiPropertyOptional({
    description: "Path returned by POST /v1/uploads for the store logo. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "logoUrl must be a path returned by POST /v1/uploads" })
  logoUrl?: string | null;

  @ApiPropertyOptional({
    description: "Path returned by POST /v1/uploads for a wide storefront banner image. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "bannerUrl must be a path returned by POST /v1/uploads" })
  bannerUrl?: string | null;

  @ApiPropertyOptional({ description: "6-digit hex color for the storefront background.", example: "#f8fafc" })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "backgroundColor must be a 6-digit hex color, e.g. #f8fafc" })
  backgroundColor?: string;

  @ApiPropertyOptional({
    description:
      "Path returned by POST /v1/uploads for a full-page storefront background photo. Independent of backgroundColor. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "backgroundImageUrl must be a path returned by POST /v1/uploads" })
  backgroundImageUrl?: string | null;

  @ApiPropertyOptional({
    description:
      "Long-form brand story shown as its own storefront section. Blank lines separate paragraphs — unlike the one-line tagline. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  aboutText?: string | null;

  @ApiPropertyOptional({
    description:
      "6-digit hex brand accent for storefront highlights (chips, links, pay button). Omit to leave unchanged, or send null to clear back to the default palette.",
    example: "#e11d48",
    nullable: true,
  })
  @IsOptional()
  // IsOptional already skips validation for null/undefined — this only runs
  // when a value is actually present, so null (explicit "clear") still gets
  // through to the service untouched, distinct from undefined ("don't change").
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "accentColor must be a 6-digit hex color, e.g. #e11d48" })
  accentColor?: string | null;

  @ApiPropertyOptional({
    description: "Corner treatment for the storefront's buttons and inputs.",
    enum: ["rounded", "pill", "square"],
  })
  @IsOptional()
  @IsIn(["rounded", "pill", "square"])
  buttonStyle?: string;

  @ApiPropertyOptional({
    description: "Short promo/notice line shown in a bar at the very top of the storefront. Omit to leave unchanged, or send null to clear.",
    example: "Envío gratis en compras desde Bs 200",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  announcement?: string | null;

  @ApiPropertyOptional({
    description:
      "Support phone/WhatsApp number shown to customers on the receipt, e.g. for order questions or refund requests. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @ApiPropertyOptional({
    description: "Support email shown to customers on the receipt. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  contactEmail?: string | null;
}
