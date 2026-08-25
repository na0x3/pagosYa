import { WebhookEventStatus } from "@prisma/client";
import { WebhookDeliveryWorker } from "./webhook-delivery.worker";
import { createHmac } from "node:crypto";

function makeFakePrisma() {
  return {
    webhookEvent: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

const baseEvent = {
  id: "evt_1",
  eventType: "payment_intent.succeeded",
  payload: { id: "pi_1" },
  status: WebhookEventStatus.PENDING,
  attempts: 0,
  createdAt: new Date("2026-08-18T12:00:00.000Z"),
  webhookEndpoint: { url: "https://merchant.example/webhook", secret: "whsec_test" },
};

describe("WebhookDeliveryWorker.deliverDueEvents", () => {
  let httpMock: { post: jest.Mock };

  beforeEach(() => {
    httpMock = { post: jest.fn() };
  });

  it("skips an event when the optimistic claim loses the race", async () => {
    const prisma = makeFakePrisma();
    prisma.webhookEvent.findMany.mockResolvedValue([baseEvent]);
    prisma.webhookEvent.updateMany.mockResolvedValue({ count: 0 });

    const worker = new WebhookDeliveryWorker(prisma as any, httpMock as any);
    await worker.deliverDueEvents();

    expect(httpMock.post).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
  });

  it("marks a successful delivery DELIVERED", async () => {
    const prisma = makeFakePrisma();
    prisma.webhookEvent.findMany.mockResolvedValue([baseEvent]);
    prisma.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
    httpMock.post.mockResolvedValue({ ok: true, status: 200 });

    const worker = new WebhookDeliveryWorker(prisma as any, httpMock as any);
    await worker.deliverDueEvents();

    const [, body, headers] = httpMock.post.mock.calls[0];
    const signature = headers["pagosya-signature"] as string;
    const timestamp = signature.match(/t=(\d+)/)?.[1];
    expect(JSON.parse(body)).toEqual({
      id: "evt_1",
      type: "payment_intent.succeeded",
      createdAt: "2026-08-18T12:00:00.000Z",
      data: { id: "pi_1" },
    });
    expect(signature).toBe(
      `t=${timestamp},v1=${createHmac("sha256", "whsec_test").update(`${timestamp}.${body}`).digest("hex")}`,
    );

    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: { status: WebhookEventStatus.DELIVERED, lastResponseStatus: 200 },
    });
  });

  it("schedules an exponential backoff retry on a non-2xx response", async () => {
    const prisma = makeFakePrisma();
    // pre-claim attempts=2 -> post-claim=3 -> backoff = 5000 * 2^(3-1) = 20000ms
    prisma.webhookEvent.findMany.mockResolvedValue([{ ...baseEvent, attempts: 2 }]);
    prisma.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
    httpMock.post.mockResolvedValue({ ok: false, status: 500 });

    const before = Date.now();
    const worker = new WebhookDeliveryWorker(prisma as any, httpMock as any);
    await worker.deliverDueEvents();

    const call = prisma.webhookEvent.update.mock.calls[0][0];
    expect(call.data.status).toBe(WebhookEventStatus.FAILED);
    expect(call.data.lastResponseStatus).toBe(500);
    const nextRetryAt = call.data.nextRetryAt.getTime();
    expect(nextRetryAt - before).toBeGreaterThanOrEqual(19_000);
    expect(nextRetryAt - before).toBeLessThan(21_000);
  });

  it("catches a thrown fetch error and schedules a retry instead of rejecting", async () => {
    const prisma = makeFakePrisma();
    prisma.webhookEvent.findMany.mockResolvedValue([baseEvent]);
    prisma.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
    httpMock.post.mockRejectedValue(new Error("network down"));

    const worker = new WebhookDeliveryWorker(prisma as any, httpMock as any);
    await expect(worker.deliverDueEvents()).resolves.toBeUndefined();

    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: expect.objectContaining({ status: WebhookEventStatus.FAILED, lastResponseStatus: null }),
    });
  });

  it("stops scheduling retries once MAX_ATTEMPTS is reached", async () => {
    const prisma = makeFakePrisma();
    // pre-claim attempts=7 -> post-claim=8 (MAX_ATTEMPTS) -> nextRetryAt must be null
    prisma.webhookEvent.findMany.mockResolvedValue([{ ...baseEvent, attempts: 7 }]);
    prisma.webhookEvent.updateMany.mockResolvedValue({ count: 1 });
    httpMock.post.mockResolvedValue({ ok: false, status: 500 });

    const worker = new WebhookDeliveryWorker(prisma as any, httpMock as any);
    await worker.deliverDueEvents();

    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: expect.objectContaining({ nextRetryAt: null }),
    });
  });
});
