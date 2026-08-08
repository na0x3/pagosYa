import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The payout/invoice/webhook workers already persist every failure durably
 * (status FAILED, a reason, attempts, nextRetryAt) — nothing about a failed
 * delivery is silent at the data layer. What's actually missing is a place
 * for a human to see it: nothing surfaced these rows anywhere except a log
 * line, so a delivery that exhausts all retries (nextRetryAt goes back to
 * null once attempts hits the worker's MAX_ATTEMPTS) sits there forever
 * with nobody aware. This is that surface.
 */
@Injectable()
export class DeliveryFailuresService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [payouts, invoices, webhookEvents] = await Promise.all([
      this.prisma.payout.findMany({
        where: { status: "FAILED" },
        select: { id: true, merchantId: true, amount: true, currency: true, failureReason: true, attempts: true, nextRetryAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.invoice.findMany({
        where: { status: "FAILED" },
        select: { id: true, merchantId: true, amount: true, currency: true, failureReason: true, attempts: true, nextRetryAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.webhookEvent.findMany({
        where: { status: "FAILED" },
        select: { id: true, merchantId: true, eventType: true, lastResponseStatus: true, attempts: true, nextRetryAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    // nextRetryAt is only ever null on a FAILED row once the worker has
    // given up retrying (see scheduleRetry in each worker) — that's the
    // "nobody is coming back to this" bucket, worth calling out separately
    // from a delivery that's mid-backoff and still due to retry itself.
    const bucket = <T extends { nextRetryAt: Date | null }>(rows: T[]) => ({
      retrying: rows.filter((r) => r.nextRetryAt !== null),
      exhausted: rows.filter((r) => r.nextRetryAt === null),
    });

    return {
      payouts: bucket(payouts),
      invoices: bucket(invoices),
      webhookEvents: bucket(webhookEvents),
    };
  }
}
