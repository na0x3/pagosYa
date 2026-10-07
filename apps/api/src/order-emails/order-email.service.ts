import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { kitPath } from '@pagosya/storefront-kit';
import { PrismaService } from '../prisma/prisma.service';
import { brandColorTokens, EMPTY_BRAND, type BrandProfile } from '../brand/brand-profile';
import { validateOrderEmailHtml } from '../storefront-source/source-email-html';
import { renderOrderEmail, type OrderEmailData } from './order-email-render';
import { ORDER_EMAIL_TEMPLATE_PATH } from './order-email-slots';

type SnapshotFile = { path: string; content: string };

/**
 * Picks the email a given store sends and renders it. The authored template wins when it
 * survived validation as a receipt; otherwise the kit floor does. Every path is guarded,
 * because the caller is a payment confirmation and nothing here may become its problem.
 */
@Injectable()
export class OrderEmailService {
  private readonly logger = new Logger(OrderEmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Email clients do not support custom properties, so every token becomes a literal: the store's
   * own confirmed colour when it has one, then the declared fallback, then nothing. One pass, so a
   * token written with a fallback still resolves to the brand rather than to the fallback.
   */
  private resolveTokens(html: string, brand: BrandProfile): string {
    const values = brandColorTokens(brand);
    return html.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?)\s*)?\)/g, (_match, name: string, fallback?: string) =>
      values.get(name) ?? fallback ?? '',
    );
  }

  /** A logo is only ever fetched over https; anything else is dropped rather than rendered. */
  private safeLogo(url: string | null, repairs: string[]): string | null {
    if (!url) return null;
    try {
      if (new URL(url).protocol === 'https:') return url;
    } catch {
      /* not a URL at all */
    }
    repairs.push('logo: not an https url, dropped');
    return null;
  }

  private async authoredTemplate(storeId: string, repairs: string[]): Promise<string | null> {
    const version = await this.prisma.storeSourceVersion.findFirst({
      where: { storeId }, orderBy: { revision: 'desc' }, select: { snapshot: true },
    });
    const files = (version?.snapshot as { files?: SnapshotFile[] } | null)?.files ?? [];
    const authored = files.find(file => file.path === ORDER_EMAIL_TEMPLATE_PATH)?.content;
    if (!authored) return null;

    const checked = validateOrderEmailHtml(authored);
    repairs.push(...checked.repairs);
    if (!checked.usable) {
      repairs.push('floor: authored template is not a receipt, using the kit template');
      return null;
    }

    const brand = await this.prisma.storeBrandProfile.findUnique({ where: { storeId }, select: { data: true } });
    return this.resolveTokens(checked.html, (brand?.data as BrandProfile | null) ?? EMPTY_BRAND);
  }

  async renderForStore(storeId: string | null, data: OrderEmailData): Promise<{ html: string; repairs: string[] }> {
    const repairs: string[] = [];
    let template: string | null = null;
    if (storeId) {
      try {
        template = await this.authoredTemplate(storeId, repairs);
      } catch (err) {
        this.logger.warn(`Order email template lookup failed for ${storeId}: ${(err as Error).message}`);
        repairs.push(`floor: ${(err as Error).message}`);
        template = null;
      }
    }

    const html = template ?? (await readFile(kitPath('emails', 'order-confirmation.html'), 'utf8'));
    const rendered = renderOrderEmail(html, { ...data, logoUrl: this.safeLogo(data.logoUrl, repairs) });
    return { html: rendered.html, repairs: [...repairs, ...rendered.repairs] };
  }

  /** A fixed synthetic order for the preview, populating every slot the merchant can style. */
  sampleData(storeName: string): OrderEmailData {
    return {
      storeName,
      logoUrl: null,
      customerName: 'Ana',
      orderId: 'pi_SYNTH001',
      items: [
        { name: 'Café de altura, grano entero', variantName: '250 g', extras: null, quantity: 1, amount: 'Bs 75,00' },
        { name: 'Taza de cerámica', variantName: null, extras: 'grabado', quantity: 2, amount: 'Bs 75,00' },
      ],
      total: 'Bs 150,00',
      originalTotal: null,
      trackingUrl: 'https://example.test/track/sample',
      subscription: 'Tu suscripción se renueva cada mes. Te enviamos un enlace para pagar antes de cada entrega.',
      appointment: null,
    };
  }
}
