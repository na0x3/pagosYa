import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from "class-validator";

export class ReorderCategoriesDto {
  @ApiProperty({
    description: "Every category id in the store, in the order customers should see them.",
    type: [String],
    example: ["cat_food", "cat_drinks", "cat_dessert"],
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  categoryIds!: string[];
}
