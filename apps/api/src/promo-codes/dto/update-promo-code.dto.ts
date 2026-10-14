import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class UpdatePromoCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Whether the code may appear in the store's emails. Off by default, so a private code never leaks. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showInEmails?: boolean;

  /** Whether the store assistant may offer the code in its chat. Off by default. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showInAssistant?: boolean;
}
