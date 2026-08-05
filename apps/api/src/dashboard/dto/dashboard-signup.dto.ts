import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class DashboardSignupDto {
  @ApiProperty({ example: "owner@tienda-ejemplo.bo" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "a-strong-password" })
  @IsString()
  @MinLength(8)
  password!: string;
}
