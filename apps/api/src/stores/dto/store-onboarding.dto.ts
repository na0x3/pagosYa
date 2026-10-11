import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ONBOARDING_STEPS, type OnboardingStep } from '../store-onboarding';

class StoreOnboardingContactDto {
  @IsOptional() @IsString() @MaxLength(30) whatsapp?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
}
export class StoreOnboardingDto {
  @IsOptional() @IsInt() @Min(0) @Max(7) step?: number;
  @IsOptional() @IsArray() @IsIn(ONBOARDING_STEPS, { each: true }) done?: OnboardingStep[];
  @IsOptional() @IsArray() @IsIn(ONBOARDING_STEPS, { each: true }) skipped?: OnboardingStep[];
  @IsOptional() @IsString() @MaxLength(300) what?: string;
  @IsOptional() @IsString() @MaxLength(1200) story?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @Matches(/^\/v1\/uploads\/[A-Za-z0-9._-]+$/, { each: true }) photos?: string[];
  @IsOptional() @ValidateNested() @Type(() => StoreOnboardingContactDto) contact?: StoreOnboardingContactDto;
  @IsOptional() @IsBoolean() finished?: boolean;
}
