import { LedgerAccount, LedgerDirection } from '@prisma/client';
import type { JournalLine } from '../ledger/ledger.service';

const { DEBIT, CREDIT } = LedgerDirection;

/**
 * Posted after the capture journal for platform-account shipments: the shipping line never becomes the merchant's money.
 * Not wired yet (shipments Phase 2). When it is, for AGGREGATOR captures it must debit MERCHANT_PENDING (where the
 * capture net now lands) and reduce that capture's SettlementHold.pendingAmount by the same amount.
 */
export function shippingCollectedJournal(p: { merchantId: string; transactionId: string; amount: number }): JournalLine[] {
  return [
    { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: p.amount, merchantId: p.merchantId, transactionId: p.transactionId },
    { account: LedgerAccount.SHIPPING_CLEARING, direction: CREDIT, amount: p.amount, merchantId: p.merchantId, transactionId: p.transactionId },
  ];
}

export function shipmentBookedJournal(p: { merchantId: string; cost: number; margin: number }): JournalLine[] {
  return [
    { account: LedgerAccount.SHIPPING_CLEARING, direction: DEBIT, amount: p.cost + p.margin, merchantId: p.merchantId },
    { account: LedgerAccount.COURIER_PAYABLE, direction: CREDIT, amount: p.cost, merchantId: p.merchantId },
    ...(p.margin > 0 ? [{ account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: CREDIT, amount: p.margin, merchantId: p.merchantId }] : []),
  ];
}

export function shipmentAdjustmentJournal(p: { merchantId: string; delta: number }): JournalLine[] {
  if (p.delta === 0) return [];
  const amount = Math.abs(p.delta);
  return p.delta > 0
    ? [{ account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount, merchantId: p.merchantId }, { account: LedgerAccount.COURIER_PAYABLE, direction: CREDIT, amount, merchantId: p.merchantId }]
    : [{ account: LedgerAccount.COURIER_PAYABLE, direction: DEBIT, amount, merchantId: p.merchantId }, { account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount, merchantId: p.merchantId }];
}

export function cancellationFeeJournal(p: { merchantId: string; fee: number }): JournalLine[] {
  return [
    { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: p.fee, merchantId: p.merchantId },
    { account: LedgerAccount.COURIER_PAYABLE, direction: CREDIT, amount: p.fee, merchantId: p.merchantId },
  ];
}
