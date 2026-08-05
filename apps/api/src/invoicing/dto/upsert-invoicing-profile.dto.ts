import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class UpsertInvoicingProfileDto {
  @ApiProperty({ example: "1023456028", description: "Merchant's NIT" })
  @IsString()
  @MinLength(5)
  nit!: string;

  @ApiProperty({ example: "Tienda Ejemplo S.R.L." })
  @IsString()
  @MinLength(2)
  razonSocial!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sucursal?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  puntoVenta?: number;
}
