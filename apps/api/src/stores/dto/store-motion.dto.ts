/** Hero slides, editorial gallery images, and motion/animation sections of a store. */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsString, MaxLength, Matches, IsOptional, IsInt, Min, Max, IsIn, IsArray, ArrayMaxSize, ArrayUnique, ValidateNested } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { STORE_ANIMATION_TEXT_ALIGNS, STORE_FONT_STYLES, STORE_ANIMATION_ID_PATTERN, STORE_MOTION_EXPERIENCES, STORE_ANIMATION_TEXT_SIZES, STORE_ANIMATION_TEXT_WIDTHS } from "./store-options";


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
