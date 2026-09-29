import {
  DomainFxRefresher, effectiveBobPerUsd, latestOfficialRate, parseBcbOfficialRate, resetOfficialRateForTests, setOfficialRate, validateOfficialRate,
} from './domain-fx-rate';
import { domainCommerceConfig, domainPrice } from './domain-commerce.config';

/** The card of the BCB home page that carries the official rate (copied from the live page, trimmed). */
const page = (rate = '12,02', date = '2026-09-29') => `<div class="bcb-kpis"><!-- 1) Tipo de cambio oficial automático --> <article class="bcb-kpi2-card is-tc-oficial"> <div class="bcb-kpi2-hd"> <p class="bcb-kpi2-name">Tipo de cambio oficial</p> <div class="bcb-kpi2-sub">Bolivianos por dólar estadounidense</div> <div class="bcb-kpi2-asof"> <time datetime="${date}">MARTES 29 DE SEPTIEMBRE, 2026</time> </div> </div> <div class="bcb-kpi2-body"> <div class="bcb-tco-value"> <div class="bcb-tco-amount"> <span class="bcb-tco-num">${rate}</span> </div> </div> </div> </article></div>`;
const now = new Date('2026-09-29T15:00:00Z');

afterEach(() => resetOfficialRateForTests());

describe('parseBcbOfficialRate', () => {
  it('reads the official rate and its date from the BCB page', () => {
    expect(parseBcbOfficialRate(page())).toEqual({ rate: 12.02, date: '2026-09-29' });
  });
  it('accepts a decimal point as well as a comma', () => {
    expect(parseBcbOfficialRate(page('6.96'))).toEqual({ rate: 6.96, date: '2026-09-29' });
  });
  it.each([
    ['a page without the card', '<html><body>hola</body></html>'],
    ['a rate that is not a number', page('n/d')],
    ['an empty rate', page('')],
    ['a missing date', page().replace(/<time[^>]*>[^<]*<\/time>/, '')],
    ['a malformed date', page('12,02', '29/09/2026')],
    ['a card that is not the official rate', page().replace('is-tc-oficial', 'is-otra-cosa')],
    ['not text', undefined as never],
  ])('returns null for %s', (_name, html) => {
    expect(parseBcbOfficialRate(html)).toBeNull();
  });
  it('does not read a rate from a different card that appears before the official one', () => {
    const other = '<article class="bcb-kpi2-card is-compra"><time datetime="2026-09-29">x</time><span class="bcb-tco-num">99,99</span></article>';
    expect(parseBcbOfficialRate(other + page())).toEqual({ rate: 12.02, date: '2026-09-29' });
  });
});

describe('validateOfficialRate', () => {
  const ok = { rate: 12.02, date: '2026-09-29' };
  it('accepts a sensible, fresh rate when there is no previous one', () => {
    expect(validateOfficialRate(ok, null, now)).toEqual({ ok: true });
  });
  it.each([[2.99], [30.01], [0], [-5], [Number.NaN], [Infinity]])('rejects the rate %s as outside any believable range', rate => {
    expect(validateOfficialRate({ rate, date: '2026-09-29' }, null, now)).toEqual({ ok: false, reason: expect.stringMatching(/range|rango/i) });
  });
  it('rejects a date older than three days, and one in the future', () => {
    expect(validateOfficialRate({ rate: 12.02, date: '2026-09-25' }, null, now)).toEqual({ ok: false, reason: expect.stringMatching(/old|antigu/i) });
    expect(validateOfficialRate({ rate: 12.02, date: '2026-09-27' }, null, now)).toEqual({ ok: true });
    expect(validateOfficialRate({ rate: 12.02, date: '2026-10-05' }, null, now)).toEqual({ ok: false, reason: expect.stringMatching(/future|futur/i) });
  });
  it('rejects a move of more than 5% from the last accepted rate and accepts one up to 5%', () => {
    const previous = { rate: 12.0, date: '2026-09-28', fetchedAt: new Date('2026-09-28T15:00:00Z') };
    expect(validateOfficialRate({ rate: 12.6, date: '2026-09-29' }, previous, now)).toEqual({ ok: true });
    expect(validateOfficialRate({ rate: 12.61, date: '2026-09-29' }, previous, now)).toEqual({ ok: false, reason: expect.stringMatching(/jump|salto|move/i) });
    expect(validateOfficialRate({ rate: 11.39, date: '2026-09-29' }, previous, now)).toEqual({ ok: false, reason: expect.stringMatching(/jump|salto|move/i) });
  });
});

