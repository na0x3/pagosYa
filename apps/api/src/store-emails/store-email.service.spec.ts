import { Logger } from '@nestjs/common';
import { StoreEmailService } from './store-email.service';
import { loadFloorKit } from './email-copy-defaults';
import * as validate from './email-kit-validate';

const config = (base: string | null) => ({ get: (key: string) => ({ 'app.publicAssetBaseUrl': base, 'app.checkoutOrigin': 'https://pagar.bo' } as Record<string, unknown>)[key] }) as any;
const input = (over: object = {}) => ({ storeName: 'Café Illimani', customerName: 'Ana', orderId: 'pi_1', total: 'Bs 150,00', originalTotal: null, trackingUrl: null,
  subscription: null, appointment: null, logoUrl: null,
  lines: [{ paymentLinkId: 'pl_1', variantId: 'v_2', name: 'Café', variant: '250 g', extras: null, quantity: 1, amount: 'Bs 150,00' }], ...over });

function harness({ kit = null as any, legacy = null as string | null, base = 'https://api.example' as string | null, brand = [{ field: 'accent', value: '#c2410c' }] as any[], domains = [] as { hostname: string }[],
  promos = [] as object[], stored = {} as object, contact = {} as object } = {}) {
  const prisma: any = {
    storeLink: { findMany: jest.fn(async () => []) },
    collection: { findMany: jest.fn(async () => []) },
    storeReview: { findFirst: jest.fn(async () => null) },
    promoCode: { findMany: jest.fn(async () => promos) },
    storeSourceVersion: { findFirst: jest.fn(async () => (legacy ? { snapshot: { files: [{ path: 'emails/order-confirmation.html', content: legacy }] } } : null)) },
    storeBrandProfile: { findUnique: jest.fn(async () => ({ data: { confirmed: brand, suggested: [] } })) },
    paymentLink: { findMany: jest.fn(async () => [{ id: 'pl_1', name: 'Café', amount: 5000, currency: 'BOB', imageUrls: ['/v1/uploads/cover.webp'], variants: [{ id: 'v_2', imageUrls: ['/v1/uploads/v2.webp'] }] }]) },
    store: { findUnique: jest.fn(async () => ({ name: 'Café Illimani', logoUrl: '/v1/uploads/logo.png', slug: 'cafe', customDomains: domains, policies: {}, locations: [], ...contact })) },
  };
  const kits: any = { active: jest.fn(async () => kit), overrides: jest.fn(async () => ({})) };
  const content: any = { get: jest.fn(async () => stored) };
  return new StoreEmailService(prisma, kits, content, config(base));
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
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = harness();
    (service as any).kits.active.mockRejectedValue(new Error('relation "StoreEmailKit" does not exist'));
    (service as any).kits.overrides.mockRejectedValue(new Error('relation "StoreEmailCopyOverride" does not exist'));
    const { html, repairs } = await service.renderReceipt('s1', input());
    expect(html).toContain('Café');
    expect(repairs.join(' ')).toContain('kit lookup failed');
    // Logged where it happens: the receipt sender keeps only the html and the subject.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kit lookup failed for s1'));
  });

  it("links the store's name and logo to its address: the active custom domain, else its pagosYa page", async () => {
    expect((await harness().renderReceipt('s1', input())).html).toContain('href="https://pagar.bo/s/cafe"');
    expect((await harness({ domains: [{ hostname: 'tienda.bo' }] }).renderReceipt('s1', input())).html).toContain('href="https://tienda.bo"');
  });

  it('resolves brand colours before filling the order, so buyer text is never rewritten', async () => {
    const { html } = await harness().renderReceipt('s1', input({ customerName: 'Ana var(--brand-accent)' }));
    expect(html).toContain('Hola Ana var(--brand-accent),');
    expect(html.replace('var(--brand-accent),', '')).not.toContain('var(--');
  });

  it("gives a stand-in block the store layout's colours when the brand has none confirmed", async () => {
    const floor = await loadFloorKit();
    const dark = { id: 'dark', layout: '<html><body style="background:#000000;color:#ffffff"><table><tr><td data-email-content style="background:#111111;color:#eeeeee"></td></tr></table></body></html>',
      blocks: ['heading', 'button', 'note'].map(b => floor.blocks[b as 'heading']).join(''), copy: {} };
    expect((await harness({ kit: dark, brand: [] }).renderReceipt('s1', input())).html).toContain('color:#eeeeee;background:#111111');
    // A confirmed brand colour still wins over the layout's.
    expect((await harness({ kit: dark, brand: [{ field: 'foreground', value: '#222222' }] }).renderReceipt('s1', input())).html).toContain('color:#222222;background:#111111');
  });

  it('checks a kit once and reuses the result for later receipts', async () => {
    const floor = await loadFloorKit();
    const kit = { id: 'k-cache', layout: floor.layout!, blocks: Object.values(floor.blocks).join(''), copy: {} };
    const spy = jest.spyOn(validate, 'validateEmailKit');
    const service = harness({ kit });
    await service.renderReceipt('s1', input());
    await service.renderReceipt('s1', input());
    expect(spy.mock.calls.filter(([raw]) => raw.layout === kit.layout && raw.blocks === kit.blocks)).toHaveLength(1);
    spy.mockRestore();
  });

  it('a null store gets the standard kit', async () => {
    expect((await harness().renderReceipt(null, input())).html).toContain('Café');
  });

  it('the sample uses the store\'s own products when it has some', async () => {
    const sample = await harness().sampleReceipt('s1', 'Café Illimani', 'order_confirmation');
    expect(sample.lines[0]).toMatchObject({ paymentLinkId: 'pl_1', name: 'Café', quantity: 1, amount: '50.00 BOB' });
    // Real prices, in the same form a real receipt uses, so the preview never shows a made-up total.
    expect(sample.total).toBe('50.00 BOB');
    expect((await harness().sampleReceipt('s1', 'Café', 'appointment_confirmed')).appointment).not.toBeNull();
  });

  describe('the rich receipt', () => {
    const vuelve = { id: 'p2', code: 'VUELVE10', discountType: 'PERCENT', discountValue: 10 };

    it('the latest shared code goes out by default, with its discount read from the code', async () => {
      const { html } = await harness({ promos: [vuelve] }).renderReceipt('s1', input());
      expect(html).toContain('VUELVE10');
      expect(html).toContain('10% en tu próxima compra');
    });

    it('a promo picked in Correos but since switched off or deactivated is not sent', async () => {
      // The query only returns active, shared codes, so a picked code missing from it is gone.
      const { html } = await harness({ promos: [], stored: { promo: { promoCodeId: 'p1' } } }).renderReceipt('s1', input());
      expect(html).not.toContain('VUELVE10');
      expect(html).not.toContain('próxima compra');
      const picked = await harness({ promos: [{ ...vuelve, id: 'p9', code: 'OTRO5' }, vuelve], stored: { promo: { promoCodeId: 'p2' } } }).renderReceipt('s1', input());
      expect(picked.html).toContain('VUELVE10');
      expect(picked.html).not.toContain('OTRO5');
    });

    it('the merchant can choose no promo at all', async () => {
      expect((await harness({ promos: [vuelve], stored: { promo: { promoCodeId: null } } }).renderReceipt('s1', input())).html).not.toContain('VUELVE10');
    });

    it('a per-email switch hides the promo on appointments only', async () => {
      const service = harness({ promos: [vuelve], stored: { emails: { appointment_confirmed: { promo: false } } } });
      expect((await service.renderReceipt('s1', input({ appointment: { name: 'Corte', date: '12/10/2026, 10:00' } }))).html).not.toContain('VUELVE10');
      expect((await service.renderReceipt('s1', input())).html).toContain('VUELVE10');
    });

    it("renders the merchant's announcement, or none when turned off", async () => {
      expect((await harness({ stored: { announcement: { text: 'Envío gratis todo octubre' } } }).renderReceipt('s1', input())).html).toContain('Envío gratis todo octubre');
      expect((await harness({ stored: { announcement: { off: true } } }).renderReceipt('s1', input())).html).not.toContain('Gracias por comprar en Café Illimani.</td>');
    });

    it('renders the delivery box and contact cards from real data', async () => {
      const { html } = await harness({ contact: { contactEmail: 'hola@cafe.bo', contactPhone: '+591 70000000', checkoutMode: 'whatsapp' } })
        .renderReceipt('s1', input({ delivery: { method: 'delivery', recipient: 'Ana', lines: ['Av. 1'] } }));
      expect(html).toContain('Envío a');
      expect(html).toContain('Av. 1');
      expect(html).toContain('hola@cafe.bo');
      expect(html).toContain('whatsapp-dark.png');
      expect(html).toContain('href="https://wa.me/59170000000"');
    });

    it("the merchant's hero photo wins, and only one of the store's uploads", async () => {
      const { html } = await harness({ stored: { heroImage: { url: '/v1/uploads/hero.webp' } } }).renderReceipt('s1', input());
      expect(html).toContain('https://api.example/v1/uploads/hero.webp');
    });

    it('a content lookup failure still sends the full email', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const service = harness({ promos: [vuelve] });
      (service as any).content.get.mockRejectedValue(new Error('relation "StoreEmailContent" does not exist'));
      const { html, repairs } = await service.renderReceipt('s1', input());
      expect(html).toContain('Café');
      expect(html).toContain('VUELVE10');
      expect(repairs.join(' ')).toContain('content lookup failed');
    });

    it('a store facts failure still sends the full email', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const service = harness();
      (service as any).prisma.promoCode.findMany.mockRejectedValue(new Error('column "showInEmails" does not exist'));
      const { html, repairs } = await service.renderReceipt('s1', input());
      expect(html).toContain('Café');
      expect(html).toContain('href="https://pagar.bo/s/cafe"');
      expect(repairs.join(' ')).toContain('context lookup failed');
    });

    it('the sample shows a delivery box', async () => {
      expect((await harness().sampleReceipt('s1', 'Café', 'order_confirmation')).delivery).toMatchObject({ method: 'delivery', recipient: 'Ana Quispe' });
    });
  });
});
