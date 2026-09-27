import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ShopifyUrlDto { @IsString() @MaxLength(300) url!: string; }
export class ShopifyCsvDto { @IsString() @MaxLength(5_000_000) csv!: string; @IsString() @MaxLength(120) name!: string; @IsOptional() @IsString() @MaxLength(253) host?: string; }
export class ConfirmImportDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(100000) exchangeRate?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) @MaxLength(255, { each: true }) excluded?: string[];
}
