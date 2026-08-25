import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { WebhookEventStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { signWebhookBody } from "./webhook-signing.util";
import { WebhookHttpClient } from "./webhook-http.client";

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 5_000;

/** Polls due WebhookEvent rows and delivers them with HMAC signatures + exponential backoff. */
@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: WebhookHttpClient,
  ) {}

  @Interval(3_000)
  async deliverDueEvents(): Promise<void> {
    const candidates = await this.prisma.webhookEvent.findMany({
      where: {
        status: { in: [WebhookEventStatus.PENDING, WebhookEventStatus.FAILED] },
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        webhookEndpoint: { status: "ACTIVE" },
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
    createdAt: Date;
    attempts: number;
    webhookEndpoint: { url: string; secret: string };
  }): Promise<void> {
    const body = JSON.stringify({
      id: event.id,
      type: event.eventType,
      createdAt: event.createdAt.toISOString(),
      data: event.payload,
    });
    const signature = signWebhookBody(event.webhookEndpoint.secret, body);

    try {
      const response = await this.http.post(event.webhookEndpoint.url, body, {
        "content-type": "application/json",
        "pagosya-signature": signature,
      });

      if (response.ok) {
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: WebhookEventStatus.DELIVERED, lastResponseStatus: response.status },
        });
        return;
      }
      await this.scheduleRetry(event.id, event.attempts, response.status, null);
    } catch (error) {
      await this.scheduleRetry(event.id, event.attempts, null, (error as Error).message);
    }
  }

  /**
   * `attempts` here is already the post-claim count (this attempt included).
   * Logs here, not at each call site, so severity always reflects whether
   * this failure is still retrying (warn — expected, self-healing) or has
   * exhausted every attempt (error — nobody is coming back to this event,
   * worth a human's attention; also visible via GET /internal/delivery_failures).
   */
  private async scheduleRetry(
    eventId: string,
    attempts: number,
    responseStatus: number | null,
    errorMessage: string | null,
  ): Promise<void> {
    const exhausted = attempts >= MAX_ATTEMPTS;
    const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
    const reason = errorMessage ?? `HTTP ${responseStatus}`;
    if (exhausted) {
      this.logger.error(`Webhook event ${eventId} exhausted all ${MAX_ATTEMPTS} attempts, giving up: ${reason}`);
    } else {
      this.logger.warn(`Webhook event ${eventId} delivery attempt ${attempts}/${MAX_ATTEMPTS} failed, retrying: ${reason}`);
    }
    await this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: WebhookEventStatus.FAILED,
        lastResponseStatus: responseStatus,
        nextRetryAt: exhausted ? null : new Date(Date.now() + backoffMs),
      },
    });
  }
}
