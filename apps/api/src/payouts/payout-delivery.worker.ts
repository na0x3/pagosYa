import { Inject, Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PayoutStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PayoutsService } from "./payouts.service";
import { PAYOUT_PROVIDER } from "./tokens";
import { PayoutProvider } from "./interfaces/payout-provider.interface";

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 5_000;

/** Runs the payout batch and delivers due Payout rows. Mirrors WebhookDeliveryWorker/InvoiceEmissionWorker's claim/backoff shape. */
@Injectable()
export class PayoutDeliveryWorker {
  private readonly logger = new Logger(PayoutDeliveryWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
    private readonly ledger: LedgerService,
    @Inject(PAYOUT_PROVIDER) private readonly provider: PayoutProvider,
  ) {}

  @Interval(10_000)
  async tick(): Promise<void> {
    await this.payouts.createDuePayouts();

    const candidates = await this.prisma.payout.findMany({
      where: {
        status: { in: [PayoutStatus.PENDING, PayoutStatus.FAILED] },
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      take: 25,
    });

    for (const payout of candidates) {
      // Optimistic-concurrency claim, same reasoning as the webhook/invoice workers.
      const claim = await this.prisma.payout.updateMany({
        where: { id: payout.id, status: payout.status, attempts: payout.attempts },
        data: { attempts: { increment: 1 } },
      });
      if (claim.count === 0) continue;

      await this.deliverOne({ ...payout, attempts: payout.attempts + 1 });
    }
  }

  private async deliverOne(payout: {
    id: string;
    merchantId: string;
    amount: number;
    currency: string;
    bankAccount: string;
    attempts: number;
  }): Promise<void> {
    try {
      const result = await this.provider.disburse({
        bankAccount: payout.bankAccount,
        amount: payout.amount,
        currency: payout.currency,
        idempotencyKey: `payout_${payout.id}`,
      });

      if (result.status === "succeeded") {
        await this.prisma.$transaction(async (tx) => {
          await tx.payout.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.SUCCEEDED,
              railReference: result.railReference,
              paidOutAt: new Date(),
              nextRetryAt: null,
            },
          });
          const lines = this.ledger.buildPayoutJournal({ merchantId: payout.merchantId, amount: payout.amount });
          await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), lines, payout.currency);
        });
        return;
      }

      await this.scheduleRetry(payout.id, payout.attempts, result.failureReason ?? "unknown_error");
    } catch (error) {
      this.logger.warn(`Payout delivery failed for ${payout.id}: ${(error as Error).message}`);
      await this.scheduleRetry(payout.id, payout.attempts, (error as Error).message);
    }
  }

  private async scheduleRetry(payoutId: string, attempts: number, failureReason: string): Promise<void> {
    const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.FAILED,
        failureReason,
        nextRetryAt: attempts < MAX_ATTEMPTS ? new Date(Date.now() + backoffMs) : null,
      },
    });
  }
}
