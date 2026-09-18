import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmailWorkspaceService } from './email-workspace.service';
import { queueStoreEmail, workspaceSender } from './email-workspace.config';
import { RetentionService } from './retention.service';
import { DEFAULT_RETENTION } from './retention.dto';
const domains = { create: jest.fn(), remove: jest.fn().mockResolvedValue({}), verify: jest.fn(), get: jest.fn() };
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ domains })) }));
function harness(settings: any = {}, revision = 2) {
    const row: any = { storeId: 'store-a', revision, settings };
    const db: any = {
        $executeRaw: jest.fn(),
        storeRetention: { findUnique: jest.fn().mockResolvedValue(row), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockImplementation(({ data }) => { Object.assign(row.settings, data.settings); row.revision++; return { count: 1 }; }), create: jest.fn() },
        storeEmailDelivery: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
        store: { findUnique: jest.fn().mockResolvedValue({ name: 'Tienda A' }) },
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    const retention: any = { owner: jest.fn().mockResolvedValue({ name: 'Tienda A' }), settings: jest.fn().mockImplementation(() => ({ ...row.settings, revision: row.revision })) };
    const service = new EmailWorkspaceService(db, retention, { get: () => 'test-key' } as any);
    return { db, retention, service, row };
}
afterEach(() => jest.clearAllMocks());
describe('per-store email workspace', () => {
    it('requires ownership before reading logs and rejects a cursor from another store', async () => {
        const { service, retention, db } = harness();
        retention.owner.mockRejectedValueOnce(new NotFoundException());
        await expect(service.logs('merchant', 'store-a')).rejects.toBeInstanceOf(NotFoundException);
        expect(db.storeEmailDelivery.findMany).not.toHaveBeenCalled();
        await expect(service.logs('merchant', 'store-a', 'another-store-log')).rejects.toBeInstanceOf(BadRequestException);
        expect(db.storeEmailDelivery.findFirst).toHaveBeenCalledWith({ where: { id: 'another-store-log', storeId: 'store-a' }, select: { id: true } });
    });
    it('preserves retention settings and other email settings when saving one template', async () => {
        const { service, row } = harness({ comebackEnabled: true, emailWorkspace: { staff: { enabled: true, recipients: [] }, templates: { REFUND: { enabled: true } } } });
        await service.template('merchant', 'store-a', 'WELCOME', { revision: 2, enabled: true, subject: 'Hola {{store}}', body: 'Bienvenido' });
        expect(row.settings).toMatchObject({ comebackEnabled: true, welcomeEnabled: true, welcomeSubject: 'Hola {{store}}', emailWorkspace: { staff: { enabled: true }, templates: { REFUND: { enabled: true }, WELCOME: { enabled: true } } } });
    });
    it('rejects stale writes and unsupported event activation', async () => {
        const { service, db } = harness();
        await expect(service.template('merchant', 'store-a', 'SHIPPED', { revision: 1, enabled: true, subject: 'Hola', body: 'En camino' })).rejects.toBeInstanceOf(ConflictException);
        await expect(service.template('merchant', 'store-a', 'SUBSCRIPTION_SKIPPED', { revision: 2, enabled: true, subject: 'Hola', body: 'En camino' })).rejects.toBeInstanceOf(BadRequestException);
        expect(db.storeRetention.updateMany).not.toHaveBeenCalled();
    });
    it('rejects duplicate recipient addresses after normalization', async () => {
        const { service } = harness();
        await expect(service.staff('merchant', 'store-a', { revision: 2, enabled: true, recipients: [{ email: 'Staff@Store.test', events: ['REFUND'] }, { email: 'staff@store.test', events: ['WEEKLY'] }] })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('locks domain claims and does not provision a domain claimed by another store', async () => {
        const { service, db } = harness();
        db.storeRetention.findFirst.mockResolvedValue({ storeId: 'store-b' });
        await expect(service.domain('merchant', 'store-a', { revision: 2, name: 'mail.store.test', senderName: 'Tienda' })).rejects.toBeInstanceOf(ConflictException);
        expect(db.$executeRaw).toHaveBeenCalledTimes(2);
        expect(domains.create).not.toHaveBeenCalled();
    });
    it('removes newly provisioned provider domain after a concurrent settings conflict', async () => {
        const { service, db } = harness();
        domains.create.mockResolvedValue({ data: { id: 'domain-new', records: [] } });
        db.storeRetention.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.domain('merchant', 'store-a', { revision: 2, name: 'mail.store.test', senderName: 'Tienda' })).rejects.toBeInstanceOf(ConflictException);
        expect(domains.remove).toHaveBeenCalledWith('domain-new');
    });
    it('uses only a provider-verified custom sender', () => {
        const domain = { name: 'mail.store.test', senderName: 'Tienda', status: 'pending' };
        expect(workspaceSender({ emailWorkspace: { domain } })).toBeUndefined();
        domain.status = 'verified';
        expect(workspaceSender({ emailWorkspace: { domain } })).toBe('Tienda <notificaciones@mail.store.test>');
    });
    it('queues customer and opted-in staff mail with stable store-scoped idempotency keys', async () => {
        const { db } = harness({ emailWorkspace: { templates: { ORDER_CONFIRMATION: { enabled: true, subject: '{{store}} / {{order}}', body: 'Hola {{customer}}' } }, staff: { enabled: true, recipients: [{ email: 'staff@store.test', events: ['NEW_ORDER'] }, { email: 'refund@store.test', events: ['REFUND'] }] } } });
        const values = { store: 'Merchant profile', order: 'order-1', customer: 'Ana', amount: 'BOB 10', details: 'Private tracking URL' };
        await queueStoreEmail(db, 'store-a', 'ORDER_CONFIRMATION', 'payment-1', 'Buyer@Example.test', values);
        await queueStoreEmail(db, 'store-a', 'ORDER_CONFIRMATION', 'payment-1', 'Buyer@Example.test', values);
        const calls = db.storeEmailDelivery.upsert.mock.calls.map(([call]: any) => call);
        expect(calls).toHaveLength(4);
        expect(calls[0].where).toEqual(calls[2].where);
        expect(calls[0].create).toMatchObject({ storeId: 'store-a', email: 'buyer@example.test', subject: 'Tienda A / order-1', body: 'Hola Ana\n\nPrivate tracking URL' });
        expect(calls[1].create.kind).toBe('STAFF_NEW_ORDER');
        expect(calls.every((call: any) => call.create.email !== 'refund@store.test')).toBe(true);
    });
    it('does not queue customer emails for disabled templates', async () => {
        const { db } = harness();
        expect(await queueStoreEmail(db, 'store-a', 'SHIPPED', 'event-1', 'buyer@example.test', { store: 'A' })).toBe(false);
        expect(db.storeEmailDelivery.upsert).not.toHaveBeenCalled();
    });
    it('keeps an already-paid receipt due after disabling its template', async () => {
        const { db } = harness({ emailWorkspace: { templates: { ORDER_CONFIRMATION: { enabled: false } }, staff: { enabled: false, recipients: [] } } });
        db.storeEmailDelivery.findMany.mockResolvedValue([{ id: 'mail-1', storeId: 'store-a', email: 'buyer@example.test', kind: 'WORKSPACE_ORDER_CONFIRMATION', subject: 'Recibo', body: 'Pago confirmado', store: { status: 'ACTIVE', name: 'Tienda A' } }]);
        db.storeEmailDelivery.updateMany = jest.fn().mockResolvedValue({ count: 1 });
        db.storeEmailDelivery.update = jest.fn();
        db.storeNewsletterSubscriber = { findUnique: jest.fn().mockResolvedValue(null) };
        const email = { send: jest.fn() };
        await new RetentionService(db, {} as any, email as any).deliver();
        expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Recibo', idempotencyKey: 'retention/mail-1' }));
    });
    it('queues weekly reports once per local Monday and selected recipient', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-14T13:00:00Z'));
        try {
            const { service, db } = harness();
            db.storeRetention.findMany = jest.fn().mockResolvedValue([{ storeId: 'store-a', store: { status: 'ACTIVE', name: 'Tienda A' }, settings: { timezone: 'America/La_Paz', emailWorkspace: { staff: { enabled: true, recipients: [{ email: 'weekly@example.test', events: ['WEEKLY'] }, { email: 'orders@example.test', events: ['NEW_ORDER'] }] } } } }]);
            db.storeOrder = { count: jest.fn().mockResolvedValue(4) };
            await service.weeklyReports();
            await service.weeklyReports();
            const calls = db.storeEmailDelivery.upsert.mock.calls;
            expect(calls).toHaveLength(2);
            expect(calls[0][0].where).toEqual(calls[1][0].where);
            expect(calls[0][0].create).toMatchObject({ email: 'weekly@example.test', kind: 'STAFF_WEEKLY', sourceId: '2026-09-14' });
        }
        finally {
            jest.useRealTimers();
        }
    });
    it('preserves email configuration when the original Comeback form saves', async () => {
        const { db, row } = harness({ ...DEFAULT_RETENTION, emailWorkspace: { templates: { SHIPPED: { enabled: true } }, staff: { enabled: false, recipients: [] } } });
        db.store.findFirst = jest.fn().mockResolvedValue({ id: 'store-a' });
        const retention = new RetentionService(db, {} as any, {} as any);
        await retention.save('merchant', 'store-a', { ...DEFAULT_RETENTION, revision: 2, comebackEnabled: true });
        expect(row.settings.emailWorkspace.templates.SHIPPED.enabled).toBe(true);
        expect(row.settings.comebackEnabled).toBe(true);
    });
});
