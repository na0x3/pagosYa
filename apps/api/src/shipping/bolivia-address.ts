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
  @IsIn(BOLIVIA_DEPARTMENTS, { message: 'Elige un departamento válido.' }) department!: Department;
  @IsString({ message: 'Escribe la ciudad.' }) @MinLength(2, { message: 'Escribe la ciudad.' }) @MaxLength(80, { message: 'Escribe la ciudad.' }) city!: string;
  @IsString({ message: 'Escribe la calle y el número.' }) @MinLength(3, { message: 'Escribe la calle y el número.' }) @MaxLength(200, { message: 'Escribe la calle y el número.' }) street!: string;
  @IsOptional() @IsString({ message: 'Las referencias son demasiado largas.' }) @MaxLength(300, { message: 'Las referencias son demasiado largas.' }) references?: string;
  @IsNumber({}, { message: 'Marca tu ubicación en el mapa.' }) @Validate(InsideBolivia) lat!: number;
  @IsNumber({}, { message: 'Marca tu ubicación en el mapa.' }) lng!: number;
  @IsString({ message: 'Escribe el nombre de quien recibe.' }) @MinLength(2, { message: 'Escribe el nombre de quien recibe.' }) @MaxLength(120, { message: 'Escribe el nombre de quien recibe.' }) recipientName!: string;
  @Matches(/^\+?[0-9 ]{7,16}$/, { message: 'Escribe un teléfono válido (7 a 16 dígitos).' }) recipientPhone!: string;
}
