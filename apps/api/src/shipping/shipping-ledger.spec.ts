import { LedgerDirection } from '@prisma/client';
import { cancellationFeeJournal, shipmentAdjustmentJournal, shipmentBookedJournal, shippingCollectedJournal } from './shipping-ledger';

const net = (lines: { direction: LedgerDirection; amount: number }[]) => lines.reduce((s, l) => s + (l.direction === 'DEBIT' ? l.amount : -l.amount), 0);

describe('shipping ledger journals', () => {
  it('reclassifies the collected shipping line from the merchant to shipping clearing', () => {
    const lines = shippingCollectedJournal({ merchantId: 'm', transactionId: 't', amount: 2500 });
    expect(net(lines)).toBe(0);
    expect(lines).toEqual([
      { account: 'MERCHANT_PAYABLE', direction: 'DEBIT', amount: 2500, merchantId: 'm', transactionId: 't' },
      { account: 'SHIPPING_CLEARING', direction: 'CREDIT', amount: 2500, merchantId: 'm', transactionId: 't' },
    ]);
  });
  it('splits booked shipping into courier payable and PagosYa margin', () => {
    const lines = shipmentBookedJournal({ merchantId: 'm', cost: 2300, margin: 200 });
    expect(net(lines)).toBe(0);
    expect(lines.find(l => l.account === 'COURIER_PAYABLE')?.amount).toBe(2300);
    expect(lines.find(l => l.account === 'PAGOSYA_FEE_REVENUE')?.amount).toBe(200);
  });
  it('omits a zero margin line', () => {
    expect(shipmentBookedJournal({ merchantId: 'm', cost: 2500, margin: 0 }).some(l => l.account === 'PAGOSYA_FEE_REVENUE')).toBe(false);
  });
  it('charges surcharges to the merchant and credits refunds back', () => {
    const up = shipmentAdjustmentJournal({ merchantId: 'm', delta: 400 });
    const down = shipmentAdjustmentJournal({ merchantId: 'm', delta: -400 });
    expect(net(up)).toBe(0); expect(net(down)).toBe(0);
    expect(up.find(l => l.account === 'MERCHANT_PAYABLE')?.direction).toBe('DEBIT');
    expect(down.find(l => l.account === 'MERCHANT_PAYABLE')?.direction).toBe('CREDIT');
    expect(shipmentAdjustmentJournal({ merchantId: 'm', delta: 0 })).toEqual([]);
  });
  it('charges cancellation fees to the merchant', () => {
    const lines = cancellationFeeJournal({ merchantId: 'm', fee: 800 });
    expect(net(lines)).toBe(0);
    expect(lines[0]).toMatchObject({ account: 'MERCHANT_PAYABLE', direction: 'DEBIT', amount: 800 });
  });
});
