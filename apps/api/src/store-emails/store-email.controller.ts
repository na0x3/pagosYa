import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
import { StoreEmailService } from './store-email.service';
import { resolveCopy } from './email-recipes';
import { validateEmailCopy } from './email-kit-validate';

const TYPES: { type: EmailType; label: string; group: string }[] = [
  { type: 'order_confirmation', label: 'Confirmación de compra', group: 'Compras' },
  { type: 'appointment_confirmed', label: 'Cita confirmada', group: 'Compras' },
];
const asType = (value: string): EmailType => { if (!(EMAIL_TYPES as readonly string[]).includes(value)) throw new BadRequestException('Ese correo no existe.'); return value as EmailType; };
const asField = (value: string): EmailCopyField => { if (!Object.hasOwn(EMAIL_COPY_FIELDS, value)) throw new BadRequestException('Ese campo no existe.'); return value as EmailCopyField; };

/** Ajustes › Correos. Every route is scoped to a store the caller owns; another merchant's store reads as absent. */
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project/emails')
export class StoreEmailController {
  constructor(private readonly emails: StoreEmailService, private readonly designer: EmailKitService, private readonly kits: EmailKitStore,
    private readonly prisma: PrismaService, @Inject(EMAIL_PROVIDER) private readonly mail: EmailProvider) {}

  private async owned(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true, publishedSourceRevision: true } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  @Get()
  async status(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    const store = await this.owned(merchant.id, storeId);
    const [active, candidate, previous] = await Promise.all([this.kits.active(storeId), this.kits.candidate(storeId), this.kits.hasPrevious(storeId)]);
    const siteChanged = Boolean(active && store.publishedSourceRevision && (active.designedFromRevision ?? 0) < store.publishedSourceRevision);
    return { kit: active ? 'active' : 'none', candidate: Boolean(candidate), previous, siteChanged, maxCredits: EMAIL_KIT_MAX_CREDITS, types: TYPES };
  }

  @Get('preview')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async preview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('type') type = 'order_confirmation', @Query('which') which = 'active') {
    const store = await this.owned(merchant.id, storeId);
    const emailType = asType(type);
    const sample = await this.emails.sampleReceipt(storeId, store.name, emailType);
    if (which !== 'candidate') return this.emails.renderReceipt(storeId, sample);
    const candidate = await this.kits.candidate(storeId);
    if (!candidate) throw new NotFoundException('No hay un diseño nuevo.');
    return this.emails.renderReceipt(storeId, sample, { kit: candidate });
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
    const [active, overrides] = await Promise.all([this.kits.active(storeId), this.kits.overrides(storeId, emailType)]);
    // Shown with placeholders intact: the merchant edits the template, not one buyer's copy.
    const base = resolveCopy(emailType, active ? validateEmailCopy(active.copy).copy : {}, {}, { cliente: '{cliente}', tienda: '{tienda}' });
    return { storeName: store.name, fields: (Object.keys(EMAIL_COPY_FIELDS) as EmailCopyField[]).map(field => ({
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

  /** The address comes from the session and nothing else, never the body: otherwise this mails arbitrary people from the store's sender. */
  @Post('test-send')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async testSend(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: { type?: string }, @Req() req: { merchantUser?: { email?: string } }) {
    const store = await this.owned(merchant.id, storeId);
    const to = req.merchantUser?.email;
    if (!to) throw new ForbiddenException('Sign in to the dashboard to send yourself a test');
    const emailType = asType(body?.type ?? 'order_confirmation');
    const { html, subject } = await this.emails.renderReceipt(storeId, await this.emails.sampleReceipt(storeId, store.name, emailType));
    await this.mail.send({ to, subject: `Prueba · ${subject}`, html,
      body: `Esta es una vista previa del correo que recibe tu cliente en ${store.name}.\n\nLos datos de la orden son de ejemplo.` });
    return { sent: true };
  }
}
