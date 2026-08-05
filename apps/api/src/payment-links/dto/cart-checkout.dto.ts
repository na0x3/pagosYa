import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsPositive, IsString, Max, ValidateNested } from "class-validator";

class CartItemDto {
  @ApiProperty()
  @IsString()
  paymentLinkId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Max(999)
  quantity!: number;
}

export class CartCheckoutDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}
