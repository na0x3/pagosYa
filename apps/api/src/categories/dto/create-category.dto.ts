import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class CreateCategoryDto {
  @ApiProperty({ example: "Bebidas" })
  @IsString()
  @IsSafeText()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ description: "Lower sorts first on the storefront. Defaults to the end of the list.", example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
