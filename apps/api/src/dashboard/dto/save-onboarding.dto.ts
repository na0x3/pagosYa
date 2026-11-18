import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches } from "class-validator";

/** Owner 2026-11-12 (Amboras's setup steps): the merchant's answers right after sign-up. */
export const ONBOARDING_ROLES = ["owner", "marketing", "operations", "designer", "developer", "agency", "other"] as const;
export const ONBOARDING_GOALS = ["store", "products", "payments", "domain", "emails", "analytics"] as const;

export class SaveOnboardingDto {
  @ApiProperty({ enum: ONBOARDING_ROLES, required: false })
  @IsOptional()
  @IsIn(ONBOARDING_ROLES)
  role?: (typeof ONBOARDING_ROLES)[number];

  @ApiProperty({ enum: ONBOARDING_GOALS, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ONBOARDING_GOALS.length)
  @IsIn(ONBOARDING_GOALS, { each: true })
  goals?: Array<(typeof ONBOARDING_GOALS)[number]>;

  /** WhatsApp with its country code (+591 70000000); empty when skipped. */
  @ApiProperty({ example: "+59170000000", required: false })
  @IsOptional()
  @IsString()
  @Matches(/^(\+\d{6,15})?$/)
  phone?: string;
}
