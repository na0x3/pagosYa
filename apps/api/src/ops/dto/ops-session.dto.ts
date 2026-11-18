import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class OpsTokenDto {
  @ApiProperty({ example: "ops_…", description: "The person's own ops_ token" })
  @IsString()
  @MaxLength(80)
  token!: string;
}

export class StartOpsSessionDto extends OpsTokenDto {
  @ApiPropertyOptional({ example: "123456", description: "The 6-digit code from the authenticator app" })
  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code?: string;
}

export class ConfirmOpsMfaDto extends OpsTokenDto {
  @ApiProperty({ example: "123456" })
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code!: string;
}
