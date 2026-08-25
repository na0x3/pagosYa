import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { STORE_MOTION_EXPERIENCES } from "./create-store.dto";

export class GenerateVisualProposalsDto {
  @ApiPropertyOptional({ description: "Whether the storefront announcement should move as a marquee instead of staying static." })
  @IsOptional()
  @IsBoolean()
  announcementMarqueeEnabled?: boolean;

  @ApiPropertyOptional({ description: "Animation treatment for the merchant-authored showcase section.", enum: ["story-scroll", "coverflow-carousel", "hero-carousel", "image-stream", "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials"] })
  @IsOptional()
  @IsIn(["story-scroll", "coverflow-carousel", "hero-carousel", "image-stream", "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials"])
  motionExperience?: string;

  @ApiPropertyOptional({ description: "Animation treatments composed into the merchant-authored showcase section.", enum: STORE_MOTION_EXPERIENCES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(STORE_MOTION_EXPERIENCES.length)
  @ArrayUnique()
  @IsIn(STORE_MOTION_EXPERIENCES, { each: true })
  motionExperiences?: string[];

  @ApiPropertyOptional({ description: "Storefront font family every generated direction must use.", enum: ["mono", "modern", "editorial", "friendly"] })
  @IsOptional()
  @IsIn(["mono", "modern", "editorial", "friendly"])
  fontStyle?: string;

  @ApiPropertyOptional({ description: "Optional extra merchant-owned image URLs. The generator automatically reuses images already present in the store and catalog.", type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true, message: "Every asset URL must come from POST /v1/uploads" })
  assetUrls?: string[];

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
