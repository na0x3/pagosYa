import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { STORE_FONT_STYLES, STORE_MOTION_EXPERIENCES } from "./create-store.dto";
import { SITE_ART_DIRECTIONS } from "@pagosya/shared-types";

export class GenerateVisualProposalsDto {
  @ApiPropertyOptional({ description: "Merchant-owned creative recipe to materialize against this store's own content." })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateId?: string;

  @ApiPropertyOptional({ description: "Stable section ids to preserve exactly while the rest of the creative canvas is regenerated.", type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9-]{1,47}$/, { each: true, message: "Every locked section must use a stable section id" })
  lockedSectionIds?: string[];

  @ApiPropertyOptional({ description: "Preferred coherent visual world. The first proposal follows it and the alternatives deliberately contrast it.", enum: SITE_ART_DIRECTIONS })
  @IsOptional()
  @IsIn(SITE_ART_DIRECTIONS)
  artDirection?: string;

  @ApiPropertyOptional({
    description: "Free-form art direction, references, mood, and constraints for the generated storefront.",
    example: "Que se sienta como una revista de arte joven: mucho espacio, fotos grandes y movimiento suave.",
  })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(1200)
  creativeBrief?: string;

  @ApiPropertyOptional({ description: "Whether the storefront announcement should move as a marquee instead of staying static." })
  @IsOptional()
  @IsBoolean()
  announcementMarqueeEnabled?: boolean;

  @ApiPropertyOptional({ description: "Animation treatment for the merchant-authored showcase section.", enum: STORE_MOTION_EXPERIENCES })
  @IsOptional()
  @IsIn(STORE_MOTION_EXPERIENCES)
  motionExperience?: string;

  @ApiPropertyOptional({ description: "Animation treatments composed into the merchant-authored showcase section.", enum: STORE_MOTION_EXPERIENCES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(STORE_MOTION_EXPERIENCES.length)
  @ArrayUnique()
  @IsIn(STORE_MOTION_EXPERIENCES, { each: true })
  motionExperiences?: string[];

  @ApiPropertyOptional({ description: "Storefront font family every generated direction must use.", enum: STORE_FONT_STYLES })
  @IsOptional()
  @IsIn(STORE_FONT_STYLES)
  fontStyle?: string;

  @ApiPropertyOptional({ description: "Optional extra merchant-owned image URLs. The generator automatically reuses images already present in the store and catalog.", type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true, message: "Every asset URL must come from POST /v1/uploads" })
  assetUrls?: string[];

  @ApiPropertyOptional({
    description: "Dominant colors sampled from the merchant's logo and store photography, ordered by visual importance.",
    type: [String],
    example: ["#6f7d51", "#d8c7a2", "#3b2d24"],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { each: true, message: "Every brand palette color must be a 6-digit hex value" })
  brandPalette?: string[];

  @ApiPropertyOptional({ example: "Café y repostería" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  businessCategory?: string;

  @ApiPropertyOptional({ enum: ["warm", "bold", "minimal", "elegant", "playful"] })
  @IsOptional()
  @IsIn(["warm", "bold", "minimal", "elegant", "playful"])
  personality?: string;

  @ApiPropertyOptional({ description: "Required conversion path for every generated proposal.", enum: ["payment", "whatsapp", "external"] })
  @IsOptional()
  @IsIn(["payment", "whatsapp", "external"])
  checkoutMode?: string;

  @ApiPropertyOptional({ description: "WhatsApp number used when checkoutMode is whatsapp.", example: "+59171234567" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(40)
  whatsappPhone?: string;

  @ApiPropertyOptional({ description: "Required http(s) destination when checkoutMode is external." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/[^\s]+$/i, { message: "leadCaptureUrl must be an http(s) URL" })
  leadCaptureUrl?: string;
}
