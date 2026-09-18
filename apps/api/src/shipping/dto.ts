import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class TrackingNumberDto {
  @IsString()
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9 ._\/-]{3,60}$/)
  trackingNumber!: string;
}

export class SwitchCarrierDto {
  @IsString()
  @MaxLength(48)
  carrierId!: string;
}

export class UpdateCarrierDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) trackingUrlTemplate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() platformEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(5000) platformMarginBps?: number;
}
