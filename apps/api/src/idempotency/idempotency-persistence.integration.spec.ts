import { ConflictException } from "@nestjs/common";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Observable, firstValueFrom, of, throwError } from "rxjs";
import { integrationDatabase } from "../common/testing/integration-database";
import { IdempotencyInterceptor } from "./idempotency.interceptor";

/**
 * The idempotency interceptor is applied globally to every mutating merchant
 * request — payment intents and refunds among them — and until now had no test
 * of any kind.
 *
 * It is tested here against a real database rather than a mock because every
 * failure mode that matters is a database behaviour: the unique index on
 * (merchantId, key) is what makes two concurrent requests safe, and the moment
 * a row reaches COMPLETED is what decides whether a caller can ever retry. A
 * fake Prisma agrees with whatever the interceptor happens to do, including
 * doing it too late.
 */

const db = integrationDatabase("idempotency");

function contextFor(
  merchantId: string,
  { method = "POST", url = "/v1/payment_intents", body = {} as unknown, key = "key-abcdefgh" } = {},
): { context: ExecutionContext; response: { statusCode: number; status: (code: number) => void } } {
  const response = {
    statusCode: 201,
    status(code: number) {
      this.statusCode = code;
    },
  };
  const request = { method, url, originalUrl: url, body, headers: { "idempotency-key": key }, merchant: { id: merchantId } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, response };
}

const handlerOf = (value: unknown): CallHandler => ({ handle: () => of(value) });
const failingHandler = (error: Error): CallHandler => ({ handle: () => throwError(() => error) });

db.describeDb("idempotency interceptor (real Postgres, real migrations)", () => {
  if (!db.available) {
    db.failIfUnavailable();
    return;
  }

  let prisma: PrismaClient;
  let interceptor: IdempotencyInterceptor;
  let merchantId: string;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    prisma = await db.create();
    interceptor = new IdempotencyInterceptor(prisma as never);
    const merchant = await prisma.merchant.create({
      data: { name: "Comercio", email: `m-${db.databaseName}@test.test` },
    });
    merchantId = merchant.id;
  });

  afterAll(async () => {
    await db.drop();
  });

  afterEach(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { merchantId } });
  });

  /**
   * The defect this suite was written for.
   *
   * The caller's contract is: once you have the response, the key is spent. If
   * the row is still IN_PROGRESS at that moment, then a crash in the window
   * that follows — or a failed write nobody awaited — strands the key forever,
   * and every retry gets "already in progress". For a payment that is a
   * merchant who cannot retry and cannot complete.
   */
  it("has marked the key COMPLETED by the time the caller sees the response", async () => {
    const { context } = contextFor(merchantId);

    const result = await firstValueFrom(
      (await interceptor.intercept(context, handlerOf({ id: "pi_1" }))) as Observable<unknown>,
    );

    expect(result).toEqual({ id: "pi_1" });

    // Read the moment the value arrives, with no settling delay: this is the
    // state a caller's very next request would find.
    const row = await prisma.idempotencyKey.findUnique({
      where: { merchantId_key: { merchantId, key: "key-abcdefgh" } },
    });
    expect(row?.status).toBe("COMPLETED");
    expect(row?.responseBody).toEqual({ id: "pi_1" });
    expect(row?.completedAt).not.toBeNull();
  });

  /**
   * Same contract on the failure path. The interceptor deliberately deletes the
   * row so the caller may retry with the same key; if the delete has not
   * happened by the time the error surfaces, an immediate retry gets a
   * spurious 409 instead.
   */
  it("has released the key by the time the caller sees the error", async () => {
    const { context } = contextFor(merchantId, { key: "key-failing-1" });

    await expect(
      firstValueFrom((await interceptor.intercept(context, failingHandler(new Error("rail down")))) as Observable<unknown>),
    ).rejects.toThrow("rail down");

    const row = await prisma.idempotencyKey.findUnique({
      where: { merchantId_key: { merchantId, key: "key-failing-1" } },
    });
    expect(row).toBeNull();
  });

  it("replays the stored response instead of running the handler again", async () => {
    const { context } = contextFor(merchantId, { key: "key-replay-1" });
    await firstValueFrom((await interceptor.intercept(context, handlerOf({ id: "pi_2" }))) as Observable<unknown>);

    let ran = false;
    const second = contextFor(merchantId, { key: "key-replay-1" });
    const replay = await firstValueFrom(
      (await interceptor.intercept(second.context, {
        handle: () => {
          ran = true;
          return of({ id: "pi_DIFFERENT" });
        },
      })) as Observable<unknown>,
    );

    expect(ran).toBe(false);
    expect(replay).toEqual({ id: "pi_2" });
    expect(second.response.statusCode).toBe(201);
  });

  it("rejects the same key carrying a different payload", async () => {
    const first = contextFor(merchantId, { key: "key-payload-1", body: { amount: 100 } });
    await firstValueFrom((await interceptor.intercept(first.context, handlerOf({ id: "pi_3" }))) as Observable<unknown>);

    const second = contextFor(merchantId, { key: "key-payload-1", body: { amount: 999 } });
    await expect(interceptor.intercept(second.context, handlerOf({ id: "pi_4" }))).rejects.toThrow(ConflictException);
  });

  /**
   * The unique index on (merchantId, key) is the whole concurrency story: the
   * double-click, the retrying mobile client, two API replicas. Exactly one
   * caller may pass; the other must be refused, not allowed to charge twice.
   */
  it("lets exactly one of two concurrent requests through", async () => {
    const both = await Promise.allSettled([
      interceptor.intercept(contextFor(merchantId, { key: "key-race-1" }).context, handlerOf({ id: "pi_a" })),
      interceptor.intercept(contextFor(merchantId, { key: "key-race-1" }).context, handlerOf({ id: "pi_b" })),
    ]);

    const accepted = both.filter((r) => r.status === "fulfilled");
    const refused = both.filter((r) => r.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(await prisma.idempotencyKey.count({ where: { merchantId, key: "key-race-1" } })).toBe(1);
  });

  it("ignores requests that carry no Idempotency-Key", async () => {
    const request = { method: "POST", url: "/v1/payment_intents", originalUrl: "/v1/payment_intents", body: {}, headers: {}, merchant: { id: merchantId } };
    const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ status() {}, statusCode: 201 }) }) } as unknown as ExecutionContext;

    const result = await firstValueFrom((await interceptor.intercept(context, handlerOf({ id: "pi_5" }))) as Observable<unknown>);

    expect(result).toEqual({ id: "pi_5" });
    expect(await prisma.idempotencyKey.count({ where: { merchantId } })).toBe(0);
  });
});
