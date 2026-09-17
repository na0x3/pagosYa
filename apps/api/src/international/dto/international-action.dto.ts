import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class InternationalActionDto {
  @ApiProperty({ example: "KYC aprobado y cuenta USD verificada." })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
