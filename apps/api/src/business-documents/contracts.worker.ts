import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { ContractsService } from "./contracts.service";

/**
 * Closes contracts past their signing deadline. Conditional and recorded once per version, so
 * several API instances may run it side by side (the public view also expires on read).
 */
@Injectable()
export class ContractsWorker {
  private readonly logger = new Logger(ContractsWorker.name);
  private running = false;

  constructor(private readonly contracts: ContractsService) {}

  @Interval("contracts-maintenance", 15 * 60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.contracts.expireOverdue();
      if (expired) this.logger.log(`Contracts: ${expired} expired`);
    } catch (error) {
      this.logger.warn(`Contracts maintenance failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
