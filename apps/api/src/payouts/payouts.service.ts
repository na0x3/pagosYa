import { Injectable, Logger } from "@nestjs/common";
import { KycStatus, LedgerAccount, LedgerDirection, MerchantStatus, PayoutStatus, SettlementMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { createPayoutsPdf } from "../reports/finance-pdfs";
import { TermsAcceptanceService } from "../legal/terms-acceptance.service";

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly terms: TermsAcceptanceService,
  ) {}

  /**
   * Sum of MERCHANT_PAYABLE ledger entries for this merchant in one currency.
   * Credits from captures, debits from refunds and prior payouts (see
   * LedgerService.buildPayoutJournal), so this is the currently-unpaid balance.
   * Never sum across currencies: a USD cent is not a boliviano cent.
   */
  async getPayableBalance(merchantId: string, currency = "BOB"): Promise<number> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: { merchantId, account: LedgerAccount.MERCHANT_PAYABLE, currency },
      _sum: { amount: true },
    });
    const credit = rows.find((r) => r.direction === LedgerDirection.CREDIT)?._sum.amount ?? 0;
    const debit = rows.find((r) => r.direction === LedgerDirection.DEBIT)?._sum.amount ?? 0;
    return credit - debit;
  }

  async getPayableBalances(merchantId: string): Promise<{ currency: string; payableBalance: number }[]> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["currency", "direction"],
      where: { merchantId, account: LedgerAccount.MERCHANT_PAYABLE },
      _sum: { amount: true },
    });
    const byCurrency = new Map<string, number>();
    for (const row of rows) {
      const signed = (row._sum.amount ?? 0) * (row.direction === LedgerDirection.CREDIT ? 1 : -1);
      byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + signed);
    }
    return [...byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, payableBalance]) => ({ currency, payableBalance }));
  }

  /**
   * Enqueues one PENDING Payout per (merchant, currency) with a positive unpaid
   * balance and no payout of that currency already in flight. USD balances
   * wait until the merchant's approved KYC has a USD bank account.
   */
  async createDuePayouts(): Promise<void> {
    const merchants = await this.prisma.merchant.findMany({
      where: { settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE },
    });

    for (const merchant of merchants) {
      const balances = (await this.getPayableBalances(merchant.id)).filter((b) => b.payableBalance > 0);
      if (!balances.length) continue;
      // Held, not failed: the balance stays in MERCHANT_PAYABLE and goes out on the first run after they accept.
      if (await this.terms.needsMerchantAcceptance(merchant.id)) {
        this.logger.warn(`Payout held: merchant ${merchant.id} has not accepted the terms in force`);
        continue;
      }

      const approvedKyc = await this.prisma.merchantKycSubmission.findFirst({
        where: { merchantId: merchant.id, status: KycStatus.APPROVED },
        orderBy: { createdAt: "desc" },
      });
      if (!approvedKyc) continue; // shouldn't happen for an ACTIVE merchant, but never guess a bank account

      for (const { currency, payableBalance } of balances) {
        const bankAccount =
          currency === "BOB" ? approvedKyc.payoutBankAccount : currency === "USD" ? approvedKyc.payoutUsdBankAccount : null;
        if (!bankAccount) continue;

        const inFlight = await this.prisma.payout.findFirst({
          where: { merchantId: merchant.id, currency, status: PayoutStatus.PENDING },
        });
        if (inFlight) continue;

        await this.prisma.payout.create({
          data: { merchantId: merchant.id, amount: payableBalance, currency, bankAccount, nextRetryAt: new Date() },
        });
      }
    }
  }

  async listForMerchant(merchantId: string, options: { exportPdf?: boolean } = {}) {
    return this.prisma.payout.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      ...(options.exportPdf ? {} : { take: 50 }),
    });
  }

  async exportPayoutsPdf(merchantId: string) {
    const payouts = await this.listForMerchant(merchantId, { exportPdf: true });
    return createPayoutsPdf(
      payouts.map((payout) => ({
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        bankAccount: payout.bankAccount,
        status: payout.status,
        paidOutAt: payout.paidOutAt,
        createdAt: payout.createdAt,
      })),
    );
  }
}
