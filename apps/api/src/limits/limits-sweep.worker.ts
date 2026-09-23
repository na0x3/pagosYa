import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { LimitsService } from "./limits.service";

/**
 * Safety net for missed rail callbacks (see LimitsService.releaseStale):
 * without this, a live QR/bank-QR intent that never resolves would hold its
 * reserved limit room for the rest of the month.
 */
@Injectable()
export class LimitsSweepWorker {
  private readonly logger = new Logger(LimitsSweepWorker.name);

  constructor(private readonly limits: LimitsService) {}

  @Interval("limits-stale-reservations", 60 * 60_000)
  async tick(): Promise<void> {
    try {
      const released = await this.limits.releaseStale();
      if (released > 0) {
        this.logger.log(`Released ${released} stale limit reservation(s) held by unresolved live payments`);
      }
    } catch (error) {
      this.logger.warn(`Could not sweep stale limit reservations: ${(error as Error).message}`);
    }
  }
}
