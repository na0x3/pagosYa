import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsString, Matches } from "class-validator";

export class SetVisualSectionLocksDto {
  @ApiProperty({ type: [String], description: "Stable siteDocument section ids preserved during regeneration." })
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9-]{1,47}$/, { each: true })
  sectionIds!: string[];
}
