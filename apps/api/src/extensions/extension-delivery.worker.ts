import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExtensionDeliveryService } from './extension-delivery.service';

/** One batch at a time per API process; a slow provider never blocks a checkout, only this loop. */
@Injectable()
export class ExtensionDeliveryWorker {
  private busy = false;
  private lastCleanup = 0;
  constructor(private readonly deliveries: ExtensionDeliveryService) {}

  @Interval(2000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.deliveries.runOnce();
      if (Date.now() - this.lastCleanup > 24 * 60 * 60_000) { this.lastCleanup = Date.now(); await this.deliveries.cleanup(); }
    } catch { /* The next tick retries; per-delivery failures are recorded on the row. */ }
    finally { this.busy = false; }
  }
}
