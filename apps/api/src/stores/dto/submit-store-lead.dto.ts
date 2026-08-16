import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { CartCheckoutDto } from "../../payment-links/dto/cart-checkout.dto";

export class SubmitStoreLeadDto extends CartCheckoutDto {
  @ApiProperty({ example: "María Pérez" })
  @IsString()
  @IsSafeText()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "maria@gmail.com" })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: "+591 71234567" })
  @IsString()
  @IsSafeText()
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional({ example: "Quisiera saber si hacen entregas en Cochabamba." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(600)
  message?: string;
}
