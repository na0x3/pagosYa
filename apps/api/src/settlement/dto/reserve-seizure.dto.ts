import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class ReserveSeizureDto {
  @ApiProperty({ description: "Centavos" }) @IsInt() @Min(1) @Max(2_000_000_000) amount!: number;
  @ApiProperty({ enum: ["BOB", "USD"] }) @IsIn(["BOB", "USD"]) currency!: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(500) reason!: string;
  @ApiProperty({ description: "Referencia de la restitución, p. ej. la transferencia al comprador" }) @IsString() @MinLength(3) @MaxLength(200) externalReference!: string;
}
