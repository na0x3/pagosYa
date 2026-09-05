import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Min, IsOptional, IsArray, ArrayMaxSize, ArrayUnique, IsString, MaxLength } from "class-validator";
import { SaveStoreSettingsDto } from "./save-store-settings.dto";

export class WebsiteRevisionDto {
  @ApiProperty({ description: "Exact website revision reviewed by the merchant." })
  @IsInt()
  @Min(0)
  revision!: number;
}

export class SaveWebsiteDraftDto extends SaveStoreSettingsDto {
  // A full appearance form carries stock values for display. Only explicit
  // stock edits may become stock changes; old display values are not commands.
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ArrayUnique()
  @IsString({ each: true }) @MaxLength(64, { each: true })
  inventoryProductIds?: string[];

  @ApiProperty()
  @IsInt()
  @Min(0)
  revision!: number;
}
