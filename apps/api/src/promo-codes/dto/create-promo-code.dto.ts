import { ApiProperty } from "@nestjs/swagger";
import { PromoDiscountType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsInt, Matches, Max, Min } from "class-validator";

export class CreatePromoCodeDto {
  @ApiProperty({ example: "VERANO20" })
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, {
    message: "El código debe tener entre 3 y 32 caracteres: letras, números, guion o guion bajo",
  })
  code!: string;

  @ApiProperty({ enum: PromoDiscountType })
  @IsEnum(PromoDiscountType)
  discountType!: PromoDiscountType;

  @ApiProperty({ description: "Porcentaje entero o importe fijo en centavos" })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  discountValue!: number;
}
