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
  IsNumber,
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
import { CATALOG_LAYOUTS, type CatalogLayout } from "../catalog-layout";
import {
  SITE_ART_DIRECTIONS,
  STORE_SITE_SECTION_ALIGNS,
  STORE_SITE_SECTION_KINDS,
  STORE_SITE_SECTION_LAYOUTS,
  STORE_SITE_SECTION_MOTIONS,
  STORE_SITE_SECTION_WIDTHS,
} from "@pagosya/shared-types";
import { STORE_CONTENT_SECTIONS, STORE_ANIMATION_SECTION_PATTERN, STORE_SITE_SECTION_PATTERN, STORE_LEGACY_REQUIRED_CONTENT_SECTIONS, STORE_FONT_STYLES, STORE_ANNOUNCEMENT_FONTS, STORE_ANNOUNCEMENT_EFFECTS, STORE_MOTION_EXPERIENCES } from "./store-options";
import { StoreSiteSectionDto, StoreSitePageDto, StoreSiteNavigationDto, StoreSiteNavigationItemDto, StoreSiteFooterDto } from "./store-site.dto";
import { StoreHeroSlideDto, StoreAnimationDto, StoreEditorialImageDto } from "./store-motion.dto";
import { IsSupportedMapEmbedUrl, StoreLocationDto } from "./store-location.dto";

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
                (!(STORE_CONTENT_SECTIONS as readonly string[]).includes(section) && !STORE_ANIMATION_SECTION_PATTERN.test(section) && !STORE_SITE_SECTION_PATTERN.test(section)),
            )
          ) return false;
          if (value.some((section) => typeof section === "string" && STORE_SITE_SECTION_PATTERN.test(section))) return true;
          return STORE_LEGACY_REQUIRED_CONTENT_SECTIONS.every((section) => unique.has(section));
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must contain every required storefront section exactly once; contact, location, and animation sections are optional and unique`;
        },
      },
    });
  };
}

function IsStoreSectionBackgrounds(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isStoreSectionBackgrounds",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!value || typeof value !== "object" || Array.isArray(value)) return false;
          const entries = Object.entries(value);
          if (entries.length > 32) return false;
          return entries.every(([section, color]) =>
            ((STORE_CONTENT_SECTIONS as readonly string[]).includes(section) || STORE_ANIMATION_SECTION_PATTERN.test(section) || STORE_SITE_SECTION_PATTERN.test(section))
            && typeof color === "string"
            && /^#[0-9a-f]{6}$/i.test(color),
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must map valid storefront section ids to 6-digit hex colors`;
        },
      },
    });
  };
}

export {
  STORE_SITE_SECTION_ALIGNS,
  STORE_SITE_SECTION_KINDS,
  STORE_SITE_SECTION_LAYOUTS,
  STORE_SITE_SECTION_MOTIONS,
  STORE_SITE_SECTION_WIDTHS,
};

export class StoreCatalogCollectionDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  id!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(60)
  name!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  productIds!: string[];
}

