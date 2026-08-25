import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class SupportActionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  merchantUserId!: string;

  @ApiProperty({ example: "El titular solicitó recuperar el acceso." })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
