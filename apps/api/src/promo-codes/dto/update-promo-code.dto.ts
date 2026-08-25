import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class UpdatePromoCodeDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
