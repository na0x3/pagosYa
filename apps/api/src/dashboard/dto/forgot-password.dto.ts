import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ example: "owner@tienda-ejemplo.bo" })
  @IsEmail()
  email!: string;
}
