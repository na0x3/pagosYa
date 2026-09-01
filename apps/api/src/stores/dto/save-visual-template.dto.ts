import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class SaveVisualTemplateDto {
  @ApiProperty({ example: "Editorial para lanzamientos" })
  @IsString()
  @IsSafeText()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}
