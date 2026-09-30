import { DomainFxRate } from './domain-fx-rate';

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
});
