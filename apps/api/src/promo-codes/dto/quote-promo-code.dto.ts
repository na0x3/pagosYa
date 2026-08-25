import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { Matches } from "class-validator";

export class QuotePromoCodeDto {
  @ApiProperty({ example: "VERANO20" })
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,31}$/)
  code!: string;
}
