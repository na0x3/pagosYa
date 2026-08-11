import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export const STORE_CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "links"] as const;

export class StoreHeroSlideDto {
  @ApiProperty({ description: "Image, GIF, MP4, or WEBM path returned by POST /v1/uploads." })
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "hero slide imageUrl must be a media path returned by POST /v1/uploads" })
  imageUrl!: string;

  @ApiPropertyOptional({ example: "Nueva colección" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({ example: "Piezas pensadas para todos los días." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(180)
  body?: string;

  @ApiPropertyOptional({ example: "Descubrir" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(36)
  ctaLabel?: string;

  @ApiPropertyOptional({ description: "Optional http(s) destination. Without it the CTA scrolls to the catalog." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(500)
  @Matches(/^https?:\/\/[^\s]+$/i, { message: "hero slide ctaUrl must be an http(s) URL" })
  ctaUrl?: string;
}

export class StoreEditorialImageDto {
  @ApiProperty({ description: "Image path returned by POST /v1/uploads." })
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "editorial imageUrl must be a path returned by POST /v1/uploads" })
  imageUrl!: string;

  @ApiPropertyOptional({ example: "Cada pieza se termina a mano en nuestro taller." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(180)
  caption?: string;
}

export class CreateStoreDto {
  @ApiProperty({ example: "Mi Tienda de Ropa" })
  @IsString()
  @IsSafeText()
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
  @IsSafeText()
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
  @IsSafeText()
  @MaxLength(4000)
  aboutText?: string | null;

  @ApiPropertyOptional({
    description:
      "Path returned by POST /v1/uploads for the optional Nuestra historia background image. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "aboutImageUrl must be a path returned by POST /v1/uploads" })
  aboutImageUrl?: string | null;

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
    description: "Curated font family used across the merchant's public storefront.",
    enum: ["mono", "modern", "editorial", "friendly"],
  })
  @IsOptional()
  @IsIn(["mono", "modern", "editorial", "friendly"])
  fontStyle?: string;

  @ApiPropertyOptional({
    description: "Corner treatment for the storefront's buttons and inputs.",
    enum: ["rounded", "pill", "square"],
  })
  @IsOptional()
  @IsIn(["rounded", "pill", "square"])
  buttonStyle?: string;

  @ApiPropertyOptional({
    description: "Storefront ground material for the hand-lettered price-board visual world.",
    enum: ["chalkboard", "kraft", "painted"],
  })
  @IsOptional()
  @IsIn(["chalkboard", "kraft", "painted"])
  boardTexture?: string;

  @ApiPropertyOptional({
    description: "Short promo/notice line shown in a bar at the very top of the storefront. Omit to leave unchanged, or send null to clear.",
    example: "Envío gratis en compras desde Bs 200",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(160)
  announcement?: string | null;

  @ApiPropertyOptional({ description: "Announcement behavior.", enum: ["static", "marquee"] })
  @IsOptional()
  @IsIn(["static", "marquee"])
  announcementMode?: string;

  @ApiPropertyOptional({ description: "Seconds for one marquee pass.", minimum: 8, maximum: 40, example: 18 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(40)
  announcementSpeed?: number;

  @ApiPropertyOptional({ description: "Whether the storefront promotion dialog is active." })
  @IsOptional()
  @IsBoolean()
  promotionEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, example: "20% en tu primera compra" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  promotionTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Usa el código BIENVENIDA al pagar." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(280)
  promotionBody?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Ver promoción" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(36)
  promotionCtaLabel?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "https://mitienda.bo/promocion" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(500)
  @Matches(/^https?:\/\/[^\s]+$/i, { message: "promotionCtaUrl must be an http(s) URL" })
  promotionCtaUrl?: string | null;

  @ApiPropertyOptional({
    description: "Ordered storefront hero carousel slides (maximum 5). Send [] to remove the carousel.",
    type: [StoreHeroSlideDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => StoreHeroSlideDto)
  heroSlides?: StoreHeroSlideDto[];

  @ApiPropertyOptional({
    description: "Every storefront content section exactly once, in public display order.",
    enum: STORE_CONTENT_SECTIONS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(STORE_CONTENT_SECTIONS.length)
  @ArrayMaxSize(STORE_CONTENT_SECTIONS.length)
  @ArrayUnique()
  @IsIn(STORE_CONTENT_SECTIONS, { each: true })
  contentOrder?: (typeof STORE_CONTENT_SECTIONS)[number][];

  @ApiPropertyOptional({
    description: "Captioned editorial images shown outside the product catalog (maximum 8).",
    type: [StoreEditorialImageDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => StoreEditorialImageDto)
  editorialGallery?: StoreEditorialImageDto[];

  @ApiPropertyOptional({ description: "Button fill treatment.", enum: ["solid", "outline", "soft"] })
  @IsOptional()
  @IsIn(["solid", "outline", "soft"])
  buttonVariant?: string;

  @ApiPropertyOptional({ description: "Button interaction motion.", enum: ["none", "lift", "pulse"] })
  @IsOptional()
  @IsIn(["none", "lift", "pulse"])
  buttonMotion?: string;

  @ApiPropertyOptional({ description: "Customer-facing cart button label.", example: "Completar pedido" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(36)
  cartButtonLabel?: string;

  @ApiPropertyOptional({
    description:
      "Support phone/WhatsApp number shown to customers on the receipt, e.g. for order questions or refund requests. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
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
