import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class GenerateVisualProposalsDto {
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

  @ApiPropertyOptional({ description: "Required conversion path for every generated proposal.", enum: ["payment", "whatsapp"] })
  @IsOptional()
  @IsIn(["payment", "whatsapp"])
  checkoutMode?: string;

  @ApiPropertyOptional({ description: "WhatsApp number used when checkoutMode is whatsapp.", example: "+59171234567" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(40)
  whatsappPhone?: string;
}
