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
  @IsOptional() @IsString({ message: 'Escribe un nombre válido.' }) @MaxLength(80, { message: 'Escribe un nombre válido.' }) name?: string;
  @IsOptional() @IsString({ message: 'La plantilla de seguimiento no es válida.' }) @MaxLength(300, { message: 'La plantilla de seguimiento no es válida.' }) trackingUrlTemplate?: string;
  @IsOptional() @IsBoolean({ message: 'Indica si el courier está activo.' }) isActive?: boolean;
  @IsOptional() @IsBoolean({ message: 'Indica si el courier está habilitado en la plataforma.' }) platformEnabled?: boolean;
  @IsOptional() @IsInt({ message: 'El margen debe estar entre 0 y 5000 puntos básicos.' }) @Min(0, { message: 'El margen debe estar entre 0 y 5000 puntos básicos.' }) @Max(5000, { message: 'El margen debe estar entre 0 y 5000 puntos básicos.' }) platformMarginBps?: number;
}
