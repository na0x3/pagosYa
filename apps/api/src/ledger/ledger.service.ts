import { Injectable } from "@nestjs/common";
import { LedgerAccount, LedgerDirection, Prisma, SettlementMode } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { computeFee } from "./ledger.constants";

const groupId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);

export interface JournalLine {
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: number;
  merchantId?: string;
  transactionId?: string;
}

@Injectable()
export class LedgerService {
  generateGroupId(): string {
    return `grp_${groupId()}`;
  }

  /** Debits and credits for one journal event must net to zero — this is the ledger's core invariant. */
  async postJournalEntry(
    tx: Prisma.TransactionClient,
    transactionGroupId: string,
    lines: JournalLine[],
    currency: string,
  ): Promise<void> {
    const debits = lines.filter((l) => l.direction === LedgerDirection.DEBIT).reduce((s, l) => s + l.amount, 0);
    const credits = lines.filter((l) => l.direction === LedgerDirection.CREDIT).reduce((s, l) => s + l.amount, 0);

    if (debits !== credits) {
      throw new Error(
        `Ledger imbalance for group ${transactionGroupId}: debits=${debits} credits=${credits}`,
      );
    }

    await tx.ledgerEntry.createMany({
      data: lines.map((line) => ({
        transactionGroupId,
        transactionId: line.transactionId,
        merchantId: line.merchantId,
        account: line.account,
        direction: line.direction,
        amount: line.amount,
        currency,
      })),
    });
  }

  /**
   * Journal for a succeeded capture. AGGREGATOR merchants have funds pooled
   * by pagosYa (MERCHANT_PAYABLE is a liability paid out later); FACILITATOR
   * merchants get a pure pass-through entry since funds settle to their bank
   * directly — pagosYa's fee for that mode is invoiced out-of-band, not
   * deducted here.
   */
  buildCaptureJournal(params: {
    merchantId: string;
    transactionId: string;
    amount: number;
    settlementMode: SettlementMode;
  }): JournalLine[] {
    const { merchantId, transactionId, amount, settlementMode } = params;

    if (settlementMode === SettlementMode.FACILITATOR) {
      return [
        { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.DEBIT, amount, merchantId, transactionId },
        { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.CREDIT, amount, merchantId, transactionId },
      ];
    }

    const fee = computeFee(amount);
    const net = amount - fee;
    return [
      { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.DEBIT, amount, merchantId, transactionId },
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.CREDIT, amount: net, merchantId, transactionId },
      { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: LedgerDirection.CREDIT, amount: fee, merchantId, transactionId },
    ];
  }

  /** Reverses a prior capture journal — refunds are new rows, never mutations of old ones. */
  buildRefundJournal(params: {
    merchantId: string;
    transactionId: string;
    amount: number;
    settlementMode: SettlementMode;
  }): JournalLine[] {
    const { merchantId, transactionId, amount, settlementMode } = params;

    if (settlementMode === SettlementMode.FACILITATOR) {
      return [
        { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.DEBIT, amount, merchantId, transactionId },
        { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.CREDIT, amount, merchantId, transactionId },
      ];
    }

    const fee = computeFee(amount);
    const net = amount - fee;
    return [
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.DEBIT, amount: net, merchantId, transactionId },
      { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: LedgerDirection.DEBIT, amount: fee, merchantId, transactionId },
      { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.CREDIT, amount, merchantId, transactionId },
    ];
  }
}
