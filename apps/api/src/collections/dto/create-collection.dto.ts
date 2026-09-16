import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Length } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class CreateCollectionDto {
  @ApiProperty({ example: "Verano" })
  @IsString()
  @Length(1, 60)
  @IsSafeText()
  name!: string;

  @ApiPropertyOptional({ description: "Lower sorts first on the storefront. Defaults to the end of the list.", example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
