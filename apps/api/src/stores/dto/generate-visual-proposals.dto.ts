import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class GenerateVisualProposalsDto {
  @ApiProperty({ description: "Between 1 and 8 original merchant-owned image URLs.", type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  @Matches(UPLOADED_FILE_URL_PATTERN, { each: true, message: "Every asset URL must come from POST /v1/uploads" })
  assetUrls!: string[];

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
}
