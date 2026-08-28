import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { CartItemDto } from "../../payment-links/dto/cart-checkout.dto";

export class SubmitStoreLeadDto {
  @ApiProperty({
    type: [CartItemDto],
    description: "Selected products, or an empty array for a general storefront contact message.",
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @ApiPropertyOptional({ example: "María Pérez" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ example: "maria@gmail.com" })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: "+591 71234567" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: "Quisiera saber si hacen entregas en Cochabamba." })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(600)
  message?: string;

  @ApiPropertyOptional({ description: "Selected store branch for a product enquiry." })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  locationId?: string;

  @ApiPropertyOptional({ enum: ["pickup", "delivery"] })
  @IsOptional()
  @IsIn(["pickup", "delivery"])
  fulfillmentMethod?: "pickup" | "delivery";
}
