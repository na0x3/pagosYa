/** The site document: sections, blocks, navigation, pages, newsletter, and footer. */
import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsInt, Min, Max, IsIn, Matches, IsString, MaxLength, ValidateIf, ValidateNested, IsArray, ArrayMaxSize, ArrayUnique, IsBoolean } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { STORE_SITE_SECTION_ALIGNS, SITE_SECTION_BLOCK_KINDS, SITE_SECTION_BLOCK_ROLES, STORE_SITE_SECTION_KINDS, SITE_SECTION_FAMILIES, STORE_SITE_SECTION_LAYOUTS, STORE_SITE_SECTION_WIDTHS, STORE_SITE_SECTION_MOTIONS, STORE_SITE_HEADER_STYLES, STORE_SITE_HEADER_POSITIONS, STORE_SITE_HEADER_ACTION_POSITIONS } from "@pagosya/shared-types";
import { STORE_FONT_STYLES } from "./store-options";


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
