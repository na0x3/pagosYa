import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";

export class CreateQuickQrPaymentDto {
  @ApiProperty({ description: "Amount in centavos.", example: 4550 })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;

  @ApiPropertyOptional({ example: "Compra en caja" })
  @IsOptional()
  @IsString()
  @IsSafeText()
  @MaxLength(160)
  description?: string;
}
