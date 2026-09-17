import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

export class InternationalMethodsDto {
  @ApiProperty({ example: "BR" })
  @Matches(/^[A-Z]{2}$/)
  country!: string;
}
