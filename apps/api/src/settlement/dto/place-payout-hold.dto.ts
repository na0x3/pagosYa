import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class PlacePayoutHoldDto {
  @ApiProperty({ description: "Motivo interno; nunca se muestra al comercio" }) @IsString() @MinLength(8) @MaxLength(500) reason!: string;
}
