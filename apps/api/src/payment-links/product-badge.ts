import { BadRequestException } from '@nestjs/common';

export const PRODUCT_BADGE_MAX = 20;

/** null = Automática (the kit shows only what is true), '' = Ninguna, text = the merchant's own badge (spec 2026-10-10). */
export function normalizeProductBadge(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new BadRequestException('La insignia debe ser un texto.');
  const text = value.trim();
  if (/[\r\n]/.test(text)) throw new BadRequestException('La insignia va en una sola línea.');
  if (text.length > PRODUCT_BADGE_MAX) throw new BadRequestException(`La insignia tiene hasta ${PRODUCT_BADGE_MAX} caracteres.`);
  return text;
}
