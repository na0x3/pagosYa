import { Injectable, Logger } from "@nestjs/common";
import { LimitReservationStatus, Prisma, SupportCaseCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import { limitExceeded, perPaymentLimitExceeded } from "./limit-errors";

export type EffectiveLimits = { level: number; levelName: string; liveEnabled: boolean; monthlyLimit: number | null; perPaymentLimit: number | null; misconfigured: boolean };
export type ReservableIntent = { id: string; merchantId: string; amount: number; currency: string; metadata: unknown; livemode: boolean; limitStatus: LimitReservationStatus | null };
export type LimitUsage = EffectiveLimits & { month: string; used: number; resetsAt: string };

const LA_PAZ = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit" });

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

  async effectiveLimits(merchantId: string): Promise<EffectiveLimits> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { id: true, level: true, monthlyLimitOverride: true, perPaymentLimitOverride: true },
    });
    const policy = await this.prisma.merchantLevelPolicy.findUnique({ where: { level: merchant.level } });
    const monthlyLimit = merchant.monthlyLimitOverride ?? policy?.monthlyLimit ?? null;
    const perPaymentLimit = merchant.perPaymentLimitOverride ?? policy?.perPaymentLimit ?? null;
    const misconfigured = !policy || (policy.liveEnabled && (monthlyLimit === null || perPaymentLimit === null));
    if (misconfigured) {
      this.logger.error(`Merchant ${merchantId} has no usable limits at level ${merchant.level}; live payments refused`);
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

  async amountInBob(intent: { amount: number; currency: string; metadata: unknown }): Promise<{ amountBob: number; fxRate: Prisma.Decimal | null }> {
    const fx = (intent.metadata as { fx?: { originalAmount?: number; originalCurrency?: string } } | null)?.fx;
    let amountBob: number;
    let fxRate: Prisma.Decimal | null = null;
    if (fx?.originalCurrency === "BOB" && typeof fx.originalAmount === "number") {
      amountBob = fx.originalAmount;
    } else if (intent.currency === "BOB") {
      amountBob = intent.amount;
    } else if (intent.currency === "USD") {
      const settings = await this.prisma.limitSettings.findUnique({ where: { id: "singleton" } });
      if (!settings) throw limitExceeded();
      // Decimal, not float: Math.ceil(amount * Number(rate)) can over-count by
      // one centavo due to binary floating point rounding of the rate.
      amountBob = new Prisma.Decimal(intent.amount).mul(settings.usdToBobRate).ceil().toNumber();
      fxRate = settings.usdToBobRate;
    } else {
      throw limitExceeded();
    }
    // fx.originalAmount comes from merchant-controlled metadata; refuse
    // anything that isn't a positive integer centavo count so a negative or
    // fractional value can't shrink the monthly reservation while counted.
    if (!Number.isSafeInteger(amountBob) || amountBob <= 0) throw limitExceeded();
    return { amountBob, fxRate };
  }

  async assertPerPayment(merchantId: string, intent: { amount: number; currency: string; metadata: unknown }, audience: "merchant" | "buyer") {
    const limits = await this.effectiveLimits(merchantId);
    if (!limits.liveEnabled) throw audience === "merchant" ? perPaymentLimitExceeded("merchant") : limitExceeded();
    const { amountBob } = await this.amountInBob(intent);
    if (amountBob > limits.perPaymentLimit!) throw perPaymentLimitExceeded(audience);
  }

  async reserve(tx: Prisma.TransactionClient, intent: ReservableIntent, now = new Date()): Promise<{ crossedWarning: boolean }> {
    if (!intent.livemode || intent.amount === 0) return { crossedWarning: false };
    if (intent.limitStatus === LimitReservationStatus.RESERVED || intent.limitStatus === LimitReservationStatus.SETTLED) return { crossedWarning: false };
    const limits = await this.effectiveLimits(intent.merchantId);
    if (!limits.liveEnabled) throw limitExceeded();
    const { amountBob, fxRate } = await this.amountInBob(intent);
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

  /** Moves a reservation exactly once: the conditional status flip is the guard. */
  private async finish(tx: Prisma.TransactionClient, paymentIntentId: string, to: LimitReservationStatus) {
    const intent = await tx.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      select: { merchantId: true, limitMonth: true, limitAmountBob: true, limitStatus: true },
    });
    if (!intent || intent.limitStatus !== LimitReservationStatus.RESERVED || !intent.limitMonth || intent.limitAmountBob === null) return;
    const flipped = await tx.paymentIntent.updateMany({ where: { id: paymentIntentId, limitStatus: LimitReservationStatus.RESERVED }, data: { limitStatus: to } });
    if (flipped.count === 0) return;
    const amount = intent.limitAmountBob;
    if (to === LimitReservationStatus.SETTLED) {
      await tx.$executeRaw`UPDATE "MerchantMonthlyVolume" SET reserved = reserved - ${amount}, settled = settled + ${amount} WHERE "merchantId" = ${intent.merchantId} AND month = ${intent.limitMonth}`;
    } else {
      await tx.$executeRaw`UPDATE "MerchantMonthlyVolume" SET reserved = reserved - ${amount} WHERE "merchantId" = ${intent.merchantId} AND month = ${intent.limitMonth}`;
    }
  }

  async usage(merchantId: string, now = new Date()): Promise<LimitUsage> {
    const limits = await this.effectiveLimits(merchantId);
    const month = laPazMonth(now);
    const volume = await this.prisma.merchantMonthlyVolume.findUnique({ where: { merchantId_month: { merchantId, month } } });
    return { ...limits, month, used: (volume?.reserved ?? 0) + (volume?.settled ?? 0), resetsAt: nextMonthStart(month) };
  }
}
