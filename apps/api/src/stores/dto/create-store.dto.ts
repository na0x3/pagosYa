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
  registerDecorator,
  ValidateIf,
  ValidateNested,
  type ValidationArguments,
  type ValidationOptions,
} from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

function isSupportedMapEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    const googleHost = /^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/.test(hostname);
    const googleEmbed = googleHost && url.pathname.startsWith("/maps/embed");
    const openStreetMapEmbed = (hostname === "openstreetmap.org" || hostname === "www.openstreetmap.org")
      && url.pathname === "/export/embed.html";
    return googleEmbed || openStreetMapEmbed;
  } catch {
    return false;
  }
}

function IsSupportedMapEmbedUrl(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isSupportedMapEmbedUrl",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isSupportedMapEmbedUrl(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a secure Google Maps or OpenStreetMap embed URL`;
        },
      },
    });
  };
}

export const STORE_MOTION_EXPERIENCES = [
  "story-scroll",
  "coverflow-carousel",
  "hero-carousel",
  "image-stream",
  "scroll-expansion",
  "hero-gallery-scroll",
  "stagger-testimonials",
  "zoom-parallax",
  "video-pill",
  "portfolio-scroller",
  "circle-reveal",
  "clarity-marquee",
  "full-screen-chapters",
  "magnetic-target",
  "frame-sequence",
  "3d-gallery",
] as const;
export const STORE_ANIMATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
export const STORE_ANIMATION_SECTION_PATTERN = /^animation-[a-z0-9][a-z0-9_-]{0,47}$/;
export const STORE_BASE_CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "links", "contact", "location"] as const;
const STORE_LEGACY_REQUIRED_CONTENT_SECTIONS = STORE_BASE_CONTENT_SECTIONS.filter((section) => !["contact", "location"].includes(section));
export const STORE_MOTION_CONTENT_SECTIONS = [
  "motion-story-scroll",
  "motion-coverflow-carousel",
  "motion-hero-carousel",
  "motion-image-stream",
  "motion-scroll-expansion",
  "motion-hero-gallery-scroll",
  "motion-stagger-testimonials",
  "motion-zoom-parallax",
  "motion-video-pill",
  "motion-portfolio-scroller",
  "motion-circle-reveal",
  "motion-clarity-marquee",
  "motion-full-screen-chapters",
  "motion-magnetic-target",
  "motion-frame-sequence",
  "motion-3d-gallery",
] as const;
// `motion` remains accepted so stores saved by the previous editor can be
// expanded in place. New editors persist one section key per animation.
export const STORE_CONTENT_SECTIONS = [
  ...STORE_BASE_CONTENT_SECTIONS,
  "motion",
  ...STORE_MOTION_CONTENT_SECTIONS,
] as const;

