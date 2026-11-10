import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
export const POPUP_TRIGGERS = ['load', 'delay', 'exit', 'both'] as const;
export type PopupTrigger = typeof POPUP_TRIGGERS[number];
import { CartItemDto } from '../payment-links/dto/cart-checkout.dto';
import { POPUP_LOOK_IDS } from '../store-popups/popup-looks';
export class RetentionSettingsDto {
  @IsInt() @Min(0) revision!: number;
  @IsBoolean() comebackEnabled!: boolean;
  @IsInt() @Min(2) @Max(50) visitsRequired!: number;
  @IsString() @MinLength(1) @MaxLength(160) rewardLabel!: string;
  @IsString() @MaxLength(60) timezone!: string;
  @IsBoolean() signupEnabled!: boolean;
  @IsString() @MinLength(1) @MaxLength(100) signupTitle!: string;
  @IsString() @MaxLength(500) signupBody!: string;
  // The signup popup (plan 2026-10-20-store-popup): when it opens and the welcome code it may hand out.
  @IsOptional() @IsIn(POPUP_TRIGGERS) popupTrigger?: PopupTrigger;
  @IsOptional() @IsInt() @Min(0) @Max(60) popupDelaySeconds?: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() @MaxLength(40) popupPromoCodeId?: string | null;
  /** Spec 2026-11-09 popup looks: the merchant's chosen look (absent = YAPI's pick). */
  @IsOptional() @IsIn(POPUP_LOOK_IDS) popupLook?: string;
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
  /** The popup asks for the welcome code; the inline form never gets one. */
  @IsOptional() @IsIn(['popup']) source?: 'popup';
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ArrayUnique() @IsString({ each: true }) @MaxLength(100, { each: true }) interests?: string[];
  /** Spec 2026-11-09 popup games: the signed prize from /play, and the shopper's tap answer. */
  @IsOptional() @IsString() @MaxLength(400) gameToken?: string;
  @IsOptional() @IsString() @MaxLength(40) answer?: string;
  /** Spec 2026-11-09 A/B tests: the store page's test visit, so a B visitor gets B's code and the signup counts for B. */
  @IsOptional() @IsString() @MaxLength(64) sourceVisitToken?: string;
}
class GameQuestionDto {
  @IsString() @MinLength(1) @MaxLength(80) text!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(40, { each: true }) answers!: string[];
}
/** Spec 2026-11-09 popup games: the Studio's «Juego» panel (its own route; Ajustes keeps its fields). */
export class PopupGameDto {
  @IsOptional() @IsIn(['scratch', 'wheel', 'off']) game?: 'scratch' | 'wheel' | 'off';
  @IsOptional() @IsInt() @Min(5) @Max(50) topPrize?: number;
  @IsOptional() @ValidateIf((_, value) => value !== null) @ValidateNested() @Type(() => GameQuestionDto) question?: GameQuestionDto | null;
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
  popupTrigger: 'both' as PopupTrigger, popupDelaySeconds: 8, popupPromoCodeId: null as string | null,
  recoveryEnabled: false, recoveryHours: 24, reviewRequestsEnabled: false, welcomeEnabled: false, welcomeSubject: '¡Bienvenido a {{store}}!', welcomeBody: 'Gracias por unirte a nuestra comunidad. Pronto tendrás noticias de {{store}}.',
};
export type RetentionSettings = typeof DEFAULT_RETENTION;
