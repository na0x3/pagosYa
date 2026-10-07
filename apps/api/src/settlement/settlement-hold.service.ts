import { Injectable, Logger } from "@nestjs/common";
import { LedgerAccount, LedgerDirection, Prisma, SettlementHoldStatus, SettlementMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JournalLine, LedgerService } from "../ledger/ledger.service";
import { SettlementPolicyService } from "./settlement-policy.service";
import { laPazDayStart } from "./settlement-dates";
import { planRefundDrawdown } from "./settlement-drawdown";
import { accountBalance } from "./settlement-balances";
import { lockMerchantSettlement } from "./settlement-lock";
import { inFlightPayoutWhere } from "../payouts/payout-in-flight";

const { CREDIT, DEBIT } = LedgerDirection;
const { PENDING, RESERVE_HELD, CLOSED } = SettlementHoldStatus;

@Injectable()
export class SettlementHoldService {
  private readonly logger = new Logger(SettlementHoldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly policies: SettlementPolicyService,
  ) {}

  /** Inside the capture transaction: an AGGREGATOR capture credits MERCHANT_PENDING, and this row says when it becomes payable. */
  async recordCapture(
    tx: Prisma.TransactionClient,
    params: { merchantId: string; paymentIntentId: string; transactionId: string; currency: string; lines: JournalLine[]; capturedAt?: Date },
  ): Promise<void> {
    const netAmount = params.lines
      .filter((l) => l.account === LedgerAccount.MERCHANT_PENDING && l.direction === CREDIT)
      .reduce((sum, l) => sum + l.amount, 0);
    if (netAmount <= 0) return; // FACILITATOR capture: the money never sits with pagosYa

    const capturedAt = params.capturedAt ?? new Date();
    const policy = await this.policies.resolve(tx, params.merchantId);
    const availableAt = laPazDayStart(capturedAt, policy.delayDays);
    const reserveReleaseAt = new Date(Math.max(availableAt.getTime(), laPazDayStart(capturedAt, policy.reserveDays).getTime()));
    await tx.settlementHold.create({
      data: {
        merchantId: params.merchantId,
        paymentIntentId: params.paymentIntentId,
        transactionId: params.transactionId,
        currency: params.currency,
        netAmount,
        pendingAmount: netAmount,
        reserveAmount: Math.floor((netAmount * policy.reserveBps) / 10_000),
        availableAt,
        reserveReleaseAt,
        delayDays: policy.delayDays,
        reserveBps: policy.reserveBps,
        reserveDays: policy.reserveDays,
      },
    });
  }

  /** Moves every due hold one stage. Each hold commits on its own, so one bad row never blocks the rest. Returns how many moved. */
  async releaseDue(now = new Date()): Promise<number> {
    const select = { id: true, merchantId: true } as const;
    const tally = { moved: 0, failed: 0 };
    const release = async (hold: { id: string; merchantId: string }) => {
      const result = await this.releaseOne(hold, now);
      if (result === "moved") tally.moved += 1;
      if (result === "failed") tally.failed += 1;
    };
    const duePending = await this.prisma.settlementHold.findMany({ where: { status: PENDING, availableAt: { lte: now } }, orderBy: { availableAt: "asc" }, select });
    for (const hold of duePending) await release(hold);
    // Second pass after the first, so a hold whose reserve date equals its available date leaves in the same run.
    const dueReserve = await this.prisma.settlementHold.findMany({ where: { status: RESERVE_HELD, reserveReleaseAt: { lte: now } }, orderBy: { reserveReleaseAt: "asc" }, select });
    for (const hold of dueReserve) await release(hold);
    if (tally.failed > 0) this.logger.error(`Settlement release: ${tally.moved} hold stage(s) moved, ${tally.failed} failed`);
    return tally.moved;
  }

  private async releaseOne(ref: { id: string; merchantId: string }, now: Date): Promise<"moved" | "skipped" | "failed"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockMerchantSettlement(tx, ref.merchantId);
        const hold = await tx.settlementHold.findUniqueOrThrow({ where: { id: ref.id } });
        const line = (account: LedgerAccount, direction: LedgerDirection, amount: number): JournalLine => ({ account, direction, amount, merchantId: hold.merchantId, transactionId: hold.transactionId });

