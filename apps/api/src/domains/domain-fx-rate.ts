import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

export const DOLARAPI_URL = 'https://bo.dolarapi.com/v1/dolares';
export const FX_REFRESH_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MIN_BOB_PER_USD = 5;
const MAX_BOB_PER_USD = 30;
const MAX_MOVE = 0.05;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS: Record<FxSource, number> = { oficial: 3 * DAY_MS, binance: DAY_MS };

export type FxSource = 'oficial' | 'binance';
export type FxRateOrigin = 'live' | 'env' | 'none';

/**
 * BOB per USD for domain pricing. Live value from DolarApi (kept in memory only),
 * then the operator's DOMAIN_BOB_PER_USD, then 0 — which keeps the shop closed
 * (assertDomainCommerceReady) instead of pricing with a wrong number.
 */
@Injectable()
export class DomainFxRate implements OnModuleInit {
  private readonly logger = new Logger(DomainFxRate.name);
  private live: number | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    // Tests must never depend on the network; they set the rate through config.
    if (process.env.NODE_ENV === 'test') return;
    await this.refresh();
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
      if (rate !== null) { this.live = rate; this.logger.log(`BOB per USD (${source}): ${rate}`); }
    } catch (error) {
      this.logger.warn(`Could not refresh the BOB/USD rate: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  current(): number {
    if (this.live !== null) return this.live;
    const env = Number(this.config.get<{ bobPerUsd?: number }>('app.domainCommerce')?.bobPerUsd ?? 0);
    return Number.isFinite(env) && env > 0 ? env : 0;
  }

  source(): FxRateOrigin {
    if (this.live !== null) return 'live';
    return this.current() > 0 ? 'env' : 'none';
  }

  private source_(): FxSource {
    const value = this.config.get<{ fxSource?: string }>('app.domainCommerce')?.fxSource;
    return value === 'binance' ? 'binance' : 'oficial';
  }

  private validate(row: any, source: FxSource): number | null {
    const rate = Number(row.venta);
    if (typeof row.venta !== 'number' || !Number.isFinite(rate) || rate < MIN_BOB_PER_USD || rate > MAX_BOB_PER_USD) {
      this.logger.warn(`Rejected BOB/USD rate ${String(row.venta)}: outside ${MIN_BOB_PER_USD}-${MAX_BOB_PER_USD}`);
      return null;
    }
    const updated = Date.parse(row.fechaActualizacion);
    if (!Number.isFinite(updated) || Date.now() - updated > MAX_AGE_MS[source]) {
      this.logger.warn(`Rejected BOB/USD rate ${rate}: stale or unreadable fechaActualizacion`);
      return null;
    }
    if (this.live !== null && Math.abs(rate - this.live) / this.live > MAX_MOVE) {
      this.logger.warn(`Rejected BOB/USD rate ${rate}: moves more than 5% from ${this.live}`);
      return null;
    }
    return rate;
  }
}
