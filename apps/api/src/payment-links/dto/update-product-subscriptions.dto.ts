import { ApiProperty } from "@nestjs/swagger";
import { ProductSubscriptionCadence } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsInt, Max, Min, ValidateNested } from "class-validator";

export class ProductSubscriptionOptionDto {
  @ApiProperty({ enum: ProductSubscriptionCadence, description: "WEEKLY: 7 days; BIWEEKLY: 14 days; MONTHLY: one calendar month." })
  @IsEnum(ProductSubscriptionCadence)
  cadence!: ProductSubscriptionCadence;

  @ApiProperty({ description: "Confirmed integer percentage off the one-time product/variant price. Zero means no discount.", example: 10 })
  @IsInt()
  @Min(0)
  @Max(99)
  discountPercent!: number;
}

export class UpdateProductSubscriptionsDto {
  @ApiProperty({ type: [ProductSubscriptionOptionDto], description: "Create or update these cadences; omitted cadences remain unchanged." })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique((option: ProductSubscriptionOptionDto) => option?.cadence)
  @ValidateNested({ each: true })
  @Type(() => ProductSubscriptionOptionDto)
  options!: ProductSubscriptionOptionDto[];
}

export class RemoveProductSubscriptionsDto {
  @ApiProperty({ enum: ProductSubscriptionCadence, isArray: true, description: "Remove only these cadences. Send all three to disable every recurring-purchase option." })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsEnum(ProductSubscriptionCadence, { each: true })
  cadences!: ProductSubscriptionCadence[];
}
