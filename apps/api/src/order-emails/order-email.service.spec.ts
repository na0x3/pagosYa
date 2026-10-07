import { OrderEmailService } from './order-email.service';
import type { OrderEmailData } from './order-email-render';

const authored = `<!doctype html><html><body><p>MARCA DE PRUEBA</p>
<table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table>
<p data-order-total></p><img data-store-logo></body></html>`;

const sample: OrderEmailData = {
  storeName: 'Mantecate', logoUrl: null, customerName: 'Ana', orderId: 'pi_SYNTH001',
  items: [{ name: 'Café', variantName: null, extras: null, quantity: 1, amount: 'Bs 75,00' }],
  total: 'Bs 75,00', originalTotal: null, trackingUrl: null, subscription: null, appointment: null,
};

const prisma = {
  storeSourceVersion: { findFirst: jest.fn() },
  storeBrandProfile: { findUnique: jest.fn() },
};
const service = new OrderEmailService(prisma as never);

beforeEach(() => {
  jest.resetAllMocks();
  prisma.storeSourceVersion.findFirst.mockResolvedValue(null);
  prisma.storeBrandProfile.findUnique.mockResolvedValue(null);
});

describe('OrderEmailService', () => {
  it('uses the floor when the store has no authored template', async () => {
    const { html } = await service.renderForStore(null, sample);
    expect(html).toContain('Gracias por tu compra');
  });

  it('uses the authored template when the store has a usable one', async () => {
    prisma.storeSourceVersion.findFirst.mockResolvedValue({ snapshot: { files: [{ path: 'emails/order-confirmation.html', content: authored }] } });
    const { html } = await service.renderForStore('store_1', sample);
    expect(html).toContain('MARCA DE PRUEBA');
  });

  it('falls back to the floor when the authored template lacks a required slot', async () => {
    prisma.storeSourceVersion.findFirst.mockResolvedValue({ snapshot: { files: [{ path: 'emails/order-confirmation.html', content: '<html><body>nada</body></html>' }] } });
    const { html, repairs } = await service.renderForStore('store_1', sample);
    expect(html).toContain('Gracias por tu compra');
    expect(repairs.join(' ')).toContain('floor');
  });

  it.each(['data:image/png;base64,AAA', 'javascript:alert(1)', 'http://insecure.example/l.png'])('drops a %s logo', async logoUrl => {
    const { html } = await service.renderForStore(null, { ...sample, logoUrl });
    expect(html).not.toContain(logoUrl);
  });

  it('keeps an https logo', async () => {
    const { html } = await service.renderForStore(null, { ...sample, logoUrl: 'https://cdn.example/l.png' });
    expect(html).toContain('https://cdn.example/l.png');
  });

  it('resolves brand tokens to literal values, never leaving a custom property', async () => {
    prisma.storeSourceVersion.findFirst.mockResolvedValue({
      snapshot: { files: [{ path: 'emails/order-confirmation.html', content: authored.replace('<body>', '<body style="color:var(--brand-accent);background:#fff">') }] },
    });
    prisma.storeBrandProfile.findUnique.mockResolvedValue({ data: { confirmed: [{ name: 'brand-accent', value: '#236452' }] } });
    const { html } = await service.renderForStore('store_1', sample);
    expect(html).toContain('#236452');
    expect(html).not.toContain('var(--brand');
  });

  it('drops an unresolved custom property rather than shipping it', async () => {
    prisma.storeSourceVersion.findFirst.mockResolvedValue({
      snapshot: { files: [{ path: 'emails/order-confirmation.html', content: authored.replace('<body>', '<body style="color:var(--brand-missing,#111);background:#fff">') }] },
    });
    const { html } = await service.renderForStore('store_1', sample);
    expect(html).not.toContain('var(--');
    expect(html).toContain('#111');
  });

  it('never rejects — a thrown lookup still yields the floor', async () => {
    prisma.storeSourceVersion.findFirst.mockRejectedValue(new Error('db down'));
    const { html } = await service.renderForStore('store_1', sample);
    expect(html).toContain('Gracias por tu compra');
  });

  it('offers sample data that populates every slot the merchant can style', () => {
    const data = service.sampleData('Mantecate');
    expect(data.items.length).toBeGreaterThan(1);
    expect(data.trackingUrl).toBeTruthy();
    expect(data.subscription).toBeTruthy();
  });
});
