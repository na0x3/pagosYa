import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { DlocalAdapter } from "../rails/adapters/dlocal/dlocal.adapter";
import { PaymentIntentsService } from "./payment-intents.service";

const PROCESSING_STALE_MS = 15 * 60_000;
const ACTION_STALE_MS = 60 * 60_000;

/**
 * Safety net for missed dLocal webhooks. Intents whose authorize call timed out
 * carry "order:<id>" instead of a dLocal id and can only be resolved by the
 * webhook, so they're skipped here.
 */
@Injectable()
export class DlocalReconciliationWorker {
  private readonly logger = new Logger(DlocalReconciliationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: DlocalAdapter,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  @Interval("dlocal-reconciliation", 15 * 60_000)
  async tick(now: Date = new Date()): Promise<void> {
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        railId: "dlocal",
        OR: [
          { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - PROCESSING_STALE_MS) } },
          { status: "REQUIRES_ACTION", updatedAt: { lt: new Date(now.getTime() - ACTION_STALE_MS) } },
        ],
      },
      select: { id: true, transactions: { orderBy: { createdAt: "desc" }, take: 1, select: { railReference: true } } },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });

    for (const intent of intents) {
      const reference = intent.transactions[0]?.railReference;
      if (!reference || reference.startsWith("order:")) continue;
      try {
        const result = await this.adapter.getStatus(reference);
        if (result.status === "pending" || result.status === "requires_action") continue;
        await this.paymentIntents.applyCallbackResult(intent.id, result, { railId: "dlocal" });
      } catch (error) {
        this.logger.warn(`dLocal reconciliation for ${intent.id} failed: ${(error as Error).message}`);
      }
    }
  }
}
