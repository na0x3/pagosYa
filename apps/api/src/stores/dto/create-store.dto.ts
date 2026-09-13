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
import {
  SITE_ART_DIRECTIONS,
  SITE_SECTION_BLOCK_KINDS,
  SITE_SECTION_BLOCK_ROLES,
  SITE_SECTION_FAMILIES,
  STORE_SITE_HEADER_ACTION_POSITIONS,
  STORE_SITE_HEADER_POSITIONS,
  STORE_SITE_HEADER_STYLES,
  STORE_SITE_SECTION_ALIGNS,
  STORE_SITE_SECTION_KINDS,
  STORE_SITE_SECTION_LAYOUTS,
  STORE_SITE_SECTION_MOTIONS,
  STORE_SITE_SECTION_WIDTHS,
} from "@pagosya/shared-types";

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
  "hero-carousel",
  "image-stream",
  "scroll-expansion",
  "hero-gallery-scroll",
  "stagger-testimonials",
  "portfolio-scroller",
  "circle-reveal",
  "clarity-marquee",
  "layered-text",
  "text-rotate",
  "text-glitch",
  "text-reveal-block",
  "text-along-path",
  "full-screen-chapters",
  "magnetic-target",
  "frame-sequence",
  "video-background",
  "draggable-cards",
  "perspective-carousel",
  "link-preview",
  "video-pin-reveal",
  "gallery-accordion",
  "split-scroll",
  "sticky-gallery",
  "sticky-story",
  "text-parallax",
] as const;
export const STORE_ANIMATION_TEXT_ALIGNS = ["left", "center", "right"] as const;
export const STORE_ANIMATION_TEXT_SIZES = ["small", "medium", "large"] as const;
export const STORE_ANIMATION_TEXT_WIDTHS = ["narrow", "medium", "wide"] as const;
export const STORE_FONT_STYLES = ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"] as const;
export type StoreFontStyle = (typeof STORE_FONT_STYLES)[number];
export const STORE_ANNOUNCEMENT_FONTS = ["store", ...STORE_FONT_STYLES] as const;
export const STORE_ANNOUNCEMENT_EFFECTS = ["none", "wave", "pulse", "sparkle"] as const;
export const STORE_ANIMATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
export const STORE_ANIMATION_SECTION_PATTERN = /^animation-[a-z0-9][a-z0-9_-]{0,47}$/;
export const STORE_SITE_SECTION_PATTERN = /^site-[a-z][a-z0-9-]{1,47}$/;
export const STORE_BASE_CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "links", "contact", "location"] as const;
const STORE_LEGACY_REQUIRED_CONTENT_SECTIONS = STORE_BASE_CONTENT_SECTIONS.filter((section) => !["contact", "location"].includes(section));
export const STORE_MOTION_CONTENT_SECTIONS = [
  "motion-story-scroll",
  "motion-hero-carousel",
  "motion-image-stream",
  "motion-scroll-expansion",
  "motion-hero-gallery-scroll",
  "motion-stagger-testimonials",
  "motion-portfolio-scroller",
  "motion-circle-reveal",
  "motion-clarity-marquee",
  "motion-layered-text",
  "motion-text-rotate",
  "motion-text-glitch",
  "motion-text-reveal-block",
  "motion-text-along-path",
  "motion-full-screen-chapters",
  "motion-magnetic-target",
  "motion-frame-sequence",
  "motion-video-background",
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

  @ApiPropertyOptional({ example: "product_123", description: "Optional product opened when a customer taps this image." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  productId?: string;

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

  @ApiPropertyOptional({ example: 24, minimum: 0, maximum: 100, description: "Horizontal position of this scene's text box." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  textPositionX?: number;

  @ApiPropertyOptional({ example: 72, minimum: 0, maximum: 100, description: "Vertical position of this scene's text box." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  textPositionY?: number;

  @ApiPropertyOptional({ example: 100, minimum: 50, maximum: 200, description: "Scale of this scene's text box." })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(200)
  textScale?: number;

  @ApiPropertyOptional({ example: 62, minimum: 20, maximum: 100, description: "Width of this scene's text box." })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(100)
  textWidthPercent?: number;

  @ApiPropertyOptional({ enum: STORE_ANIMATION_TEXT_ALIGNS, example: "left" })
  @IsOptional()
  @IsIn(STORE_ANIMATION_TEXT_ALIGNS)
  textAlign?: string;

  @ApiPropertyOptional({ example: "#ffffff", description: "Optional text color for this scene's text box." })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/i, { message: "editorial textColor must be a 6-digit hex color" })
  textColor?: string;

  @ApiPropertyOptional({ enum: STORE_FONT_STYLES, description: "Curated font for this scene's text." })
  @IsOptional()
  @IsIn(STORE_FONT_STYLES)
  fontStyle?: string;
}

export class StoreAnimationTextBlockDto {
  @ApiProperty({ example: "title-1", description: "Stable identifier for one independently editable text object." })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,47}$/)
  id!: string;

  @ApiProperty({ enum: ["title", "subtitle"] })
  @IsIn(["title", "subtitle"])
  role!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(220)
  text!: string;

  @IsOptional() @IsInt() @Min(0) @Max(100) textPositionX?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) textPositionY?: number;
  @IsOptional() @IsInt() @Min(50) @Max(200) textScale?: number;
  @IsOptional() @IsInt() @Min(20) @Max(100) textWidthPercent?: number;
  @IsOptional() @IsIn(STORE_ANIMATION_TEXT_ALIGNS) textAlign?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/i)
  textColor?: string;

  @IsOptional()
  @IsIn(STORE_FONT_STYLES)
  fontStyle?: string;
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

  @ApiPropertyOptional({ example: "page-1", description: "Optional custom page that owns this animation." })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  pageId?: string;

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

  @ApiPropertyOptional({ example: "Ver colección", description: "Optional movable call-to-action shown over the animation." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(36)
  buttonLabel?: string;

  @ApiPropertyOptional({ example: 18, minimum: 0, maximum: 100, description: "Horizontal button anchor inside the animation canvas." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  buttonPositionX?: number;

  @ApiPropertyOptional({ example: 88, minimum: 0, maximum: 100, description: "Vertical button anchor inside the animation canvas." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  buttonPositionY?: number;

  @ApiPropertyOptional({ example: 20, minimum: 0, maximum: 100, description: "Horizontal text anchor inside the animation canvas." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  textPositionX?: number;

  @ApiPropertyOptional({ example: 75, minimum: 0, maximum: 100, description: "Vertical text anchor inside the animation canvas." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  textPositionY?: number;

  @ApiPropertyOptional({ example: 100, minimum: 50, maximum: 200, description: "Precise text scale selected by direct canvas resizing." })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(200)
  textScale?: number;

  @ApiPropertyOptional({ example: 60, minimum: 20, maximum: 100, description: "Precise text-block width selected by direct canvas resizing." })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(100)
  textWidthPercent?: number;

  @ApiPropertyOptional({ enum: STORE_ANIMATION_TEXT_ALIGNS, example: "left" })
  @IsOptional()
  @IsIn(STORE_ANIMATION_TEXT_ALIGNS)
  textAlign?: string;

  @ApiPropertyOptional({ enum: STORE_ANIMATION_TEXT_SIZES, example: "medium" })
  @IsOptional()
  @IsIn(STORE_ANIMATION_TEXT_SIZES)
  textSize?: string;

  @ApiPropertyOptional({ enum: STORE_ANIMATION_TEXT_WIDTHS, example: "medium" })
  @IsOptional()
  @IsIn(STORE_ANIMATION_TEXT_WIDTHS)
  textWidth?: string;

  @ApiPropertyOptional({ example: "#ffffff", description: "Text color used by this animation." })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/i, { message: "animation textColor must be a 6-digit hex color" })
  textColor?: string;

  @ApiPropertyOptional({ example: "#111827", description: "Background color used by this animation." })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/i, { message: "animation backgroundColor must be a 6-digit hex color" })
  backgroundColor?: string;

  @ApiPropertyOptional({ enum: STORE_FONT_STYLES, description: "Curated font used by the primary text object." })
  @IsOptional()
  @IsIn(STORE_FONT_STYLES)
  fontStyle?: string;

  @ApiPropertyOptional({ type: [StoreAnimationTextBlockDto], description: "Additional independently editable titles and subtitles." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique((entry: StoreAnimationTextBlockDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreAnimationTextBlockDto)
  textBlocks?: StoreAnimationTextBlockDto[];

  @ApiProperty({ description: "Ordered pictures and copy owned by this animation.", type: [StoreEditorialImageDto] })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => StoreEditorialImageDto)
  media!: StoreEditorialImageDto[];
}

export {
  STORE_SITE_SECTION_ALIGNS,
  STORE_SITE_SECTION_KINDS,
  STORE_SITE_SECTION_LAYOUTS,
  STORE_SITE_SECTION_MOTIONS,
  STORE_SITE_SECTION_WIDTHS,
};

export class StoreCanvasTextStyleDto {
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(200)
  textScale?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(100)
  textWidthPercent?: number;

  @IsOptional()
  @IsIn(STORE_SITE_SECTION_ALIGNS)
  textAlign?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  textColor?: string;

  @IsOptional()
  @IsIn(STORE_FONT_STYLES)
  fontStyle?: string;

  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  textOffsetX?: number;

  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  textOffsetY?: number;

  @IsOptional()
  @IsIn(["element", "section"])
  textOffsetBasis?: "element" | "section";
}

export class StoreSiteSectionItemDto {
  @ApiPropertyOptional({ description: "Merchant-editable title for one authored scene." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: "Merchant-editable body for one authored scene." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(320)
  body?: string;

  @ApiPropertyOptional({ nullable: true, description: "Owned upload used by this authored scene." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN)
  mediaUrl?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  titleStyle?: StoreCanvasTextStyleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  bodyStyle?: StoreCanvasTextStyleDto;
}

export class StoreSiteSectionBlockDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  id!: string;

  @IsIn(SITE_SECTION_BLOCK_KINDS)
  kind!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,31}$/)
  slot!: string;

  @IsIn(SITE_SECTION_BLOCK_ROLES)
  role!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(600)
  text!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN)
  mediaUrl?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  style?: StoreCanvasTextStyleDto;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => StoreSiteSectionBlockDto)
  children!: StoreSiteSectionBlockDto[];
}

/** A bounded patch for an AI-authored section. The immutable section kind and
 * owned media URLs remain server-controlled; merchants can safely customize
 * every presentational and copy decision without submitting HTML or CSS. */
export class StoreSiteSectionDto {
  @ApiProperty({ example: "brand-story" })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,47}$/)
  id!: string;

  @ApiPropertyOptional({ description: "Optional authored page that owns this section; omitted sections belong to Inicio." })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  pageId?: string;

  @ApiPropertyOptional({ type: [String], description: "Optional curated products rendered by a catalog section." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z0-9_-]{1,200}$/i, { each: true })
  productIds?: string[];

  @IsIn(STORE_SITE_SECTION_KINDS)
  kind!: string;

  @ApiPropertyOptional({ enum: SITE_SECTION_FAMILIES, description: "Structural family used to compose this section's existing blocks." })
  @IsOptional()
  @IsIn(SITE_SECTION_FAMILIES)
  family?: string;

  @IsString()
  @IsSafeText()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(600)
  body!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(40)
  ctaLabel!: string;

  @IsIn(STORE_SITE_SECTION_LAYOUTS)
  layout!: string;

  @IsIn(STORE_SITE_SECTION_WIDTHS)
  width!: string;

  @ApiPropertyOptional({ minimum: 180, maximum: 1800, description: "Merchant-controlled fixed section height in CSS pixels." })
  @IsOptional()
  @IsInt()
  @Min(180)
  @Max(1800)
  heightPx?: number;

  @ApiPropertyOptional({ minimum: 180, maximum: 1800, description: "Optional fixed section height for storefronts up to 760px wide." })
  @IsOptional()
  @IsInt()
  @Min(180)
  @Max(1800)
  mobileHeightPx?: number;

  @IsIn(STORE_SITE_SECTION_ALIGNS)
  align!: string;

  @IsIn(STORE_SITE_SECTION_MOTIONS)
  motion!: string;

  @Matches(/^#[0-9a-fA-F]{6}$/)
  backgroundColor!: string;

  @Matches(/^#[0-9a-fA-F]{6}$/)
  textColor!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  titleStyle?: StoreCanvasTextStyleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  bodyStyle?: StoreCanvasTextStyleDto;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true })
  mediaUrls!: string[];

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => StoreSiteSectionItemDto)
  items!: StoreSiteSectionItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => StoreSiteSectionBlockDto)
  blocks?: StoreSiteSectionBlockDto[];
}

export class StoreSiteNavigationItemDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  id!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(40)
  label!: string;

  @IsIn(["home", "catalog", "section", "page"])
  target!: "home" | "catalog" | "section" | "page";

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  sectionId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  pageId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  style?: StoreCanvasTextStyleDto;
}

export class StoreSitePageDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  id!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(40)
  label!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(48)
  slug!: string;
}

export class StoreSiteNavigationDto {
  @IsIn(["brand-left", "centered", "split"])
  layout!: "brand-left" | "centered" | "split";

  @IsOptional()
  @IsIn(STORE_SITE_HEADER_STYLES)
  barStyle?: (typeof STORE_SITE_HEADER_STYLES)[number];

  @IsOptional()
  @IsIn(STORE_SITE_HEADER_POSITIONS)
  brandPosition?: (typeof STORE_SITE_HEADER_POSITIONS)[number];

  @IsOptional()
  @IsIn(STORE_SITE_HEADER_POSITIONS)
  navPosition?: (typeof STORE_SITE_HEADER_POSITIONS)[number];

  @IsOptional()
  @IsIn(STORE_SITE_HEADER_ACTION_POSITIONS)
  searchPosition?: (typeof STORE_SITE_HEADER_ACTION_POSITIONS)[number];

  @IsOptional()
  @IsIn(STORE_SITE_HEADER_ACTION_POSITIONS)
  profilePosition?: (typeof STORE_SITE_HEADER_ACTION_POSITIONS)[number];

  @IsOptional()
  @IsIn(STORE_SITE_HEADER_ACTION_POSITIONS)
  cartPosition?: (typeof STORE_SITE_HEADER_ACTION_POSITIONS)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  brandStyle?: StoreCanvasTextStyleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreCanvasTextStyleDto)
  taglineStyle?: StoreCanvasTextStyleDto;

  @IsBoolean()
  sticky!: boolean;

  @IsBoolean()
  transparent!: boolean;

  @IsIn(["mark", "wordmark", "oversized", "seal"])
  logoTreatment!: "mark" | "wordmark" | "oversized" | "seal";
}

export class StoreSiteNewsletterDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsSafeText()
  @MaxLength(80)
  title!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(240)
  body!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(40)
  buttonLabel!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(120)
  successMessage!: string;
}

export class StoreSiteFooterItemDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  id!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(100)
  label!: string;

  @IsString()
  @MaxLength(500)
  @Matches(/^(?:$|#[a-z][a-z0-9-]{0,63}$|\/(?!\/)[^\s]*$|https:\/\/[^\s]+$|mailto:[^\s]+$|tel:[+0-9() .-]+$)/i)
  href!: string;
}

export class StoreSiteFooterColumnDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,47}$/)
  id!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(60)
  title!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique((entry: StoreSiteFooterItemDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreSiteFooterItemDto)
  items!: StoreSiteFooterItemDto[];
}

export class StoreSiteFooterDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsSafeText()
  @MaxLength(320)
  brandDescription!: string;

  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique((entry: StoreSiteFooterColumnDto) => entry.id)
  @ValidateNested({ each: true })
  @Type(() => StoreSiteFooterColumnDto)
  columns!: StoreSiteFooterColumnDto[];

  @IsString()
  @IsSafeText()
  @MaxLength(160)
  copyright!: string;

  @IsString()
  @IsSafeText()
  @MaxLength(80)
  badge!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoreSiteNewsletterDto)
  newsletter?: StoreSiteNewsletterDto;
}

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
