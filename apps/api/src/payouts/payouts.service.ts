import { Injectable } from "@nestjs/common";
import { KycStatus, LedgerAccount, LedgerDirection, MerchantStatus, PayoutStatus, SettlementMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sum of MERCHANT_PAYABLE ledger entries for this merchant — credits from
   * captures, debits from refunds *and* from prior successful payouts (see
   * LedgerService.buildPayoutJournal). That invariant is what makes this
   * always equal the currently-*unpaid* balance, with no separate bookkeeping.
   */
  async getPayableBalance(merchantId: string): Promise<number> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: { merchantId, account: LedgerAccount.MERCHANT_PAYABLE },
      _sum: { amount: true },
    });
    const credit = rows.find((r) => r.direction === LedgerDirection.CREDIT)?._sum.amount ?? 0;
    const debit = rows.find((r) => r.direction === LedgerDirection.DEBIT)?._sum.amount ?? 0;
    return credit - debit;
  }

  /**
   * Enqueues a PENDING Payout for every AGGREGATOR merchant with a positive
   * unpaid balance and no payout already in flight. A real deployment would
   * run this on a daily cron; PayoutDeliveryWorker calls it on a short
   * interval purely to make the flow demonstrable.
   */
  async createDuePayouts(): Promise<void> {
    const merchants = await this.prisma.merchant.findMany({
      where: { settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE },
    });

    for (const merchant of merchants) {
      const inFlight = await this.prisma.payout.findFirst({
        where: { merchantId: merchant.id, status: PayoutStatus.PENDING },
      });
      if (inFlight) continue;

      const balance = await this.getPayableBalance(merchant.id);
      if (balance <= 0) continue;

      const approvedKyc = await this.prisma.merchantKycSubmission.findFirst({
        where: { merchantId: merchant.id, status: KycStatus.APPROVED },
        orderBy: { createdAt: "desc" },
      });
      if (!approvedKyc) continue; // shouldn't happen for an ACTIVE merchant, but never guess a bank account

      await this.prisma.payout.create({
        data: {
          merchantId: merchant.id,
          amount: balance,
          bankAccount: approvedKyc.payoutBankAccount,
          nextRetryAt: new Date(),
        },
      });
    }
  }

  async listForMerchant(merchantId: string) {
    return this.prisma.payout.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 50 });
  }
}
