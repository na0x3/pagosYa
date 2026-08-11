import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class StoreLinkDto {
  @ApiProperty({ example: "Instagram" })
  @IsString()
  @IsSafeText()
  @MaxLength(40)
  label!: string;

  // http(s) only — these render as clickable buttons on a customer-facing
  // page, so javascript:/data: and friends must never get through.
  @ApiProperty({ example: "https://instagram.com/mitienda" })
  @IsString()
  @IsSafeText()
  @MaxLength(500)
  @Matches(/^https?:\/\/\S+$/i, { message: "url must start with http:// or https://" })
  url!: string;
}

/** Replaces the store's whole link list at once (order in the array = display
 * order) — a handful of buttons doesn't warrant per-row CRUD endpoints. */
export class SetStoreLinksDto {
  @ApiProperty({ type: [StoreLinkDto] })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => StoreLinkDto)
  links!: StoreLinkDto[];
}
