import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, ValidateNested } from "class-validator";
import { BOLIVIA_DEPARTMENTS, ShippingDestinationDto, type Department } from "../../shipping/bolivia-address";

export class CartItemDto {
  @ApiProperty()
  @IsString()
  paymentLinkId!: string;

  @ApiProperty({ required: false, description: "Selected product option id, when this product defines options." })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ required: false, type: [String], description: "Selected additive extra ids. An id repeats once per pick inside a choose-N group." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(48)
  @IsString({ each: true })
  extraIds?: string[];

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Max(999)
  quantity!: number;

  @ApiProperty({ required: false, enum: ["WEEKLY", "BIWEEKLY", "MONTHLY"], description: "Buy this line as a subscription with this frequency." })
  @IsOptional()
  @IsIn(["WEEKLY", "BIWEEKLY", "MONTHLY"])
  subscriptionCadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
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

  @ApiProperty({ required: false, description: "The buyer ticked the subscription terms. Required when any line has subscriptionCadence." })
  @IsOptional() @IsBoolean() subscriptionConsent?: boolean;

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

  @ApiProperty({ required: false, type: () => ShippingDestinationDto })
  @IsOptional() @ValidateNested() @Type(() => ShippingDestinationDto)
  shippingDestination?: ShippingDestinationDto;

  // A hosted design never sees the buyer's address, so it quotes carrier rates by department alone;
  // the full destination arrives with the checkout from pagosYa's secure form.
  @ApiProperty({ required: false, enum: BOLIVIA_DEPARTMENTS, description: "Department to quote carrier rates for when no full shippingDestination is sent." })
  @IsOptional() @IsIn(BOLIVIA_DEPARTMENTS)
  shippingDepartment?: Department;
}
