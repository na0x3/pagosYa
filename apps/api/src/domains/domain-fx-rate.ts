import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

export const DOLARAPI_URL = 'https://bo.dolarapi.com/v1/dolares';
export const FX_REFRESH_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MIN_BOB_PER_USD = 5;
const MAX_BOB_PER_USD = 30;
const MAX_MOVE = 0.05;
const MAX_ENV_ANCHOR_DRIFT = 0.25;
const CONFIRM_COUNT = 3;
const CONFIRM_AGREEMENT = 0.01;
const LIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const EPS = 1e-9;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS: Record<FxSource, number> = { oficial: 3 * DAY_MS, binance: DAY_MS };

export type FxSource = 'oficial' | 'binance';
export type FxRateOrigin = 'live' | 'env' | 'none';

/**
 * BOB per USD for domain pricing. Live value from DolarApi (kept in memory only),
 * then the operator's DOMAIN_BOB_PER_USD, then 0 — which keeps the shop closed
 * (assertDomainCommerceReady) instead of pricing with a wrong number.
 *
 * Guards: range, fechaActualizacion freshness, a 5% jump limit (three agreeing
 * rejected values in a row are accepted as a real move), a 25% anchor to the env
 * value for the first live value, and a 7-day expiry counted from acceptance.
 */
@Injectable()
export class DomainFxRate implements OnModuleInit {
  private readonly logger = new Logger(DomainFxRate.name);
  private live: { value: number; acceptedAt: number } | null = null;
  private pending: number[] = [];
  /** Tests must never depend on the network; they set the rate through config. Overridable for specs. */
  skipBootFetch = process.env.NODE_ENV === 'test';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (this.skipBootFetch) return;
    // Never hold up boot on the network; refresh() swallows its own errors.
    void this.refresh().catch(() => undefined);
  }

  @Interval(FX_REFRESH_MS)
  async refresh(): Promise<void> {
    try {
      const source = this.source_();
      const res = await fetch(DOLARAPI_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows: unknown = await res.json();
      if (!Array.isArray(rows)) throw new Error('unexpected payload');
      const row = rows.find((r: any) => r?.moneda === 'USD' && r?.casa === source);
      if (!row) throw new Error(`no USD/${source} entry`);
      const rate = this.validate(row, source);
      if (rate !== null) { this.live = { value: rate, acceptedAt: Date.now() }; this.logger.log(`BOB per USD (${source}): ${rate}`); }
    } catch (error) {
      this.logger.warn(`Could not refresh the BOB/USD rate: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  current(): number {
    const live = this.liveValue();
    if (live !== null) return live;
    return this.envRate();
  }

  source(): FxRateOrigin {
    if (this.liveValue() !== null) return 'live';
    return this.envRate() > 0 ? 'env' : 'none';
  }

  private liveValue(): number | null {
    if (this.live && Date.now() - this.live.acceptedAt >= LIVE_TTL_MS) {
      this.logger.warn('Live BOB/USD rate expired; falling back to the configured value');
      this.live = null; this.pending = [];
    }
    return this.live ? this.live.value : null;
  }

  private envRate(): number {
    const env = Number(this.config.get<{ bobPerUsd?: number }>('app.domainCommerce')?.bobPerUsd ?? 0);
    return Number.isFinite(env) && env > 0 ? env : 0;
  }

  private source_(): FxSource {
    const value = this.config.get<{ fxSource?: string }>('app.domainCommerce')?.fxSource;
    return value === 'binance' ? 'binance' : 'oficial';
  }

  private reject(message: string): null {
    this.pending = [];
    this.logger.warn(message);
    return null;
  }

  private validate(row: any, source: FxSource): number | null {
    const raw = Number(row.venta);
    if (typeof row.venta !== 'number' || !Number.isFinite(raw) || raw < MIN_BOB_PER_USD || raw > MAX_BOB_PER_USD) {
      return this.reject(`Rejected BOB/USD rate ${String(row.venta)}: outside ${MIN_BOB_PER_USD}-${MAX_BOB_PER_USD}`);
    }
    if (typeof row.compra === 'number' && Number.isFinite(row.compra) && raw < row.compra) {
      return this.reject(`Rejected BOB/USD rate ${raw}: venta is below compra ${row.compra}`);
    }
    const now = Date.now();
    const updated = Date.parse(row.fechaActualizacion);
    if (!Number.isFinite(updated) || now - updated > MAX_AGE_MS[source] || updated - now > FUTURE_SKEW_MS) {
      return this.reject(`Rejected BOB/USD rate ${raw}: stale, future or unreadable fechaActualizacion`);
    }
    const rate = Math.round(raw * 10_000) / 10_000;
    const live = this.liveValue();
    if (live === null) {
      const env = this.envRate();
      if (env > 0 && Math.abs(rate - env) / env > MAX_ENV_ANCHOR_DRIFT + EPS) {
        return this.reject(`Rejected BOB/USD rate ${rate}: more than 25% away from the configured ${env}`);
      }
    } else if (Math.abs(rate - live) / live > MAX_MOVE + EPS) {
      this.pending = [...this.pending, rate].slice(-CONFIRM_COUNT);
      const lo = Math.min(...this.pending), hi = Math.max(...this.pending);
      if (this.pending.length === CONFIRM_COUNT && (hi - lo) / lo <= CONFIRM_AGREEMENT + EPS) {
        this.logger.warn(`Accepting sustained BOB/USD move ${live} -> ${rate}`);
        this.pending = [];
        return rate;
      }
      this.logger.warn(`Rejected BOB/USD rate ${rate}: moves more than 5% from ${live}`);
      return null;
    }
    this.pending = [];
    return rate;
  }
}
