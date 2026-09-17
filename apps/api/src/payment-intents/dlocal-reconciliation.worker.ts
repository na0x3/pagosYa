import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import { PrismaService } from "../prisma/prisma.service";
import { DlocalAdapter } from "../rails/adapters/dlocal/dlocal.adapter";
import { PaymentIntentsService } from "./payment-intents.service";

const PROCESSING_STALE_MS = 15 * 60_000;
const ACTION_STALE_MS = 60 * 60_000;
const UNRESOLVABLE_ESCALATION_MS = 6 * 60 * 60_000;

/**
 * Safety net for missed dLocal webhooks. Intents whose authorize call timed out
 * carry "order:<id>" instead of a dLocal id and can only be resolved by the
 * webhook, so tick skips them and escalateUnresolvable hands them to ops after 6 hours.
 */
@Injectable()
export class DlocalReconciliationWorker {
  private readonly logger = new Logger(DlocalReconciliationWorker.name);
  private cursor: { updatedAt: Date; id: string } | null = null;
  private readonly failures = new Map<string, number>();
  private readonly unresolvableLogged = new Set<string>();
  private readonly escalated = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: DlocalAdapter,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  /**
   * An intent whose authorize call timed out carries "order:<id>" (or has no
   * attempt row at all) and can only be resolved by a webhook. If none arrives
   * within 6 hours the shopper may have paid without us knowing, so ops gets a
   * case. Logged once per intent per process; the case is deduplicated by the
   * intent id in its summary, which also survives restarts.
   */
  @Interval("dlocal-unresolvable-escalation", 60 * 60_000)
  async escalateUnresolvable(now: Date = new Date()): Promise<void> {
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        railId: "dlocal",
        status: { in: ["PROCESSING", "REQUIRES_ACTION"] },
        updatedAt: { lt: new Date(now.getTime() - UNRESOLVABLE_ESCALATION_MS) },
        OR: [
          { transactions: { none: { type: "AUTHORIZATION" } } },
          { transactions: { some: { type: "AUTHORIZATION", railReference: { startsWith: "order:" } } } },
        ],
        ...(this.escalated.size ? { id: { notIn: [...this.escalated] } } : {}),
      },
      select: {
        id: true,
        merchantId: true,
        status: true,
        transactions: { where: { type: "AUTHORIZATION" }, orderBy: { createdAt: "desc" }, take: 1, select: { railReference: true } },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 50,
    });

    for (const intent of intents) {
      const reference = intent.transactions[0]?.railReference;
      if (this.escalated.has(intent.id)) continue;
      if (reference && !reference.startsWith("order:")) continue; // the regular tick can poll this one
      if (!this.unresolvableLogged.has(intent.id)) {
        this.unresolvableLogged.add(intent.id);
        this.logger.error(`dLocal intent ${intent.id} has been ${intent.status} for over 6 hours with no dLocal payment id (${reference ?? "no attempt recorded"}); needs manual review`);
      }
      try {
        await openOpsCaseOnce(this.prisma, {
          merchantId: intent.merchantId,
          dedupeKey: intent.id,
          summary: `Cobro internacional ${intent.id} sin respuesta de dLocal por más de 6 horas (${intent.status}). No sabemos si el comprador pagó: buscar el order_id ${intent.id} en dLocal y conciliar.`,
        });
        this.escalated.add(intent.id);
      } catch (error) {
        this.logger.warn(`Could not open a support case for dLocal intent ${intent.id}: ${(error as Error).message}`);
      }
    }
  }

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
