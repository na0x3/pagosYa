import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { brandColorTokens, EMPTY_BRAND, type BrandProfile } from '../brand/brand-profile';
import { validateOrderEmailHtml } from '../storefront-source/source-email-html';
import { renderOrderEmail } from '../order-emails/order-email-render';
import { ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';
import { assembleEmail, type EmailItem } from './email-assemble';
import { loadFloorKit } from './email-copy-defaults';
import type { EmailType } from './email-kit-contract';
import { EmailKitStore, type KitRow } from './email-kit-store';
import { validateEmailKit } from './email-kit-validate';
import { emailImageUrl } from './email-image-url';
import { receiptCalls, receiptType, resolveCopy, type ReceiptData } from './email-recipes';

export type ReceiptLine = { paymentLinkId: string | null; variantId: string | null; name: string; variant: string | null; extras: string | null; quantity: number; amount: string };
export type ReceiptInput = Omit<ReceiptData, 'items'> & { logoUrl: string | null; lines: ReceiptLine[] };
type Variant = { id?: string; imageUrl?: string; imageUrls?: string[] };

/**
 * Builds the emails a store sends its buyers from that store's one email look. Fallback:
 * the store's active kit → its legacy authored order-confirmation.html (receipts only) →
 * the standard kit. The caller is a payment confirmation; it catches anything thrown here
 * and sends the text receipt.
 */
@Injectable()
export class StoreEmailService {
  constructor(private readonly prisma: PrismaService, private readonly kits: EmailKitStore, private readonly config: ConfigService) {}

  private base() { return this.config.get<string | null>('app.publicAssetBaseUrl') ?? null; }

  private async brand(storeId: string | null): Promise<BrandProfile> {
    if (!storeId) return EMPTY_BRAND;
    const row = await this.prisma.storeBrandProfile.findUnique({ where: { storeId }, select: { data: true } });
    return (row?.data as BrandProfile | null) ?? EMPTY_BRAND;
  }

  /** Same rule as the receipt template: the store's confirmed colour, then the declared fallback, then nothing. */
  private resolveTokens(html: string, brand: BrandProfile): string {
    const values = brandColorTokens(brand);
    return html.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?)\s*)?\)/g, (_m, name: string, fallback?: string) => values.get(name) ?? fallback ?? '');
  }

  private async items(lines: ReceiptLine[]): Promise<EmailItem[]> {
    const ids = [...new Set(lines.map(line => line.paymentLinkId).filter((id): id is string => !!id))];
    const links = ids.length ? await this.prisma.paymentLink.findMany({ where: { id: { in: ids } }, select: { id: true, imageUrls: true, variants: true } }) : [];
    const photos = new Map<string, string>();
    for (const link of links) {
      if (link.imageUrls[0]) photos.set(`${link.id}|`, link.imageUrls[0]);
      for (const variant of (Array.isArray(link.variants) ? link.variants : []) as Variant[]) {
        const photo = variant.imageUrls?.[0] ?? variant.imageUrl;
        if (variant.id && photo) photos.set(`${link.id}|${variant.id}`, photo);
      }
    }
    return lines.map(line => {
      const path = (line.paymentLinkId && line.variantId ? photos.get(`${line.paymentLinkId}|${line.variantId}`) : undefined)
        ?? (line.paymentLinkId ? photos.get(`${line.paymentLinkId}|`) : undefined) ?? null;
      const src = emailImageUrl(path, this.base());
      return { name: line.name, variant: line.variant, extras: line.extras, quantity: line.quantity, amount: line.amount, image: src ? { src, alt: line.name } : null };
    });
  }

  private async legacyTemplate(storeId: string): Promise<string | null> {
    const version = await this.prisma.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' }, select: { snapshot: true } });
    const authored = ((version?.snapshot as { files?: { path: string; content: string }[] } | null)?.files ?? []).find(file => file.path === ORDER_EMAIL_TEMPLATE_PATH)?.content;
    if (!authored) return null;
    const checked = validateOrderEmailHtml(authored);
    return checked.usable ? checked.html : null;
  }

  async renderReceipt(storeId: string | null, input: ReceiptInput, opts: { kit?: Pick<KitRow, 'layout' | 'blocks' | 'copy'> | null } = {}): Promise<{ html: string; subject: string; repairs: string[] }> {
    const floor = await loadFloorKit();
    const type = receiptType(input);
    const store = storeId ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { logoUrl: true } }) : null;
    const logoUrl = emailImageUrl(input.logoUrl ?? store?.logoUrl ?? null, this.base());
    const repairs: string[] = [];
    // A failed lookup (for instance before the kit tables are migrated) costs the store's look, never the email.
    const guarded = async <T>(lookup: Promise<T>, fallback: T): Promise<T> => {
      try { return await lookup; } catch (error) { repairs.push(`kit lookup failed: ${(error as Error).message}`); return fallback; }
    };
    const [brand, items, row, overrides] = await Promise.all([
      this.brand(storeId), this.items(input.lines),
      opts.kit !== undefined ? Promise.resolve(opts.kit) : storeId ? guarded(this.kits.active(storeId), null) : Promise.resolve(null),
      storeId ? guarded(this.kits.overrides(storeId, type), {}) : Promise.resolve({}),
    ]);
    const checked = row ? validateEmailKit({ layout: row.layout, blocks: row.blocks, copy: row.copy }) : null;
    repairs.push(...(checked?.repairs ?? []));
    const copy = resolveCopy(type, checked?.kit.copy ?? {}, overrides, { cliente: input.customerName, tienda: input.storeName });

    if (!checked && storeId) {
      const legacy = await this.legacyTemplate(storeId);
      if (legacy) {
        const rendered = renderOrderEmail(this.resolveTokens(legacy, brand), {
          storeName: input.storeName, logoUrl, customerName: input.customerName, orderId: input.orderId,
          items: input.lines.map(line => ({ name: line.name, variantName: line.variant, extras: line.extras, quantity: line.quantity, amount: line.amount })),
          total: input.total, originalTotal: input.originalTotal, trackingUrl: input.trackingUrl, subscription: input.subscription, appointment: input.appointment,
        });
        return { html: rendered.html, subject: copy.subject, repairs: [...repairs, 'legacy: authored order-confirmation.html used', ...rendered.repairs] };
      }
    }

    const data: ReceiptData = { ...input, items };
    const assembled = assembleEmail(checked?.kit ?? floor, floor, receiptCalls(type, data, copy),
      { storeName: input.storeName, logoUrl, storeUrl: null, preheader: copy.preheader, unsubscribeUrl: null, marketing: false });
    return { html: this.resolveTokens(assembled.html, brand), subject: copy.subject, repairs: [...repairs, ...assembled.repairs] };
  }

  /** The synthetic order the preview and the test send use; the store's own products (and photos) when it has some. */
  async sampleReceipt(storeId: string, storeName: string, type: EmailType): Promise<ReceiptInput> {
    const products = await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 2, select: { id: true, name: true } });
    const lines: ReceiptLine[] = products.length
      ? products.map((p, i) => ({ paymentLinkId: p.id, variantId: null, name: p.name, variant: null, extras: null, quantity: i + 1, amount: 'Bs 75,00' }))
      : [{ paymentLinkId: null, variantId: null, name: 'Café de altura, grano entero', variant: '250 g', extras: null, quantity: 1, amount: 'Bs 75,00' },
         { paymentLinkId: null, variantId: null, name: 'Taza de cerámica', variant: null, extras: 'grabado', quantity: 2, amount: 'Bs 75,00' }];
    return { storeName, customerName: 'Ana', orderId: 'pi_SYNTH001', lines, total: 'Bs 150,00', originalTotal: null,
      trackingUrl: 'https://example.test/track/sample', subscription: null, logoUrl: null,
      appointment: type === 'appointment_confirmed' ? { name: 'Corte de cabello', date: '12/10/2026, 10:00' } : null };
  }
}
