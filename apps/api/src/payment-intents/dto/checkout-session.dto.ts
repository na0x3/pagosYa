import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CheckoutSessionDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^pi_[0-9a-z]+_secret_[0-9A-Za-z]+$/)
  clientSecret!: string;
}

export class WidgetSessionDto extends CheckoutSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^pk_(test|live)_[0-9A-Za-z_]+$/)
  publishableKey?: string;
}
