import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { ProposalsService } from "./proposals.service";

/**
 * Closes proposals past their validity. Conditional and recorded once per version, so
 * several API instances may run it side by side (the public view also expires on read).
 */
@Injectable()
export class ProposalsWorker {
  private readonly logger = new Logger(ProposalsWorker.name);
  private running = false;

  constructor(private readonly proposals: ProposalsService) {}

  @Interval("proposals-maintenance", 15 * 60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.proposals.expireOverdue();
      if (expired) this.logger.log(`Proposals: ${expired} expired`);
    } catch (error) {
      this.logger.warn(`Proposals maintenance failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
