import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { CobrosService } from "./cobros.service";

/**
 * Marks cobros overdue and sends the automatic reminders (due day, 3 days late).
 * Every step is conditional or claimed with a dedupeKey, so several API instances
 * may run it side by side.
 */
@Injectable()
export class CobrosWorker {
  private readonly logger = new Logger(CobrosWorker.name);
  private running = false;

  constructor(private readonly cobros: CobrosService) {}

  @Interval("cobros-maintenance", 15 * 60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { overdue, reminders } = await this.cobros.runMaintenance();
      if (overdue || reminders) this.logger.log(`Cobros: ${overdue} marked overdue, ${reminders} reminder(s) sent`);
    } catch (error) {
      this.logger.warn(`Cobros maintenance failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
