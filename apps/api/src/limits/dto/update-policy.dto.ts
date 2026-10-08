import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";

export class UpdatePolicyDto {
  @ApiPropertyOptional({ nullable: true, description: "Centavos BOB" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(2_000_000_000) monthlyLimit?: number | null;
  @ApiPropertyOptional({ nullable: true, description: "Centavos BOB" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(2_000_000_000) perPaymentLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() liveEnabled?: boolean;
  @ApiPropertyOptional({ description: "Días antes de que una venta pase a disponible" }) @IsOptional() @IsInt() @Min(0) @Max(90) payoutDelayDays?: number;
  @ApiPropertyOptional({ description: "Reserva en puntos básicos (1000 = 10%)" }) @IsOptional() @IsInt() @Min(0) @Max(10_000) reserveBps?: number;
  @ApiPropertyOptional({ description: "Días que se guarda la reserva" }) @IsOptional() @IsInt() @Min(0) @Max(365) reserveDays?: number;
}
