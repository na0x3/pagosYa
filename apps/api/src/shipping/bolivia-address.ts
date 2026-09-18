import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

export const BOLIVIA_DEPARTMENTS = ['LA_PAZ', 'SANTA_CRUZ', 'COCHABAMBA', 'ORURO', 'POTOSI', 'CHUQUISACA', 'TARIJA', 'BENI', 'PANDO'] as const;
export type Department = (typeof BOLIVIA_DEPARTMENTS)[number];
export const DEPARTMENT_LABELS: Record<Department, string> = {
  LA_PAZ: 'La Paz', SANTA_CRUZ: 'Santa Cruz', COCHABAMBA: 'Cochabamba', ORURO: 'Oruro', POTOSI: 'Potosí',
  CHUQUISACA: 'Chuquisaca', TARIJA: 'Tarija', BENI: 'Beni', PANDO: 'Pando',
};

export function isInsideBolivia(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -23.0 && lat <= -9.6 && lng >= -69.7 && lng <= -57.4;
}

@ValidatorConstraint({ name: 'insideBolivia' })
class InsideBolivia implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const { lat, lng } = args.object as { lat: number; lng: number };
    return isInsideBolivia(lat, lng);
  }
  defaultMessage() { return 'La ubicación del mapa debe estar dentro de Bolivia.'; }
}

export class ShippingDestinationDto {
  @IsIn(BOLIVIA_DEPARTMENTS) department!: Department;
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsString() @MinLength(3) @MaxLength(200) street!: string;
  @IsOptional() @IsString() @MaxLength(300) references?: string;
  @IsNumber() @Validate(InsideBolivia) lat!: number;
  @IsNumber() lng!: number;
  @IsString() @MinLength(2) @MaxLength(120) recipientName!: string;
  @Matches(/^\+?[0-9 ]{7,16}$/) recipientPhone!: string;
}
