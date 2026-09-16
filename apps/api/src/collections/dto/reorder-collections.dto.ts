import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsString } from "class-validator";

export class ReorderCollectionsDto {
  @ApiProperty({
    description: "Every collection id in the store, in the order customers should see them.",
    type: [String],
    example: ["col_summer", "col_bestsellers"],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  collectionIds!: string[];
}