/** Plain text only; the storefront renders it escaped, paragraph by paragraph. */
export class StorePoliciesDto {
  @ApiPropertyOptional({ description: "Cambios y devoluciones", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(6000)
  returns?: string | null;

  @ApiPropertyOptional({ description: "Envíos y entregas", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(6000)
  delivery?: string | null;

  @ApiPropertyOptional({ description: "Privacidad", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(6000)
  privacy?: string | null;

  @ApiPropertyOptional({ description: "Términos y condiciones", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(6000)
  terms?: string | null;
}

export class CreateStoreDto {
  @ApiProperty({ example: "Mi Tienda de Ropa" })
  @IsString()
  @IsSafeText()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: SITE_ART_DIRECTIONS, description: "Coherent art direction applied across the full generated storefront." })
  @IsOptional()
  @IsIn(SITE_ART_DIRECTIONS)
  siteArtDirection?: string;

  @ApiPropertyOptional({ type: [StoreSiteSectionDto], description: "Safe editable fields for generated storefront sections." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ArrayUnique((entry: StoreSiteSectionDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreSiteSectionDto)
  siteSections?: StoreSiteSectionDto[];

  @ApiPropertyOptional({ type: [StoreSitePageDto], description: "Additional storefront pages; Inicio remains implicit." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique((entry: StoreSitePageDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreSitePageDto)
  sitePages?: StoreSitePageDto[];

  @ApiPropertyOptional({ type: StoreSiteNavigationDto, description: "Layout and behavior of the storefront header." })
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSiteNavigationDto)
  siteNavigation?: StoreSiteNavigationDto;

  @ApiPropertyOptional({ type: [StoreSiteNavigationItemDto], description: "Editable labels and destinations in the storefront header." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique((entry: StoreSiteNavigationItemDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreSiteNavigationItemDto)
  siteNavigationItems?: StoreSiteNavigationItemDto[];

  @ApiPropertyOptional({ type: StoreSiteFooterDto, description: "Editable structured storefront footer; HTML is never accepted." })
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSiteFooterDto)
  siteFooter?: StoreSiteFooterDto;

  @ApiPropertyOptional({ enum: ["tabs", "editorial-sidebar"], description: "How collection tabs are presented above the product catalog." })
  @IsOptional()
  @IsIn(["tabs", "editorial-sidebar"])
  siteCatalogMenuStyle?: "tabs" | "editorial-sidebar";

  @ApiPropertyOptional({ type: [StoreCatalogCollectionDto], description: "Merchant-authored product collections; one product may belong to several." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique((entry: StoreCatalogCollectionDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreCatalogCollectionDto)
  siteCatalogCollections?: StoreCatalogCollectionDto[];

  @ApiPropertyOptional({ type: [String], description: "Existing generated section ids explicitly removed by the merchant." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/, { each: true })
  siteDeletedSectionIds?: string[];

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
    enum: STORE_FONT_STYLES,
  })
  @IsOptional()
  @IsIn(STORE_FONT_STYLES)
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

  @ApiPropertyOptional({ description: "Announcement strip color.", example: "#ffffff" })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "announcementColor must be a 6-digit hex color, e.g. #ffffff" })
  announcementColor?: string;

  @ApiPropertyOptional({
    description: "Curated font used only by the announcement strip. 'store' inherits the storefront font.",
    enum: STORE_ANNOUNCEMENT_FONTS,
  })
  @IsOptional()
  @IsIn(STORE_ANNOUNCEMENT_FONTS)
  announcementFont?: string;

  @ApiPropertyOptional({
    description: "Optional per-letter announcement effect. Reduced-motion visitors always receive static lettering.",
    enum: STORE_ANNOUNCEMENT_EFFECTS,
  })
  @IsOptional()
  @IsIn(STORE_ANNOUNCEMENT_EFFECTS)
  announcementEffect?: string;

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
  @ArrayMinSize(3)
  @ArrayUnique()
  @IsStoreContentOrder()
  contentOrder?: string[];

  @ApiPropertyOptional({
    description: "Optional background color per storefront section id.",
    type: "object",
    additionalProperties: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
  })
  @IsOptional()
  @IsStoreSectionBackgrounds()
  sectionBackgrounds?: Record<string, string>;

  @ApiPropertyOptional({
    description: "Structural storefront composition.",
    enum: ["cinematic", "editorial", "collage", "catalog-first"],
  })
  @IsOptional()
  @IsIn(["cinematic", "editorial", "collage", "catalog-first"])
  layoutStyle?: string;

  @ApiPropertyOptional({
    description: "How the home page arranges products.",
    enum: CATALOG_LAYOUTS,
  })
  @IsOptional()
  @IsIn([...CATALOG_LAYOUTS])
  catalogLayout?: CatalogLayout;

  @ApiPropertyOptional({
    description: "Editorial presentation shown after the product catalog.",
    enum: ["editorial-grid", "story-scroller"],
  })
  @IsOptional()
  @IsIn(["editorial-grid", "story-scroller"])
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
    default: "hero-carousel",
  })
  @IsOptional()
  @IsIn(STORE_MOTION_EXPERIENCES)
  motionExperience?: string;

  @ApiPropertyOptional({
    description: "Animation templates, each rendered as its own reorderable storefront section.",
    enum: STORE_MOTION_EXPERIENCES,
    isArray: true,
    default: ["hero-carousel"],
  })
  @IsOptional()
  @IsArray()
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

  @ApiPropertyOptional({ description: "Whether shoppers may see the store. New stores stay private until the owner publishes a design or turns this on." })
  @IsOptional()
  @IsBoolean()
  publicVisibility?: boolean;

  @ApiPropertyOptional({ description: "Shopper policies as plain text; empty or null removes one.", type: () => StorePoliciesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StorePoliciesDto)
  policies?: StorePoliciesDto;

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

  @ApiPropertyOptional({ nullable: true, description: "Public heading of the contact section." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  contactTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Public supporting text of the contact section." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(320)
  contactSubtitle?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Public heading of the locations section." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  locationTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Public supporting text of the locations section." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(220)
  locationSubtitle?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Public heading above social and external links." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  linksTitle?: string | null;
}
