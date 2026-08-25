import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ApiKeyMode, ApiKeyType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateApiKeyDto {
  @ApiProperty({ enum: ApiKeyType })
  @IsEnum(ApiKeyType)
  type!: ApiKeyType;

  @ApiProperty({ enum: ApiKeyMode })
  @IsEnum(ApiKeyMode)
  mode!: ApiKeyMode;

  @ApiPropertyOptional({ example: "Production backend" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;
}
