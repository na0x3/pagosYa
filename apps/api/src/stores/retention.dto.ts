import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsBoolean, IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { CartItemDto } from '../payment-links/dto/cart-checkout.dto';
export class RetentionSettingsDto {
  @IsInt() @Min(0) revision!: number;
  @IsBoolean() comebackEnabled!: boolean;
  @IsInt() @Min(2) @Max(50) visitsRequired!: number;
  @IsString() @MinLength(1) @MaxLength(160) rewardLabel!: string;
  @IsString() @MaxLength(60) timezone!: string;
  @IsBoolean() signupEnabled!: boolean;
  @IsString() @MinLength(1) @MaxLength(100) signupTitle!: string;
  @IsString() @MaxLength(500) signupBody!: string;
  @IsString() @MinLength(1) @MaxLength(60) signupButton!: string;
  @IsBoolean() recoveryEnabled!: boolean;
  @IsInt() @Min(1) @Max(168) recoveryHours!: number;
  /** Review requests are transactional but still opt-in because they email buyers. */
  @IsOptional() @IsBoolean() reviewRequestsEnabled?: boolean;
  @IsBoolean() welcomeEnabled!: boolean;
  @IsString() @MinLength(1) @MaxLength(160) welcomeSubject!: string;
  @IsString() @MinLength(1) @MaxLength(5000) welcomeBody!: string;
}
export class RetentionEmailDto { @IsEmail() @MaxLength(254) email!: string; }
export class RetentionPaymentCardDto { @IsString() @MinLength(20) @MaxLength(200) trackingToken!: string; }
export class RetentionSubscribeDto extends RetentionEmailDto {
  @Equals(true) consent!: boolean;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ArrayUnique() @IsString({ each: true }) @MaxLength(100, { each: true }) interests?: string[];
}
export class RetentionCartDto extends RetentionSubscribeDto {
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) token?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ArrayUnique((v: CartItemDto) => JSON.stringify([v?.paymentLinkId, v?.variantId || '', Array.isArray(v?.extraIds) ? [...v.extraIds].sort() : []]))
  @ValidateNested({ each: true }) @Type(() => CartItemDto) items!: CartItemDto[];
}
export class RetentionCampaignDto {
  @IsString() @MinLength(1) @MaxLength(160) subject!: string;
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
}
export class RedeemComebackDto { @IsString() @MaxLength(100) code!: string; }
export const DEFAULT_RETENTION = {
  comebackEnabled: false, visitsRequired: 5, rewardLabel: 'Un regalo en tu próxima visita', timezone: 'America/La_Paz',
  signupEnabled: false, signupTitle: 'Sé parte de nuestra comunidad', signupBody: 'Recibe novedades y beneficios de nuestra tienda.', signupButton: 'Quiero unirme',
  recoveryEnabled: false, recoveryHours: 24, reviewRequestsEnabled: false, welcomeEnabled: false, welcomeSubject: '¡Bienvenido a {{store}}!', welcomeBody: 'Gracias por unirte a nuestra comunidad. Pronto tendrás noticias de {{store}}.',
};
export type RetentionSettings = typeof DEFAULT_RETENTION;
