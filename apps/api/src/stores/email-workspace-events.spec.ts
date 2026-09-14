import { PaymentIntentsService } from '../payment-intents/payment-intents.service';
import { ConsumerService } from '../consumer/consumer.service';
import { CommercePlatformService } from '../commerce-platform/commerce-platform.service';
import { OrderFulfillmentStatus, TransactionType } from '@prisma/client';
function harness(livemode = true) {
    const template = { enabled: true, subject: '{{store}} · {{order}}', body: 'Hola {{customer}}' };
    const intent = { id: 'payment-1', status: 'SUCCEEDED', livemode, amount: 18000, currency: 'BOB', customerEmail: 'buyer@example.test', customerName: 'Ana', metadata: { cart: [{ name: 'Suéter', variantName: 'Azul / S', quantity: 1, unitAmount: 18000 }] } };
    const db: any = {
        $queryRaw: jest.fn().mockResolvedValue([{ ...intent, status: 'PROCESSING' }]),
        merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Perfil', settlementMode: 'AGGREGATOR' }) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'capture-1' }) },
        paymentIntent: { update: jest.fn().mockResolvedValue(intent), findUnique: jest.fn().mockResolvedValue(intent) },
        store: { findUnique: jest.fn().mockResolvedValue({ name: 'Suéteres' }), findFirst: jest.fn().mockResolvedValue({ name: 'Suéteres' }), update: jest.fn() },
        storeOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', storeId: 'store-a', status: 'AWAITING_PAYMENT' }), update: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'order-1', storeId: 'store-a', paymentIntentId: 'payment-1', status: 'SHIPPED', amount: 18000, currency: 'BOB' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn() },
        storeOrderStatusEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
        storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings: { emailWorkspace: { templates: { ORDER_CONFIRMATION: template, DELIVERED: template, SUBSCRIPTION_FAILED: template, GIFT_CARD: template }, staff: { enabled: false, recipients: [] } } } }) },
        storeEmailDelivery: { upsert: jest.fn().mockResolvedValue({}) },
        subscriptionInvoice: { updateMany: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'invoice-1', storeId: 'store-a', subscriptionId: 'subscription-1', amount: 18000, currency: 'BOB' }) },
        customerSubscription: { findUnique: jest.fn().mockResolvedValue({ customerEmail: 'buyer@example.test', customerName: 'Ana' }) },
        appointment: { updateMany: jest.fn() }, storeCredit: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => ({ id: 'gift-1', ...data })) }, storeCreditEntry: { create: jest.fn() },
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    const email = { send: jest.fn() };
    const ledger = { buildCaptureJournal: jest.fn(), generateGroupId: jest.fn(), postJournalEntry: jest.fn() };
    const payment = new PaymentIntentsService(db, {} as any, {} as any, ledger as any, { enqueueEvent: jest.fn() } as any, { enqueueInvoice: jest.fn() } as any, email as any);
    jest.spyOn(payment as any, 'decrementStockForCart').mockResolvedValue(undefined);
    jest.spyOn(payment as any, 'recordProductStats').mockResolvedValue(undefined);
    return { db, payment, email };
}
describe('email lifecycle hooks', () => {
    it('queues a paid receipt with selected variant and tracking, without a duplicate default receipt', async () => {
        const { db, payment, email } = harness();
        await (payment as any).applyRailResult('payment-1', 'merchant', 'rail', { status: 'succeeded', raw: {} }, TransactionType.CAPTURE);
        expect(db.storeEmailDelivery.upsert).toHaveBeenCalledTimes(1);
        const body = db.storeEmailDelivery.upsert.mock.calls[0][0].create.body;
        expect(body).toContain('Suéter (Azul / S)');
        expect(body).toContain('/track/');
        expect(email.send).not.toHaveBeenCalled();
    });
    it('does not queue workspace mail for sandbox payments', async () => {
        const { db, payment } = harness(false);
        await (payment as any).applyRailResult('payment-1', 'merchant', 'rail', { status: 'succeeded', raw: {} }, TransactionType.CAPTURE);
        expect(db.storeEmailDelivery.upsert).not.toHaveBeenCalled();
    });
    it('queues failed subscription payment notices for the invoice owner', async () => {
        const { db, payment } = harness();
        await (payment as any).applyRailResult('payment-1', 'merchant', 'rail', { status: 'failed', raw: {} }, TransactionType.AUTHORIZATION);
        expect(db.storeEmailDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ storeId: 'store-a', kind: 'WORKSPACE_SUBSCRIPTION_FAILED', sourceId: 'payment-1' }) }));
    });
    it('queues delivery notifications in the same transaction as the status event', async () => {
        const { db } = harness();
        const consumer = new ConsumerService(db, {} as any, {} as any, {} as any);
        await consumer.updateOrderStatus('merchant', 'order-1', OrderFulfillmentStatus.DELIVERED);
        expect(db.storeEmailDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ kind: 'WORKSPACE_DELIVERED', sourceId: 'event-1' }) }));
    });
    it('queues an issued gift code only for its requested recipient', async () => {
        const { db } = harness();
        const service = new CommercePlatformService(db, { get: () => 'test-secret-long-enough-for-code' } as any, {} as any);
        const result = await service.issueCredit('merchant', 'store-a', { reference: 'gift-reference', label: 'Ana', kind: 'GIFT_CARD', amount: 5000, currency: 'BOB', recipientEmail: 'ana@example.test' });
        const mail = db.storeEmailDelivery.upsert.mock.calls[0][0].create;
        expect(mail.email).toBe('ana@example.test');
        expect(mail.kind).toBe('WORKSPACE_GIFT_CARD');
        expect(mail.body).toContain(result.code);
    });
});