describe('effectiveBobPerUsd', () => {
  it('uses the live rate while it is fresh, and the configured fallback once it is stale or absent', () => {
    expect(effectiveBobPerUsd(6.96, now)).toBe(6.96);
    setOfficialRate({ rate: 12.02, date: '2026-09-29' }, new Date('2026-09-29T14:00:00Z'));
    expect(effectiveBobPerUsd(6.96, now)).toBe(12.02);
    expect(effectiveBobPerUsd(0, now)).toBe(12.02);
    expect(effectiveBobPerUsd(6.96, new Date('2026-09-30T20:30:00Z'))).toBe(6.96);
    expect(effectiveBobPerUsd(0, new Date('2026-09-30T20:30:00Z'))).toBe(0);
  });
});

describe('the domain price follows the live rate', () => {
  const fakeConfig = (extra: Record<string, unknown> = {}) => ({ get: () => ({ enabled: true, sandbox: true, username: 'u', token: 't', platformMerchantId: 'm', bobPerUsd: 0, markupPercent: 10, cloudflareToken: '', cloudflareZoneId: '', target: '', ...extra }) }) as never;
  it('prices in bolivianos with the official rate and the markup, rounded up to centavos', () => {
    setOfficialRate({ rate: 12.02, date: '2026-09-29' }, new Date());
    const c = domainCommerceConfig(fakeConfig());
    expect(c.bobPerUsd).toBe(12.02);
    expect(domainPrice(10.99, c)).toBe(Math.ceil(10.99 * 12.02 * 1.1 * 100));
  });
  it('falls back to DOMAIN_BOB_PER_USD when there is no live rate, and can be forced to use only that', () => {
    expect(domainCommerceConfig(fakeConfig({ bobPerUsd: 6.96 })).bobPerUsd).toBe(6.96);
    setOfficialRate({ rate: 12.02, date: '2026-09-29' }, new Date());
    expect(domainCommerceConfig(fakeConfig({ bobPerUsd: 6.96, fxSource: 'env' })).bobPerUsd).toBe(6.96);
  });
});

describe('DomainFxRefresher', () => {
  const refresher = (config: Record<string, unknown> = { enabled: true, fxSource: 'bcb' }) => new DomainFxRefresher({ get: () => config } as never);
  const respond = (body: string, status = 200) => jest.fn(async () => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } }));

  it('stores the official rate it reads', async () => {
    expect(await refresher().refresh(respond(page()) as never, now)).toBe('updated');
    expect(latestOfficialRate()).toMatchObject({ rate: 12.02, date: '2026-09-29' });
  });
  it('keeps the previous good rate when the page cannot be read, is not a rate, or the request fails', async () => {
    const r = refresher();
    await r.refresh(respond(page()) as never, now);
    expect(await r.refresh(respond('<html>mantenimiento</html>') as never, now)).toBe('failed');
    expect(await r.refresh(respond('', 503) as never, now)).toBe('failed');
    expect(await r.refresh((async () => { throw new Error('timeout'); }) as never, now)).toBe('failed');
    expect(latestOfficialRate()!.rate).toBe(12.02);
  });
  it('refuses a suspicious jump and keeps the previous rate', async () => {
    const r = refresher();
    await r.refresh(respond(page('12,00')) as never, now);
    expect(await r.refresh(respond(page('14,50')) as never, now)).toBe('failed');
    expect(latestOfficialRate()!.rate).toBe(12);
  });
  it('does nothing when domain purchases are off or the rate is forced to the environment value', async () => {
    const fetcher = respond(page());
    expect(await refresher({ enabled: false, fxSource: 'bcb' }).refresh(fetcher as never, now)).toBe('skipped');
    expect(await refresher({ enabled: true, fxSource: 'env' }).refresh(fetcher as never, now)).toBe('skipped');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('never throws, even for a huge or non-text response', async () => {
    const r = refresher();
    expect(await r.refresh(respond('x'.repeat(3_000_000)) as never, now)).toBe('failed');
    expect(await r.refresh((async () => new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png' } })) as never, now)).toBe('failed');
  });
});
