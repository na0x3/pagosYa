import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Logger, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { EmailProvider } from '../dashboard/interfaces/email-provider.interface';
import { EMAIL_PROVIDER } from '../dashboard/tokens';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { EMAIL_COPY_FIELDS, EMAIL_TYPES, type EmailCopyField, type EmailType } from './email-kit-contract';
import { EMAIL_KIT_MAX_CREDITS } from './email-kit-designer';
import { EmailKitService } from './email-kit.service';
import { EmailKitStore } from './email-kit-store';
import { EmailContentStore, type ContentItem, type StoredContent, type SwitchItem } from './email-content-store';
import { promoDiscountLabel } from './email-context';
import { StoreEmailService } from './store-email.service';
import { resolveCopy } from './email-recipes';
import { validateEmailCopy } from './email-kit-validate';

const TYPES: { type: EmailType; label: string; group: string }[] = [
  { type: 'order_confirmation', label: 'Confirmación de compra', group: 'Compras' },
  { type: 'appointment_confirmed', label: 'Cita confirmada', group: 'Compras' },
];
const asType = (value: string): EmailType => { if (!(EMAIL_TYPES as readonly string[]).includes(value)) throw new BadRequestException('Ese correo no existe.'); return value as EmailType; };
const asField = (value: string): EmailCopyField => { if (!Object.hasOwn(EMAIL_COPY_FIELDS, value)) throw new BadRequestException('Ese campo no existe.'); return value as EmailCopyField; };
const CONTENT_ITEMS: ContentItem[] = ['announcement', 'heroImage', 'promo', 'story', 'note', 'recommendations'];
const SWITCH_ITEMS: SwitchItem[] = ['announcement', 'promo', 'story', 'recommendations'];
const asItem = (value: string): ContentItem => { if (!(CONTENT_ITEMS as string[]).includes(value)) throw new BadRequestException('Ese contenido no existe.'); return value as ContentItem; };
const asSwitch = (value: string): SwitchItem => { if (!(SWITCH_ITEMS as string[]).includes(value)) throw new BadRequestException('Ese contenido no se puede apagar por correo.'); return value as SwitchItem; };
const UPLOAD = /^\/v1\/uploads\/[A-Za-z0-9._-]+$/;
const MAX_PRODUCT_PHOTOS = 12;

/** Ajustes › Correos. Every route is scoped to a store the caller owns; another merchant's store reads as absent. */
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project/emails')
export class StoreEmailController {
  private readonly logger = new Logger(StoreEmailController.name);
  constructor(private readonly emails: StoreEmailService, private readonly designer: EmailKitService, private readonly kits: EmailKitStore, private readonly content: EmailContentStore,
    private readonly prisma: PrismaService, @Inject(EMAIL_PROVIDER) private readonly mail: EmailProvider, private readonly config: ConfigService) {}

  private async owned(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true, publishedSourceRevision: true, bannerUrl: true } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  @Get()
  async status(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    const store = await this.owned(merchant.id, storeId);
    let looks: [Awaited<ReturnType<EmailKitStore['active']>>, unknown, boolean];
    try { looks = await Promise.all([this.kits.active(storeId), this.kits.candidate(storeId), this.kits.hasPrevious(storeId)]); }
    catch (error) {
      // The kit tables may not be migrated yet: the preview and test send still work on the standard look.
      this.logger.warn(`Email kit status unavailable for ${storeId}: ${(error as Error).message}`);
      return { kit: 'none', candidate: false, previous: false, siteChanged: false, available: false, maxCredits: EMAIL_KIT_MAX_CREDITS, types: TYPES };
    }
    const [active, candidate, previous] = looks;
    const siteChanged = Boolean(active && store.publishedSourceRevision && (active.designedFromRevision ?? 0) < store.publishedSourceRevision);
    return { kit: active ? 'active' : 'none', candidate: Boolean(candidate), previous, siteChanged, available: true, maxCredits: EMAIL_KIT_MAX_CREDITS, types: TYPES };
  }

