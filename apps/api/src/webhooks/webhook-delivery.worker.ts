import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { WebhookEventStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { signWebhookPayload } from "./webhook-signing.util";

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 5_000;

/** Polls due WebhookEvent rows and delivers them with HMAC signatures + exponential backoff. */
@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);

  constructor(private readonly prisma: PrismaService) {}

  @Interval(3_000)
  async deliverDueEvents(): Promise<void> {
    const candidates = await this.prisma.webhookEvent.findMany({
      where: {
        status: { in: [WebhookEventStatus.PENDING, WebhookEventStatus.FAILED] },
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      include: { webhookEndpoint: true },
      take: 25,
    });

    for (const event of candidates) {
      // Optimistic-concurrency claim: only proceed if status+attempts still
      // match what we just read. Guards against two overlapping ticks (or
      // future multi-instance workers) delivering the same event twice.
      const claim = await this.prisma.webhookEvent.updateMany({
        where: { id: event.id, status: event.status, attempts: event.attempts },
        data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
      });
      if (claim.count === 0) continue;

      await this.deliverOne({ ...event, attempts: event.attempts + 1 });
    }
  }

  private async deliverOne(event: {
    id: string;
    eventType: string;
    payload: unknown;
    attempts: number;
    webhookEndpoint: { url: string; secret: string };
  }): Promise<void> {
    const signature = signWebhookPayload(event.webhookEndpoint.secret, event.payload);

    try {
      const response = await fetch(event.webhookEndpoint.url, {
        method: "POST",
        headers: { "content-type": "application/json", "pagosya-signature": signature },
        body: JSON.stringify({ type: event.eventType, data: event.payload }),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: WebhookEventStatus.DELIVERED, lastResponseStatus: response.status },
        });
        return;
      }
      await this.scheduleRetry(event.id, event.attempts, response.status);
    } catch (error) {
      this.logger.warn(`Webhook delivery failed for event ${event.id}: ${(error as Error).message}`);
      await this.scheduleRetry(event.id, event.attempts, null);
    }
  }

  /** `attempts` here is already the post-claim count (this attempt included). */
  private async scheduleRetry(eventId: string, attempts: number, responseStatus: number | null): Promise<void> {
    const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
    await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: WebhookEventStatus.FAILED,
        lastResponseStatus: responseStatus,
        nextRetryAt: attempts < MAX_ATTEMPTS ? new Date(Date.now() + backoffMs) : null,
      },
    });
  }
}
