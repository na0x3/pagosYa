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
  private cursor: { updatedAt: Date; id: string } | null = null;
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: DlocalAdapter,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  @Interval("dlocal-reconciliation", 15 * 60_000)
  async tick(now: Date = new Date()): Promise<void> {
    const statusOrCondition = [
      { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - PROCESSING_STALE_MS) } },
      { status: "REQUIRES_ACTION", updatedAt: { lt: new Date(now.getTime() - ACTION_STALE_MS) } },
    ];

    let where: any = {
      railId: "dlocal",
      OR: statusOrCondition,
    };

    if (this.cursor) {
      where = {
        railId: "dlocal",
        AND: [
          { OR: statusOrCondition },
          {
            OR: [
              { updatedAt: { gt: this.cursor.updatedAt } },
              { updatedAt: this.cursor.updatedAt, id: { gt: this.cursor.id } },
            ],
          },
        ],
      };
    }

    const intents = await this.prisma.paymentIntent.findMany({
      where,
      select: { id: true, updatedAt: true, transactions: { orderBy: { createdAt: "desc" }, take: 1, select: { railReference: true } } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 50,
    });

    for (const intent of intents) {
      const reference = intent.transactions[0]?.railReference;
      if (!reference || reference.startsWith("order:")) {
        this.failures.delete(intent.id);
        continue;
      }
      try {
        const result = await this.adapter.getStatus(reference);
        if (result.status === "pending" || result.status === "requires_action") {
          this.failures.delete(intent.id);
          continue;
        }
        await this.paymentIntents.applyCallbackResult(intent.id, result, { railId: "dlocal" });
        this.failures.delete(intent.id);
      } catch (error) {
        const failureCount = (this.failures.get(intent.id) || 0) + 1;
        this.failures.set(intent.id, failureCount);
        const message = (error as Error).message;
        if (failureCount === 8) {
          this.logger.error(`dLocal reconciliation for ${intent.id} failed 8 times in a row; needs manual review: ${message}`);
        } else if (failureCount < 8) {
          this.logger.warn(`dLocal reconciliation for ${intent.id} failed: ${message}`);
        }
      }
    }

    if (intents.length === 50) {
      const lastIntent = intents[intents.length - 1];
      this.cursor = { updatedAt: lastIntent.updatedAt, id: lastIntent.id };
    } else {
      this.cursor = null;
    }
  }
}
