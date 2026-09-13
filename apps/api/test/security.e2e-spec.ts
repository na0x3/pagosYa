import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PaymentIntentStatus, TransactionStatus, TransactionType } from "@prisma/client";
import * as argon2 from "argon2";
import request = require("supertest");
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";

type MerchantFixture = {
  id: string;
  secretKey: string;
  publishableKey: string;
  storeId: string;
  productId: string;
};

describe("credential-free security boundaries (HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantA: MerchantFixture;
  let merchantB: MerchantFixture;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createMerchant(label: string): Promise<MerchantFixture> {
    const merchantResponse = await request(app.getHttpServer())
      .post("/v1/merchants")
      .send({ name: `${label} Store`, email: `${label.toLowerCase()}@security.example`, settlementMode: "AGGREGATOR" })
      .expect(201);
    const secretKey = merchantResponse.body.testKeys.secretKey as string;
    const publishableKey = merchantResponse.body.testKeys.publishableKey as string;
    const storeResponse = await request(app.getHttpServer())
      .post("/v1/stores")
      .set(bearer(secretKey))
      .send({ name: `${label} Store` })
      .expect(201);
    const productResponse = await request(app.getHttpServer())
      .post(`/v1/stores/${storeResponse.body.id}/payment_links`)
      .set(bearer(secretKey))
      .send({ name: `${label} Product`, amount: 10_000, currency: "BOB", stock: 2 })
      .expect(201);
    return {
      id: merchantResponse.body.merchant.id,
      secretKey,
      publishableKey,
      storeId: storeResponse.body.id,
      productId: productResponse.body.id,
    };
  }

  async function createAndConfirmCardPayment(merchant: MerchantFixture, amount = 10_000) {
    const created = await request(app.getHttpServer())
      .post("/v1/payment_intents")
      .set(bearer(merchant.secretKey))
      .send({ amount, currency: "BOB", metadata: { storeId: merchant.storeId } })
      .expect(201);
    const confirmed = await request(app.getHttpServer())
      .post(`/v1/payment_intents/${created.body.id}/confirm`)
      .set(bearer(created.body.clientSecret))
      .send({ paymentMethod: { type: "CARD", token: "tok_visa_success" } })
      .expect(201);
    expect(confirmed.body.paymentIntent.status).toBe(PaymentIntentStatus.SUCCEEDED);
    return created.body as { id: string; clientSecret: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      validationError: { target: false, value: false },
    }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    merchantA = await createMerchant("Alpha");
    merchantB = await createMerchant("Bravo");
  });

  afterAll(async () => {
    await app.close();
  });

  it("does not expose the retired event and facial-entry APIs", async () => {
    await request(app.getHttpServer()).get('/v1/events/public').expect(404);
    await request(app.getHttpServer()).get('/v1/events/consumer/face-entry').expect(404);
    await request(app.getHttpServer()).post('/v1/events/dev/device-simulator').send({}).expect(404);
  });

  it("prevents horizontal access to stores, products, proposals, API keys, and payment intents", async () => {
    const ownStores = await request(app.getHttpServer()).get("/v1/stores").set(bearer(merchantA.secretKey)).expect(200);
    expect(ownStores.body.map((store: { id: string }) => store.id)).toEqual([merchantA.storeId]);

    await request(app.getHttpServer())
      .patch(`/v1/stores/${merchantA.storeId}`)
      .set(bearer(merchantB.secretKey))
      .send({ name: "Stolen" })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/v1/stores/${merchantA.storeId}/payment_links`)
      .set(bearer(merchantB.secretKey))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/v1/stores/${merchantA.storeId}/payment_links/${merchantA.productId}`)
      .set(bearer(merchantB.secretKey))
      .send({ name: "Stolen product" })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/v1/stores/${merchantA.storeId}/visual-studio`)
      .set(bearer(merchantB.secretKey))
      .expect(404);

    const keysB = await request(app.getHttpServer()).get("/v1/api_keys").set(bearer(merchantB.secretKey)).expect(200);
    const keyB = keysB.body.find((key: { type: string }) => key.type === "PUBLISHABLE");
    await request(app.getHttpServer())
      .delete(`/v1/api_keys/${keyB.id}`)
      .set(bearer(merchantA.secretKey))
      .expect(404);

    const intentA = await request(app.getHttpServer())
      .post("/v1/payment_intents")
      .set(bearer(merchantA.secretKey))
      .send({ amount: 1_000, metadata: { storeId: merchantA.storeId } })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/v1/payment_intents/${intentA.body.id}`)
      .set(bearer(merchantB.secretKey))
      .expect(404);
  });

  it("keeps dashboard sessions revocable and unable to escalate into money-moving credentials", async () => {
    const password = "Correct-password-2026!";
    await prisma.merchantUser.create({
      data: {
        merchantId: merchantA.id,
        email: "owner-alpha@security.example",
        hashedPassword: await argon2.hash(password),
        emailVerifiedAt: new Date(),
      },
    });
    const login = await request(app.getHttpServer())
      .post("/v1/dashboard/login")
      .send({ email: "owner-alpha@security.example", password })
      .expect(201);
    const sessionToken = login.body.token as string;

    await request(app.getHttpServer()).get("/v1/stores").set(bearer(sessionToken)).expect(200);
    await request(app.getHttpServer())
      .post("/v1/payment_intents")
      .set(bearer(sessionToken))
      .send({ amount: 1_000 })
      .expect(401);
    await request(app.getHttpServer())
      .post("/v1/api_keys")
      .set(bearer(sessionToken))
      .send({ mode: "TEST", type: "SECRET" })
      .expect(401);

    await request(app.getHttpServer()).post("/v1/dashboard/logout").set(bearer(sessionToken)).expect(201);
    await request(app.getHttpServer()).get("/v1/stores").set(bearer(sessionToken)).expect(401);
  });

  it("rejects executable URLs and hostile uploads before persistence", async () => {
    await request(app.getHttpServer())
      .put(`/v1/stores/${merchantA.storeId}/links`)
      .set(bearer(merchantA.secretKey))
      .send({ links: [{ label: "Bad", url: "javascript:alert(document.cookie)" }] })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/v1/stores/${merchantA.storeId}`)
      .set(bearer(merchantA.secretKey))
      .send({ checkoutMode: "external", leadCaptureUrl: "data:text/html,<script>alert(1)</script>" })
      .expect(400);

    await request(app.getHttpServer())
      .post("/v1/uploads")
      .set(bearer(merchantA.secretKey))
      .attach("file", Buffer.from("<script>alert(document.cookie)</script>"), { filename: "fake.png", contentType: "image/png" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/v1/uploads")
      .set(bearer(merchantA.secretKey))
      .attach("file", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { filename: "attack.svg", contentType: "image/svg+xml" })
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/uploads/..%2F..%2Fetc%2Fpasswd")
      .expect(404);
  });

  it("blocks oversized and decompression-bomb image uploads", async () => {
    const oversizedPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8_000_001),
    ]);
    await request(app.getHttpServer())
      .post("/v1/uploads")
      .set(bearer(merchantA.secretKey))
      .attach("file", oversizedPng, { filename: "oversized.png", contentType: "image/png" })
      .expect(400);

    const pixelBomb = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pixelBomb);
    pixelBomb.write("IHDR", 12, "ascii");
    pixelBomb.writeUInt32BE(100_000, 16);
    pixelBomb.writeUInt32BE(100_000, 20);
    await request(app.getHttpServer())
      .post("/v1/uploads")
      .set(bearer(merchantA.secretKey))
      .attach("file", pixelBomb, { filename: "pixel-bomb.png", contentType: "image/png" })
      .expect(400);
  });

  it("rejects PNG signature spoofing and executable bytes after a complete PNG", async () => {
    const validPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const signatureSpoof = Buffer.concat([
      validPng.subarray(0, 8),
      Buffer.from("<script>globalThis.stolen=true</script>"),
    ]);
    const trailingScript = Buffer.concat([
      validPng,
      Buffer.from("<script>globalThis.stolen=true</script>"),
    ]);

    for (const [name, bytes] of [["signature-spoof.png", signatureSpoof], ["polyglot.png", trailingScript]] as const) {
      await request(app.getHttpServer())
        .post("/v1/uploads")
        .set(bearer(merchantA.secretKey))
        .attach("file", bytes, { filename: name, contentType: "image/png" })
        .expect(400);
    }

    const stored = await request(app.getHttpServer())
      .post("/v1/uploads")
      .set(bearer(merchantA.secretKey))
      .attach("file", validPng, { filename: "real.png", contentType: "image/png" })
      .expect(201);
    await request(app.getHttpServer())
      .get(stored.body.url)
      .expect("Content-Type", /image\/png/)
      .expect("X-Content-Type-Options", "nosniff")
      .expect(200);
  });

  it("treats SQL payloads as values and rejects NoSQL-style operator objects", async () => {
    const sqlPayload = "' OR 1=1; DROP TABLE \"Merchant\"; --";
    const merchantCountBefore = await prisma.merchant.count();

    const search = await request(app.getHttpServer())
      .get("/v1/stores/public")
      .query({ search: sqlPayload })
      .expect(200);
    expect(search.body.stores).toEqual([]);

    await request(app.getHttpServer())
      .get(`/v1/payment_intents/${encodeURIComponent(sqlPayload)}`)
      .set(bearer(merchantA.secretKey))
      .expect(404);

    const operatorBody = JSON.parse(
      '{"email":{"$ne":null},"password":{"$gt":""},"$where":"return true","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    );
    await request(app.getHttpServer())
      .post("/v1/dashboard/login")
      .send(operatorBody)
      .expect(400);
    await request(app.getHttpServer())
      .post("/v1/payment_intents")
      .set(bearer(merchantA.secretKey))
      .send({ amount: { $gt: 0 }, currency: { $ne: "USD" } })
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/merchants/orders?search%5B%24ne%5D=x&status%5B%24where%5D=return%20true")
      .set(bearer(merchantA.secretKey))
      .expect(200);

    expect(await prisma.merchant.count()).toBe(merchantCountBefore);
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("allows exactly one winner when the same PaymentIntent is confirmed concurrently", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/payment_intents")
      .set(bearer(merchantA.secretKey))
      .send({ amount: 5_000, currency: "BOB" })
      .expect(201);
    const confirm = () => request(app.getHttpServer())
      .post(`/v1/payment_intents/${created.body.id}/confirm`)
      .set(bearer(created.body.clientSecret))
      .send({ paymentMethod: { type: "CARD", token: "tok_visa_success" } });

    const responses = await Promise.all([confirm(), confirm()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.transaction.count({
      where: { paymentIntentId: created.body.id, type: TransactionType.AUTHORIZATION },
    })).toBe(1);
    const ledger = await prisma.ledgerEntry.findMany({ where: { transaction: { paymentIntentId: created.body.id } } });
    const debits = ledger.filter((line) => line.direction === "DEBIT").reduce((sum, line) => sum + line.amount, 0);
    const credits = ledger.filter((line) => line.direction === "CREDIT").reduce((sum, line) => sum + line.amount, 0);
    expect(debits).toBe(credits);
  });

  it("never oversells a one-unit product when two different carts confirm concurrently", async () => {
    const product = await request(app.getHttpServer())
      .post(`/v1/stores/${merchantA.storeId}/payment_links`)
      .set(bearer(merchantA.secretKey))
      .send({ name: "Last unit", amount: 2_500, currency: "BOB", stock: 1 })
      .expect(201);
    const createCartIntent = async () => (await request(app.getHttpServer())
      .post("/v1/payment_intents")
      .set(bearer(merchantA.secretKey))
      .send({
        amount: 2_500,
        currency: "BOB",
        metadata: {
          storeId: merchantA.storeId,
          cart: [{ paymentLinkId: product.body.id, name: "Last unit", quantity: 1, unitAmount: 2_500 }],
        },
      })
      .expect(201)).body;
    const [first, second] = await Promise.all([createCartIntent(), createCartIntent()]);
    const confirm = (intent: { id: string; clientSecret: string }) => request(app.getHttpServer())
      .post(`/v1/payment_intents/${intent.id}/confirm`)
      .set(bearer(intent.clientSecret))
      .send({ paymentMethod: { type: "CARD", token: "tok_visa_success" } });

    const responses = await Promise.all([confirm(first), confirm(second)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    expect(await prisma.paymentLink.findUniqueOrThrow({ where: { id: product.body.id } })).toEqual(
      expect.objectContaining({ stock: 0 }),
    );
    expect(await prisma.paymentIntent.count({
      where: { id: { in: [first.id, second.id] }, status: PaymentIntentStatus.SUCCEEDED },
    })).toBe(1);
  });

  it("rejects callback rail mismatches and acknowledges terminal callback replays once", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/payment_intents")
      .set(bearer(merchantA.secretKey))
      .send({ amount: 3_000, currency: "BOB" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/payment_intents/${created.body.id}/confirm`)
      .set(bearer(created.body.clientSecret))
      .send({ paymentMethod: { type: "BANK_TRANSFER", token: "bank_pending" } })
      .expect(201);
    const callbackBody = {
      paymentIntentId: created.body.id,
      status: "succeeded",
      railReference: "bank-settlement-1",
      raw: { source: "e2e" },
    };

    await request(app.getHttpServer())
      .post("/internal/rails/mock_qr/callback")
      .set(bearer("e2e-internal-rail-secret"))
      .send(callbackBody)
      .expect(400);
    const before = await prisma.transaction.count({ where: { paymentIntentId: created.body.id } });
    await request(app.getHttpServer())
      .post("/internal/rails/mock_bank_transfer/callback")
      .set(bearer("e2e-internal-rail-secret"))
      .send(callbackBody)
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/rails/mock_bank_transfer/callback")
      .set(bearer("e2e-internal-rail-secret"))
      .send(callbackBody)
      .expect(201);
    expect(await prisma.transaction.count({ where: { paymentIntentId: created.body.id } })).toBe(before + 1);
  });

  it("reserves refundable balance under a row lock during concurrent refunds", async () => {
    const payment = await createAndConfirmCardPayment(merchantA, 10_000);
    const refund = (amount: number, key: string) => request(app.getHttpServer())
      .post("/v1/refunds")
      .set(bearer(merchantA.secretKey))
      .set("Idempotency-Key", key)
      .send({ paymentIntentId: payment.id, amount, reason: "security race test" });

    const responses = await Promise.all([
      refund(6_000, "refund-race-alpha"),
      refund(6_000, "refund-race-bravo"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    const refunds = await prisma.transaction.findMany({
      where: {
        paymentIntentId: payment.id,
        type: TransactionType.REFUND,
        status: { in: [TransactionStatus.PENDING, TransactionStatus.SUCCEEDED] },
      },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(6_000);
  });

  it("enforces login throttling without distinguishing known and unknown accounts", async () => {
    const known = await request(app.getHttpServer())
      .post("/v1/dashboard/login")
      .send({ email: "owner-alpha@security.example", password: "wrong-password" });
    const unknown = await request(app.getHttpServer())
      .post("/v1/dashboard/login")
      .send({ email: "missing@security.example", password: "wrong-password" });
    expect(known.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(known.body.message).toBe(unknown.body.message);

    const attempts = await Promise.all(Array.from({ length: 6 }, (_, index) => request(app.getHttpServer())
      .post("/v1/dashboard/login")
      .send({ email: `attacker-${index}@security.example`, password: "wrong-password" })));
    expect(attempts.some((response) => response.status === 429)).toBe(true);
  });

  it("rejects private webhook targets and hides webhook secrets from list responses", async () => {
    for (const url of [
      "https://127.0.0.1/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://user:password@8.8.8.8/hook",
      "https://8.8.8.8:444/hook",
      "https://8.8.8.8/hook#secret",
    ]) {
      await request(app.getHttpServer())
        .post("/v1/webhook_endpoints")
        .set(bearer(merchantA.secretKey))
        .send({ url, enabledEvents: ["payment_intent.succeeded"] })
        .expect(400);
    }

    const created = await request(app.getHttpServer())
      .post("/v1/webhook_endpoints")
      .set(bearer(merchantA.secretKey))
      .send({ url: "https://8.8.8.8/pagosya-hook", enabledEvents: ["payment_intent.succeeded"] })
      .expect(201);
    expect(created.body.secret).toMatch(/^whsec_/);
    const listed = await request(app.getHttpServer())
      .get("/v1/webhook_endpoints")
      .set(bearer(merchantA.secretKey))
      .expect(200);
    expect(listed.body[0]).not.toHaveProperty("secret");
    await request(app.getHttpServer())
      .delete(`/v1/webhook_endpoints/${created.body.id}`)
      .set(bearer(merchantB.secretKey))
      .expect(404);
  });
});
