import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, ValidateNested } from "class-validator";

export class CartItemDto {
  @ApiProperty()
  @IsString()
  paymentLinkId!: string;

  @ApiProperty({ required: false, description: "Selected product option id, when this product defines options." })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ required: false, type: [String], description: "Selected additive extra ids." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  extraIds?: string[];

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Max(999)
  quantity!: number;
}

export class CartCheckoutDto {
  @IsOptional() @Matches(/^[a-zA-Z0-9_-]{32}$/) funnelToken?: string;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) recoveryToken?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) shippingCountry?: string;
  @IsOptional() @IsString() @MaxLength(20) @Matches(/^[A-Za-z0-9 -]{1,20}$/) shippingPostalCode?: string;
  @IsOptional() @IsString() @MaxLength(50) @Matches(/^[a-fA-F0-9-]{32,39}$/) creditCode?: string;
  @IsOptional() @IsString() @MaxLength(48) shippingZoneId?: string;
  @IsOptional() @IsString() @MaxLength(500) shippingAddress?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{32}$/)
  sourceVisitToken?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{8,40}$/)
  partnerCode?: string;

  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @ApiProperty({ required: false, example: "VERANO20" })
  @IsOptional()
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,31}$/)
  promoCode?: string;

  @ApiProperty({ required: false, description: "Selected store branch when this storefront has multiple fulfillment locations." })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  locationId?: string;

  @ApiProperty({ required: false, enum: ["pickup", "delivery"] })
  @IsOptional()
  @IsIn(["pickup", "delivery"])
  fulfillmentMethod?: "pickup" | "delivery";

}
