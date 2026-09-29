import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class SaveExtensionDto { @IsOptional() @IsObject() settings?: Record<string, unknown>; @IsOptional() @IsObject() secrets?: Record<string, unknown>; }
export class ToggleExtensionDto { @IsBoolean() enabled!: boolean; }
