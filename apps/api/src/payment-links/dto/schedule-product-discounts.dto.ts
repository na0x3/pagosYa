import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsISO8601, IsString, Max, Min } from "class-validator";

export class ScheduleProductDiscountsDto {
  @ApiProperty({ description: "Active product ids that will share this discount campaign.", type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  productIds!: string[];

  @ApiProperty({ description: "Percentage deducted while the campaign is active.", example: 20 })
  @IsInt()
  @Min(1)
  @Max(99)
  discountPercent!: number;

  @ApiProperty({ description: "ISO-8601 campaign start time.", example: "2026-08-22T14:00:00.000Z" })
  @IsISO8601({ strict: true })
  discountStartsAt!: string;

  @ApiProperty({ description: "ISO-8601 campaign end time.", example: "2026-08-29T14:00:00.000Z" })
  @IsISO8601({ strict: true })
  discountEndsAt!: string;
}
