import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ResolveSupportCaseDto {
  @ApiProperty({ example: "Acceso recuperado y sesiones anteriores revocadas." })
  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  resolution!: string;
}
