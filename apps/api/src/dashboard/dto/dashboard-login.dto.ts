import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Matches } from "class-validator";

export class DashboardLoginDto {
  @ApiProperty({ example: "owner@tienda-ejemplo.bo" })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiPropertyOptional({ example: "123456", description: "Authenticator code, when the account has a second factor on" })
  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code?: string;
}
