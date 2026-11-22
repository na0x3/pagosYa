import { createHmac } from 'node:crypto';
import { PlansService } from '../plans/plans.service';
import { workspaceMail, workspaceSender, renderEmailText } from '../email-workspace/email-workspace.config';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
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
import { DEFAULT_RETENTION, RetentionSettings, RetentionSettingsDto, RetentionCartDto, RetentionCampaignDto, RetentionSubscribeDto, type PopupEventDto } from './retention.dto';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { comebackCode, qualifyingDays, unusedDays } from './retention-policy';
import { reminderCart } from './reminder-cart';
import { pickPopupLook, readPopupLook, type PopupLookSettings } from '../store-popups/popup-looks';
import { readGame, type PopupGameSettings, readShape, readInterests, readContact, whatsappDigits } from '../store-popups/popup-games';
import { PopupGameService } from '../store-popups/popup-game.service';
import { popupWordsFor } from '../storefront-source/source-ab';
// Plans 2026-11-07: the kinds that stop at the plan's monthly emails; everything else (receipts, notices, replies) always goes out.
const PROMOTIONAL_KINDS = new Set(['CAMPAIGN', 'WELCOME', 'RECOVERY', 'REVIEW_REQUEST', 'CARD']);
const token = () => randomBytes(32).toString('hex');
const normalized = (email: string) => email.trim().toLowerCase();
const REVIEW_REQUEST_DELAY_MS = 24 * 60 * 60 * 1000;
const safeDeliveryError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'El proveedor rechazó el envío.';
  return message.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[correo oculto]').slice(0, 500);
};
type Db = Prisma.TransactionClient;
/** What a store page may know about its signup and popup: the timing, whether a code exists (never the code), and the popup look
 *  (spec 2026-11-09: the saved one, else a stable pick from the slug, so every store has one) with its chosen photo. */
