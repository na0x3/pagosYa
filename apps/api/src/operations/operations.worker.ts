import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsService } from "./operations.service";

@Injectable()
export class OperationsWorker {
  private readonly logger = new Logger(OperationsWorker.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly operations: OperationsService) {}

  @Interval("operations-maintenance", 15 * 60 * 1000)
  async maintain() {
    if (this.running) return;
    this.running = true;
    try {
      const stores = await this.prisma.store.findMany({ select: { id: true, merchantId: true } });
      for (const store of stores) {
        const generation = await Promise.allSettled([
          this.operations.runAutomations(store.merchantId, store.id),
          this.operations.generateSubscriptionInvoices(store.merchantId, store.id),
        ]);
        if (generation[1].status === "fulfilled") {
          await this.operations.sendDueSubscriptionReminders(store.merchantId, store.id).catch((error: Error) => {
            this.logger.warn(`Subscription reminders failed for ${store.id}: ${error.message}`);
          });
        }
      }
      await this.operations.releaseExpiredAppointmentHolds();
    } catch (error) {
      this.logger.error(`Operations maintenance failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
