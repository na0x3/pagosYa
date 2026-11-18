import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class GoogleLoginDto {
  @ApiProperty({ description: "Google Identity Services ID token returned in the credential callback." })
  @IsString()
  @MaxLength(10_000)
  credential!: string;

  @ApiPropertyOptional({ description: "Carnet/CI required only when Google creates a new consumer account." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  carnet?: string;

  @ApiPropertyOptional({ example: "123456", description: "Merchant dashboard only: authenticator code, when the account has a second factor on." })
  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code?: string;
}
