import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class DomainOrderActionDto {
  @ApiProperty({ example: "El token del registrador volvió a cargarse." })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
