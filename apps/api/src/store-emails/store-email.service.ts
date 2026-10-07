import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { brandColorTokens, EMPTY_BRAND, type BrandProfile } from '../brand/brand-profile';
import { validateOrderEmailHtml } from '../storefront-source/source-email-html';
import { renderOrderEmail } from '../order-emails/order-email-render';
import { ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';
import { assembleWithinBudget, type EmailItem } from './email-assemble';
import { EmailContentStore, type StoredContent } from './email-content-store';
import { loadEmailContext, type EmailContext } from './email-context';
import { loadFloorKit } from './email-copy-defaults';
import type { EmailType, ValidEmailKit } from './email-kit-contract';
import { EmailKitStore, type KitRow } from './email-kit-store';
import * as validate from './email-kit-validate';
import { layoutColorTokens } from './email-layout-tokens';
import { emailImageUrl } from './email-image-url';
import { receiptType, resolveContent, resolveCopy, richReceiptCalls, type Delivery, type ReceiptData } from './email-recipes';

export type ReceiptLine = { paymentLinkId: string | null; variantId: string | null; name: string; variant: string | null; extras: string | null; quantity: number; amount: string };
export type ReceiptInput = Omit<ReceiptData, 'items'> & { logoUrl: string | null; lines: ReceiptLine[]; delivery?: Delivery };
type Variant = { id?: string; imageUrl?: string; imageUrls?: string[] };
type KitInput = Pick<KitRow, 'layout' | 'blocks' | 'copy'> & { id?: string };
const KIT_CACHE_SIZE = 200;
const formatAmount = (amount: number, currency: string) => `${(amount / 100).toFixed(2)} ${currency}`;

/** The facts of a store we could not look up: every optional section is simply left out. */
const NO_CONTEXT: EmailContext = { storeUrl: null, heroImage: null, nav: [], socials: [], address: null, policies: [],
  contact: { email: null, phone: null, whatsapp: false }, delivers: false, review: null, promos: [], recommendations: () => [] };

/**
 * Builds the emails a store sends its buyers from that store's one email look. Fallback:
 * the store's active kit → its legacy authored order-confirmation.html (receipts only) →
 * the standard kit. The caller is a payment confirmation; it catches anything thrown here
 * and sends the text receipt.
 */
@Injectable()
export class StoreEmailService {
  private readonly logger = new Logger(StoreEmailService.name);
  /** A saved kit never changes (a redesign is a new row), so its checked form is kept by id. */
  private readonly checkedKits = new Map<string, ReturnType<typeof validate.validateEmailKit>>();
  constructor(private readonly prisma: PrismaService, private readonly kits: EmailKitStore, private readonly content: EmailContentStore, private readonly config: ConfigService) {}

  private base() { return this.config.get<string | null>('app.publicAssetBaseUrl') ?? null; }

  private async brand(storeId: string | null): Promise<BrandProfile> {
    if (!storeId) return EMPTY_BRAND;
    const row = await this.prisma.storeBrandProfile.findUnique({ where: { storeId }, select: { data: true } });
    return (row?.data as BrandProfile | null) ?? EMPTY_BRAND;
  }

  /** Same rule as the receipt template: the given colour for each token, then its declared fallback, then nothing. */
  private resolveTokens(html: string, values: Map<string, string>): string {
    return html.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?)\s*)?\)/g, (_m, name: string, fallback?: string) => values.get(name) ?? fallback ?? '');
  }

  /** Tokens resolve on the kit's own parts, before any order fact or buyer text is filled in. */
  private resolveKit(kit: ValidEmailKit, values: Map<string, string>): ValidEmailKit {
    return { ...kit, layout: kit.layout && this.resolveTokens(kit.layout, values),
      blocks: Object.fromEntries(Object.entries(kit.blocks).map(([type, html]) => [type, this.resolveTokens(html!, values)])) };
  }

  private check(row: KitInput) {
    const cached = row.id ? this.checkedKits.get(row.id) : undefined;
    if (cached) return cached;
    const checked = validate.validateEmailKit({ layout: row.layout, blocks: row.blocks, copy: row.copy });
    if (row.id) {
      if (this.checkedKits.size >= KIT_CACHE_SIZE) this.checkedKits.delete(this.checkedKits.keys().next().value!);
      this.checkedKits.set(row.id, checked);
    }
    return checked;
  }

  /** Where the store lives: its active custom domain, else its page on the checkout origin. */
  private storeUrl(store: { slug: string; customDomains?: { hostname: string }[] } | null): string | null {
    if (!store) return null;
    const domain = store.customDomains?.[0]?.hostname;
    if (domain) return `https://${domain}`;
    const origin = this.config.get<string>('app.checkoutOrigin');
    return origin ? `${origin.replace(/\/$/, '')}/s/${encodeURIComponent(store.slug)}` : null;
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
      return { name: line.name, variant: line.variant, extras: line.extras, quantity: line.quantity, amount: line.amount, image: src ? { src, alt: line.name } : null, productId: line.paymentLinkId };
    });
  }

  private async legacyTemplate(storeId: string): Promise<string | null> {
    const version = await this.prisma.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' }, select: { snapshot: true } });
    const authored = ((version?.snapshot as { files?: { path: string; content: string }[] } | null)?.files ?? []).find(file => file.path === ORDER_EMAIL_TEMPLATE_PATH)?.content;
    if (!authored) return null;
    const checked = validateOrderEmailHtml(authored);
    return checked.usable ? checked.html : null;
  }

  async renderReceipt(storeId: string | null, input: ReceiptInput, opts: { kit?: KitInput | null } = {}): Promise<{ html: string; subject: string; repairs: string[] }> {
    const floor = await loadFloorKit();
    const type = receiptType(input);
    const store = storeId ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { logoUrl: true, slug: true, customDomains: { where: { status: 'ACTIVE' }, select: { hostname: true }, take: 1 } } }) : null;
    const logoUrl = emailImageUrl(input.logoUrl ?? store?.logoUrl ?? null, this.base());
    const repairs: string[] = [];
    // A failed lookup (for instance before the kit or content tables are migrated) costs the store's look, never the email.
    const guarded = async <T>(what: string, lookup: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await lookup(); }
      catch (error) {
        // Logged here: the receipt sender keeps only the html and the subject, so a repair alone would go unseen.
        this.logger.warn(`Store email ${what} lookup failed for ${storeId}: ${(error as Error).message}`);
        repairs.push(`${what} lookup failed: ${(error as Error).message}`);
        return fallback;
      }
    };
    const checkoutOrigin = this.config.get<string>('app.checkoutOrigin') ?? null;
    const [brand, items, row, overrides, ctx, stored] = await Promise.all([
      this.brand(storeId), this.items(input.lines),
      opts.kit !== undefined ? Promise.resolve(opts.kit) : storeId ? guarded('kit', () => this.kits.active(storeId), null) : Promise.resolve(null),
      storeId ? guarded('kit', () => this.kits.overrides(storeId, type), {}) : Promise.resolve({}),
      storeId ? guarded('context', () => loadEmailContext(this.prisma, storeId, { assetBase: this.base(), checkoutOrigin }), NO_CONTEXT) : Promise.resolve(NO_CONTEXT),
      storeId ? guarded<StoredContent>('content', () => this.content.get(storeId), {}) : Promise.resolve({}),
    ]);
    const checked = row ? this.check(row) : null;
    repairs.push(...(checked?.repairs ?? []));
    const copy = resolveCopy(type, checked?.kit.copy ?? {}, overrides, { cliente: input.customerName, tienda: input.storeName });

    if (!checked && storeId) {
      const legacy = await this.legacyTemplate(storeId);
      if (legacy) {
        const rendered = renderOrderEmail(this.resolveTokens(legacy, brandColorTokens(brand)), {
          storeName: input.storeName, logoUrl, customerName: input.customerName, orderId: input.orderId,
          items: input.lines.map(line => ({ name: line.name, variantName: line.variant, extras: line.extras, quantity: line.quantity, amount: line.amount })),
          total: input.total, originalTotal: input.originalTotal, trackingUrl: input.trackingUrl, subscription: input.subscription, appointment: input.appointment,
        });
        return { html: rendered.html, subject: copy.subject, repairs: [...repairs, 'legacy: authored order-confirmation.html used', ...rendered.repairs] };
      }
    }

    // Confirmed brand colours win; without them a stand-in block takes the store layout's own colours.
    const kit = checked?.kit ?? floor;
    const values = new Map([...layoutColorTokens(kit), ...brandColorTokens(brand)]);
    const data: ReceiptData & { delivery: Delivery } = { ...input, items, delivery: input.delivery ?? null };
    const content = resolveContent(type, stored, ctx, copy, input.storeName, this.base());
    const assembled = assembleWithinBudget(this.resolveKit(kit, values), this.resolveKit(floor, values), richReceiptCalls(type, data, copy, ctx, content), {
      storeName: input.storeName, logoUrl, storeUrl: ctx.storeUrl ?? this.storeUrl(store), preheader: copy.preheader, unsubscribeUrl: null, marketing: false,
      nav: ctx.nav, socials: ctx.socials, address: ctx.address, policies: ctx.policies, iconBase: this.base(),
    });
    return { html: assembled.html, subject: copy.subject, repairs: [...repairs, ...assembled.repairs] };
  }

  /** The synthetic order the preview and the test send use; the store's own products (and photos) when it has some. */
  async sampleReceipt(storeId: string, storeName: string, type: EmailType): Promise<ReceiptInput> {
    const products = await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 2, select: { id: true, name: true, amount: true, currency: true } });
    // The store's own products at their own prices, written the way a real receipt writes them.
    const priced = products.length
      ? products.map((p, i) => ({ id: p.id, name: p.name, quantity: i + 1, amount: p.amount, currency: p.currency }))
      : [{ id: null, name: 'Café de altura, grano entero', quantity: 1, amount: 7500, currency: 'BOB' }, { id: null, name: 'Taza de cerámica', quantity: 2, amount: 3750, currency: 'BOB' }];
    const lines: ReceiptLine[] = priced.map(p => ({ paymentLinkId: p.id, variantId: null, name: p.name, variant: null, extras: null, quantity: p.quantity, amount: formatAmount(p.amount * p.quantity, p.currency) }));
    const currency = priced[0].currency;
    const total = formatAmount(priced.filter(p => p.currency === currency).reduce((sum, p) => sum + p.amount * p.quantity, 0), currency);
    return { storeName, customerName: 'Ana', orderId: 'pi_SYNTH001', lines, total, originalTotal: null,
      trackingUrl: 'https://example.test/track/sample', subscription: null, logoUrl: null,
      delivery: type === 'appointment_confirmed' ? null : { method: 'delivery', recipient: 'Ana Quispe', lines: ['Av. 6 de Agosto 123', 'La Paz'] },
      appointment: type === 'appointment_confirmed' ? { name: 'Corte de cabello', date: '12/10/2026, 10:00' } : null };
  }
}
