import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

@Injectable()
export class WebhookDispatcherService {
  /**
   * Enqueues a WebhookEvent per active endpoint subscribed to this event type,
   * inside the *same* Prisma transaction as the state change that caused it
   * (transactional outbox) — so a crash right after commit can never silently
   * drop a webhook the way a separate post-commit call could.
   */
  async enqueueEvent(
    tx: Prisma.TransactionClient,
    merchantId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await tx.webhookEndpoint.findMany({
      where: { merchantId, status: "ACTIVE" },
    });

    const subscribed = endpoints.filter(
      (e) => e.enabledEvents.length === 0 || e.enabledEvents.includes(eventType),
    );
    if (subscribed.length === 0) return;

    await tx.webhookEvent.createMany({
      data: subscribed.map((endpoint) => ({
        merchantId,
        webhookEndpointId: endpoint.id,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: "PENDING",
        nextRetryAt: new Date(),
      })),
    });
  }
}
