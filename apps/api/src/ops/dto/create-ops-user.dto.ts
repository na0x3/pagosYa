import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class CreateOpsUserDto {
  @ApiProperty({ example: "Ana Gutierrez" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "ana@pagosya.bo" })
  @IsEmail()
  email!: string;
}
