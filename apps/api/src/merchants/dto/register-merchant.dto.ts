import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";
import { CreateMerchantDto } from "./create-merchant.dto";

/** The dashboard's own sign-up (owner 2026-11-07): the business, its owner's email and the password they will use. */
export class RegisterMerchantDto extends CreateMerchantDto {
  @ApiProperty({ example: "una-clave-segura" })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
