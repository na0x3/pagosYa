import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsService } from "./operations.service";
import { SubscriptionsService } from "./subscriptions.service";
import { AppointmentsService } from "./appointments.service";

@Injectable()
export class OperationsWorker {
  private readonly logger = new Logger(OperationsWorker.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly operations: OperationsService, private readonly appointments: AppointmentsService, private readonly subscriptions: SubscriptionsService) {}

  @Interval("operations-maintenance", 15 * 60 * 1000)
  async maintain() {
    if (this.running) return;
    this.running = true;
    try {
      const stores = await this.prisma.store.findMany({ select: { id: true, merchantId: true } });
      for (const store of stores) {
        const generation = await Promise.allSettled([
          this.operations.runAutomations(store.merchantId, store.id),
          this.subscriptions.generateSubscriptionInvoices(store.merchantId, store.id),
        ]);
        for (const [label, outcome] of [["automations", generation[0]], ["subscription invoice generation", generation[1]]] as const) {
          if (outcome.status === "rejected") this.logger.warn(`${label} failed for ${store.id}: ${(outcome.reason as Error)?.message ?? outcome.reason}`);
        }
        // Independent of generation: a failure there must not leave reminders and missed renewals stuck.
        await this.subscriptions.sendDueSubscriptionReminders(store.merchantId, store.id).catch((error: Error) => {
          this.logger.warn(`Subscription reminders failed for ${store.id}: ${error.message}`);
        });
        await this.subscriptions.expireMissedRenewals(store.merchantId, store.id).catch((error: Error) => {
          this.logger.warn(`Missed renewals failed for ${store.id}: ${error.message}`);
        });
      }
      await this.appointments.releaseExpiredAppointmentHolds();
    } catch (error) {
      this.logger.error(`Operations maintenance failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
