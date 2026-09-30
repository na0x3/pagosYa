import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DomainOrder } from '@prisma/client';
import { assertDomainCommerceReady, domainPrice } from './domain-commerce.config';
import { paidDomainOrder, purchasableHostname, supported } from './domain-commerce.service';
import { NamecomProvider } from './namecom.provider';
import { CloudflareHostingProvider } from './cloudflare-hosting.provider';

const settings = { sandbox: true, username: 'test-user', token: 'test-token', bobPerUsd: 7, markupPercent: 20, cloudflareToken: 'cf-test', cloudflareZoneId: 'zone' };
const config = { get: () => settings } as any;
describe('Domain commerce boundaries', () => {
  describe('supported registrar rows', () => {
    const base = { domainName: 'foo.com', purchasable: true, purchaseType: 'registration', purchasePrice: 17.99, renewalPrice: 19.99 };
    it('accepts an ordinary name whose response omits the premium flag (as Name.com does)', () => {
      expect(supported(base as any)).toBe(true);
      expect(supported({ ...base, premium: false } as any)).toBe(true);
    });
    it('rejects premium, unpurchasable, non-registration and unpriced rows', () => {
      expect(supported({ ...base, premium: true } as any)).toBe(false);
      expect(supported({ ...base, purchasable: false } as any)).toBe(false);
      expect(supported({ ...base, purchaseType: 'transfer' } as any)).toBe(false);
      expect(supported({ ...base, purchasePrice: 0 } as any)).toBe(false);
      expect(supported(undefined)).toBe(false);
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it.each(['foo.bo', 'www.foo.com', 'https://foo.com', 'xn--maana-pta.com', 'foo.com/x', '-bad.com', 'a'.repeat(64) + '.com'])('rejects unsupported registration %s', name => {
    expect(() => purchasableHostname(name)).toThrow(BadRequestException);
  });
  it('normalizes names and rounds the server price up to centavos', () => {
    expect(purchasableHostname(' My-Shop.COM ')).toBe('my-shop.com');
    expect(domainPrice(12.99, settings as any)).toBe(10912);
    expect(() => domainPrice(NaN, settings as any)).toThrow();
  });
  it('requires the platform recipient, exact amount and a real rail for a live registration', () => {
    const order = { amount: 10000, currency: 'BOB', sandbox: false } as DomainOrder;
    const payment = { amount: 10000, currency: 'BOB', status: 'SUCCEEDED', merchantId: 'platform', livemode: true, railId: 'baneco_qr' };
    expect(paidDomainOrder(order, payment, 'platform')).toBe(true);
    for (const patch of [{ amount: 1 }, { currency: 'USD' }, { merchantId: 'buyer' }, { livemode: false }, { railId: 'mock_qr' }, { status: 'PROCESSING' }]) {
      expect(paidDomainOrder(order, { ...payment, ...patch }, 'platform')).toBe(false);
    }
  });
  it('refuses live purchases until the storefront CNAME target is configured', () => {
    const live = { enabled: true, sandbox: false, username: 'u', token: 't', platformMerchantId: 'm', bobPerUsd: 7, markupPercent: 20, cloudflareToken: 'cf', cloudflareZoneId: 'zone' };
    const withTarget = (target: string) => ({ get: (key: string) => key === 'app.banecoQr.enabled' ? true : { ...live, target } }) as any;
    // Absent, this silently pointed real domains at the platform's default host.
    expect(() => assertDomainCommerceReady(withTarget(''))).toThrow(ServiceUnavailableException);
    expect(() => assertDomainCommerceReady(withTarget('edge.example.test'))).not.toThrow();
  });
  it('pins the sandbox URL, registration price, one-year term, contacts and idempotency key', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ order: 1 }) } as Response);
    const provider = new NamecomProvider(config);
    await provider.register('shop.com', { email: 'owner@example.test' } as any, 12.99, 'persistent-order-id');
    await provider.register('shop.com', { email: 'owner@example.test' } as any, 12.99, 'persistent-order-id');
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.dev.name.com/core/v1/domains');
    expect((init!.headers as any)['X-Idempotency-Key']).toBe('persistent-order-id');
    expect(JSON.parse(init!.body as string)).toMatchObject({ years: 1, purchasePrice: 12.99, domain: { autorenewEnabled: false, contacts: { registrant: { email: 'owner@example.test' } } } });
  });
  it('recovers DNS writes by reading before retrying and preserves unrelated records', async () => {
    const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ records: [{ id: 1, host: 'www', type: 'CNAME', answer: 'stores.pagosya.bo.' }, { id: 2, host: '', type: 'MX', answer: 'mail.example.com' }] }) } as Response);
    await new NamecomProvider(config).ensureRecord('shop.com', 'www', 'CNAME', 'stores.pagosya.bo');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('recovers a hosting create timeout by looking up the exact hostname first', async () => {
    const existing = { id: 'host1', hostname: 'shop.com', status: 'pending', ssl: { status: 'pending_validation' } };
    const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ success: true, result: [existing] }) } as Response);
    expect(await new CloudflareHostingProvider(config).ensure('shop.com')).toEqual(existing);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
