import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class SetCollectionProductsDto {
  @ApiProperty({
    description: "Every product in this collection, in the order customers should see them. Replaces the previous membership.",
    type: [String],
    example: ["plk_1", "plk_2"],
  })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  paymentLinkIds!: string[];
}
