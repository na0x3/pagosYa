import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class TrackingNumberDto {
  @IsString({ message: 'Escribe un número de guía válido.' })
  @MaxLength(60, { message: 'Escribe un número de guía válido.' })
  @Matches(/^[A-Za-z0-9 ._\/-]{3,60}$/, { message: 'Escribe un número de guía válido.' })
  trackingNumber!: string;
}

export class SwitchCarrierDto {
  @IsString({ message: 'Elige un courier.' })
  @MinLength(1, { message: 'Elige un courier.' })
  @MaxLength(48, { message: 'Elige un courier.' })
  carrierId!: string;
}

export class UpdateCarrierDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) trackingUrlTemplate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() platformEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(5000) platformMarginBps?: number;
}
