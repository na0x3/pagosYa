import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class MfaCodeDto {
  @ApiProperty({ example: "123456", description: "The 6-digit code from the authenticator app" })
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code!: string;
}
