import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Min, ValidateIf } from "class-validator";

export class UpdatePolicyDto {
  @ApiPropertyOptional({ nullable: true, description: "Centavos BOB" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) monthlyLimit?: number | null;
  @ApiPropertyOptional({ nullable: true, description: "Centavos BOB" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) perPaymentLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() liveEnabled?: boolean;
}
