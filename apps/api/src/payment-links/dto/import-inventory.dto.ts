import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { CreatePaymentLinkDto } from "./create-payment-link.dto";

export class InventoryImportProductDto extends OmitType(CreatePaymentLinkDto, ["categoryId"] as const) {
  @ApiPropertyOptional({
    description: "Category name. Existing names are reused case-insensitively and missing categories are created at the end.",
    example: "Bebidas",
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryName?: string;
}

export class ImportInventoryDto {
  @ApiPropertyOptional({
    description: "Active stock connection that should receive automatic mappings for imported products with a SKU.",
    example: "cm123integration",
  })
  @IsOptional()
  @IsString()
  integrationConnectionId?: string;

  @ApiProperty({ type: [InventoryImportProductDto], description: "Validated products to create in one transaction." })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryImportProductDto)
  products!: InventoryImportProductDto[];
}
