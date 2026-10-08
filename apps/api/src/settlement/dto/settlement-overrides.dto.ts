import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";

export class SettlementOverridesDto {
  @ApiPropertyOptional({ nullable: true, description: "Días; null = usar el del nivel" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(90) payoutDelayDaysOverride?: number | null;
  @ApiPropertyOptional({ nullable: true, description: "Puntos básicos (1000 = 10%); null = usar el del nivel" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(10_000) reserveBpsOverride?: number | null;
  @ApiPropertyOptional({ nullable: true, description: "Días; null = usar el del nivel" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(365) reserveDaysOverride?: number | null;
}
