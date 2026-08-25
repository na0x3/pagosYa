import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class NormalizeDebtCsvDto {
  @ApiProperty({
    description: "Raw CSV debt data to normalize into PagosYa collection fields. The result is reviewed before creating the link.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5_000_000)
  csv!: string;
}
