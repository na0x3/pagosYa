import { ServiceUnavailableException } from '@nestjs/common';
import { DomainFxRate } from './domain-fx-rate';
import { assertDomainCommerceReady } from './domain-commerce.config';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const row = (over: object = {}) => ({ moneda: 'USD', casa: 'oficial', nombre: 'Oficial', compra: 6.8, venta: 6.96, fechaActualizacion: hoursAgo(1), ...over });
const reply = (rows: unknown, ok = true, status = 200) => ({ ok, status, json: async () => rows }) as Response;
const make = (settings: object = {}) => new DomainFxRate({ get: () => settings } as any);

describe('DomainFxRate', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => { fetchMock = jest.spyOn(globalThis, 'fetch'); });
  afterEach(() => jest.restoreAllMocks());

  it('picks the USD oficial venta rate', async () => {
    fetchMock.mockResolvedValue(reply([row({ moneda: 'EUR', venta: 9 }), row({ casa: 'binance', venta: 9.5 }), row()]));
    const fx = make(); await fx.refresh();
    expect(fx.current()).toBe(6.96); expect(fx.source()).toBe('live');
    expect(fetchMock.mock.calls[0][0]).toBe('https://bo.dolarapi.com/v1/dolares');
  });
  it('selects binance through the configured source', async () => {
    fetchMock.mockResolvedValue(reply([row(), row({ casa: 'binance', venta: 9.5 })]));
    const fx = make({ fxSource: 'binance' }); await fx.refresh();
    expect(fx.current()).toBe(9.5);
  });
  it.each([[4.99], [30.01], [NaN], ['7'], [null]])('rejects out-of-range or non-numeric venta %p', async venta => {
    fetchMock.mockResolvedValue(reply([row({ venta })]));
    const fx = make(); await fx.refresh();
    expect(fx.source()).toBe('none'); expect(fx.current()).toBe(0);
  });
  it('rejects stale or unreadable dates, with a tighter window for binance', async () => {
    for (const [settings, r] of [[{}, row({ fechaActualizacion: hoursAgo(80) })], [{}, row({ fechaActualizacion: 'nope' })], [{ fxSource: 'binance' }, row({ casa: 'binance', fechaActualizacion: hoursAgo(30) })]] as const) {
      fetchMock.mockResolvedValue(reply([r]));
      const fx = make(settings); await fx.refresh();
      expect(fx.source()).toBe('none');
    }
    fetchMock.mockResolvedValue(reply([row({ fechaActualizacion: hoursAgo(60) })]));
    const fx = make(); await fx.refresh(); expect(fx.current()).toBe(6.96);
  });
  it('rejects a move above 5% and keeps the previous value; accepts one within 5%', async () => {
    const fx = make();
    fetchMock.mockResolvedValue(reply([row({ venta: 10 })])); await fx.refresh();
    fetchMock.mockResolvedValue(reply([row({ venta: 10.6 })])); await fx.refresh();
    expect(fx.current()).toBe(10);
    fetchMock.mockResolvedValue(reply([row({ venta: 10.4 })])); await fx.refresh();
    expect(fx.current()).toBe(10.4);
  });
  it('falls back to the env rate until a live value exists, then to none', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const withEnv = make({ bobPerUsd: 7 }); await withEnv.refresh();
    expect(withEnv.current()).toBe(7); expect(withEnv.source()).toBe('env');
    expect(make({ bobPerUsd: 0 }).current()).toBe(0);
    expect(make().source()).toBe('none');
    fetchMock.mockResolvedValue(reply([row()])); await withEnv.refresh();
    expect(withEnv.current()).toBe(6.96);
  });
  it.each([
    ['network error', () => fetchMock.mockRejectedValue(new Error('ECONNRESET'))],
    ['timeout', () => fetchMock.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))],
    ['non-200', () => fetchMock.mockResolvedValue(reply({}, false, 503))],
    ['malformed JSON', () => fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } } as unknown as Response)],
    ['non-array body', () => fetchMock.mockResolvedValue(reply({ a: 1 }))],
    ['missing entry', () => fetchMock.mockResolvedValue(reply([row({ moneda: 'EUR' })]))],
  ])('never throws out of refresh on %s and keeps the last value', async (_name, arrange) => {
    const fx = make(); fetchMock.mockResolvedValue(reply([row()])); await fx.refresh();
    arrange();
    await expect(fx.refresh()).resolves.toBeUndefined();
    expect(fx.current()).toBe(6.96);
  });
  it('does not fetch at startup under test, so specs stay offline', async () => {
    await make().onModuleInit(); expect(fetchMock).not.toHaveBeenCalled();
  });
  const feed = async (fx: DomainFxRate, venta: number, over: object = {}) => { fetchMock.mockResolvedValue(reply([row({ venta, ...over })])); await fx.refresh(); };

  describe('sustained moves', () => {
    it('accepts a new level after three agreeing rejected values, and resets the reference', async () => {
      const fx = make(); await feed(fx, 10);
      await feed(fx, 11); await feed(fx, 11.05); expect(fx.current()).toBe(10);
      await feed(fx, 11.02); expect(fx.current()).toBe(11.02);
      await feed(fx, 11.4); expect(fx.current()).toBe(11.4); // within 5% of the new reference
    });
    it('does not accept three rejected values that disagree by more than 1%', async () => {
      const fx = make(); await feed(fx, 10);
      await feed(fx, 11); await feed(fx, 11.5); await feed(fx, 12); expect(fx.current()).toBe(10);
    });
    it('an accepted fetch resets the pending candidates', async () => {
      const fx = make(); await feed(fx, 10);
      await feed(fx, 11); await feed(fx, 11); await feed(fx, 10.1); // normal fetch breaks the streak
      await feed(fx, 11); expect(fx.current()).toBe(10.1);
      await feed(fx, 11); expect(fx.current()).toBe(10.1);
      await feed(fx, 11); expect(fx.current()).toBe(11);
    });
  });
  describe('first-value anchor', () => {
    it('rejects a first live value more than 25% from the env value', async () => {
      const fx = make({ bobPerUsd: 7 }); await feed(fx, 9.0);
      expect(fx.source()).toBe('env'); expect(fx.current()).toBe(7);
      await feed(fx, 8.75); expect(fx.current()).toBe(8.75); // exactly 25%
    });
    it('applies only range and date checks without an env value', async () => {
      const fx = make(); await feed(fx, 29); expect(fx.current()).toBe(29);
    });
    it('does not anchor later values to env', async () => {
      const fx = make({ bobPerUsd: 7 }); await feed(fx, 8);
      await feed(fx, 8.3); expect(fx.current()).toBe(8.3);
    });
  });
  describe('expiry', () => {
    it('expires 7 days after acceptance, then uses env, then none', async () => {
      const t0 = Date.now(); const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
      const withEnv = make({ bobPerUsd: 7 }), bare = make();
      await feed(withEnv, 6.96); await feed(bare, 6.96);
      now.mockReturnValue(t0 + 7 * 86400_000 - 1000);
      expect(withEnv.current()).toBe(6.96);
      now.mockReturnValue(t0 + 7 * 86400_000);
      expect(withEnv.current()).toBe(7); expect(withEnv.source()).toBe('env');
      expect(bare.current()).toBe(0); expect(bare.source()).toBe('none');
    });
    it('a successful refresh renews the expiry', async () => {
      const t0 = Date.now(); const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
      const fx = make(); await feed(fx, 6.96);
      now.mockReturnValue(t0 + 6 * 86400_000);
      await feed(fx, 6.96, { fechaActualizacion: new Date(t0 + 6 * 86400_000).toISOString() });
      now.mockReturnValue(t0 + 10 * 86400_000); expect(fx.current()).toBe(6.96);
    });
  });
  describe('minor validations', () => {
    it('rejects a fechaActualizacion more than 5 minutes ahead, accepts one just ahead', async () => {
      const fx = make(); await feed(fx, 7, { fechaActualizacion: new Date(Date.now() + 10 * 60_000).toISOString() });
      expect(fx.source()).toBe('none');
      await feed(fx, 7, { fechaActualizacion: new Date(Date.now() + 60_000).toISOString() });
      expect(fx.current()).toBe(7);
    });
    it('requires venta >= compra when both are numbers', async () => {
      const fx = make(); await feed(fx, 6.9, { compra: 7 }); expect(fx.source()).toBe('none');
      await feed(fx, 7, { compra: 7 }); expect(fx.current()).toBe(7);
      const other = make(); await feed(other, 6.9, { compra: null }); expect(other.current()).toBe(6.9);
    });
    it('rounds the accepted rate to 4 decimals', async () => {
      const fx = make(); await feed(fx, 6.963456); expect(fx.current()).toBe(6.9635);
    });
    it('accepts exactly 5.00 and 30.00', async () => {
      const a = make(); await feed(a, 5, { compra: 4.9 }); expect(a.current()).toBe(5);
      const b = make(); await feed(b, 30); expect(b.current()).toBe(30);
    });
    it('accepts exactly a 5% move and rejects just over', async () => {
      const fx = make(); await feed(fx, 10);
      await feed(fx, 10.5); expect(fx.current()).toBe(10.5);
      const other = make(); await feed(other, 10); await feed(other, 10.51); expect(other.current()).toBe(10);
    });
    it('binance accepts positive within 1 day, rejects beyond', async () => {
      const fx = make({ fxSource: 'binance' });
      fetchMock.mockResolvedValue(reply([row({ casa: 'binance', venta: 9.5, fechaActualizacion: hoursAgo(23) })])); await fx.refresh();
      expect(fx.current()).toBe(9.5);
    });
    it('a rejected refresh after a live value does not fall back to env', async () => {
      const fx = make({ bobPerUsd: 7 }); await feed(fx, 7.5);
      await feed(fx, 4); expect(fx.current()).toBe(7.5); expect(fx.source()).toBe('live');
    });
  });
  describe('startup', () => {
    it('in a non-test mode fires refresh without awaiting it', () => {
      const fx = make(); fx.skipBootFetch = false;
      let release!: () => void;
      const refresh = jest.spyOn(fx, 'refresh').mockReturnValue(new Promise<void>(r => { release = r; }));
      expect(fx.onModuleInit()).toBeUndefined();
      expect(refresh).toHaveBeenCalledTimes(1);
      release();
    });
    it('swallows a refresh rejection at startup', async () => {
      const fx = make(); fx.skipBootFetch = false;
      jest.spyOn(fx, 'refresh').mockRejectedValue(new Error('boom'));
      expect(() => fx.onModuleInit()).not.toThrow();
      await new Promise(r => setImmediate(r));
    });
  });
  describe('readiness with the rate', () => {
    const live = { enabled: true, sandbox: true, username: 'u', token: 't', platformMerchantId: 'm', bobPerUsd: 0, markupPercent: 20 };
    const cfg = { get: (k: string) => k === 'app.domainCommerce' ? live : undefined } as any;
    it('none yields the 503 for search/quote/checkout, but fulfilment readiness passes', () => {
      const fx = make(); expect(fx.source()).toBe('none');
      expect(() => assertDomainCommerceReady(cfg, fx.current())).toThrow(ServiceUnavailableException);
      expect(() => assertDomainCommerceReady(cfg, fx.current(), { skipRate: true })).not.toThrow();
    });
    it('fulfilment readiness still checks enabled and credentials', () => {
      const off = { get: () => ({ ...live, enabled: false }) } as any;
      expect(() => assertDomainCommerceReady(off, 0, { skipRate: true })).toThrow(ServiceUnavailableException);
      const noToken = { get: () => ({ ...live, token: '' }) } as any;
      expect(() => assertDomainCommerceReady(noToken, 0, { skipRate: true })).toThrow(ServiceUnavailableException);
    });
  });
});
