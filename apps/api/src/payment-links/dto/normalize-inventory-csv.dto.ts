import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class NormalizeInventoryCsvDto {
  @ApiProperty({
    description: "Raw CSV inventory to normalize into PagosYa product fields. The caller reviews the result before importing it.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(750_000)
  csv!: string;
}
