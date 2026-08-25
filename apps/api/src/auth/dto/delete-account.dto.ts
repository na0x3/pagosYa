import { ApiProperty } from "@nestjs/swagger";
import { Equals, IsString } from "class-validator";

export class DeleteAccountDto {
  @ApiProperty({ example: "ELIMINAR", description: "Explicit destructive-action confirmation." })
  @IsString()
  @Equals("ELIMINAR")
  confirmation!: "ELIMINAR";
}
