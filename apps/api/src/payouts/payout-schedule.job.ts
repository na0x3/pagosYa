import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SettlementHoldService } from "../settlement/settlement-hold.service";
import { PayoutsService } from "./payouts.service";

/** The one daily payout batch, 10:00 La Paz (ASFI sub-project 3). PayoutDeliveryWorker then delivers and retries what this creates. */
@Injectable()
export class PayoutScheduleJob {
  private readonly logger = new Logger(PayoutScheduleJob.name);

  constructor(
    private readonly holds: SettlementHoldService,
    private readonly payouts: PayoutsService,
  ) {}

  @Cron("0 10 * * *", { name: "daily-payout-batch", timeZone: "America/La_Paz" })
  async run(now = new Date()): Promise<void> {
    try {
      const moved = await this.holds.releaseDue(now);
      if (moved > 0) this.logger.log(`Released ${moved} settlement hold stage(s)`);
    } catch (error) {
      // Money already available must not wait a day because the release failed.
      this.logger.error(`Settlement release failed; paying out what is already available: ${(error as Error).message}`);
    }
    await this.payouts.createDuePayouts();
  }
}
