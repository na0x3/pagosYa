import { StoreEmailService } from './store-email.service';
import { loadFloorKit } from './email-copy-defaults';

const config = (base: string | null) => ({ get: (key: string) => (key === 'app.publicAssetBaseUrl' ? base : undefined) }) as any;
const input = (over: object = {}) => ({ storeName: 'Café Illimani', customerName: 'Ana', orderId: 'pi_1', total: 'Bs 150,00', originalTotal: null, trackingUrl: null,
  subscription: null, appointment: null, logoUrl: null,
  lines: [{ paymentLinkId: 'pl_1', variantId: 'v_2', name: 'Café', variant: '250 g', extras: null, quantity: 1, amount: 'Bs 150,00' }], ...over });

function harness({ kit = null as any, legacy = null as string | null, base = 'https://api.example' as string | null } = {}) {
  const prisma: any = {
    storeSourceVersion: { findFirst: jest.fn(async () => (legacy ? { snapshot: { files: [{ path: 'emails/order-confirmation.html', content: legacy }] } } : null)) },
    storeBrandProfile: { findUnique: jest.fn(async () => ({ data: { confirmed: [{ field: 'accent', value: '#c2410c' }], suggested: [] } })) },
    paymentLink: { findMany: jest.fn(async () => [{ id: 'pl_1', name: 'Café', imageUrls: ['/v1/uploads/cover.webp'], variants: [{ id: 'v_2', imageUrls: ['/v1/uploads/v2.webp'] }] }]) },
    store: { findUnique: jest.fn(async () => ({ logoUrl: '/v1/uploads/logo.png' })) },
  };
  const kits: any = { active: jest.fn(async () => kit), overrides: jest.fn(async () => ({})) };
  return new StoreEmailService(prisma, kits, config(base));
}

describe('StoreEmailService.renderReceipt', () => {
  it('without a kit or a legacy template, renders the standard kit in the store colours with the variant photo', async () => {
    // With a tracking link, so the button (the block that carries the accent colour) is in the email.
    const { html, subject } = await harness().renderReceipt('s1', input({ trackingUrl: 'https://t.example/track/1' }));
    expect(html).toContain('#c2410c');
    expect(html).not.toContain('var(--');
    expect(html).toContain('https://api.example/v1/uploads/v2.webp');
    expect(html).toContain('https://api.example/v1/uploads/logo.png');
    expect(subject).toBe('Recibo de tu compra en Café Illimani');
  });

  it('uses the product cover when the variant has no photo, and no image at all without a public base', async () => {
    const variantless = input({ lines: [{ paymentLinkId: 'pl_1', variantId: null, name: 'Café', variant: null, extras: null, quantity: 1, amount: 'Bs 150,00' }] });
    expect((await harness().renderReceipt('s1', variantless)).html).toContain('https://api.example/v1/uploads/cover.webp');
    expect((await harness({ base: null }).renderReceipt('s1', variantless)).html).not.toContain('/v1/uploads/');
  });

  it("prefers the store's active kit and its wording", async () => {
    const floor = await loadFloorKit();
    const kit = { layout: floor.layout!.replace('<body', '<body data-kit="mine"'), blocks: Object.values(floor.blocks).join(''), copy: { order_confirmation: { headline: 'Gracias de verdad' } } };
    const { html } = await harness({ kit }).renderReceipt('s1', input());
    expect(html).toContain('data-kit="mine"');
    expect(html).toContain('Gracias de verdad');
  });

  it('uses a legacy authored order-confirmation.html when the store has no kit', async () => {
    const legacy = '<html><body><p data-order-greeting></p><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total></p><p>LEGACY</p></body></html>';
    expect((await harness({ legacy }).renderReceipt('s1', input())).html).toContain('LEGACY');
  });

  it('a kit lookup that fails (the tables are not migrated yet) still renders the standard kit', async () => {
    const service = harness();
    (service as any).kits.active.mockRejectedValue(new Error('relation "StoreEmailKit" does not exist'));
    (service as any).kits.overrides.mockRejectedValue(new Error('relation "StoreEmailCopyOverride" does not exist'));
    const { html, repairs } = await service.renderReceipt('s1', input());
    expect(html).toContain('Café');
    expect(repairs.join(' ')).toContain('kit lookup failed');
  });

  it('a null store gets the standard kit', async () => {
    expect((await harness().renderReceipt(null, input())).html).toContain('Café');
  });

  it('the sample uses the store\'s own products when it has some', async () => {
    const sample = await harness().sampleReceipt('s1', 'Café Illimani', 'order_confirmation');
    expect(sample.lines[0]).toMatchObject({ paymentLinkId: 'pl_1', name: 'Café' });
    expect((await harness().sampleReceipt('s1', 'Café', 'appointment_confirmed')).appointment).not.toBeNull();
  });
});