        if (hold.status === PENDING && hold.availableAt <= now) {
          const reserve = Math.min(hold.reserveAmount, hold.pendingAmount);
          const toAvailable = hold.pendingAmount - reserve;
          if (hold.pendingAmount > 0) {
            await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), [
              line(LedgerAccount.MERCHANT_PENDING, DEBIT, hold.pendingAmount),
              ...(toAvailable > 0 ? [line(LedgerAccount.MERCHANT_PAYABLE, CREDIT, toAvailable)] : []),
              ...(reserve > 0 ? [line(LedgerAccount.RESERVE, CREDIT, reserve)] : []),
            ], hold.currency);
          }
          await tx.settlementHold.update({ where: { id: hold.id }, data: { pendingAmount: 0, reserveAmount: reserve, status: reserve > 0 ? RESERVE_HELD : CLOSED } });
          return "moved" as const;
        }

        if (hold.status === RESERVE_HELD && hold.reserveReleaseAt <= now) {
          if (hold.reserveAmount > 0) {
            await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), [
              line(LedgerAccount.RESERVE, DEBIT, hold.reserveAmount),
              line(LedgerAccount.MERCHANT_PAYABLE, CREDIT, hold.reserveAmount),
            ], hold.currency);
          }
          await tx.settlementHold.update({ where: { id: hold.id }, data: { reserveAmount: 0, status: CLOSED } });
          return "moved" as const;
        }

        return "skipped" as const; // already moved by another run, a refund or a seizure
      });
    } catch (error) {
      this.logger.error(`Settlement hold ${ref.id} (merchant ${ref.merchantId}) could not be released: ${(error as Error).message}`, (error as Error).stack);
      return "failed";
    }
  }

  /**
   * Swaps a refund journal's single MERCHANT_PAYABLE debit for the drawdown
   * (available → pending → reserve → negative available). FACILITATOR
   * refunds pass through untouched.
   */
  async applyRefundDrawdown(
    tx: Prisma.TransactionClient,
    params: { merchantId: string; paymentIntentId: string; currency: string; settlementMode: SettlementMode; lines: JournalLine[] },
  ): Promise<JournalLine[]> {
    if (params.settlementMode !== SettlementMode.AGGREGATOR) return params.lines;
    const isPayableDebit = (l: JournalLine) => l.account === LedgerAccount.MERCHANT_PAYABLE && l.direction === DEBIT;
    const payableDebits = params.lines.filter(isPayableDebit);
    const net = payableDebits.reduce((sum, l) => sum + l.amount, 0);
    if (net <= 0) return params.lines;

    await lockMerchantSettlement(tx, params.merchantId);
    // Payouts already created but not yet delivered are still in MERCHANT_PAYABLE yet promised to the bank: treat
    // them as spent, so the refund takes from pending and reserve before driving available below what they'll debit.
    // Read after the lock, which createDuePayouts also takes around its check-and-create.
    const payable = await accountBalance(tx, params.merchantId, LedgerAccount.MERCHANT_PAYABLE, params.currency);
    const inFlight = await tx.payout.aggregate({ where: inFlightPayoutWhere(params.merchantId, params.currency), _sum: { amount: true } });
    const available = payable - (inFlight._sum.amount ?? 0);
    const holds = await tx.settlementHold.findMany({
      where: { merchantId: params.merchantId, currency: params.currency, status: { in: [PENDING, RESERVE_HELD] } },
      select: { id: true, paymentIntentId: true, status: true, pendingAmount: true, reserveAmount: true, createdAt: true },
    });
    const plan = planRefundDrawdown({ net, available, paymentIntentId: params.paymentIntentId, holds });
    for (const update of plan.holdUpdates) {
      await tx.settlementHold.update({ where: { id: update.id }, data: { pendingAmount: update.pendingAmount, reserveAmount: update.reserveAmount, status: update.status } });
    }
    const fromPayable = plan.debits.find((d) => d.account === LedgerAccount.MERCHANT_PAYABLE)?.amount ?? 0;
    if (fromPayable > Math.max(available, 0)) {
      this.logger.warn(`Refund on ${params.paymentIntentId} drives merchant ${params.merchantId} available ${params.currency} balance (net of in-flight payouts) negative by ${fromPayable - Math.max(available, 0)}`);
    }
    const transactionId = payableDebits[0].transactionId;
    return [
      ...params.lines.filter((l) => !isPayableDebit(l)),
      ...plan.debits.map((d) => ({ account: d.account, direction: DEBIT, amount: d.amount, merchantId: params.merchantId, transactionId })),
    ];
  }
}
