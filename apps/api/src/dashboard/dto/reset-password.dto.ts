import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ example: "a-new-strong-password" })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
