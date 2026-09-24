import { RetentionService } from './retention.service';

/**
 * The delivery worker is the last hop before the wire, so this is where the
 * inbox's two routing guarantees are either kept or silently lost:
 *
 *   - Reply-To must be the store's own inbound address, so the shopper's
 *     answer reaches an MX we control and the webhook actually fires.
 *   - Message-ID must go out as a real header, so that answer comes back with
 *     an In-Reply-To the inbox can correlate.
 *
 * Both were missing end to end until this fix; each one alone is enough to
 * make the whole receiving half of the feature dead code.
 */
function worker(row: Record<string, unknown>) {
  const sent: Record<string, unknown>[] = [];
  // Same harness the other retention specs use: the real prototype with its
  // collaborators injected by hand, cast because both are private fields.
  const service = Object.create(RetentionService.prototype) as RetentionService;
  const wired = service as unknown as { prisma: unknown; email: unknown };
  const delivery = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([row]),
    update: jest.fn(),
  };
  wired.prisma = {
    storeEmailDelivery: delivery,
    storeNewsletterSubscriber: { findUnique: jest.fn().mockResolvedValue(null) },
    storeRetention: { findUnique: jest.fn().mockResolvedValue({ settings: { emailWorkspace: {
      domain: { name: 'tienda.test', senderName: 'Tienda', status: 'verified' },
    } } }) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ storeEmailDelivery: { update: jest.fn() }, storeSavedCart: { update: jest.fn() } })),
  };
  wired.email = { send: jest.fn(async (req: Record<string, unknown>) => { sent.push(req); }) };
  return { service, sent, delivery };
}

const baseRow = {
  id: 'delivery-1', storeId: 'store-1', email: 'ana@gmail.test', kind: 'INBOX_REPLY',
  sourceId: 'thread-1', subject: 'Re: Pedido', body: 'Sí, llega en 3 días.',
  attempts: 0, store: { id: 'store-1', slug: 'tienda', name: 'Tienda', status: 'ACTIVE', contactEmail: 'dueno@gmail.test' },
};

describe('RetentionService.deliver — inbox reply routing', () => {
  it('sends the reply with the queued Reply-To, not the store contact address', async () => {
    const { service, sent } = worker({ ...baseRow, replyTo: 'hola@inbound.tienda.test', messageIdHeader: 'thread-1.123@pagosya' });

    await service.deliver();

    expect(sent).toHaveLength(1);
    expect(sent[0].replyTo).toBe('hola@inbound.tienda.test');
    // The merchant's personal mailbox is exactly where this must NOT go: a
    // reply landing there never reaches our webhook.
    expect(sent[0].replyTo).not.toBe('dueno@gmail.test');
  });

  it('emits the queued Message-ID as a real header, wrapped in angle brackets', async () => {
    const { service, sent } = worker({ ...baseRow, replyTo: 'hola@inbound.tienda.test', messageIdHeader: 'thread-1.123@pagosya' });

    await service.deliver();

    expect(sent[0].headers).toEqual({ 'Message-ID': '<thread-1.123@pagosya>' });
  });

  it('sets no headers for a row that queued no Message-ID', async () => {
    const { service, sent } = worker({ ...baseRow, kind: 'WORKSPACE_ORDER_CONFIRMATION', replyTo: null, messageIdHeader: null });

    await service.deliver();

    expect(sent[0].headers).toBeUndefined();
  });

  it('still falls back to the store contact address when no Reply-To was queued', async () => {
    const { service, sent } = worker({ ...baseRow, kind: 'WORKSPACE_ORDER_CONFIRMATION', replyTo: null, messageIdHeader: null });

    await service.deliver();

    expect(sent[0].replyTo).toBe('dueno@gmail.test');
  });
});
