import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementHoldService } from "../settlement/settlement-hold.service";
import { PayoutsService } from "./payouts.service";

/** Generous: the batch normally takes seconds. If it ever overruns, Prisma rolls the lock holder back and run() logs it. */
const BATCH_LOCK_TIMEOUT_MS = 30 * 60_000;

/** The one daily payout batch, 10:00 La Paz (ASFI sub-project 3). PayoutDeliveryWorker then delivers and retries what this creates. */
@Injectable()
export class PayoutScheduleJob {
  private readonly logger = new Logger(PayoutScheduleJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holds: SettlementHoldService,
    private readonly payouts: PayoutsService,
  ) {}

  /**
   * The cron fires on every API replica at the same instant; only the one that wins the advisory lock runs the batch.
   * The lock is transaction-scoped (pg_try_advisory_xact_lock) and held by a transaction that stays open while the
   * batch runs on other pooled connections: a session-level pg_advisory_lock/unlock pair could land on two different
   * pooled connections and leave the lock stuck. Commit — or a crash dropping the connection — releases it.
   */
  @Cron("0 10 * * *", { name: "daily-payout-batch", timeZone: "America/La_Paz" })
  async run(now = new Date()): Promise<void> {
    try {
      const ran = await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('daily-payout-batch')) AS locked`;
          if (!lock?.locked) return false;
          await this.batch(now);
          return true;
        },
        { timeout: BATCH_LOCK_TIMEOUT_MS },
      );
      if (!ran) this.logger.log("Daily payout batch is already running on another instance; skipping");
    } catch (error) {
      this.logger.error(`Daily payout batch failed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  private async batch(now: Date): Promise<void> {
    try {
      const moved = await this.holds.releaseDue(now);
      if (moved > 0) this.logger.log(`Released ${moved} settlement hold stage(s)`);
    } catch (error) {
      // Money already available must not wait a day because the release failed.
      this.logger.error(`Settlement release failed; paying out what is already available: ${(error as Error).message}`);
    }
    try {
      await this.payouts.createDuePayouts();
    } catch (error) {
      this.logger.error(`Creating due payouts failed: ${(error as Error).message}`, (error as Error).stack);
    }
  }
}
