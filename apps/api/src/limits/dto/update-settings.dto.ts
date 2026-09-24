import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, Max, Min } from "class-validator";

export class UpdateLimitSettingsDto {
  @ApiProperty({ example: 6.96 }) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) usdToBobRate!: number;
}
