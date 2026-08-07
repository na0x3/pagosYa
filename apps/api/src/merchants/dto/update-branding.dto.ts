import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, Matches } from "class-validator";
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from "../../uploads/uploaded-file-url.constants";

export class UpdateMerchantBrandingDto {
  @ApiPropertyOptional({ description: "Path returned by POST /v1/uploads for the store logo." })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH)
  @Matches(UPLOADED_FILE_URL_PATTERN, { message: "logoUrl must be a path returned by POST /v1/uploads" })
  logoUrl?: string;

  @ApiPropertyOptional({ description: "6-digit hex color for the storefront background.", example: "#f8fafc" })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "backgroundColor must be a 6-digit hex color, e.g. #f8fafc" })
  backgroundColor?: string;
}
