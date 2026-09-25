import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StoreAnalyticsService } from './store-analytics.service';

const PRUNE_EVERY_MS = 6 * 3_600_000;

/**
 * Every 15 minutes: rebuild yesterday's and today's rollups (the last 7 days on the first tick after a start, so a
 * day or more of downtime heals), and at most every 6 hours prune raw events past 13 months. The rollup holds a
 * Postgres advisory lock and the prune is idempotent, so several API instances may run it side by side.
 */
@Injectable()
export class StoreAnalyticsWorker {
  private readonly logger = new Logger(StoreAnalyticsWorker.name);
  private running = false;
  private started = false;
  private prunedAt = 0;
  /** The clock, replaceable in tests. */
  now = () => Date.now();

  constructor(private readonly analytics: StoreAnalyticsService) {}

  @Interval('store-analytics-rollup', 15 * 60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.now();
      await this.analytics.rollup({ now: new Date(now), days: this.started ? 2 : 7 });
      this.started = true;
      if (now - this.prunedAt >= PRUNE_EVERY_MS) {
        this.prunedAt = now;
        const removed = await this.analytics.prune(new Date(now));
        if (removed) this.logger.log(`Analytics: pruned ${removed} raw event(s) older than 13 months`);
      }
    } catch (error) {
      this.logger.warn(`Analytics rollup failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
