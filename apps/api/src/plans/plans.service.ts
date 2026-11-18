import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MerchantPlan, OpsRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { laPazMonthStart } from '../store-assistant/assistant-text';
import { laPazMonth } from '../limits/limits.service';
import { CREDIT_MICRO_USD } from '../storefront-source/source-generation-policy';
import { CREDITS_EXHAUSTED, PLAN_ORDER, PLAN_REQUIRED, PLANS, type PlanDetails } from './plans';

export type CreditSummary = {
  plan: PlanDetails; monthlyCredits: number; extraCredits: number; usedCredits: number; remainingCredits: number;
  /** False on the merchant's own ChatGPT plan (dev): usage is still measured, but nothing is blocked. */
  enforced: boolean; renewsAt: string; month: string;
};
export type PlansAdmin = { id: string; name: string; email: string; role: OpsRole };

const nextMonthStart = (now: Date) => laPazMonthStart(new Date(laPazMonthStart(now).getTime() + 32 * 86_400_000));
const formatDay = (at: Date) => new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', day: 'numeric', month: 'long' }).format(at);

/** Plans 2026-11-07: a merchant's monthly YAPI credits (all its stores together) and whether it may publish.
 *  Spend is what StoreAiUsage already records for every AI call, so nothing new is metered; the shopper assistant is not counted. */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private get unmetered() { return Boolean(this.config.get('app.chatgptPlan')); }

  async planOf(merchantId: string): Promise<PlanDetails> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { plan: true } });
    if (!merchant) throw new NotFoundException('Comercio no encontrado');
    return PLANS[merchant.plan];
  }

  async summary(merchantId: string, now = new Date()): Promise<CreditSummary> {
    const plan = await this.planOf(merchantId);
    const month = laPazMonth(now);
    const [grants, [spent]] = await Promise.all([
      this.prisma.merchantCreditGrant.aggregate({ where: { merchantId, month }, _sum: { credits: true } }),
      this.prisma.$queryRaw<Array<{ micro: unknown }>>`
        SELECT coalesce(sum((u."usage"->>'providerMicroUsd')::numeric), 0) AS micro
        FROM "StoreAiUsage" u JOIN "Store" s ON s."id" = u."storeId"
        WHERE s."merchantId" = ${merchantId} AND u."createdAt" >= ${laPazMonthStart(now)} AND u."stage" <> 'assistant'`,
    ]);
    const extraCredits = grants._sum.credits ?? 0;
    const usedCredits = Math.ceil(Number(String(spent?.micro ?? 0)) / CREDIT_MICRO_USD);
    return { plan, monthlyCredits: plan.monthlyCredits, extraCredits, usedCredits, month, enforced: !this.unmetered,
      remainingCredits: Math.max(0, plan.monthlyCredits + extraCredits - usedCredits), renewsAt: nextMonthStart(now).toISOString() };
  }

  /** Before YAPI spends for a store: refuses when the merchant's month is used up. Returns the credits left (Infinity unmetered).
   *  With `merchantId` (a request from the merchant) another merchant's store reads as not found, never as its plan. */
  async assertCredits(storeId: string, merchantId?: string, now = new Date()): Promise<number> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, ...(merchantId ? { merchantId } : {}) }, select: { merchantId: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const summary = await this.summary(store.merchantId, now);
    if (!summary.enforced) return Infinity;
    if (summary.remainingCredits <= 0) {
      throw new HttpException({ statusCode: HttpStatus.PAYMENT_REQUIRED, code: CREDITS_EXHAUSTED, message:
        `Usaste los ${summary.monthlyCredits + summary.extraCredits} créditos de YAPI de este mes (plan ${summary.plan.name}). Se renuevan el ${formatDay(new Date(summary.renewsAt))}. Tu tienda sigue funcionando; para seguir editando ahora, cambia de plan.` },
        HttpStatus.PAYMENT_REQUIRED);
    }
    return summary.remainingCredits;
  }

  /** Before a store goes public: the Gratis plan builds and previews, but does not publish. */
  async assertCanPublish(merchantId: string) {
    const plan = await this.planOf(merchantId);
    if (plan.canPublish) return;
    throw new HttpException({ statusCode: HttpStatus.PAYMENT_REQUIRED, code: PLAN_REQUIRED, message:
      `Tu plan ${plan.name} no incluye publicar la tienda. Elige un plan para publicarla y empezar a vender.` }, HttpStatus.PAYMENT_REQUIRED);
  }

  /** Connecting or buying a domain is part of publishing: paid plans only. */
  async assertCustomDomain(merchantId: string) {
    const plan = await this.planOf(merchantId);
    if (plan.customDomain) return;
    throw new HttpException({ statusCode: HttpStatus.PAYMENT_REQUIRED, code: PLAN_REQUIRED, message:
      `Tu plan ${plan.name} no incluye un dominio propio. Elige un plan para conectar o comprar tu dominio.` }, HttpStatus.PAYMENT_REQUIRED);
  }

  /** Store emails the merchant may still send this month (every sent kind counts toward the plan's emails). */
  async emailsLeft(storeId: string, now = new Date()): Promise<{ plan: PlanDetails; sent: number; left: number }> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { merchantId: true, merchant: { select: { plan: true } } } });
    if (!store) return { plan: PLANS.FREE, sent: 0, left: 0 };
    const plan = PLANS[store.merchant.plan];
    const sent = await this.prisma.storeEmailDelivery.count({ where: { status: 'SENT', sentAt: { gte: laPazMonthStart(now) }, store: { merchantId: store.merchantId } } });
    return { plan, sent, left: Math.max(0, plan.emailsPerMonth - sent) };
  }

  /** The shopper assistant's monthly conversations for a store: the plan's, or more if ops raised that store. */
  async assistantCap(storeId: string, storeCap: number): Promise<number> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { merchant: { select: { plan: true } } } });
    return Math.max(storeCap, store ? PLANS[store.merchant.plan].assistantConversations : 0);
  }

  plans() { return PLAN_ORDER.map(id => PLANS[id]); }

  private assertAdmin(actor: PlansAdmin) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException('Solo un administrador puede cambiar planes o créditos');
  }

  private audit(tx: Prisma.TransactionClient, actor: PlansAdmin, action: string, merchantId: string, before: unknown, after: unknown) {
    return tx.auditLogEntry.create({ data: { actorType: 'OPS_USER', actorId: actor.id, actorLabel: `${actor.name} <${actor.email}>`, action,
      targetType: 'merchant', targetId: merchantId, metadata: { before, after } as Prisma.InputJsonValue } });
  }

  async setPlan(merchantId: string, plan: MerchantPlan, actor: PlansAdmin) {
    this.assertAdmin(actor);
    if (!PLANS[plan]) throw new BadRequestException('Plan desconocido');
    return this.prisma.$transaction(async tx => {
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select: { plan: true } });
      if (!before) throw new NotFoundException('Comercio no encontrado');
      const after = await tx.merchant.update({ where: { id: merchantId }, data: { plan }, select: { id: true, plan: true } });
      await this.audit(tx, actor, 'merchant.plan.update', merchantId, before, { plan });
      return after;
    });
  }

  async grantCredits(merchantId: string, credits: number, reason: string, actor: PlansAdmin, now = new Date()) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async tx => {
      if (!await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true } })) throw new NotFoundException('Comercio no encontrado');
      const grant = await tx.merchantCreditGrant.create({ data: { merchantId, month: laPazMonth(now), credits, reason, actorLabel: `${actor.name} <${actor.email}>` } });
      await this.audit(tx, actor, 'merchant.credits.grant', merchantId, null, { credits, reason, month: grant.month });
      return grant;
    });
  }
}
