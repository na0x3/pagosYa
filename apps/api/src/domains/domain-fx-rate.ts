import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

/** The official boliviano rate for domain prices. Bolivia moved to a flexible regime in 2026, so the rate changes daily and a
 * fixed DOMAIN_BOB_PER_USD goes stale. The Banco Central de Bolivia publishes "Tipo de cambio oficial" with its date on its
 * home page (no JSON is offered), so this reads that card. Everything is fail-safe: a page that changed, a stale date, a
 * value outside a believable range or a jump of more than 5% is refused and the previous good rate (or the configured
 * fallback) stays in force. The rate lives in memory and is fetched again at start-up and every few hours. */
export const BCB_OFFICIAL_RATE_URL = 'https://www.bcb.gob.bo/';
export const FX_LIMITS = { minRate: 3, maxRate: 30, maxDailyMove: 0.05, maxAgeDays: 3, freshHours: 30, maxPageBytes: 2_000_000, timeoutMs: 10_000 } as const;

export type OfficialRate = { rate: number; date: string };
export type StoredOfficialRate = OfficialRate & { fetchedAt: Date };

/** Reads the rate and date of the "Tipo de cambio oficial" card, or null when the page is not what we expect. */
export function parseBcbOfficialRate(html: unknown): OfficialRate | null {
  if (typeof html !== 'string') return null;
  const start = html.indexOf('is-tc-oficial');
  if (start < 0) return null;
  const end = html.indexOf('</article>', start);
  const card = html.slice(start, end < 0 ? start + 2500 : end);
  const date = card.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/)?.[1];
  const text = card.match(/class="bcb-tco-num"[^>]*>\s*([^<]*?)\s*</)?.[1] ?? '';
  if (!date || Number.isNaN(Date.parse(date)) || !/^\d{1,3}(?:[.,]\d{1,4})?$/.test(text)) return null;
  return { rate: Number(text.replace(',', '.')), date };
}

export function validateOfficialRate(candidate: OfficialRate, previous: StoredOfficialRate | null, now: Date): { ok: true } | { ok: false; reason: string } {
  const { rate, date } = candidate;
  if (!Number.isFinite(rate) || rate < FX_LIMITS.minRate || rate > FX_LIMITS.maxRate) return { ok: false, reason: `rate ${rate} is outside the believable range (${FX_LIMITS.minRate}-${FX_LIMITS.maxRate} Bs per USD)` };
  const ageDays = (now.getTime() - Date.parse(date)) / 86_400_000;
  if (ageDays > FX_LIMITS.maxAgeDays) return { ok: false, reason: `the published date ${date} is too old` };
  if (ageDays < -1) return { ok: false, reason: `the published date ${date} is in the future` };
  // After a long outage the real rate may have moved more than a day's worth: only compare against a recent previous value.
  if (previous && now.getTime() - previous.fetchedAt.getTime() <= FX_LIMITS.maxAgeDays * 86_400_000) {
    const move = Math.abs(rate - previous.rate) / previous.rate;
    if (move > FX_LIMITS.maxDailyMove) return { ok: false, reason: `a jump of ${(move * 100).toFixed(1)}% from ${previous.rate} to ${rate} needs a human look` };
  }
  return { ok: true };
}

let latest: StoredOfficialRate | null = null;
export const setOfficialRate = (rate: OfficialRate, fetchedAt = new Date()) => { latest = { ...rate, fetchedAt }; };
export const latestOfficialRate = () => latest;
export const resetOfficialRateForTests = () => { latest = null; };

/** The rate to price with: the live official one while it is fresh, otherwise the configured fallback (0 when there is none). */
export function effectiveBobPerUsd(fallback: number, now = new Date()): number {
  return latest && now.getTime() - latest.fetchedAt.getTime() <= FX_LIMITS.freshHours * 3_600_000 ? latest.rate : fallback;
}

@Injectable()
export class DomainFxRefresher implements OnModuleInit {
  private readonly logger = new Logger(DomainFxRefresher.name);
  constructor(private readonly config: ConfigService) {}

  onModuleInit() { void this.refresh(); }

  @Interval(6 * 60 * 60_000)
  async tick() { await this.refresh(); }

  /** Never throws: a failure keeps the previous rate. */
  async refresh(fetcher: typeof fetch = fetch, now = new Date()): Promise<'updated' | 'skipped' | 'failed'> {
    const settings = this.config.get<{ enabled?: boolean; fxSource?: string }>('app.domainCommerce');
    if (!settings?.enabled || settings.fxSource === 'env') return 'skipped';
    const fail = (reason: string) => { this.logger.warn(`Official BOB rate not updated: ${reason}. Keeping ${latest ? `${latest.rate} (${latest.date})` : 'the configured fallback'}.`); return 'failed' as const; };
    try {
      const response = await fetcher(BCB_OFFICIAL_RATE_URL, { headers: { 'user-agent': 'pagosYa/1.0 (tipo de cambio oficial)' }, signal: AbortSignal.timeout(FX_LIMITS.timeoutMs), redirect: 'follow' });
      if (!response.ok) return fail(`the BCB answered ${response.status}`);
      if (!(response.headers.get('content-type') ?? '').includes('text/html')) return fail('the BCB answered with something that is not a web page');
      const html = await response.text();
      if (html.length > FX_LIMITS.maxPageBytes) return fail('the page is unexpectedly large');
      const parsed = parseBcbOfficialRate(html);
      if (!parsed) return fail('the page no longer shows the official rate where expected');
      const verdict = validateOfficialRate(parsed, latest, now);
      if (!verdict.ok) return fail(verdict.reason);
      setOfficialRate(parsed, now);
      this.logger.log(`Official BOB rate for ${parsed.date}: ${parsed.rate} Bs per USD`);
      return 'updated';
    } catch (error) { return fail((error as Error).message.slice(0, 200)); }
  }
}
