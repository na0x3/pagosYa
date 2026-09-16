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

  it("builds a balanced payout journal that draws down MERCHANT_PAYABLE", () => {
    const lines = ledger.buildPayoutJournal({ merchantId: "merch_1", amount: 975 });
    expect(netsToZero(lines)).toBe(true);
    const payable = lines.find((l) => l.account === LedgerAccount.MERCHANT_PAYABLE);
    expect(payable?.direction).toBe(LedgerDirection.DEBIT);
    expect(payable?.amount).toBe(975);
  });

  it("throws when postJournalEntry lines do not balance", async () => {
    const badLines = [
      { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.DEBIT, amount: 100 },
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.CREDIT, amount: 90 },
    ];
    const fakeTx = { ledgerEntry: { createMany: jest.fn() } } as any;
    await expect(ledger.postJournalEntry(fakeTx, "grp_1", badLines, "BOB")).rejects.toThrow(/imbalance/);
  });

  it("books the international fee and dLocal's estimated cost as separate accounts, balanced", () => {
    const lines = ledger.buildCaptureJournal({
      ...base, amount: 10000, settlementMode: SettlementMode.AGGREGATOR, pricing: { feeBps: 590, railCostBps: 420 },
    });
    expect(netsToZero(lines)).toBe(true);
    const find = (account: LedgerAccount) => lines.find((l) => l.account === account);
    expect(find(LedgerAccount.RAIL_CLEARING)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 9580 });
    expect(find(LedgerAccount.RAIL_COST)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 420 });
    expect(find(LedgerAccount.MERCHANT_PAYABLE)).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 9410 });
    expect(find(LedgerAccount.PAGOSYA_FEE_REVENUE)).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 590 });
  });

  it("omits the RAIL_COST line when the rail has no cost (domestic journals unchanged)", () => {
    const lines = ledger.buildCaptureJournal({ ...base, settlementMode: SettlementMode.AGGREGATOR });
    expect(lines.some((l) => l.account === LedgerAccount.RAIL_COST)).toBe(false);
  });

  it("reverses the international fee on refund and credits clearing for the full amount", () => {
    const lines = ledger.buildRefundJournal({
      ...base, amount: 10000, settlementMode: SettlementMode.AGGREGATOR, pricing: { feeBps: 590, railCostBps: 420 },
    });
    expect(netsToZero(lines)).toBe(true);
    expect(lines.find((l) => l.account === LedgerAccount.MERCHANT_PAYABLE)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 9410 });
    expect(lines.find((l) => l.account === LedgerAccount.PAGOSYA_FEE_REVENUE)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 590 });
    expect(lines.find((l) => l.account === LedgerAccount.RAIL_CLEARING)).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 10000 });
  });
});
