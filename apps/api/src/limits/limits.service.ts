import { Injectable, Logger } from "@nestjs/common";
import { LimitReservationStatus, PaymentIntentStatus, Prisma, SupportCaseCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import { limitExceeded, perPaymentLimitExceeded } from "./limit-errors";

/** Any client effectiveLimits/amountInBob can read through: the pooled
 * PrismaService, or the Prisma.TransactionClient of a transaction already in
 * progress (reserve/assertPerPayment often run inside one and must not open
 * a second pooled connection while it's held). */
export type LimitsDb = PrismaService | Prisma.TransactionClient;

export type EffectiveLimits = { level: number; levelName: string; liveEnabled: boolean; monthlyLimit: number | null; perPaymentLimit: number | null; misconfigured: boolean };
export type ReservableIntent = { id: string; merchantId: string; amount: number; currency: string; metadata: unknown; livemode: boolean; limitStatus: LimitReservationStatus | null };
export type LimitUsage = EffectiveLimits & { month: string; used: number; resetsAt: string };

const LA_PAZ = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit" });

/** How long a RESERVED live intent may sit in PROCESSING/REQUIRES_ACTION with
 * no callback before releaseStale() gives its limit room back. */
export const STALE_RESERVATION_MS = 24 * 60 * 60_000;

/** Month key the limit counts in: the calendar month in La Paz (UTC-4, no DST). */
export function laPazMonth(at: Date): string {
  const parts = Object.fromEntries(LA_PAZ.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${next}-01T04:00:00.000Z`;
}

/**
 * ASFI afiliación: how much each merchant may collect live, by verification
 * level. Reservation happens inside the confirm transaction before any rail
 * call, with one conditional UPDATE so concurrent confirms can't overshoot.
 */
@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async effectiveLimits(merchantId: string, db: LimitsDb = this.prisma): Promise<EffectiveLimits> {
    const merchant = await db.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { id: true, level: true, monthlyLimitOverride: true, perPaymentLimitOverride: true },
    });
    const policy = await db.merchantLevelPolicy.findUnique({ where: { level: merchant.level } });
    const monthlyLimit = merchant.monthlyLimitOverride ?? policy?.monthlyLimit ?? null;
    const perPaymentLimit = merchant.perPaymentLimitOverride ?? policy?.perPaymentLimit ?? null;
    const misconfigured = !policy || (policy.liveEnabled && (monthlyLimit === null || perPaymentLimit === null));
    if (misconfigured) {
      this.logger.error(`Merchant ${merchantId} has no usable limits at level ${merchant.level}; live payments refused`);
      // Always through the pooled client, never the caller's tx: this case
      // must survive if that transaction rolls back.
      await openOpsCaseOnce(this.prisma, {
        merchantId,
        dedupeKey: `limits-misconfigured:${merchantId}`,
        summary: `Límites sin configurar para el nivel ${merchant.level} (limits-misconfigured:${merchantId}). Los cobros en vivo están bloqueados hasta que ops defina montos.`,
        category: SupportCaseCategory.PAYMENTS,
      });
    }
    return {
      level: merchant.level,
      levelName: policy?.name ?? `Nivel ${merchant.level}`,
      liveEnabled: Boolean(policy?.liveEnabled) && !misconfigured,
      monthlyLimit,
      perPaymentLimit,
      misconfigured,
    };
  }

  async amountInBob(intent: { amount: number; currency: string; metadata: unknown }, db: LimitsDb = this.prisma): Promise<{ amountBob: number; fxRate: Prisma.Decimal | null }> {
    const fx = (intent.metadata as { fx?: { originalAmount?: number; originalCurrency?: string } } | null)?.fx;
    let amountBob: number;
    let fxRate: Prisma.Decimal | null = null;
    if (fx?.originalCurrency === "BOB" && typeof fx.originalAmount === "number") {
      amountBob = fx.originalAmount;
    } else if (intent.currency === "BOB") {
      amountBob = intent.amount;
    } else if (intent.currency === "USD") {
      const settings = await db.limitSettings.findUnique({ where: { id: "singleton" } });
      if (!settings) throw limitExceeded();
      // Decimal, not float: Math.ceil(amount * Number(rate)) can over-count by
      // one centavo due to binary floating point rounding of the rate.
      amountBob = new Prisma.Decimal(intent.amount).mul(settings.usdToBobRate).ceil().toNumber();
      fxRate = settings.usdToBobRate;
    } else {
      throw limitExceeded();
    }
    // create() now drops a caller-supplied fx, but intents created before that
    // may still carry one; refuse anything that isn't a positive integer centavo
    // count so a negative or fractional value can't shrink the monthly reservation.
    if (!Number.isSafeInteger(amountBob) || amountBob <= 0) throw limitExceeded();
    return { amountBob, fxRate };
  }

  async assertPerPayment(merchantId: string, intent: { amount: number; currency: string; metadata: unknown }, audience: "merchant" | "buyer", db: LimitsDb = this.prisma) {
    const limits = await this.effectiveLimits(merchantId, db);
    if (!limits.liveEnabled) throw audience === "merchant" ? perPaymentLimitExceeded("merchant") : limitExceeded();
    const { amountBob } = await this.amountInBob(intent, db);
    if (amountBob > limits.perPaymentLimit!) throw perPaymentLimitExceeded(audience);
  }

  async reserve(tx: Prisma.TransactionClient, intent: ReservableIntent, now = new Date()): Promise<{ crossedWarning: boolean }> {
    if (!intent.livemode || intent.amount === 0) return { crossedWarning: false };
    if (intent.limitStatus === LimitReservationStatus.RESERVED || intent.limitStatus === LimitReservationStatus.SETTLED) return { crossedWarning: false };
    // Read the merchant/policy/FX-rate rows through the same connection this
    // confirm's transaction already holds, not a second pooled one.
    const limits = await this.effectiveLimits(intent.merchantId, tx);
    if (!limits.liveEnabled) throw limitExceeded();
    const { amountBob, fxRate } = await this.amountInBob(intent, tx);
    if (amountBob > limits.perPaymentLimit!) throw limitExceeded();
    const month = laPazMonth(now);
    const key = { merchantId_month: { merchantId: intent.merchantId, month } };
    // Not prisma upsert: two first-of-month confirms can race to create the row.
    await tx.$executeRaw`INSERT INTO "MerchantMonthlyVolume" ("merchantId", month) VALUES (${intent.merchantId}, ${month}) ON CONFLICT DO NOTHING`;
    const updated = await tx.$executeRaw`
      UPDATE "MerchantMonthlyVolume" SET reserved = reserved + ${amountBob}
      WHERE "merchantId" = ${intent.merchantId} AND month = ${month}
        AND reserved + settled + ${amountBob} <= ${limits.monthlyLimit!}
    `;
    if (updated === 0) throw limitExceeded();
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { limitMonth: month, limitAmountBob: amountBob, limitFxRate: fxRate, limitStatus: LimitReservationStatus.RESERVED },
    });
    const volume = await tx.merchantMonthlyVolume.findUniqueOrThrow({ where: key });
    const crossedWarning = !volume.warnedAt && (volume.reserved + volume.settled) * 10 >= limits.monthlyLimit! * 8;
    if (crossedWarning) await tx.merchantMonthlyVolume.update({ where: key, data: { warnedAt: now } });
    return { crossedWarning };
  }

  settle(tx: Prisma.TransactionClient, paymentIntentId: string) {
    return this.finish(tx, paymentIntentId, LimitReservationStatus.SETTLED);
  }

  release(tx: Prisma.TransactionClient, paymentIntentId: string) {
    return this.finish(tx, paymentIntentId, LimitReservationStatus.RELEASED);
  }

  /**
   * Moves a reservation exactly once: the conditional status flip is the
   * guard. Settling accepts either RESERVED (the ordinary case) or RELEASED
   * — a late success can arrive after releaseStale() already gave the room
   * back for a stale, unpaid QR reservation. In that RELEASED case the
   * volume's `reserved` column was already decremented by the release, so
   * settling only adds to `settled` and never touches `reserved` again
   * (otherwise it would go negative). Releasing a RELEASED/SETTLED intent
   * stays a no-op either way.
   */
  private async finish(tx: Prisma.TransactionClient, paymentIntentId: string, to: LimitReservationStatus) {
    const intent = await tx.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      select: { merchantId: true, limitMonth: true, limitAmountBob: true, limitStatus: true },
    });
    if (!intent || !intent.limitMonth || intent.limitAmountBob === null) return;
    const from = to === LimitReservationStatus.SETTLED && intent.limitStatus === LimitReservationStatus.RELEASED
      ? LimitReservationStatus.RELEASED
      : LimitReservationStatus.RESERVED;
    if (intent.limitStatus !== from) return;
    const flipped = await tx.paymentIntent.updateMany({ where: { id: paymentIntentId, limitStatus: from }, data: { limitStatus: to } });
    if (flipped.count === 0) return;
    const amount = intent.limitAmountBob;
    if (to === LimitReservationStatus.SETTLED && from === LimitReservationStatus.RELEASED) {
      await tx.$executeRaw`UPDATE "MerchantMonthlyVolume" SET settled = settled + ${amount} WHERE "merchantId" = ${intent.merchantId} AND month = ${intent.limitMonth}`;
    } else if (to === LimitReservationStatus.SETTLED) {
      await tx.$executeRaw`UPDATE "MerchantMonthlyVolume" SET reserved = reserved - ${amount}, settled = settled + ${amount} WHERE "merchantId" = ${intent.merchantId} AND month = ${intent.limitMonth}`;
    } else {
      await tx.$executeRaw`UPDATE "MerchantMonthlyVolume" SET reserved = reserved - ${amount} WHERE "merchantId" = ${intent.merchantId} AND month = ${intent.limitMonth}`;
    }
  }

  /**
   * Safety net for the case a live QR/bank-QR intent never gets its
   * requires_action -> succeeded/failed callback (a Baneco QR shown once and
   * never scanned, say): its RESERVED reservation would otherwise hold limit
   * room for the rest of the month. After 24h with no update, give the room
   * back — the payment itself is left exactly as it is (still
   * PROCESSING/REQUIRES_ACTION); a late bank confirmation must never land on
   * a CANCELED intent, so this never touches PaymentIntent.status.
   */
  async releaseStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.paymentIntent.findMany({
      where: {
        livemode: true,
        limitStatus: LimitReservationStatus.RESERVED,
        status: { in: [PaymentIntentStatus.PROCESSING, PaymentIntentStatus.REQUIRES_ACTION] },
        updatedAt: { lt: new Date(now.getTime() - STALE_RESERVATION_MS) },
      },
      select: { id: true },
    });
    for (const intent of stale) {
      await this.prisma.$transaction((tx) => this.release(tx, intent.id));
    }
    return stale.length;
  }

  async usage(merchantId: string, now = new Date()): Promise<LimitUsage> {
    const limits = await this.effectiveLimits(merchantId);
    const month = laPazMonth(now);
    const volume = await this.prisma.merchantMonthlyVolume.findUnique({ where: { merchantId_month: { merchantId, month } } });
    return { ...limits, month, used: (volume?.reserved ?? 0) + (volume?.settled ?? 0), resetsAt: nextMonthStart(month) };
  }
}
