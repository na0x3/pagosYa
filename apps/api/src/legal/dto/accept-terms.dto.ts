import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export const LEGAL_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

export class AcceptTermsDto {
  @ApiProperty({ example: "2026-10-01" })
  @IsString()
  @Matches(LEGAL_VERSION_PATTERN)
  version!: string;
}
