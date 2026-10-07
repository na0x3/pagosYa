import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EmailCopyField, EmailType } from './email-kit-contract';
import { cleanCopyValue } from './email-kit-validate';

export type ContentItem = 'announcement' | 'heroImage' | 'promo' | 'story' | 'note' | 'recommendations';
export type SwitchItem = 'announcement' | 'promo' | 'story' | 'recommendations';
export type StoredContent = {
  announcement?: { text: string } | { off: true };
  heroImage?: { url: string };
  promo?: { promoCodeId: string | null };
  story?: { title: string; text: string; imageUrl: string | null } | { off: true };
  note?: { text: string };
  recommendations?: { on: boolean };
  /** Per-email switches: a section can be on in the receipt and off in the appointment email. */
  emails?: Partial<Record<EmailType, Partial<Record<SwitchItem, boolean>>>>;
};

const CONTENT_ITEMS: ContentItem[] = ['announcement', 'heroImage', 'promo', 'story', 'note', 'recommendations'];
const UPLOAD = /^\/v1\/uploads\/[A-Za-z0-9._-]+$/;

const invalid = () => new BadRequestException('Ese contenido no es válido.');
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);
const isOff = (value: Record<string, unknown>) => value.off === true && Object.keys(value).length === 1;

/** Merchant wording goes through the same cleaning as copy edits: facts are the platform's, never typed in. */
function text(field: EmailCopyField, value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  if (!value.trim()) throw new BadRequestException('Escribe un texto.');
  const cleaned = cleanCopyValue(field, value);
  if (!cleaned.value) throw new BadRequestException('Ese texto solo tenía datos que pone la plataforma (montos, fechas o números de orden).');
  return cleaned.value;
}

/** Only the store's own uploads: an email photo must be one the platform serves. */
function upload(value: unknown): string {
  if (typeof value !== 'string' || !UPLOAD.test(value) || value.includes('..')) throw new BadRequestException('Elige una foto de tu tienda.');
  return value;
}

function validItem(item: ContentItem, raw: unknown): StoredContent[ContentItem] {
  const value = record(raw);
  if (!value) throw invalid();
  switch (item) {
    case 'announcement':
      return isOff(value) ? { off: true } : { text: text('announcement', value.text) };
    case 'heroImage':
      return { url: upload(value.url) };
    case 'promo':
      if (value.promoCodeId !== null && typeof value.promoCodeId !== 'string') throw invalid();
      return { promoCodeId: value.promoCodeId };
    case 'story':
      if (isOff(value)) return { off: true };
      return { title: text('storyTitle', value.title), text: text('storyText', value.text), imageUrl: value.imageUrl == null ? null : upload(value.imageUrl) };
    case 'note':
      return { text: text('note', value.text) };
    case 'recommendations':
      if (typeof value.on !== 'boolean') throw invalid();
      return { on: value.on };
  }
}

/** What a merchant chose to say in their emails, one JSON per store. */
@Injectable()
export class EmailContentStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(storeId: string): Promise<StoredContent> {
    const row = await this.prisma.storeEmailContent.findUnique({ where: { storeId } });
    // Junk in the row must never fail a receipt: it reads as no content.
    return (record(row?.data) ?? {}) as StoredContent;
  }

  async set(storeId: string, item: ContentItem, value: unknown): Promise<StoredContent> {
    if (!CONTENT_ITEMS.includes(item)) throw invalid();
    const next = { ...(await this.get(storeId)), [item]: validItem(item, value) };
    return this.save(storeId, next);
  }

  async clear(storeId: string, item: ContentItem): Promise<StoredContent> {
    if (!CONTENT_ITEMS.includes(item)) throw invalid();
    const { [item]: _cleared, ...rest } = await this.get(storeId);
    return this.save(storeId, rest);
  }

  async setSwitch(storeId: string, type: EmailType, item: SwitchItem, on: boolean): Promise<StoredContent> {
    const current = await this.get(storeId);
    const emails = { ...current.emails, [type]: { ...current.emails?.[type], [item]: on } };
    return this.save(storeId, { ...current, emails });
  }

  private async save(storeId: string, data: StoredContent): Promise<StoredContent> {
    const json = data as Prisma.InputJsonValue;
    await this.prisma.storeEmailContent.upsert({ where: { storeId }, create: { storeId, data: json }, update: { data: json } });
    return data;
  }
}
