import { LedgerAccount, LedgerDirection } from "@prisma/client";
import type { SettlementDb } from "./settlement-policy.service";

export interface SettlementBalance {
  currency: string;
  available: number;
  pending: number;
  reserve: number;
}

/** Credit minus debit: MERCHANT_PAYABLE, MERCHANT_PENDING and RESERVE are all money pagosYa owes the merchant. */
export async function accountBalance(db: SettlementDb, merchantId: string, account: LedgerAccount, currency: string): Promise<number> {
  const rows = await db.ledgerEntry.groupBy({ by: ["direction"], where: { merchantId, account, currency }, _sum: { amount: true } });
  const credit = rows.find((r) => r.direction === LedgerDirection.CREDIT)?._sum.amount ?? 0;
  const debit = rows.find((r) => r.direction === LedgerDirection.DEBIT)?._sum.amount ?? 0;
  return credit - debit;
}

const FIELD: Partial<Record<LedgerAccount, keyof Omit<SettlementBalance, "currency">>> = {
  [LedgerAccount.MERCHANT_PAYABLE]: "available",
  [LedgerAccount.MERCHANT_PENDING]: "pending",
  [LedgerAccount.RESERVE]: "reserve",
};

/** Per currency, never summed across currencies. */
export async function merchantBalances(db: SettlementDb, merchantId: string): Promise<SettlementBalance[]> {
  const rows = await db.ledgerEntry.groupBy({
    by: ["currency", "account", "direction"],
    where: { merchantId, account: { in: [LedgerAccount.MERCHANT_PAYABLE, LedgerAccount.MERCHANT_PENDING, LedgerAccount.RESERVE] } },
    _sum: { amount: true },
  });
  const byCurrency = new Map<string, SettlementBalance>();
  for (const row of rows) {
    const balance = byCurrency.get(row.currency) ?? { currency: row.currency, available: 0, pending: 0, reserve: 0 };
    const field = FIELD[row.account]!;
    balance[field] += (row._sum.amount ?? 0) * (row.direction === LedgerDirection.CREDIT ? 1 : -1);
    byCurrency.set(row.currency, balance);
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
