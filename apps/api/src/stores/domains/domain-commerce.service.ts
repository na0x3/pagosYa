import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { DomainOrder, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentIntentsService } from '../../payment-intents/payment-intents.service';
import { assertDomainCommerceReady, domainCommerceConfig, domainPrice } from './domain-commerce.config';
import { DomainCheckoutDto, DomainRegistrantDto } from './domain-commerce.dto';
import { DomainAvailability, NamecomProvider, DomainProviderError } from './namecom.provider';
import { CloudflareHostingProvider, HostedDomain } from './cloudflare-hosting.provider';

const TLDS = ['com', 'net', 'org', 'store', 'shop'];
const RUNNABLE = ['AWAITING_PAYMENT', 'REGISTERING', 'CONNECTING', 'ACTIVE'];
export function purchasableHostname(input: string): string {
  const hostname = input.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(com|net|org|store|shop)$/.test(hostname) || hostname.startsWith('xn--')) {
    throw new BadRequestException('Escribe un nombre sin espacios con .com, .net, .org, .store o .shop.');
  }
  return hostname;
}
function supported(row: DomainAvailability | undefined): row is DomainAvailability {
  return Boolean(row?.purchasable === true && row.premium === false && row.purchaseType === 'registration' &&
    Number.isFinite(row.purchasePrice) && row.purchasePrice > 0 && Number.isFinite(row.renewalPrice) && row.renewalPrice > 0);
}
export function paidDomainOrder(order: DomainOrder, payment: { status: string; amount: number; currency: string; merchantId: string; livemode: boolean; railId: string | null }, platformId: string) {
  return payment.status === 'SUCCEEDED' && payment.amount === order.amount && payment.currency === order.currency &&
    payment.merchantId === platformId && payment.livemode === !order.sandbox &&
    (order.sandbox ? payment.railId === 'mock_qr' : payment.railId === 'baneco_qr');
}

@Injectable()
export class DomainCommerceService {
  private readonly logger = new Logger(DomainCommerceService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService,
    private readonly payments: PaymentIntentsService, private readonly registrar: NamecomProvider,
    private readonly hosting: CloudflareHostingProvider) {}

