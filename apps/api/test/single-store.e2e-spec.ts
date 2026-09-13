import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";

describe("One store per account (HTTP + disposable PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let merchantId: string;
  let storeId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    const account = await request(app.getHttpServer()).post("/v1/merchants")
      .send({ name: "Single store", email: "single-store@example.test" }).expect(201);
    token = account.body.testKeys.secretKey;
    merchantId = account.body.merchant.id;
  });

  afterAll(async () => { await app?.close(); });

  it("accepts only one of two concurrent creation requests", async () => {
    const results = await Promise.all(["Primera", "Segunda"].map(name =>
      request(app.getHttpServer()).post("/v1/stores").set(auth()).send({ name })));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(results.find(result => result.status === 409)?.body.message).toContain("Tu cuenta ya tiene una tienda");
    storeId = results.find(result => result.status === 201)!.body.id;
    expect(await prisma.store.count({ where: { merchantId } })).toBe(1);
  });

  it("also enforces the limit for direct database writes and archived stores", async () => {
    await expect(prisma.store.create({ data: { merchantId, name: "Bypass", slug: "single-store-bypass" } }))
      .rejects.toMatchObject({ code: "P2002", meta: { target: ["merchantId"] } });
    await prisma.store.update({ where: { id: storeId }, data: { status: "ARCHIVED" } });
    await request(app.getHttpServer()).post("/v1/stores").set(auth()).send({ name: "Otra" }).expect(409);
  });

  it("allows another account its own store and allows replacement after deletion", async () => {
    const other = await request(app.getHttpServer()).post("/v1/merchants")
      .send({ name: "Other account", email: "other-single-store@example.test" }).expect(201);
    await request(app.getHttpServer()).post("/v1/stores")
      .set({ Authorization: `Bearer ${other.body.testKeys.secretKey}` }).send({ name: "Su tienda" }).expect(201);
    await request(app.getHttpServer()).delete(`/v1/stores/${storeId}`).set(auth()).expect(200);
    await request(app.getHttpServer()).post("/v1/stores").set(auth()).send({ name: "Reemplazo" }).expect(201);
    const list = await request(app.getHttpServer()).get("/v1/stores").set(auth()).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("Reemplazo");
  });
});
