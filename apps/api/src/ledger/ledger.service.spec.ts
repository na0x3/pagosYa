import { LedgerAccount, LedgerDirection, SettlementMode } from "@prisma/client";
import { LedgerService } from "./ledger.service";

function netsToZero(lines: { direction: LedgerDirection; amount: number }[]): boolean {
  const debits = lines.filter((l) => l.direction === LedgerDirection.DEBIT).reduce((s, l) => s + l.amount, 0);
  const credits = lines.filter((l) => l.direction === LedgerDirection.CREDIT).reduce((s, l) => s + l.amount, 0);
  return debits === credits;
}

describe("LedgerService", () => {
  const ledger = new LedgerService();
  const base = { merchantId: "merch_1", transactionId: "txn_1", amount: 1000 };

  it("builds a balanced capture journal for AGGREGATOR merchants, netting the fee out", () => {
    const lines = ledger.buildCaptureJournal({ ...base, settlementMode: SettlementMode.AGGREGATOR });
    expect(netsToZero(lines)).toBe(true);
    const fee = lines.find((l) => l.account === LedgerAccount.PAGOSYA_FEE_REVENUE);
    const payable = lines.find((l) => l.account === LedgerAccount.MERCHANT_PAYABLE);
    expect(fee?.amount).toBe(25); // 2.5% of 1000
    expect(payable?.amount).toBe(975);
  });

  it("builds a balanced capture journal for FACILITATOR merchants with full pass-through", () => {
    const lines = ledger.buildCaptureJournal({ ...base, settlementMode: SettlementMode.FACILITATOR });
    expect(netsToZero(lines)).toBe(true);
    const payable = lines.find((l) => l.account === LedgerAccount.MERCHANT_PAYABLE);
    expect(payable?.amount).toBe(1000);
  });

  it("builds a balanced refund journal for AGGREGATOR merchants", () => {
    const lines = ledger.buildRefundJournal({ ...base, settlementMode: SettlementMode.AGGREGATOR });
    expect(netsToZero(lines)).toBe(true);
  });

  it("throws when postJournalEntry lines do not balance", async () => {
    const badLines = [
      { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.DEBIT, amount: 100 },
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.CREDIT, amount: 90 },
    ];
    const fakeTx = { ledgerEntry: { createMany: jest.fn() } } as any;
    await expect(ledger.postJournalEntry(fakeTx, "grp_1", badLines, "BOB")).rejects.toThrow(/imbalance/);
  });
});
