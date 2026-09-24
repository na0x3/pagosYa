/** Store locations: address, map embed, opening hours, and per-location inventory. */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { type ValidationOptions, registerDecorator, type ValidationArguments, IsString, MaxLength, IsOptional, ValidateIf, IsInt, IsIn, IsNumber, Min, Max, Matches, IsBoolean, IsArray, ArrayMaxSize, ArrayUnique, ValidateNested } from "class-validator";
import { IsSafeText } from "../../common/validation/safe-text.decorator";
import { BOLIVIA_DEPARTMENTS } from "../../shipping/bolivia-address";


export function isSupportedMapEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    const googleHost = /^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/.test(hostname);
    const googleEmbed = googleHost && url.pathname.startsWith("/maps/embed");
    const openStreetMapEmbed = (hostname === "openstreetmap.org" || hostname === "www.openstreetmap.org")
      && url.pathname === "/export/embed.html";
    return googleEmbed || openStreetMapEmbed;
  } catch {
    return false;
  }
}

export function IsSupportedMapEmbedUrl(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isSupportedMapEmbedUrl",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isSupportedMapEmbedUrl(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a secure Google Maps or OpenStreetMap embed URL`;
        },
      },
    });
  };
}

export class StoreLocationInventoryDto {
  @ApiProperty({ description: "Product id owned by this store." })
  @IsString()
  @MaxLength(80)
  paymentLinkId!: string;

  @ApiPropertyOptional({ nullable: true, description: "Units available at this branch; null means unlimited." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(999999)
  stock?: number | null;
}

export class StoreLocationHoursDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: "0 is Sunday, 6 is Saturday." })
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @ApiProperty({ example: "09:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  open!: string;

  @ApiProperty({ example: "18:00" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  close!: string;

  @ApiProperty()
  @IsBoolean()
  closed!: boolean;
}

export class StoreLocationDto {
  @ApiProperty({ example: "sucursal-centro" })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,47}$/)
  id!: string;

  @ApiProperty({ example: "Sucursal Centro" })
  @IsString()
  @IsSafeText()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: "Av. Arce 1234, Sopocachi" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(240)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2400)
  @IsSupportedMapEmbedUrl()
  mapEmbedUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(600)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsSafeText()
  @MaxLength(140)
  highlight?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(BOLIVIA_DEPARTMENTS, { message: 'Elige un departamento válido.' })
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Escribe la ciudad.' })
  @MaxLength(80, { message: 'Escribe la ciudad.' })
  city?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.lng !== undefined)
  @IsNumber({}, { message: 'Marca la sucursal dentro de Bolivia.' })
  @Min(-23.0, { message: 'Marca la sucursal dentro de Bolivia.' })
  @Max(-9.6, { message: 'Marca la sucursal dentro de Bolivia.' })
  lat?: number;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.lat !== undefined)
  @IsNumber({}, { message: 'Marca la sucursal dentro de Bolivia.' })
  @Min(-69.7, { message: 'Marca la sucursal dentro de Bolivia.' })
  @Max(-57.4, { message: 'Marca la sucursal dentro de Bolivia.' })
  lng?: number;

  @ApiProperty()
  @IsBoolean()
  pickupEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  deliveryEnabled!: boolean;

  @ApiPropertyOptional({ type: [StoreLocationHoursDto], description: "Weekly opening schedule in Bolivia time." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique((entry: StoreLocationHoursDto) => entry.day)
  @ValidateNested({ each: true })
  @Type(() => StoreLocationHoursDto)
  openingHours?: StoreLocationHoursDto[];

  @ApiPropertyOptional({ type: [StoreLocationInventoryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique((entry: StoreLocationInventoryDto) => entry.paymentLinkId)
  @ValidateNested({ each: true })
  @Type(() => StoreLocationInventoryDto)
  inventory?: StoreLocationInventoryDto[];
}
