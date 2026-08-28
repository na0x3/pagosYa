import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class NormalizeInventoryCsvDto {
  @ApiProperty({
    description: "Raw CSV inventory to normalize into PagosYa product fields. The caller reviews the result before importing it.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(750_000)
  csv!: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: "Names of product image files selected with the CSV. They are used only to associate files with products before upload.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1_000)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  imageFileNames?: string[];
}
