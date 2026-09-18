import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Multiple stores per account (HTTP + disposable PostgreSQL)", () => {
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

  it("creates two stores concurrently for the same profile with distinct public slugs", async () => {
    const results = await Promise.all(["Primera", "Segunda"].map(name =>
      request(app.getHttpServer()).post("/v1/stores").set(auth()).send({ name })));
    expect(results.map(result => result.status)).toEqual([201, 201]);
    expect(new Set(results.map(result => result.body.slug)).size).toBe(2);
    storeId = results[0].body.id;
    expect(await prisma.store.count({ where: { merchantId } })).toBe(2);
  });

  it("retains archived stores while creating another store and keeps catalogs independent", async () => {
    await prisma.store.update({ where: { id: storeId }, data: { status: "ARCHIVED" } });
    const created = await request(app.getHttpServer()).post("/v1/stores").set(auth()).send({ name: "Tercera" }).expect(201);
    await request(app.getHttpServer()).post(`/v1/stores/${created.body.id}/payment_links`).set(auth())
      .send({ name: "Solo en tercera", amount: 12000, currency: "BOB", stock: 3 }).expect(201);
    const catalog = await request(app.getHttpServer()).get(`/v1/stores/${created.body.id}/payment_links`).set(auth()).expect(200);
    expect(catalog.body).toHaveLength(1);
    const originalCatalog = await request(app.getHttpServer()).get(`/v1/stores/${storeId}/payment_links`).set(auth()).expect(200);
    expect(originalCatalog.body).toHaveLength(0);
    expect(await prisma.store.count({ where: { merchantId } })).toBe(3);
  });

  it("keeps ownership enforced and deleting one store preserves the other stores", async () => {
    const other = await request(app.getHttpServer()).post("/v1/merchants")
      .send({ name: "Other account", email: "other-multiple-store@example.test" }).expect(201);
    const otherAuth = { Authorization: `Bearer ${other.body.testKeys.secretKey}` };
    await request(app.getHttpServer()).post("/v1/stores").set(otherAuth).send({ name: "Su tienda" }).expect(201);
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}`).set(otherAuth).send({ name: "Not mine" }).expect(404);
    await request(app.getHttpServer()).delete(`/v1/stores/${storeId}`).set(otherAuth).expect(404);
    const ownList = await request(app.getHttpServer()).get("/v1/stores").set(otherAuth).expect(200);
    expect(ownList.body).toHaveLength(1);
    expect(ownList.body[0].name).toBe("Su tienda");
    await request(app.getHttpServer()).delete(`/v1/stores/${storeId}`).set(auth()).expect(200);
    const list = await request(app.getHttpServer()).get("/v1/stores").set(auth()).expect(200);
    expect(list.body.map((s: { name: string }) => s.name).sort()).toEqual(["Segunda", "Tercera"]);
  });
});
