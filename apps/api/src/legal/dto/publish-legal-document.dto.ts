import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDate, IsEnum, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { LegalDocumentKind } from "@prisma/client";
import { LEGAL_VERSION_PATTERN } from "./accept-terms.dto";

export class PublishLegalDocumentDto {
  @ApiProperty({ enum: LegalDocumentKind })
  @IsEnum(LegalDocumentKind)
  kind!: LegalDocumentKind;

  @ApiProperty({ example: "2026-10-01" })
  @IsString()
  @Matches(LEGAL_VERSION_PATTERN)
  version!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: "Markdown." })
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  body!: string;

  @ApiProperty({ description: "When this version comes into force. Publish ahead of time to give merchants notice." })
  @Type(() => Date)
  @IsDate()
  effectiveAt!: Date;
}
