import { workspaceMail, workspaceSender, renderEmailText } from './email-workspace.config';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import * as QRCode from 'qrcode';
import { createOrderTrackingToken, readOrderTrackingToken } from '../consumer/order-tracking-token';
import { comebackBrand } from './comeback-brand';
import { sourceComebackBranding } from '@pagosya/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER } from '../dashboard/tokens';
import { EmailProvider } from '../dashboard/interfaces/email-provider.interface';
import { DEFAULT_RETENTION, RetentionSettings, RetentionSettingsDto, RetentionCartDto, RetentionCampaignDto, RetentionSubscribeDto } from './retention.dto';
import { comebackCode, qualifyingDays, unusedDays } from './retention-policy';
const token = () => randomBytes(32).toString('hex');
const normalized = (email: string) => email.trim().toLowerCase();
const REVIEW_REQUEST_DELAY_MS = 24 * 60 * 60 * 1000;
const safeDeliveryError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'El proveedor rechazó el envío.';
  return message.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[correo oculto]').slice(0, 500);
};
type Db = Prisma.TransactionClient;
@Injectable()
export class RetentionService {
  private working = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider) {}
  async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException('Tienda no encontrada.'); return store;
  }
  async settings(storeId: string, db: Db = this.prisma) {
    const row = await db.storeRetention.findUnique({ where: { storeId } });
    return { ...DEFAULT_RETENTION, ...(row?.settings as object || {}), revision: row?.revision || 0, startedAt: row?.startedAt || new Date() };
  }
  private link(slug: string, key: string, value: string) {
    const url = new URL(`/s/${encodeURIComponent(slug)}`, this.config.get<string>('app.checkoutOrigin'));
    url.searchParams.set(key, value); return url.href;
  }
  async overview(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId);
    const [settings, subscribers, subscriberCount, cards, carts, campaigns, deliveries, failedDeliveries] = await Promise.all([
      this.settings(storeId), this.prisma.storeNewsletterSubscriber.findMany({ where: { storeId, isActive: true }, orderBy: { createdAt: 'desc' }, take: 50, select: { email: true, name: true, phone: true, interests: true, createdAt: true } }),
      this.prisma.storeNewsletterSubscriber.count({ where: { storeId, isActive: true } }), this.prisma.comebackCard.count({ where: { storeId } }),
      this.prisma.storeSavedCart.count({ where: { storeId, closedAt: null } }),
      this.prisma.storeEmailCampaign.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 20, include: { _count: { select: { deliveries: true } } } }),
      this.prisma.storeEmailDelivery.groupBy({ by: ['status'], where: { storeId }, _count: true }),
      this.prisma.storeEmailDelivery.findMany({ where: { storeId, status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, kind: true, attempts: true, lastError: true, dueAt: true, createdAt: true } }),
    ]);
    return { settings, subscribers, subscriberCount, cards, carts, campaigns, deliveries, failedDeliveries, emailConfigured: Boolean(this.config.get('app.email.resendApiKey')) };
  }
  async save(merchantId: string, storeId: string, dto: RetentionSettingsDto) {
    await this.owner(merchantId, storeId);
    try { new Intl.DateTimeFormat('en', { timeZone: dto.timezone }); } catch { throw new BadRequestException('Zona horaria inválida.'); }
    for (const field of ['rewardLabel', 'signupTitle', 'signupButton', 'welcomeSubject', 'welcomeBody'] as const) if (!dto[field].trim()) throw new BadRequestException('Completa los textos de la configuración.');
    const { revision, ...settings } = dto;
    try {
      return await this.prisma.$transaction(async tx => {
        const prior = await this.settings(storeId, tx);
        if (prior.revision && prior.timezone !== dto.timezone) throw new BadRequestException('La zona horaria de las compras queda fijada al crear el programa.');
        if (!revision) return tx.storeRetention.create({ data: { storeId, settings } });
        const result = await tx.storeRetention.updateMany({ where: { storeId, revision }, data: { settings: { ...settings, ...((prior as any).emailWorkspace ? { emailWorkspace: (prior as any).emailWorkspace } : {}) }, revision: { increment: 1 } } });
        if (!result.count) throw new ConflictException('La configuración cambió. Vuelve a abrir esta sección.');
        return { saved: true };
      });
    } catch (e: any) { if (e.code === 'P2002') throw new ConflictException('La configuración cambió. Vuelve a abrir esta sección.'); throw e; }
  }
  private async enqueue(db: Db, data: Prisma.StoreEmailDeliveryUncheckedCreateInput) {
    return db.storeEmailDelivery.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: {} });
  }
  async signupVisual(storeId: string) {
    const [store, products, categories] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, include: { brandProfile: true } }),
      this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { imageUrls: true }, orderBy: { createdAt: 'asc' }, take: 20 }),
      this.prisma.category.findMany({ where: { storeId }, select: { name: true }, orderBy: { sortOrder: 'asc' }, take: 8 }),
    ]);
    return { brand: comebackBrand(store), imageUrl: products.flatMap(p => p.imageUrls).find(url => !/\.(mp4|webm|mov)(\?|$)/i.test(url)) || store.bannerUrl || null, interests: categories.map(c => c.name) };
  }
  async subscribe(store: { id: string; slug: string; name: string }, rawEmail: string, profile: Pick<RetentionSubscribeDto, 'name' | 'phone' | 'interests'> = {}) {
    const settings = await this.settings(store.id);
    if (!settings.signupEnabled) throw new BadRequestException('Las suscripciones están desactivadas.');
    const email = normalized(rawEmail);
    const details = { ...(profile.name !== undefined ? { name: profile.name.trim() || null } : {}), ...(profile.phone !== undefined ? { phone: profile.phone.trim() || null } : {}), ...(profile.interests !== undefined ? { interests: profile.interests } : {}) };
    if (profile.interests?.length) {
      const allowed = await this.prisma.category.findMany({ where: { storeId: store.id, name: { in: profile.interests } }, select: { name: true } });
      if (profile.interests.some(name => !allowed.some(c => c.name === name))) throw new BadRequestException('Revisa tus intereses; las categorías de la tienda cambiaron.');
    }
    await this.prisma.$transaction(async tx => {
      const subscriber = await tx.storeNewsletterSubscriber.upsert({ where: { storeId_email: { storeId: store.id, email } }, create: { storeId: store.id, email, ...details }, update: { isActive: true, ...details } });
      if (settings.welcomeEnabled) await this.enqueue(tx, { storeId: store.id, email, kind: 'WELCOME', sourceId: subscriber.id, dedupeKey: `welcome:${subscriber.id}`, subject: settings.welcomeSubject.replaceAll('{{store}}', () => store.name), body: settings.welcomeBody.replaceAll('{{store}}', () => store.name) });
    });
    return { subscribed: true };
  }
  async unsubscribe(storeId: string, value: string) {
    const subscriber = await this.prisma.storeNewsletterSubscriber.findFirst({ where: { storeId, unsubscribeToken: value } });
    if (!subscriber) throw new NotFoundException('Enlace no válido.');
    await this.prisma.$transaction([
      this.prisma.storeNewsletterSubscriber.update({ where: { id: subscriber.id }, data: { isActive: false } }),
      this.prisma.storeEmailDelivery.updateMany({ where: { storeId, email: subscriber.email, kind: { in: ['CAMPAIGN', 'WELCOME', 'RECOVERY', 'REVIEW_REQUEST'] }, status: 'PENDING' }, data: { status: 'CANCELED' } }),
      this.prisma.storeSavedCart.updateMany({ where: { storeId, email: subscriber.email, closedAt: null }, data: { closedAt: new Date() } }),
    ]); return { unsubscribed: true };
  }
  async requestCard(store: { id: string; slug: string; name: string }, rawEmail: string) {
    if (!(await this.settings(store.id)).comebackEnabled) throw new BadRequestException('Comeback está desactivado.');
    const email = normalized(rawEmail);
    await this.prisma.$transaction(async tx => {
      const card = await tx.comebackCard.upsert({ where: { storeId_email: { storeId: store.id, email } }, create: { storeId: store.id, email, token: token() }, update: {} });
      // At most one link per email per hour, independently of request IP.
      await this.enqueue(tx, { storeId: store.id, email, kind: 'CARD', sourceId: card.id, dedupeKey: `card:${card.id}:${Math.floor(Date.now() / 3600000)}`, subject: `Tu tarjeta Comeback · ${store.name}`, body: `Abre tu tarjeta digital de ${store.name}:\n${this.link(store.slug, 'comeback', card.token)}\n\nUsa este mismo correo al comprar. Guarda el enlace: es personal.` });
    }); return { submitted: true };
  }
  private async cardState(card: any, db: Db = this.prisma) {
    const settings = await this.settings(card.storeId, db);
    if (!settings.comebackEnabled) throw new BadRequestException('El programa Comeback está pausado.');
    const orders = await db.storeOrder.findMany({ where: { storeId: card.storeId, paymentIntent: { customerEmail: { equals: card.email, mode: 'insensitive' }, status: 'SUCCEEDED', livemode: true } }, include: { paymentIntent: { include: { transactions: true } } } });
    const credits = await db.storeCreditReservation.findMany({ where: { paymentIntentId: { in: orders.map(o => o.paymentIntentId) } } });
    const eligibleOrders = orders.map(o => ({ ...o, paymentIntent: { ...o.paymentIntent, creditReservation: credits.find(c => c.paymentIntentId === o.paymentIntentId) } }));
    const rewards = await db.comebackReward.findMany({ where: { cardId: card.id } });
    const days = unusedDays(qualifyingDays(eligibleOrders, settings.timezone, settings.startedAt), rewards);
    const earned = days.slice(0, settings.visitsRequired);
    const latest = [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return { visits: days.length, visitsRequired: settings.visitsRequired, rewardLabel: settings.rewardLabel, code: earned.length === settings.visitsRequired ? comebackCode(card, earned) : null, earned, redeemed: rewards.length, availableRewards: Math.floor(days.length / settings.visitsRequired), customerName: latest?.paymentIntent.customerName || null };
  }
  private async cardBrand(store: Parameters<typeof sourceComebackBranding>[0] & { id: string; publishedSourceRevision?: number | null }) {
    const version = store.publishedSourceRevision
      ? await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId: store.id, revision: store.publishedSourceRevision } }, select: { snapshot: true } })
      : null;
    return sourceComebackBranding(store, version?.snapshot as Parameters<typeof sourceComebackBranding>[1]);
  }
  async card(storeId: string, value: string) {
    const card = await this.prisma.comebackCard.findFirst({ where: { storeId, token: value } });
    if (!card) throw new NotFoundException('Tarjeta no encontrada.');
    const store = await this.prisma.store.findFirst({ where: { id: storeId, status: 'ACTIVE' }, include: { brandProfile: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const { earned, ...state } = await this.cardState(card);
    const cardUrl = this.link(store.slug, 'comeback', card.token);
    return { ...state, brand: await this.cardBrand(store), cardUrl,
      qrImageDataUrl: await QRCode.toDataURL(state.code || cardUrl, { margin: 4, width: 240, errorCorrectionLevel: 'M' }) };
  }
  private async paidCardOrder(value: string) {
    const secret = this.config.get<string>('app.orderTrackingSecret');
    const id = secret && readOrderTrackingToken(value, secret);
    if (!id) throw new NotFoundException('Enlace de pedido no válido.');
    const order = await this.prisma.storeOrder.findUnique({ where: { id }, include: { paymentIntent: { include: { transactions: true } } } });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    const [store, settings, creditReservation] = await Promise.all([
      this.prisma.store.findFirst({ where: { id: order.storeId, status: 'ACTIVE' }, include: { brandProfile: true } }),
      this.settings(order.storeId), this.prisma.storeCreditReservation.findUnique({ where: { paymentIntentId: order.paymentIntentId } }),
    ]);
    if (!store || !settings.comebackEnabled) return null;
    const days = qualifyingDays([{ ...order, paymentIntent: { ...order.paymentIntent, creditReservation } }], settings.timezone, settings.startedAt);
    if (!days.length || !order.paymentIntent.customerEmail) return null;
    return { order, store, settings };
  }
  async paymentCard(value: string) {
    const eligible = await this.paidCardOrder(value);
    if (!eligible) return null;
    const { order, store, settings } = eligible;
    const email = normalized(order.paymentIntent.customerEmail!);
    await this.prisma.comebackCard.upsert({ where: { storeId_email: { storeId: store.id, email } }, create: { storeId: store.id, email, token: token() }, update: {} });
    // A paid order proves this purchase, not ownership of the typed email address.
    // Never reveal that email's previous purchases, private card token, or redemption code.
    const cardUrl = new URL(`/track/${encodeURIComponent(value)}`, this.config.get<string>('app.checkoutOrigin')).href;
    return { paymentIntentId: order.paymentIntentId, brand: await this.cardBrand(store), customerName: order.paymentIntent.customerName, visits: 1,
      visitsRequired: settings.visitsRequired, rewardLabel: settings.rewardLabel, currentPurchaseOnly: true,
      availableRewards: null, code: null, cardUrl, emailAvailable: Boolean(this.config.get('app.email.resendApiKey')),
      qrImageDataUrl: await QRCode.toDataURL(cardUrl, { margin: 4, width: 240, errorCorrectionLevel: 'M' }) };
  }
  async emailPaymentCard(value: string) {
    const eligible = await this.paidCardOrder(value);
    if (!eligible) throw new NotFoundException('Esta compra no tiene una tarjeta disponible.');
    if (!this.config.get('app.email.resendApiKey')) throw new BadRequestException('El envío de tarjetas por correo todavía no está disponible.');
    return this.requestCard(eligible.store, eligible.order.paymentIntent.customerEmail!);
  }
  async redeem(merchantId: string, storeId: string, code: string) {
    await this.owner(merchantId, storeId);
    const id = /^CB-([a-z0-9]+)-[a-f0-9]{16}$/.exec(code)?.[1];
    if (!id) throw new BadRequestException('Código no válido.');
    return this.prisma.$transaction(async tx => {
      // Lock this customer's card so concurrent redemptions cannot consume the same days.
      const locked = await tx.comebackCard.updateMany({ where: { id, storeId }, data: { updatedAt: new Date() } });
      if (!locked.count) throw new NotFoundException('Código no encontrado.');
      const card = await tx.comebackCard.findUniqueOrThrow({ where: { id } });
      const state = await this.cardState(card, tx);
      if (state.code !== code) throw new ConflictException('El premio ya fue canjeado o todavía no cumple las compras requeridas.');
      await tx.comebackReward.create({ data: { cardId: id, code, label: state.rewardLabel, days: state.earned } });
      return { redeemed: true, rewardLabel: state.rewardLabel };
    });
  }
  async saveCart(storeId: string, dto: RetentionCartDto) {
    const settings = await this.settings(storeId);
    if (!settings.recoveryEnabled) throw new BadRequestException('Los recordatorios están desactivados.');
    const email = normalized(dto.email);
    const products = await this.prisma.paymentLink.count({ where: { id: { in: dto.items.map(i => i.paymentLinkId) }, storeId, status: 'ACTIVE' } });
    if (products !== new Set(dto.items.map(i => i.paymentLinkId)).size) throw new BadRequestException('Revisa los productos del carrito.');
    return this.prisma.$transaction(async tx => {
      // Serialize saves per recipient; concurrent requests still schedule one reminder.
      await tx.storeNewsletterSubscriber.upsert({ where: { storeId_email: { storeId, email } }, create: { storeId, email, isActive: false }, update: { updatedAt: new Date() } });
      const existing = dto.token ? await tx.storeSavedCart.findFirst({ where: { storeId, email, token: dto.token, sentAt: null, closedAt: null } }) : null;
      const data = { items: dto.items.map(i => ({ ...i })), dueAt: new Date(Date.now() + settings.recoveryHours * 3600000) };
      // Explicit cart consent permits one reminder, without subscribing to campaigns.
      const recent = existing || await tx.storeSavedCart.findFirst({ where: { storeId, email, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } }, orderBy: { createdAt: 'desc' } });
      if (recent && !existing) return { saved: true }; // Never disclose another session's token.
      const cart = existing ? await tx.storeSavedCart.update({ where: { id: existing.id }, data }) : await tx.storeSavedCart.create({ data: { storeId, email, token: token(), ...data } });
      return { saved: true, token: cart.token };
    });
  }
  async restoreCart(storeId: string, value: string) {
    const cart = await this.prisma.storeSavedCart.findFirst({ where: { storeId, token: value, closedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } });
    if (!cart || await this.cartPaid(cart)) throw new NotFoundException('Este carrito ya se completó o venció.');
    return { items: cart.items };
  }
  async attachCheckout(storeId: string, value: string | undefined, paymentIntentId: string) {
    if (!value) return;
    await this.prisma.storeSavedCart.updateMany({ where: { storeId, token: value, closedAt: null }, data: { paymentIntentId } });
  }
  private async cartPaid(cart: any) {
    return Boolean(await this.prisma.storeOrder.findFirst({ where: { storeId: cart.storeId, paymentIntent: { status: 'SUCCEEDED', OR: [{ id: cart.paymentIntentId || '' }, { customerEmail: { equals: cart.email, mode: 'insensitive' }, updatedAt: { gte: cart.createdAt } }] } }, select: { id: true } }));
  }
  async draft(merchantId: string, storeId: string, dto: RetentionCampaignDto) {
    await this.owner(merchantId, storeId);
    if (!dto.subject.trim() || !dto.body.trim()) throw new BadRequestException('Escribe asunto y mensaje.');
    return this.prisma.storeEmailCampaign.create({ data: { storeId, subject: dto.subject.trim(), body: dto.body.trim() } });
  }
  async queueCampaign(merchantId: string, storeId: string, id: string) {
    await this.owner(merchantId, storeId);
    if (!this.config.get('app.email.resendApiKey')) throw new BadRequestException('Configura el remitente de correo antes de enviar una campaña.');
    return this.prisma.$transaction(async tx => {
      const claimed = await tx.storeEmailCampaign.updateMany({ where: { id, storeId, queuedAt: null }, data: { queuedAt: new Date() } });
      if (!claimed.count) throw new ConflictException('Esta campaña ya está en cola o no existe.');
      const campaign = await tx.storeEmailCampaign.findUniqueOrThrow({ where: { id } });
      const subscribers = await tx.storeNewsletterSubscriber.findMany({ where: { storeId, isActive: true }, select: { id: true, email: true } });
      if (!subscribers.length) throw new BadRequestException('Todavía no hay suscriptores activos.');
      await tx.storeEmailDelivery.createMany({ data: subscribers.map(s => ({ storeId, campaignId: id, email: s.email, kind: 'CAMPAIGN', sourceId: s.id, dedupeKey: `campaign:${id}:${s.id}`, subject: campaign.subject, body: campaign.body })), skipDuplicates: true });
      return { queued: subscribers.length };
    }, { timeout: 20000 });
  }
  /**
   * Queue one review request per delivered order. The delivery table's unique
   * dedupe key makes this safe when several API instances run the interval at
   * the same time, and the explicit setting keeps customer email opt-in.
   */
  async scheduleReviewRequests() {
    const readyBefore = new Date(Date.now() - REVIEW_REQUEST_DELAY_MS);
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        status: 'DELIVERED',
        paymentIntent: { status: 'SUCCEEDED', livemode: true, customerEmail: { not: null } },
        statusEvents: { some: { status: 'DELIVERED', createdAt: { lte: readyBefore } } },
      },
      select: {
        id: true,
        storeId: true,
        items: true,
        paymentIntent: { select: { customerEmail: true, customerName: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    const checkoutOrigin = this.config.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174';
    const secret = this.config.get<string>('app.orderTrackingSecret') ?? 'development-only-order-tracking-secret-change-me';
    for (const order of orders) {
      const store = await this.prisma.store.findUnique({ where: { id: order.storeId }, select: { name: true, slug: true, contactEmail: true, status: true } });
      const settings = await this.settings(order.storeId);
      const email = order.paymentIntent.customerEmail?.trim().toLowerCase();
      const products = Array.isArray(order.items)
        ? order.items.filter((item: any) => typeof item?.paymentLinkId === 'string').map((item: any) => ({ id: item.paymentLinkId, name: String(item.name || 'Producto') }))
        : [];
      if (store?.status !== 'ACTIVE' || !settings.reviewRequestsEnabled || !email || !products.length) continue;
      const trackingToken = createOrderTrackingToken(order.id, secret);
      const reviewUrl = new URL(`/track/${encodeURIComponent(trackingToken)}`, checkoutOrigin);
      reviewUrl.searchParams.set('review', '1');
      await this.enqueue(this.prisma, {
        storeId: order.storeId,
        email,
        kind: 'REVIEW_REQUEST',
        sourceId: order.id,
        dedupeKey: `review-request:${order.id}`,
        subject: `¿Cómo fue tu compra en ${store.name}?`,
        body: `Hola${order.paymentIntent.customerName ? ` ${order.paymentIntent.customerName}` : ''},\n\nYa entregamos tu pedido de ${store.name}. Nos ayudaría conocer tu experiencia.\n\n${products.map((product: { name: string }) => `• ${product.name}`).join('\n')}\n\nComparte tu opinión aquí:\n${reviewUrl.href}\n\nTu reseña quedará pendiente de moderación antes de aparecer públicamente.`,
        dueAt: new Date(),
      });
    }
  }
  @Interval(60_000)
  async tick() {
    if (this.working || !this.config.get('app.email.resendApiKey')) return;
    this.working = true;
    try { await this.scheduleCarts(); await this.scheduleReviewRequests(); await this.deliver(600); } finally { this.working = false; }
  }
  async scheduleCarts() {
    const carts = await this.prisma.storeSavedCart.findMany({ where: { closedAt: null, sentAt: null, dueAt: { lte: new Date() } }, include: { store: true }, take: 100, orderBy: { dueAt: 'asc' } });
    for (const cart of carts) {
      const settings = await this.settings(cart.storeId);
      if (!settings.recoveryEnabled || cart.store.status !== 'ACTIVE' || Date.now() - cart.createdAt.getTime() > 30 * 86400000 || await this.cartPaid(cart)) {
        await this.prisma.storeSavedCart.update({ where: { id: cart.id }, data: { closedAt: new Date() } }); continue;
      }
      await this.enqueue(this.prisma, { storeId: cart.storeId, email: cart.email, kind: 'RECOVERY', sourceId: cart.id, dedupeKey: `cart:${cart.id}`, subject: `Tu carrito te espera · ${cart.store.name}`, body: `Dejaste productos en ${cart.store.name}. Puedes retomar tu pedido aquí:\n${this.link(cart.store.slug, 'recover', cart.token)}\n\nLa disponibilidad y los precios se confirman al volver.` });
    }
  }
  async deliver(pacingMs = 0) {
    // Retry within the provider's 24-hour idempotency window; stale work fails visibly.
    await this.prisma.storeEmailDelivery.updateMany({ where: { status: 'SENDING', lockedAt: { lt: new Date(Date.now() - 5 * 60000) }, createdAt: { gte: new Date(Date.now() - 20 * 3600000) } }, data: { status: 'PENDING' } });
    await this.prisma.storeEmailDelivery.updateMany({ where: { status: { in: ['PENDING', 'SENDING'] }, attempts: { gt: 0 }, createdAt: { lt: new Date(Date.now() - 20 * 3600000) } }, data: { status: 'FAILED' } });
    const rows = await this.prisma.storeEmailDelivery.findMany({ where: { status: 'PENDING', dueAt: { lte: new Date() } }, include: { store: true }, orderBy: { createdAt: 'asc' }, take: 30 });
    for (const row of rows) {
      if (pacingMs) await new Promise(resolve => setTimeout(resolve, pacingMs));
      if (!(await this.prisma.storeEmailDelivery.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'SENDING', attempts: { increment: 1 }, lockedAt: new Date() } })).count) continue;
      try {
        let allowed = row.store.status === 'ACTIVE';
        const settings = await this.settings(row.storeId);
        const subscriber = await this.prisma.storeNewsletterSubscriber.findUnique({ where: { storeId_email: { storeId: row.storeId, email: row.email } } });
        if (['CAMPAIGN', 'WELCOME'].includes(row.kind)) allowed = allowed && Boolean(subscriber?.isActive) && (row.kind !== 'WELCOME' || settings.welcomeEnabled);
        if (row.kind === 'CARD') allowed = allowed && settings.comebackEnabled;
        if (row.kind === 'RECOVERY') {
          const cart = await this.prisma.storeSavedCart.findUnique({ where: { id: row.sourceId! } });
          if (allowed && settings.recoveryEnabled && cart && !cart.closedAt && !cart.sentAt && cart.dueAt > new Date()) {
            await this.prisma.storeEmailDelivery.update({ where: { id: row.id }, data: { status: 'PENDING', dueAt: cart.dueAt } }); continue;
          }
          allowed = allowed && settings.recoveryEnabled && Boolean(cart && !cart.closedAt && !cart.sentAt && cart.dueAt <= new Date() && !await this.cartPaid(cart));
        }
        if (row.kind === 'REVIEW_REQUEST') {
          const order = await this.prisma.storeOrder.findUnique({ where: { id: row.sourceId || '' }, select: { status: true, paymentIntent: { select: { status: true, livemode: true } } } });
          allowed = allowed && settings.reviewRequestsEnabled && order?.status === 'DELIVERED' && order.paymentIntent.status === 'SUCCEEDED' && order.paymentIntent.livemode;
        }
        const mail = workspaceMail(settings);
        // A receipt already queued at payment time remains due even if its template is later disabled.
        if (row.kind.startsWith('WORKSPACE_') && row.kind !== 'WORKSPACE_ORDER_CONFIRMATION') allowed = allowed && Boolean(mail.templates[row.kind.slice(10)]?.enabled);
        if (row.kind.startsWith('STAFF_')) allowed = allowed && mail.staff.enabled && mail.staff.recipients.some(recipient => recipient.email === row.email && recipient.events.includes(row.kind.slice(6)));
        if (!allowed) { await this.prisma.storeEmailDelivery.update({ where: { id: row.id }, data: { status: 'CANCELED' } }); continue; }
        const unsubscribe = ['CAMPAIGN','WELCOME','RECOVERY','REVIEW_REQUEST'].includes(row.kind) && subscriber ? `\n\nDejar de recibir correos de esta tienda:\n${this.link(row.store.slug, 'unsubscribe', subscriber.unsubscribeToken)}` : '';
        const configured = ['RECOVERY','REVIEW_REQUEST'].includes(row.kind) ? mail.templates[row.kind] : undefined;
        const subject = configured ? renderEmailText(configured.subject, {store:row.store.name}) : row.subject;
        const body = configured ? renderEmailText(configured.body, {store:row.store.name}) + '\n\n' + row.body : row.body;
        await this.email.send({ from: workspaceSender(settings), to: row.email, subject, body: body + unsubscribe, replyTo: row.store.contactEmail || undefined, failLoudly: true, idempotencyKey: `retention/${row.id}` });
        await this.prisma.$transaction(async tx => {
          await tx.storeEmailDelivery.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
          if (row.kind === 'RECOVERY') await tx.storeSavedCart.update({ where: { id: row.sourceId! }, data: { sentAt: new Date() } });
        });
      } catch (error) {
        await this.prisma.storeEmailDelivery.update({ where: { id: row.id }, data: { status: row.attempts >= 3 ? 'FAILED' : 'PENDING', lastError: safeDeliveryError(error), dueAt: new Date(Date.now() + 60000 * 2 ** row.attempts) } });
      }
    }
  }
}