  @Get('preview')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async preview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Req() req: { protocol: string; get(name: string): string | undefined }, @Query('type') type = 'order_confirmation', @Query('which') which = 'active') {
    const store = await this.owned(merchant.id, storeId);
    const emailType = asType(type);
    const sample = await this.emails.sampleReceipt(storeId, store.name, emailType);
    const assetBase = this.previewAssetBase(req);
    if (which !== 'candidate') return this.emails.renderReceipt(storeId, sample, { assetBase });
    const candidate = await this.kits.candidate(storeId);
    if (!candidate) throw new NotFoundException('No hay un diseño nuevo.');
    return this.emails.renderReceipt(storeId, sample, { kit: candidate, assetBase });
  }

  /**
   * A preview loads in the merchant's browser, not in Gmail: its images resolve against the public https base when
   * there is one, else against the address the browser reached this API on (local dev without a tunnel), so icons
   * and photos show instead of broken boxes. Sent emails never use the latter (StoreEmailService.base is https only).
   */
  private previewAssetBase(req: { protocol: string; get(name: string): string | undefined }) {
    const base = this.config.get<string | null>('app.publicAssetBaseUrl');
    if (base?.startsWith('https://')) return base;
    const host = req.get('host');
    return host ? `${req.protocol}://${host}` : null;
  }

  @Post('design')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async designKit(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: { mode?: string }) {
    await this.owned(merchant.id, storeId);
    return this.designer.design(storeId, body?.mode === 'bold' ? 'bold' : 'twin', (await this.kits.active(storeId)) ? 'candidate' : 'first');
  }

  @Post('candidate/accept')
  async accept(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    await this.owned(merchant.id, storeId); await this.kits.accept(storeId); return { ok: true };
  }

  @Post('candidate/discard')
  async discard(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    await this.owned(merchant.id, storeId); await this.kits.discard(storeId); return { ok: true };
  }

  @Post('revert')
  async revert(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    await this.owned(merchant.id, storeId); await this.kits.revert(storeId); return { ok: true };
  }

  @Get('copy/:type')
  async copy(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('type') type: string) {
    const store = await this.owned(merchant.id, storeId);
    const emailType = asType(type);
    let available = true;
    // While a new design waits for review, its wording is the one the preview shows.
    const [active, overrides] = await Promise.all([this.kits.candidate(storeId).then(async candidate => candidate ?? this.kits.active(storeId)), this.kits.overrides(storeId, emailType)]).catch((error: Error) => {
      this.logger.warn(`Email wording unavailable for ${storeId}: ${error.message}`);
      available = false;
      return [null, {} as Partial<Record<EmailCopyField, string>>] as const;
    });
    // Shown with placeholders intact: the merchant edits the template, not one buyer's copy.
    const base = resolveCopy(emailType, active ? validateEmailCopy(active.copy).copy : {}, {}, { cliente: '{cliente}', tienda: '{tienda}' });
    return { storeName: store.name, available, fields: (Object.keys(EMAIL_COPY_FIELDS) as EmailCopyField[]).map(field => ({
      field, max: EMAIL_COPY_FIELDS[field], value: overrides[field] ?? base[field], edited: overrides[field] !== undefined })) };
  }

  @Put('copy/:type/:field')
  async setCopy(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('type') type: string, @Param('field') field: string, @Body() body: { value?: unknown }) {
    await this.owned(merchant.id, storeId);
    if (typeof body?.value !== 'string') throw new BadRequestException('Escribe un texto.');
    return this.kits.setOverride(storeId, asType(type), asField(field), body.value);
  }

  @Delete('copy/:type/:field')
  async clearCopy(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('type') type: string, @Param('field') field: string) {
    await this.owned(merchant.id, storeId);
    await this.kits.clearOverride(storeId, asType(type), asField(field));
    return { ok: true };
  }

  /** What the merchant can put in their emails: their saved content, the codes they may share, their photos and the default wording. */
  @Get('content')
  async getContent(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    const store = await this.owned(merchant.id, storeId);
    let loaded: [StoredContent, { id: string; code: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number; showInEmails: boolean }[], { name: string; imageUrls: string[] }[], Awaited<ReturnType<EmailKitStore['active']>>];
    try {
      loaded = await Promise.all([
        this.content.get(storeId),
        this.prisma.promoCode.findMany({ where: { storeId, isActive: true }, orderBy: { createdAt: 'desc' }, select: { id: true, code: true, discountType: true, discountValue: true, showInEmails: true } }),
        this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: MAX_PRODUCT_PHOTOS, select: { name: true, imageUrls: true } }),
        this.kits.candidate(storeId).then(async candidate => candidate ?? this.kits.active(storeId)),
      ]);
    } catch (error) {
      // The content table or the promo flag may not be migrated yet: the panel stays hidden, the emails still send.
      this.logger.warn(`Email content unavailable for ${storeId}: ${(error as Error).message}`);
      return { available: false, content: {}, promos: [], photos: [], defaults: null };
    }
    const [stored, promos, products, kit] = loaded;
    // Only the store's own uploads: an email photo must be one the platform serves.
    const photos = [
      ...(store.bannerUrl && UPLOAD.test(store.bannerUrl) ? [{ url: store.bannerUrl, label: 'Portada de tu tienda' }] : []),
      ...products.flatMap(p => (p.imageUrls[0] && UPLOAD.test(p.imageUrls[0]) ? [{ url: p.imageUrls[0], label: p.name }] : [])),
    ];
    const copy = resolveCopy('order_confirmation', kit ? validateEmailCopy(kit.copy).copy : {}, {}, { cliente: '{cliente}', tienda: '{tienda}' });
    return {
      available: true, content: stored, photos,
      promos: promos.map(p => ({ id: p.id, code: p.code, discount: promoDiscountLabel(p.discountType, p.discountValue, 'BOB'), shared: p.showInEmails })),
      defaults: { announcement: copy.announcement, storyTitle: copy.storyTitle, storyText: copy.storyText, note: copy.note },
    };
  }

  @Put('content/emails/:type/:item')
  async setContentSwitch(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('type') type: string, @Param('item') item: string, @Body() body: { on?: unknown }) {
    await this.owned(merchant.id, storeId);
    const emailType = asType(type); const switchItem = asSwitch(item);
    if (typeof body?.on !== 'boolean') throw new BadRequestException('Indica si se muestra o no.');
    return this.content.setSwitch(storeId, emailType, switchItem, body.on);
  }

  @Put('content/:item')
  async setContent(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('item') item: string, @Body() body: unknown) {
    await this.owned(merchant.id, storeId);
    return this.content.set(storeId, asItem(item), body);
  }

  @Delete('content/:item')
  async clearContent(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('item') item: string) {
    await this.owned(merchant.id, storeId);
    return this.content.clear(storeId, asItem(item));
  }

  /** The address comes from the session and nothing else, never the body: otherwise this mails arbitrary people from the store's sender. */
  @Post('test-send')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async testSend(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: { type?: string }, @Req() req: { merchantUser?: { email?: string } }) {
    const store = await this.owned(merchant.id, storeId);
    const sessionAddress = req.merchantUser?.email;
    if (!sessionAddress) throw new ForbiddenException('Sign in to the dashboard to send yourself a test');
    // Local development may route every test to one inbox (EMAIL_TEST_TO); configuration keeps it null in production.
    const to = this.config.get<string | null>('app.emailTestTo') || sessionAddress;
    const emailType = asType(body?.type ?? 'order_confirmation');
    // A design waiting for review is the one sent, so the merchant can check it in their inbox before using it.
    const candidate = await this.kits.candidate(storeId).catch(() => null);
    const { html, subject } = await this.emails.renderReceipt(storeId, await this.emails.sampleReceipt(storeId, store.name, emailType), candidate ? { kit: candidate } : {});
    await this.mail.send({ to, subject: `Prueba · ${subject}`, html,
      body: `Esta es una vista previa del correo que recibe tu cliente en ${store.name}.\n\nLos datos de la orden son de ejemplo.` });
    return { sent: true };
  }
}
