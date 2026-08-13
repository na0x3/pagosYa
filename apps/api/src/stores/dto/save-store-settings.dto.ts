import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, ValidateNested } from "class-validator";
import { StoreLinkDto } from "./set-store-links.dto";
import { UpdateStoreDto } from "./update-store.dto";

/** Saves storefront appearance and its ordered link buttons as one unit. */
export class SaveStoreSettingsDto extends UpdateStoreDto {
  @ApiProperty({ type: [StoreLinkDto] })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => StoreLinkDto)
  links!: StoreLinkDto[];
}