function IsStoreContentOrder(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isStoreContentOrder",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          const unique = new Set(value);
          if (
            unique.size !== value.length ||
            value.some(
              (section) =>
                typeof section !== "string" ||
                (!(STORE_CONTENT_SECTIONS as readonly string[]).includes(section) && !STORE_ANIMATION_SECTION_PATTERN.test(section)),
            )
          ) return false;
          return STORE_LEGACY_REQUIRED_CONTENT_SECTIONS.every((section) => unique.has(section));
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must contain every required storefront section exactly once; contact, location, and animation sections are optional and unique`;
        },
      },
    });
  };
}

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

  @ApiPropertyOptional({ example: "Una pausa hecha con intención" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: "Cada pieza se termina a mano en nuestro taller." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(180)
  caption?: string;

  @ApiPropertyOptional({ example: "El detalle de esta imagen puede contar una parte más amplia de la historia de la marca." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(360)
  body?: string;

  @ApiPropertyOptional({ example: "#f4ead7", description: "Background color of the image-and-caption card." })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/i, { message: "editorial boxColor must be a 6-digit hex color" })
  boxColor?: string;
}

export class StoreAnimationDto {
  @ApiProperty({ example: "coleccion-invierno", description: "Stable identifier used by the storefront section organizer." })
  @IsString()
  @Matches(STORE_ANIMATION_ID_PATTERN, { message: "animation id must use lowercase letters, numbers, hyphens, or underscores" })
  id!: string;

  @ApiProperty({ example: "Colección de invierno", description: "Merchant-facing name shown in the section organizer." })
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ enum: STORE_MOTION_EXPERIENCES })
  @IsString()
  @IsIn(STORE_MOTION_EXPERIENCES)
  type!: string;

  @ApiPropertyOptional({ example: "Una colección en movimiento" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: "Detalles, texturas y escenas de la nueva temporada." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(220)
  subtitle?: string;

  @ApiPropertyOptional({ example: "product_123", description: "Optional product featured by this animation." })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  productId?: string;

  @ApiProperty({ description: "Ordered pictures and copy owned by this animation.", type: [StoreEditorialImageDto] })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => StoreEditorialImageDto)
  media!: StoreEditorialImageDto[];
}

export class StoreLocationInventoryDto {
  @ApiProperty({ description: "Product id owned by this store." })
  @IsString()
  @MaxLength(80)
  paymentLinkId!: string;

  @ApiPropertyOptional({ nullable: true, description: "Units available at this branch; null means unlimited." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(999999)
  stock?: number | null;
}

export class StoreLocationHoursDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: "0 is Sunday, 6 is Saturday." })
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @ApiProperty({ example: "09:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  open!: string;

  @ApiProperty({ example: "18:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  close!: string;

  @ApiProperty()
  @IsBoolean()
  closed!: boolean;
}

export class StoreLocationDto {
  @ApiProperty({ example: "sucursal-centro" })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,47}$/)
  id!: string;

  @ApiProperty({ example: "Sucursal Centro" })
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: "Av. Arce 1234, Sopocachi" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(240)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2400)
  @IsSupportedMapEmbedUrl()
  mapEmbedUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(600)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(140)
  highlight?: string | null;

  @ApiProperty()
  @IsBoolean()
  pickupEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  deliveryEnabled!: boolean;

  @ApiPropertyOptional({ type: [StoreLocationHoursDto], description: "Weekly opening schedule in Bolivia time." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique((entry: StoreLocationHoursDto) => entry.day)
  @ValidateNested({ each: true })
  @Type(() => StoreLocationHoursDto)
  openingHours?: StoreLocationHoursDto[];

  @ApiPropertyOptional({ type: [StoreLocationInventoryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique((entry: StoreLocationInventoryDto) => entry.paymentLinkId)
  @ValidateNested({ each: true })
  @Type(() => StoreLocationInventoryDto)
  inventory?: StoreLocationInventoryDto[];
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
      "Long-form brand story shown as its own storefront section. Blank lines separate paragraphs — unlike the one-line tagline. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(4000)
  aboutText?: string | null;

  @ApiPropertyOptional({ description: "Heading for the brand-story section.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  aboutTitle?: string | null;

  @ApiPropertyOptional({ description: "Supporting line below the brand-story heading.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(220)
  aboutSubtitle?: string | null;

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

  @ApiPropertyOptional({ description: "Heading shown before the product catalog.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  catalogTitle?: string | null;

  @ApiPropertyOptional({ description: "Supporting line shown before the product catalog.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(220)
  catalogSubtitle?: string | null;

  @ApiPropertyOptional({ description: "Heading for the editorial image gallery.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  galleryTitle?: string | null;

  @ApiPropertyOptional({ description: "Supporting line for the editorial image gallery.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(220)
  gallerySubtitle?: string | null;

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
    description: "Material treatment used by the storefront product board.",
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

  @ApiPropertyOptional({ description: "Announcement text and strip size.", enum: ["small", "medium", "large"] })
  @IsOptional()
  @IsIn(["small", "medium", "large"])
  announcementSize?: string;

  @ApiPropertyOptional({ description: "Announcement strip color.", example: "#c58b3c" })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "announcementColor must be a 6-digit hex color, e.g. #c58b3c" })
  announcementColor?: string;

  @ApiPropertyOptional({ description: "Whether the storefront promotion dialog is active." })
  @IsOptional()
  @IsBoolean()
  promotionEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Path returned by POST /v1/uploads for the promotion dialog image. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "promotionImageUrl must be a path returned by POST /v1/uploads" })
  promotionImageUrl?: string | null;

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
    description: "Every base storefront section once plus any independently positioned animation sections.",
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(STORE_LEGACY_REQUIRED_CONTENT_SECTIONS.length)
  @ArrayUnique()
  @IsStoreContentOrder()
  contentOrder?: string[];

  @ApiPropertyOptional({
    description: "Structural storefront composition.",
    enum: ["cinematic", "editorial", "collage", "catalog-first"],
  })
  @IsOptional()
  @IsIn(["cinematic", "editorial", "collage", "catalog-first"])
  layoutStyle?: string;

  @ApiPropertyOptional({
    description: "Interactive visual experience shown after the product catalog.",
    enum: ["coverflow", "diagonal-marquee", "story-scroller"],
  })
  @IsOptional()
  @IsIn(["coverflow", "diagonal-marquee", "story-scroller"])
  experienceStyle?: string;

  @ApiPropertyOptional({
    description: "Add a merchant-authored animation section to the storefront.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  motionDuoEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Choose the presentation used by the standalone animation section.",
    enum: STORE_MOTION_EXPERIENCES,
    default: "coverflow-carousel",
  })
  @IsOptional()
  @IsIn(STORE_MOTION_EXPERIENCES)
  motionExperience?: string;

  @ApiPropertyOptional({
    description: "Animation templates, each rendered as its own reorderable storefront section.",
    enum: STORE_MOTION_EXPERIENCES,
    isArray: true,
    default: ["coverflow-carousel"],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(STORE_MOTION_EXPERIENCES.length)
  @ArrayUnique()
  @IsIn(STORE_MOTION_EXPERIENCES, { each: true })
  motionExperiences?: string[];

  @ApiPropertyOptional({
    description: "Named, independently editable and reorderable storefront animations.",
    type: [StoreAnimationDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique((animation: StoreAnimationDto) => animation.id)
  @ValidateNested({ each: true })
  @Type(() => StoreAnimationDto)
  animations?: StoreAnimationDto[];

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

  @ApiPropertyOptional({ description: "How customers finish an order.", enum: ["payment", "whatsapp", "external"] })
  @IsOptional()
  @IsIn(["payment", "whatsapp", "external"])
  checkoutMode?: string;

  @ApiPropertyOptional({ description: "Optional legacy http(s) destination for external lead stores.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/[^\s]+$/i, { message: "leadCaptureUrl must be an http(s) URL" })
  leadCaptureUrl?: string | null;

  @ApiPropertyOptional({
    description: "Show an optional shelf of other in-stock products inside the cart review.",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  cartRecommendationsEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Payment Link ids the merchant chose for the cart recommendation shelf.",
    type: [String],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  cartRecommendationProductIds?: string[];

  @ApiPropertyOptional({
    description: "Show low-stock quantities to storefront customers. Sold-out state remains visible.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  showLowStockToCustomers?: boolean;

  @ApiPropertyOptional({ description: "Short merchant-authored label for Yapi's sales goal.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  salesGoalLabel?: string | null;

  @ApiPropertyOptional({ description: "Sales target in minor units (centavos), tracked by Yapi.", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  salesGoalAmount?: number | null;

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
    description: "Secure Google Maps or OpenStreetMap embed URL for the public location section. Omit to leave unchanged, or send null to clear.",
    example: "https://www.google.com/maps/embed?pb=...",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2400)
  @IsSupportedMapEmbedUrl()
  locationMapUrl?: string | null;

  @ApiPropertyOptional({
    description: "Plain-text description shown beside the embedded location. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(600)
  locationDescription?: string | null;

  @ApiPropertyOptional({
    description: "Short merchant-authored phrase displayed with the store accent inside the public location section.",
    example: "A media cuadra de la plaza principal",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(140)
  locationHighlight?: string | null;

  @ApiPropertyOptional({ type: [StoreLocationDto], description: "Ordered public branches with fulfillment capabilities and product allocation." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((entry: StoreLocationDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreLocationDto)
  locations?: StoreLocationDto[];

  @ApiPropertyOptional({
    description: "Support email shown to customers on the receipt. Omit to leave unchanged, or send null to clear.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional({
    description: "Show the customer-interest form near the end of the storefront.",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  contactFormEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Private Gmail or email address that receives storefront contact messages. Omit to use the merchant account email.",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  contactFormEmail?: string | null;
}
