import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class AddSupportNoteDto {
  @ApiProperty({ example: "El titular confirmó control del correo registrado." })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body!: string;
}
