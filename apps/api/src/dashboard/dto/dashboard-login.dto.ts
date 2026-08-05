import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString } from "class-validator";

export class DashboardLoginDto {
  @ApiProperty({ example: "owner@tienda-ejemplo.bo" })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}
