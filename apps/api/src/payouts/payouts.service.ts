import { Injectable, Logger } from "@nestjs/common";
import { KycStatus, LedgerAccount, LedgerDirection, MerchantStatus, Prisma, SettlementMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { createPayoutsPdf } from "../reports/finance-pdfs";
import { TermsAcceptanceService } from "../legal/terms-acceptance.service";
import { lockMerchantSettlement } from "../settlement/settlement-lock";
import { inFlightPayoutWhere } from "./payout-in-flight";

/** Why the daily batch would not pay a (merchant, currency) balance today. A code, never the ops hold reason. */
export type PayoutBlocker = "held" | "terms" | "inactive" | "facilitator" | "kyc" | "no_account" | "in_flight";

type PayoutDb = PrismaService | Prisma.TransactionClient;
type PayoutCheck = { blocker: PayoutBlocker } | { blocker: null; bankAccount: string };

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

  async getPayableBalances(merchantId: string, db: PayoutDb = this.prisma): Promise<{ currency: string; payableBalance: number }[]> {
    const rows = await db.ledgerEntry.groupBy({
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
   * The one eligibility rule, shared by createDuePayouts and the merchant balance endpoint (so nextPayoutAt never
   * promises a payout the batch will skip). Null means the batch would pay this currency's balance today.
   */
  async payoutBlocker(merchantId: string, currency: string): Promise<PayoutBlocker | null> {
    return (await this.checkPayout(merchantId, currency, this.prisma)).blocker;
  }

  private async checkPayout(merchantId: string, currency: string, db: PayoutDb): Promise<PayoutCheck> {
    const merchant = await db.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, status: true, settlementMode: true, payoutHeldAt: true },
    });
    if (!merchant || merchant.status !== MerchantStatus.ACTIVE) return { blocker: "inactive" };
    if (merchant.settlementMode !== SettlementMode.AGGREGATOR) return { blocker: "facilitator" };
    // Ops hold (ASFI sub-project 3): the balance keeps accruing; nothing leaves until an admin lifts it.
    if (merchant.payoutHeldAt) return { blocker: "held" };
    // Held, not failed: the balance stays in MERCHANT_PAYABLE and goes out on the first run after they accept.
    if (await this.terms.needsMerchantAcceptance(merchantId)) return { blocker: "terms" };
    const approvedKyc = await db.merchantKycSubmission.findFirst({
      where: { merchantId, status: KycStatus.APPROVED },
      orderBy: { createdAt: "desc" },
    });
    if (!approvedKyc) return { blocker: "kyc" }; // shouldn't happen for an ACTIVE merchant, but never guess a bank account
    const bankAccount = currency === "BOB" ? approvedKyc.payoutBankAccount : currency === "USD" ? approvedKyc.payoutUsdBankAccount : null;
    if (!bankAccount) return { blocker: "no_account" };
    // Until it succeeds a payout's amount is still in MERCHANT_PAYABLE, so a second one would pay it twice.
    if (await db.payout.findFirst({ where: inFlightPayoutWhere(merchantId, currency) })) return { blocker: "in_flight" };
    return { blocker: null, bankAccount };
  }

  /**
   * Run once a day by PayoutScheduleJob: enqueues one PENDING Payout per (merchant, currency) with a positive
   * available (MERCHANT_PAYABLE) balance and no payout of that currency already in flight. USD balances wait until
   * the merchant's approved KYC has a USD bank account. Each check-and-create runs in its own transaction under the
   * merchant's settlement lock, so two runners can never both create, and the amount is re-read under that lock
   * (a release or refund drawdown in between cannot be paid out stale).
   */
  async createDuePayouts(): Promise<void> {
    const merchants = await this.prisma.merchant.findMany({
      where: { settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE },
    });

    for (const merchant of merchants) {
      const balances = (await this.getPayableBalances(merchant.id)).filter((b) => b.payableBalance > 0);
      for (const { currency } of balances) {
        await this.prisma.$transaction(async (tx) => {
          await lockMerchantSettlement(tx, merchant.id);
          const check = await this.checkPayout(merchant.id, currency, tx);
          if (check.blocker) {
            if (check.blocker === "held") this.logger.warn(`Payout held by ops: merchant ${merchant.id}`);
            if (check.blocker === "terms") this.logger.warn(`Payout held: merchant ${merchant.id} has not accepted the terms in force`);
            return;
          }
          const amount = (await this.getPayableBalances(merchant.id, tx)).find((b) => b.currency === currency)?.payableBalance ?? 0;
          if (amount <= 0) return;
          await tx.payout.create({
            data: { merchantId: merchant.id, amount, currency, bankAccount: check.bankAccount, nextRetryAt: new Date() },
          });
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