  private async ownedStore(merchantId: string, storeId: string, purchasing = false) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    if (purchasing && store.status === 'ARCHIVED') throw new BadRequestException('Reactiva la tienda antes de comprar un dominio.');
    return store;
  }
  private present(order: DomainOrder & { paymentIntent?: { clientSecret: string; status: string } | null }) {
    const url = new URL(this.config.get<string>('app.checkoutOrigin')!);
    if (order.paymentIntent) url.hash = new URLSearchParams({ client_secret: order.paymentIntent.clientSecret }).toString();
    return { id: order.id, hostname: order.hostname, status: order.status, amount: order.amount, renewalAmount: order.renewalAmount,
      currency: order.currency, years: 1, sandbox: order.sandbox, quoteExpiresAt: order.quoteExpiresAt,
      expiresAt: order.expiresAt, contactVerified: order.contactVerified, autoRenew: false, message: order.message,
      url: order.status === 'ACTIVE' ? `https://${order.hostname}` : null,
      checkoutUrl: order.status === 'AWAITING_PAYMENT' && order.paymentIntent && ['REQUIRES_PAYMENT_METHOD', 'REQUIRES_CONFIRMATION', 'PROCESSING', 'REQUIRES_ACTION'].includes(order.paymentIntent.status) ? url.href : null };
  }
  async list(merchantId: string, storeId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    let available = store.status !== 'ARCHIVED';
    try { assertDomainCommerceReady(this.config); } catch { available = false; }
    const orders = await this.prisma.domainOrder.findMany({ where: { storeId, status: { not: 'QUOTED' } }, orderBy: { createdAt: 'desc' }, take: 100, include: { paymentIntent: { select: { clientSecret: true, status: true } } } });
    return { available, sandbox: domainCommerceConfig(this.config)?.sandbox ?? true, tlds: TLDS, orders: orders.map(row => this.present(row)) };
  }
  async search(merchantId: string, storeId: string, input: string) {
    await this.ownedStore(merchantId, storeId, true);
    const c = assertDomainCommerceReady(this.config);
    const query = input.trim().toLowerCase();
    const names = query.includes('.') ? [purchasableHostname(query)] : TLDS.map(tld => purchasableHostname(`${query}.${tld}`));
    const rows = await this.registrar.availability(names);
    return names.map(hostname => {
      const row = rows.find(item => item.domainName === hostname);
      return { hostname, available: supported(row), amount: supported(row) ? domainPrice(row.purchasePrice, c) : null,
        renewalAmount: supported(row) ? domainPrice(row.renewalPrice, c) : null, currency: 'BOB', years: 1 };
    });
  }
  async quote(merchantId: string, storeId: string, value: string) {
    await this.ownedStore(merchantId, storeId, true);
    const c = assertDomainCommerceReady(this.config), hostname = purchasableHostname(value);
    const row = (await this.registrar.availability([hostname])).find(item => item.domainName === hostname);
    if (!supported(row)) throw new ConflictException('Este dominio no está disponible para comprar. Busca otro nombre.');
    return this.present(await this.prisma.domainOrder.create({ data: { storeId, hostname, sandbox: c.sandbox,
      providerPriceUsd: row.purchasePrice, amount: domainPrice(row.purchasePrice, c), renewalAmount: domainPrice(row.renewalPrice, c),
      quoteExpiresAt: new Date(Date.now() + 15 * 60_000) } }));
  }
  async checkout(merchantId: string, storeId: string, dto: DomainCheckoutDto) {
    await this.ownedStore(merchantId, storeId, true);
    const c = assertDomainCommerceReady(this.config);
    const platform = await this.prisma.merchant.findFirst({ where: { id: c.platformMerchantId, status: 'ACTIVE' } });
    if (!platform || platform.id === merchantId) throw new BadRequestException('La cuenta de cobro de dominios no está disponible.');
    if (dto.accepted !== true) throw new BadRequestException('Confirma los datos del titular y el precio anual.');
    try {
      return await this.prisma.$transaction(async tx => {
        // Shared with manual domain creation: enforce capacity and reserve both hosts before collecting money.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-domains:${storeId}`}))`;
        const order = await tx.domainOrder.findFirst({ where: { id: dto.quoteId, storeId }, include: { paymentIntent: { select: { clientSecret: true, status: true } } } });
        if (!order) throw new NotFoundException('Cotización no encontrada.');
        if (order.paymentIntentId) return this.present(order);
        if (order.status !== 'QUOTED' || order.sandbox !== c.sandbox || order.quoteExpiresAt <= new Date()) throw new ConflictException('La cotización venció. Busca el dominio otra vez para actualizar el precio.');
        if (await tx.customDomain.count({ where: { storeId } }) > 1) throw new BadRequestException('La tienda necesita dos espacios libres de dominio para conectar el nombre con y sin www.');
        await tx.customDomain.createMany({ data: [order.hostname, `www.${order.hostname}`].map(hostname => ({ storeId, hostname, domainOrderId: order.id, verificationToken: randomBytes(24).toString('base64url') })) });
        const payment = await this.payments.createInTransaction(tx, c.platformMerchantId, !c.sandbox, {
          amount: order.amount, currency: order.currency, description: `Dominio ${order.hostname} · 1 año`,
          metadata: { domainOrderId: order.id, platformPurchase: 'domain', allowedPaymentMethods: ['QR'] },
        });
        const updated = await tx.domainOrder.update({ where: { id: order.id }, data: { status: 'AWAITING_PAYMENT',
          paymentIntentId: payment.id, registrant: dto.registrant as unknown as Prisma.InputJsonValue, acceptedAt: new Date() } });
        return this.present({ ...updated, paymentIntent: payment });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Este dominio ya está reservado para otra compra o tienda.');
      throw error;
    }
  }

  async cancel(merchantId: string, storeId: string, orderId: string) {
    await this.ownedStore(merchantId, storeId);
    const order = await this.prisma.domainOrder.findFirst({ where: { id: orderId, storeId, status: 'AWAITING_PAYMENT' } });
    if (!order?.paymentIntentId) throw new ConflictException('Esta compra ya no se puede cancelar desde el panel.');
    await this.payments.cancelById(order.paymentIntentId);
    await this.prisma.$transaction([this.prisma.customDomain.deleteMany({ where: { domainOrderId: order.id } }),
      this.prisma.domainOrder.update({ where: { id: order.id }, data: { status: 'CANCELED' } })]);
    return { success: true };
  }

  private async needsReview(order: DomainOrder, message: string) {
    await this.prisma.$transaction(async tx => {
      await tx.domainOrder.update({ where: { id: order.id }, data: { status: 'REVIEW_REQUIRED', message } });
      const store = await tx.store.findUniqueOrThrow({ where: { id: order.storeId } });
      await tx.supportCase.create({ data: { merchantId: store.merchantId, category: 'OTHER',
        summary: `Compra de dominio ${order.hostname} (${order.id}): ${message}` } });
    });
  }
  private async configureHost(order: DomainOrder, domain: { id: string; hostname: string; verificationToken: string; hostingId: string | null }) {
    const c = domainCommerceConfig(this.config), host = domain.hostname === order.hostname ? '' : 'www';
    const hosted = await this.hosting.ensure(domain.hostname, domain.hostingId);
    if (!hosted.id || hosted.hostname !== domain.hostname) throw new DomainProviderError(502, 'hosting');
    await this.prisma.customDomain.update({ where: { id: domain.id }, data: { hostingId: hosted.id } });
    await this.registrar.ensureRecord(order.hostname, host, host ? 'CNAME' : 'ANAME', c.target);
    await this.registrar.ensureRecord(order.hostname, `_pagosya${host ? `.${host}` : ''}`, 'TXT', `pagosya-site-verification=${domain.verificationToken}`);
    const tokens: Array<{ name: string; value: string }> = [];
    if (hosted.ownership_verification?.type === 'txt') tokens.push(hosted.ownership_verification);
    for (const record of hosted.ssl?.validation_records || []) {
      if (record.txt_name && record.txt_value) tokens.push({ name: record.txt_name, value: record.txt_value });
    }
    for (const token of tokens) {
      const name = token.name.replace(/\.$/, '').toLowerCase();
      if (!name.endsWith(`.${order.hostname}`)) throw new DomainProviderError(502, 'hosting');
      await this.registrar.ensureRecord(order.hostname, name.slice(0, -(order.hostname.length + 1)), 'TXT', token.value);
    }
    return hosted;
  }
  private async advance(order: DomainOrder) {
    const c = assertDomainCommerceReady(this.config);
    if (order.sandbox !== c.sandbox) return; // An environment switch must never promote a sandbox purchase.
    const payment = order.paymentIntentId ? await this.prisma.paymentIntent.findUnique({ where: { id: order.paymentIntentId }, include: { transactions: { where: { type: 'REFUND', status: 'SUCCEEDED' } } } }) : null;
    if (!payment) return;
    if (order.status === 'AWAITING_PAYMENT' && ['CANCELED', 'FAILED'].includes(payment.status)) {
      await this.prisma.$transaction([this.prisma.customDomain.deleteMany({ where: { domainOrderId: order.id } }),
        this.prisma.domainOrder.update({ where: { id: order.id }, data: { status: 'CANCELED' } })]);
      return;
    }
    if (!paidDomainOrder(order, payment, c.platformMerchantId)) {
      if (payment.status === 'SUCCEEDED') await this.needsReview(order, 'El pago requiere revisión antes de registrar el dominio.');
      return;
    }
    if (payment.transactions.length && !order.providerOrderId) {
      await this.needsReview(order, 'Este pago tiene un reembolso. Soporte revisará la compra antes de registrar.'); return;
    }
    if (!order.providerOrderId) {
      if (!order.registrationStartedAt) {
        const row = (await this.registrar.availability([order.hostname])).find(item => item.domainName === order.hostname);
        if (!supported(row) || row.purchasePrice !== Number(order.providerPriceUsd)) {
          await this.needsReview(order, 'El dominio o su precio cambió después del pago. Soporte revisará la compra y el reembolso.');
          return;
        }
        const started = await this.prisma.$transaction(async tx => {
          // Same row lock used by refunds: a reserved refund and registration cannot pass each other.
          await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE id = ${payment.id} FOR UPDATE`;
          const refunds = await tx.transaction.count({ where: { paymentIntentId: payment.id, type: 'REFUND', status: { in: ['PENDING', 'SUCCEEDED'] } } });
          if (refunds) return null;
          return tx.domainOrder.update({ where: { id: order.id }, data: { status: 'REGISTERING', registrationStartedAt: new Date(), attempts: 0 } });
        });
        if (!started) { await this.needsReview(order, 'El pago tiene un reembolso pendiente de conciliación.'); return; }
        order = started;
      }
      if (Date.now() - order.registrationStartedAt!.getTime() > 24 * 60 * 60_000) {
        await this.needsReview(order, 'El registro necesita conciliación con el proveedor. No vuelvas a pagar.'); return;
      }
      // Reuse the immutable payload/key even after a timeout; never infer ownership from an account lookup.
      const result = await this.registrar.register(order.hostname, order.registrant as unknown as DomainRegistrantDto, Number(order.providerPriceUsd), order.id);
      if (result.domain?.domainName !== order.hostname || !Number.isInteger(result.order) || !Number.isFinite(Date.parse(result.domain.expireDate))) throw new DomainProviderError(502, 'registrar');
      order = await this.prisma.domainOrder.update({ where: { id: order.id }, data: { providerOrderId: String(result.order),
        status: c.sandbox ? 'TEST_COMPLETE' : 'CONNECTING', expiresAt: new Date(result.domain.expireDate),
        contactVerified: result.domain.contacts?.registrant?.isVerified === true,
        message: c.sandbox ? 'Registro de prueba completado. No se compró ni publicó un dominio real.' : null } });
    }
    if (c.sandbox) return;
    const registered = await this.registrar.getDomain(order.hostname);
    const domains = await this.prisma.customDomain.findMany({ where: { domainOrderId: order.id } });
    let active = domains.length === 2 && Date.parse(registered.expireDate) > Date.now() &&
      !(registered.locks || []).some(lock => /hold/i.test(lock));
    const hosted: HostedDomain[] = [];
    for (const domain of domains) hosted.push(await this.configureHost(order, domain));
    active = active && hosted.every(host => host.status === 'active' && host.ssl?.status === 'active');
    await this.prisma.$transaction([
      this.prisma.customDomain.updateMany({ where: { domainOrderId: order.id }, data: { status: active ? 'ACTIVE' : 'PENDING',
        lastCheckedAt: new Date(), ...(active ? { verifiedAt: new Date() } : {}) } }),
      this.prisma.domainOrder.update({ where: { id: order.id }, data: { status: active ? 'ACTIVE' : 'CONNECTING',
        contactVerified: registered.contacts?.registrant?.isVerified === true, expiresAt: new Date(registered.expireDate),
        message: active ? null : 'Estamos verificando el dominio y activando HTTPS. Revisa también el correo del titular.' } }),
    ]);
  }
  @Interval('domain-purchase-fulfillment', 30_000)
  async reconcile() {
    if (this.running || !domainCommerceConfig(this.config)?.enabled) return;
    this.running = true;
    try {
      const rows = await this.prisma.domainOrder.findMany({ where: { status: { in: RUNNABLE }, nextAttemptAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, orderBy: { nextAttemptAt: 'asc' }, take: 5 });
      for (const row of rows) {
        const lease = new Date(Date.now() + 15 * 60_000);
        const claimed = await this.prisma.domainOrder.updateMany({ where: { id: row.id, updatedAt: row.updatedAt,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseUntil: lease, attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        try { await this.advance(row); }
        catch (error) {
          this.logger.warn(`Domain order ${row.id} will retry (${error instanceof DomainProviderError ? error.provider + ':' + error.status : 'transient failure'})`);
          if (row.attempts >= 30 && row.status !== 'ACTIVE' && row.status !== 'AWAITING_PAYMENT') {
            await this.needsReview(row, 'La conexión está tardando más de lo esperado. Soporte revisará el registro; no vuelvas a pagar.');
          }
        } finally {
          await this.prisma.domainOrder.updateMany({ where: { id: row.id, leaseUntil: lease }, data: { leaseUntil: null,
            nextAttemptAt: new Date(Date.now() + (row.status === 'ACTIVE' ? 60 * 60_000 : 60_000)) } });
        }
      }
    } finally { this.running = false; }
  }
}
