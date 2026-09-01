import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, MaxLength } from "class-validator";

export class SubscribeStoreNewsletterDto {
  @ApiProperty({ example: "maria@gmail.com" })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