export function publicRetentionSettings(s: RetentionSettings & PopupLookSettings & PopupGameSettings, slug?: string) {
  const look = readPopupLook(s.popupLook) ?? (slug ? pickPopupLook(slug) : null);
  return { comebackEnabled: s.comebackEnabled, visitsRequired: s.visitsRequired, rewardLabel: s.rewardLabel, signupEnabled: s.signupEnabled, signupTitle: s.signupTitle, signupBody: s.signupBody, signupButton: s.signupButton, recoveryEnabled: s.recoveryEnabled, popupTrigger: s.popupTrigger, popupDelaySeconds: s.popupDelaySeconds, popupHasCode: Boolean(s.popupPromoCodeId),
    ...(look ? { popupLook: look } : {}), ...(s.popupPhoto ? { popupPhoto: s.popupPhoto } : {}),
    // Spec 2026-11-09 popup games: the game, its prize labels and the question — never the codes.
    ...(readGame(s.popupGame) && (s.popupGamePrizes?.length ?? 0) >= 2 ? { popupGame: s.popupGame, popupGameSlices: s.popupGamePrizes!.map(p => p.label), ...(s.popupQuestion ? { popupQuestion: s.popupQuestion } : {}),
      // Spec 2026-11-10 rasca y elige: the card's shape, the interests, the favourite question and the contact asked for.
      popupShape: readShape(s.popupShape), popupInterests: readInterests(s), popupFavourite: s.popupFavourite && typeof s.popupFavourite.text === 'string' ? { text: s.popupFavourite.text } : null,
      popupContact: readContact(s.popupContact) } : {}) };
}
/** Spec 2026-11-10 rasca y elige: a favourite as the merchant reads it — the product, a flavour as «Producto · Sabor»; null when gone. */
export function favouriteName(favourite: string | null | undefined, products: ReadonlyArray<{ id: string; name: string }>): string | null {
  if (!favourite) return null;
  const at = favourite.indexOf(':'), id = at < 0 ? favourite : favourite.slice(0, at), value = at < 0 ? '' : favourite.slice(at + 1);
  const product = products.find(entry => entry.id === id);
  return product ? (value ? `${product.name} · ${value}` : product.name) : null;
}
/** The five most chosen favourites, by name. */
export function favouriteTally(favourites: ReadonlyArray<string | null | undefined>, products: ReadonlyArray<{ id: string; name: string }>) {
  const counts = new Map<string, number>();
  for (const favourite of favourites) { const name = favouriteName(favourite, products); if (name) counts.set(name, (counts.get(name) ?? 0) + 1); }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
}
/** 59171234567 → +591 7123 4567. */
export const whatsappShown = (digits: string) => /^591\d{8}$/.test(digits) ? `+591 ${digits.slice(3, 7)} ${digits.slice(7)}` : /^591\d{7}$/.test(digits) ? `+591 ${digits.slice(3, 6)} ${digits.slice(6)}` : digits;
/** Settings Ajustes may not send but must keep: the email workspace, dismissed suggestions and the popup look. */
// Popups 2.0 (final review I2): the YAPI popup's pointer and settings are the Popups page's, never the settings form's.
export const KEPT_SETTINGS = ['popupDesignId', 'popupDesignOff', 'popupDesignPercent', 'popupDesignCapture', 'popupMoments', 'emailWorkspace', 'suggestionsDismissedAt', 'popupLook', 'popupLookPrevious', 'popupPhoto', 'popupGame', 'popupGamePrizes', 'popupQuestion', 'popupShape', 'popupInterests', 'popupFavourite', 'popupContact'] as const;
@Injectable()
export class RetentionService {
  private working = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider, @Optional() private readonly plans?: PlansService, @Optional() private readonly games?: PopupGameService, @Optional() private readonly promoCodes?: PromoCodesService) {}
  async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException('Tienda no encontrada.'); return store;
  }
  async settings(storeId: string, db: Db = this.prisma) {
    const row = await db.storeRetention.findUnique({ where: { storeId } });
    return { ...DEFAULT_RETENTION, ...(row?.settings as object || {}), revision: row?.revision || 0, startedAt: row?.startedAt || new Date() };
  }
  /** Spec 2026-11-09 A/B tests: the settings a shopper sees — B's look, words and code for a B visitor of this store's running popup
   *  test (a visit at most 30 days old); everyone else, and every A visitor, the store's own. */
  async settingsFor(storeId: string, visitToken?: string) {
    const settings = await this.settings(storeId);
    const visit = visitToken ? await this.prisma.storeSourceVisit.findFirst({ where: { token: visitToken, createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, experiment: { storeId, status: 'RUNNING', kind: 'popup' } },
      select: { id: true, variant: true, experiment: { select: { variantSettings: true, variantPromoCodeId: true } } } }).catch(() => null) : null;
    if (!visit || visit.variant !== 'B') return { settings, visitId: visit?.id };
    const b = (visit.experiment.variantSettings ?? {}) as { discount?: number; percentA?: number; look?: string };
    return { visitId: visit.id, settings: { ...settings, ...popupWordsFor(settings as unknown as Record<string, unknown>, b), ...(b.look ? { popupLook: b.look } : {}),
      ...(visit.experiment.variantPromoCodeId ? { popupPromoCodeId: visit.experiment.variantPromoCodeId } : {}) } };
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
    // Spec 2026-11-10 rasca y elige: the WhatsApp list and the favourites chosen in the popup (both lists).
    const [whatsapp, whatsappCount, chosenByEmail] = await Promise.all([
      this.prisma.storeWhatsappSubscriber.findMany({ where: { storeId, isActive: true }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, phone: true, interests: true, favourite: true, createdAt: true } }),
      this.prisma.storeWhatsappSubscriber.count({ where: { storeId, isActive: true } }),
      this.prisma.storeNewsletterSubscriber.findMany({ where: { storeId, isActive: true, favourite: { not: null } }, select: { favourite: true }, take: 2000 }),
    ]);
    // Deferred minor fixed 2026-11-10: only the products someone chose, to name them (the whole catalogue loaded on every open).
    const chosenIds = [...new Set([...whatsapp.map(row => row.favourite), ...chosenByEmail.map(row => row.favourite)].filter((id): id is string => Boolean(id)))];
    const products = chosenIds.length ? await this.prisma.paymentLink.findMany({ where: { storeId, id: { in: chosenIds } }, select: { id: true, name: true } }) : [];
    const whatsappSubscribers = whatsapp.map(row => ({ id: row.id, phone: whatsappShown(row.phone), interests: row.interests, favourite: favouriteName(row.favourite, products), createdAt: row.createdAt }));
    const favourites = favouriteTally([...whatsapp.map(row => row.favourite), ...chosenByEmail.map(row => row.favourite)], products);
    return { settings, subscribers, subscriberCount, whatsappSubscribers, whatsappCount, favourites, cards, carts, campaigns, deliveries, failedDeliveries, emailConfigured: Boolean(this.config.get('app.email.resendApiKey')) };
  }
  /** A number the merchant takes off the WhatsApp list (the customer asked to stop); it stays stored, inactive. */
  async removeWhatsapp(merchantId: string, storeId: string, id: string) {
    await this.owner(merchantId, storeId);
    const { count } = await this.prisma.storeWhatsappSubscriber.updateMany({ where: { id, storeId }, data: { isActive: false } });
    return { removed: count };
  }
  async save(merchantId: string, storeId: string, dto: RetentionSettingsDto) {
    await this.owner(merchantId, storeId);
    try { new Intl.DateTimeFormat('en', { timeZone: dto.timezone }); } catch { throw new BadRequestException('Zona horaria inválida.'); }
    for (const field of ['rewardLabel', 'signupTitle', 'signupButton', 'welcomeSubject', 'welcomeBody'] as const) if (!dto[field].trim()) throw new BadRequestException('Completa los textos de la configuración.');
    if (dto.popupPromoCodeId && !(await this.prisma.promoCode.findFirst({ where: { id: dto.popupPromoCodeId, storeId, isActive: true } }))) throw new BadRequestException('Elige un código activo de esta tienda.');
    // The DTO class declares every optional field, so one the form did not send is an own key holding undefined: dropped here, or it
    // would erase a kept value (review 2026-11-09: a save without popupLook wiped the merchant's chosen look).
    const { revision, ...sent } = dto;
    const settings = Object.fromEntries(Object.entries(sent).filter(([, value]) => value !== undefined)) as Omit<RetentionSettingsDto, 'revision'>;
    try {
      return await this.prisma.$transaction(async tx => {
        const prior = await this.settings(storeId, tx);
        if (prior.revision && prior.timezone !== dto.timezone) throw new BadRequestException('La zona horaria de las compras queda fijada al crear el programa.');
        if (!revision) return tx.storeRetention.create({ data: { storeId, settings } });
        const kept = Object.fromEntries(KEPT_SETTINGS.filter(key => (prior as Record<string, unknown>)[key] !== undefined).map(key => [key, (prior as Record<string, unknown>)[key]]));
        // A value Ajustes sends wins over a kept one; a changed look keeps the old one for «vuelve a la ventana anterior».
        const priorLook = (prior as PopupLookSettings).popupLook;
        const changedLook = Boolean(settings.popupLook && priorLook && settings.popupLook !== priorLook);
        const result = await tx.storeRetention.updateMany({ where: { storeId, revision }, data: { settings: { ...kept, ...settings, ...(changedLook ? { popupLookPrevious: priorLook } : {}) } as Prisma.InputJsonValue, revision: { increment: 1 } } });
        if (!result.count) throw new ConflictException('La configuración cambió. Vuelve a abrir esta sección.');
        return { saved: true };
      });
    } catch (e: any) { if (e.code === 'P2002') throw new ConflictException('La configuración cambió. Vuelve a abrir esta sección.'); throw e; }
  }
  private async enqueue(db: Db, data: Prisma.StoreEmailDeliveryUncheckedCreateInput) {
    return db.storeEmailDelivery.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: {} });
  }
  /** «No, gracias» on YAPI's suggestion cards: they are not offered again for this store (spec 2026-10-19 §2). */
  async dismissSuggestions(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId);
    const row = await this.prisma.storeRetention.findUnique({ where: { storeId } });
    const settings = (row?.settings ?? {}) as Record<string, unknown>;
    if (settings.suggestionsDismissedAt) return { dismissed: true };
    const next = { ...DEFAULT_RETENTION, ...settings, suggestionsDismissedAt: new Date().toISOString() };
    await this.prisma.storeRetention.upsert({ where: { storeId }, create: { storeId, settings: next }, update: { settings: next } });
    return { dismissed: true };
  }
  async signupVisual(storeId: string) {
    const [store, products, categories] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, include: { brandProfile: true } }),
      this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { imageUrls: true }, orderBy: { createdAt: 'asc' }, take: 20 }),
      this.prisma.category.findMany({ where: { storeId }, select: { name: true }, orderBy: { sortOrder: 'asc' }, take: 8 }),
    ]);
    return { brand: comebackBrand(store), imageUrl: products.flatMap(p => p.imageUrls).find(url => !/\.(mp4|webm|mov)(\?|$)/i.test(url)) || store.bannerUrl || null, interests: categories.map(c => c.name) };
  }
  /** «Ver ventana de suscripción» in the Studio: what the store page would get, for this merchant's store, published or not. */
  async popupPreview(merchantId: string, storeId: string) {
    const store = await this.owner(merchantId, storeId);
    const settings = await this.settings(storeId);
    const popupDesign = await this.liveDesign(storeId, settings as { popupDesignId?: unknown });
    return { slug: store.slug, storeName: store.name, settings: { ...publicRetentionSettings(settings, store.slug), signupEnabled: true, signupVisual: await this.signupVisual(storeId), ...(popupDesign ? { popupDesign } : {}) } };
  }
  async subscribe(store: { id: string; slug: string; name: string }, rawEmail: string | null, profile: Pick<RetentionSubscribeDto, 'name' | 'phone' | 'interests' | 'source' | 'gameToken' | 'answer' | 'sourceVisitToken' | 'answers' | 'favourite' | 'popupDesignId'> = {}) {
    // Spec 2026-11-09 A/B tests: a B visitor's signup gets B's code; a new row remembers the test visit it came from.
    const { settings, visitId } = await this.settingsFor(store.id, profile.sourceVisitToken);
    if (!settings.signupEnabled) throw new BadRequestException('Las suscripciones están desactivadas.');
    // Popups 2.0 (spec 2026-11-18): a YAPI-written popup has its own path; every older popup keeps the one below.
    if (profile.popupDesignId) return this.subscribeToDesign(store, settings, visitId, rawEmail, profile);
    // Spec 2026-11-10 rasca y elige: the store's own interest answers only, and a favourite that is really one of its products.
    const allowed = new Set((readInterests(settings as PopupGameSettings)?.answers ?? []).map(entry => entry.label));
    const chosen = (profile.answers ?? []).filter(label => allowed.has(label));
    const favourite = await this.realFavourite(store.id, profile.favourite);
    // Review M1: a number goes to the WhatsApp list only when the store's game asks for WhatsApp.
    if (!rawEmail) {
      if (!(readGame((settings as PopupGameSettings).popupGame) && readContact((settings as PopupGameSettings).popupContact) === 'whatsapp')) throw new BadRequestException('Escribe tu correo.');
      return this.subscribeWhatsapp(store, settings, visitId, profile, chosen, favourite);
    }
    const email = normalized(rawEmail);
    // Spec 2026-11-09 popup games: the tap answer joins the interests when it is one of the store's own answers.
    const answer = profile.answer && (settings as PopupGameSettings).popupQuestion?.answers?.includes(profile.answer) ? profile.answer : undefined;
    const tapped = [...(answer ? [answer] : []), ...chosen];
    const interests = tapped.length ? [...(profile.interests ?? []), ...tapped.filter(label => !(profile.interests ?? []).includes(label))] : profile.interests;
    const details = { ...(profile.name !== undefined ? { name: profile.name.trim() || null } : {}), ...(profile.phone !== undefined ? { phone: profile.phone.trim() || null } : {}), ...(interests !== undefined ? { interests } : {}),
      ...(profile.favourite !== undefined ? { favourite } : {}) };
    // A prize goes to an email only once: one already subscribed before this request gets none.
    // Review 2026-11-09: a dead or expired prize subscribes nobody (so playing again still works); only an active subscriber has had a
    // prize (a cart-only email is inactive).
    if (profile.gameToken && this.games && !(await this.games.validPrize(store.id, profile.gameToken))) throw new BadRequestException('Tu premio venció; vuelve a jugar.');
    const existed = profile.gameToken ? Boolean((await this.prisma.storeNewsletterSubscriber.findUnique({ where: { storeId_email: { storeId: store.id, email } }, select: { isActive: true } }))?.isActive) : false;
    if (profile.interests?.length) {
      const allowed = await this.prisma.category.findMany({ where: { storeId: store.id, name: { in: profile.interests } }, select: { name: true } });
      if (profile.interests.some(name => !allowed.some(c => c.name === name))) throw new BadRequestException('Revisa tus intereses; las categorías de la tienda cambiaron.');
    }
    await this.prisma.$transaction(async tx => {
      const subscriber = await tx.storeNewsletterSubscriber.upsert({ where: { storeId_email: { storeId: store.id, email } }, create: { storeId: store.id, email, ...details, ...(visitId ? { sourceVisitId: visitId } : {}) }, update: { isActive: true, ...details } });
      if (settings.welcomeEnabled) await this.enqueue(tx, { storeId: store.id, email, kind: 'WELCOME', sourceId: subscriber.id, dedupeKey: `welcome:${subscriber.id}`, subject: settings.welcomeSubject.replaceAll('{{store}}', () => store.name), body: settings.welcomeBody.replaceAll('{{store}}', () => store.name) });
    });
    // Only a popup signup, only this store's active code: the code never sits in a page or the public settings.
    if (profile.gameToken && this.games) return { subscribed: true, ...(await this.games.claim(store.id, profile.gameToken, existed)) };
    const code = profile.source === 'popup' && settings.popupPromoCodeId ? await this.prisma.promoCode.findFirst({ where: { id: settings.popupPromoCodeId, storeId: store.id, isActive: true } }) : null;
    return { subscribed: true, ...(code ? { code: code.code } : {}) };
  }
  /** Popups 2.0 (spec 2026-11-18 §7): what a store page gets of its LIVE design — never another store's, never a FAILED one. */
  async liveDesign(storeId: string, settings: { popupDesignId?: unknown }) {
    const id = typeof settings.popupDesignId === 'string' ? settings.popupDesignId : null;
    if (!id) return null;
    const row = await this.prisma.storePopupDesign.findFirst({ where: { id, storeId, status: 'LIVE' } });
    return row ? { id: row.id, flow: row.flow, steps: row.steps, css: row.css, launcher: row.launcher, capture: row.capture, percent: row.percent } : null;
  }
  /** What a store page gets of its YAPI popups: the LIVE welcome, and the other LIVE moments that are on — those keep working
   *  when the welcome is switched off (final review I7). */
  async publicPopups(storeId: string, settings: { popupDesignId?: unknown; popupMoments?: unknown }) {
    const popupDesign = await this.liveDesign(storeId, settings);
    const popupMoments = await this.liveMoments(storeId, settings);
    return { ...(popupDesign ? { popupDesign } : {}), ...(Object.keys(popupMoments).length ? { popupMoments } : {}) };
  }
  /** Part 2 (spec 2026-11-21 §4): the store's LIVE rescue / interest / return designs that are switched on. */
  async liveMoments(storeId: string, settings: { popupMoments?: unknown }) {
    const wanted = Object.entries((settings.popupMoments ?? {}) as Record<string, { id?: unknown; off?: unknown }>)
      .filter(([moment, entry]) => ['rescue', 'interest', 'return'].includes(moment) && typeof entry?.id === 'string' && entry.off !== true)
      .map(([moment, entry]) => ({ moment, id: entry.id as string }));
    if (!wanted.length) return {};
    const rows = await this.prisma.storePopupDesign.findMany({ where: { id: { in: wanted.map(w => w.id) }, storeId, status: 'LIVE' } });
    const out: Record<string, unknown> = {};
    for (const { moment, id } of wanted) {
      const row = rows.find(r => r.id === id && r.moment === moment);
      if (row) out[moment] = { id: row.id, moment, flow: row.flow, steps: row.steps, css: row.css, launcher: row.launcher, capture: row.capture, percent: row.percent };
    }
    return out;
  }
  /** What a shopper did with one of this store's popups (sent only with analytics consent). */
  async recordPopupEvent(storeId: string, dto: PopupEventDto) {
    const owned = await this.prisma.storePopupDesign.findFirst({ where: { id: dto.designId, storeId } });
    if (owned) await this.prisma.storePopupEvent.create({ data: { storeId, designId: dto.designId, moment: dto.moment, visitor: dto.visitor, kind: dto.kind, step: dto.step ?? null } });
    return { ok: true as const };
  }
  /** A reminder never shows a code the shopper can't use: only this store's own popup codes, still active and unused. */
  async popupCodeStatus(storeId: string, raw: string) {
    const code = String(raw ?? '').trim().toUpperCase();
    const row = await this.prisma.promoCode.findFirst({ where: { storeId, code } });
    if (!row || !row.popupDesignId) return { active: false };
    try { await this.promoCodes!.resolveActiveForStore(storeId, code); } catch { return { active: false }; }
    return { active: true, percent: row.discountValue };
  }
  /** One personal code per contact and design: the same shopper always gets the same single-use code, and nobody can work out
   *  another shopper's (keyed with the server secret). Tagged with the design for Part 4's sales count.
   *  Part 2 (spec 2026-11-21 §3): one code per shopper and store — a contact that already got a code from any of the store's
   *  popups gets that same code back, never a second discount. */
  private async designCode(storeId: string, design: { id: string; percent: number }, contact: string) {
    const secret = this.config.get<string>('app.orderTrackingSecret') || 'development-only';
    const codeFor = (designId: string) => `POP${Array.from(createHmac('sha256', secret).update(`${designId}:${contact}`).digest().subarray(0, 6), byte => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[byte % 32]).join('')}`;
    const code = codeFor(design.id);
    const designs = await this.prisma.storePopupDesign.findMany({ where: { storeId }, select: { id: true } });
    const candidates = [...new Set([code, ...designs.map(row => codeFor(row.id))])];
    const existing = await this.prisma.promoCode.findFirst({ where: { storeId, code: { in: candidates } }, orderBy: { createdAt: 'asc' } });
    if (existing) return existing.code;
    try {
      await this.prisma.promoCode.create({ data: { storeId, code, discountType: 'PERCENT', discountValue: design.percent, maxUses: 1, isActive: true, showInEmails: false, showInAssistant: false, popupDesignId: design.id } });
    } catch (error) { if ((error as { code?: string }).code !== 'P2002') throw error; }
    return code;
  }
  /** A signup from a YAPI-written popup: the contact the design asks for, its answers and favourite, and the design's code. */
  private async subscribeToDesign(store: { id: string; slug: string; name: string }, settings: RetentionSettings, visitId: string | null | undefined, rawEmail: string | null, profile: Pick<RetentionSubscribeDto, 'phone' | 'answers' | 'favourite' | 'popupDesignId'>) {
    const design = await this.prisma.storePopupDesign.findFirst({ where: { id: profile.popupDesignId!, storeId: store.id, status: 'LIVE' } });
    if (!design) throw new BadRequestException('Este popup ya no está activo; recarga la página.');
    // Only answers this design's quiz offers are kept (a public endpoint: never free text from the shopper's browser).
    const offered = new Set(((design.flow ?? []) as Array<{ kind?: string; questions?: Array<{ answers?: Array<{ text?: string }> }> }>)
      .flatMap(step => step.kind === 'quiz' ? (step.questions ?? []).flatMap(question => (question.answers ?? []).map(answer => String(answer.text ?? '').trim())) : []));
    const interests = (profile.answers ?? []).map(answer => String(answer).trim()).filter(answer => offered.has(answer)).map(answer => answer.slice(0, 60)).slice(0, 6);
    const favourite = await this.realFavourite(store.id, profile.favourite);
    const tag = { popupDesignId: design.id, ...(visitId ? { sourceVisitId: visitId } : {}) };
    if (design.capture === 'whatsapp') {
      if (rawEmail) throw new BadRequestException('Esta tienda pide tu WhatsApp.');
      const phone = whatsappDigits(profile.phone ?? '');
      if (!phone) throw new BadRequestException('Escribe tu WhatsApp con 8 números, como 71234567.');
      await this.prisma.storeWhatsappSubscriber.upsert({ where: { storeId_phone: { storeId: store.id, phone } },
        create: { storeId: store.id, phone, interests, favourite, ...tag },
        update: { isActive: true, ...(interests.length ? { interests } : {}), ...(favourite ? { favourite } : {}) } });
      return { subscribed: true, code: await this.designCode(store.id, design, phone) };
    }
    if (!rawEmail) throw new BadRequestException('Escribe tu correo.');
    const email = normalized(rawEmail);
    await this.prisma.$transaction(async tx => {
      const subscriber = await tx.storeNewsletterSubscriber.upsert({ where: { storeId_email: { storeId: store.id, email } },
        create: { storeId: store.id, email, interests, favourite, ...tag },
        update: { isActive: true, ...(interests.length ? { interests } : {}), ...(favourite ? { favourite } : {}) } });
      if (settings.welcomeEnabled) await this.enqueue(tx, { storeId: store.id, email, kind: 'WELCOME', sourceId: subscriber.id, dedupeKey: `welcome:${subscriber.id}`, subject: settings.welcomeSubject.replaceAll('{{store}}', () => store.name), body: settings.welcomeBody.replaceAll('{{store}}', () => store.name) });
    });
    return { subscribed: true, code: await this.designCode(store.id, design, email) };
  }
  /** Spec 2026-11-10 rasca y elige: «id» of a product of this store, or «id:value» of one of its option values; null otherwise. */
  private async realFavourite(storeId: string, raw: string | undefined): Promise<string | null> {
    if (!raw) return null;
    const at = raw.indexOf(':'), id = at < 0 ? raw : raw.slice(0, at), value = at < 0 ? '' : raw.slice(at + 1);
    const [product] = await this.prisma.paymentLink.findMany({ where: { storeId, id }, select: { id: true, variants: true }, take: 1 });
    if (!product) return null;
    if (!value) return product.id;
    const variants = Array.isArray(product.variants) ? product.variants as Array<{ name?: string; options?: Array<{ value?: string }> }> : [];
    return variants.some(variant => variant?.name === value || (variant?.options ?? []).some(option => option?.value === value)) ? `${product.id}:${value}` : null;
  }
  /** Spec 2026-11-10 rasca y elige: a popup signup by WhatsApp — its own list (pagosYa sends no WhatsApp), one prize per number. */
  private async subscribeWhatsapp(store: { id: string }, settings: RetentionSettings, visitId: string | null | undefined, profile: Pick<RetentionSubscribeDto, 'phone' | 'gameToken' | 'source'>, interests: string[], favourite: string | null) {
    const phone = whatsappDigits(profile.phone ?? '');
    if (!phone) throw new BadRequestException(profile.phone ? 'Escribe tu WhatsApp con 8 números, como 71234567.' : 'Escribe tu correo.');
    if (profile.gameToken && this.games && !(await this.games.validPrize(store.id, profile.gameToken))) throw new BadRequestException('Tu premio venció; vuelve a jugar.');
    const before = await this.prisma.storeWhatsappSubscriber.findUnique({ where: { storeId_phone: { storeId: store.id, phone } }, select: { isActive: true } });
    await this.prisma.storeWhatsappSubscriber.upsert({ where: { storeId_phone: { storeId: store.id, phone } },
      create: { storeId: store.id, phone, interests, favourite, ...(visitId ? { sourceVisitId: visitId } : {}) },
      update: { isActive: true, ...(interests.length ? { interests } : {}), ...(favourite ? { favourite } : {}) } });
    if (profile.gameToken && this.games) return { subscribed: true, ...(await this.games.claim(store.id, profile.gameToken, Boolean(before?.isActive), 'phone')) };
    const code = profile.source === 'popup' && settings.popupPromoCodeId ? await this.prisma.promoCode.findFirst({ where: { id: settings.popupPromoCodeId, storeId: store.id, isActive: true } }) : null;
    return { subscribed: true, ...(code ? { code: code.code } : {}) };
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
      if (existing) return { saved: true, token: (await tx.storeSavedCart.update({ where: { id: existing.id }, data })).token };
      // Explicit cart consent permits one reminder a week, without subscribing to campaigns.
      if (await tx.storeSavedCart.findFirst({ where: { storeId, email, sentAt: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { id: true } })) return { saved: false };
      // Another session's open cart takes the latest items; its token is never disclosed.
      const open = await tx.storeSavedCart.findFirst({ where: { storeId, email, sentAt: null, closedAt: null }, orderBy: { createdAt: 'desc' } });
      if (open) { await tx.storeSavedCart.update({ where: { id: open.id }, data }); return { saved: true }; }
      return { saved: true, token: (await tx.storeSavedCart.create({ data: { storeId, email, token: token(), ...data } })).token };
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
  /** «Avísame» is offered only for a store-page cart of an active store owned by the payment's merchant, with reminders on. */
  async reminderAvailable(intent: { merchantId: string; metadata: unknown }) {
    const cart = reminderCart(intent.metadata);
    if (!cart) return false;
    const store = await this.prisma.store.findFirst({ where: { id: cart.storeId, merchantId: intent.merchantId, status: 'ACTIVE' }, select: { id: true } });
    return Boolean(store && (await this.settings(store.id)).recoveryEnabled);
  }
  /**
   * «Avísame» in the payment form, once the shopper pressed Pagar: remember that payment's cart for one reminder under
   * saveCart's own rules (reminders on, active products, one reminder a week, the subscriber row created inactive) and
   * link it to the payment, so its success closes the cart (cartPaid). A paid payment needs no reminder. Null when
   * nothing applies. The caller runs this outside the payment and never lets it fail the payment.
   */
  async saveCartFromPayment(paymentIntentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId }, select: { merchantId: true, status: true, customerEmail: true, metadata: true } });
    const cart = intent ? reminderCart(intent.metadata) : null;
    if (!intent || !cart || !intent.customerEmail || intent.status === 'SUCCEEDED' || !(await this.reminderAvailable(intent))) return null;
    const result = await this.saveCart(cart.storeId, { email: intent.customerEmail, consent: true, items: cart.items } as RetentionCartDto);
    if (!result.saved) return result;
    // saveCart may have refreshed another session's open cart without naming it: link the open one it just wrote.
    const saved = await this.prisma.storeSavedCart.findFirst({ where: { storeId: cart.storeId, email: normalized(intent.customerEmail), sentAt: null, closedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
    if (saved) await this.prisma.storeSavedCart.update({ where: { id: saved.id }, data: { paymentIntentId } });
    return result;
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
        // Plans 2026-11-07: promotions stop at the plan's emails for the month; receipts, notices and replies always go out.
        if (PROMOTIONAL_KINDS.has(row.kind) && this.plans) {
          const room = await this.plans.emailsLeft(row.storeId);
          if (room.left <= 0) { await this.prisma.storeEmailDelivery.update({ where: { id: row.id }, data: { status: 'CANCELED', lastError: `Plan ${room.plan.name}: llegaste a los ${room.plan.emailsPerMonth} correos del mes.` } }); continue; }
        }
        const unsubscribe = ['CAMPAIGN','WELCOME','RECOVERY','REVIEW_REQUEST'].includes(row.kind) && subscriber ? `\n\nDejar de recibir correos de esta tienda:\n${this.link(row.store.slug, 'unsubscribe', subscriber.unsubscribeToken)}` : '';
        const configured = ['RECOVERY','REVIEW_REQUEST'].includes(row.kind) ? mail.templates[row.kind] : undefined;
        const subject = configured ? renderEmailText(configured.subject, {store:row.store.name}) : row.subject;
        const body = configured ? renderEmailText(configured.body, {store:row.store.name}) + '\n\n' + row.body : row.body;
        // A row that named its own Message-ID is sent with it, wrapped in the
        // angle brackets RFC 5322 requires (the column stores the bare value).
        // Inbox replies rely on this: the shopper's answer comes back with
        // In-Reply-To pointing at it, which is how it lands in its own thread.
        const headers = row.messageIdHeader ? { 'Message-ID': `<${row.messageIdHeader}>` } : undefined;
        await this.email.send({ from: workspaceSender(settings), to: row.email, subject, body: body + unsubscribe, replyTo: row.replyTo || row.store.contactEmail || undefined, headers, failLoudly: true, idempotencyKey: `retention/${row.id}` });
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
