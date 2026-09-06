import { SourceGenerationService } from "../src/stores/source-generation.service";
import { SourceProjectsService } from "../src/stores/source-projects.service";
import { StoreAgentService } from "../src/stores/store-agent.service";
import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Independent source projects (HTTP + disposable PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let foreignToken: string;
  let storeId: string;
  let slug: string;
  let route: string;
  const source = (revision: number, label: string) => ({ revision, label,
    brief: { businessType: "Café", audience: "Neighbors", primaryAction: "Order pickup", visualDirection: "Open menu" },
    files: [
      { path: "package.json", content: '{"name":"cafe","scripts":{"build":"node build.mjs"}}' },
      { path: "README.md", content: "Run npm run build. Configure the PagosYa API separately." },
      { path: "build.mjs", content: 'globalThis.__sourceMustStayInert = true;' },
    ],
  });
  const auth = (key = token) => ({ Authorization: `Bearer ${key}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transform: true, validationError: { target: false, value: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    for (const name of ["SourceOwner", "SourceOther"]) {
      const result = await request(app.getHttpServer()).post("/v1/merchants").send({ name, email: `${name}@source.example`, settlementMode: "AGGREGATOR" }).expect(201);
      if (name === "SourceOwner") token = result.body.testKeys.secretKey;
      else foreignToken = result.body.testKeys.secretKey;
    }
    const store = await request(app.getHttpServer()).post("/v1/stores").set(auth()).send({ name: "Original public store" }).expect(201);
    storeId = store.body.id; slug = store.body.slug;
    route = `/v1/stores/${storeId}/source-project`;
  });

  afterAll(async () => { await app?.close(); });

  it("requires authentication and ownership on all source routes", async () => {
    await request(app.getHttpServer()).get(route).expect(401);
    await request(app.getHttpServer()).post(`${route}/generate`).set(auth(foreignToken)).send({ revision: 0, brief: source(0, "Foreign").brief, instruction: "Generate" }).expect(404);
    await request(app.getHttpServer()).get(route).set(auth(foreignToken)).expect(404);
    await request(app.getHttpServer()).put(route).set(auth(foreignToken)).send(source(0, "Foreign")).expect(404);
    await request(app.getHttpServer()).get(`${route}/versions/1`).set(auth(foreignToken)).expect(404);
    await request(app.getHttpServer()).get(`${route}/versions/1/export`).set(auth(foreignToken)).expect(404);
    await request(app.getHttpServer()).post(`${route}/versions/1/restore`).set(auth(foreignToken)).send({ revision: 0 }).expect(404);
  });

  it("validates nested DTOs before storing a project", async () => {
    const { brief, ...missingBrief } = source(0, "Missing");
    await request(app.getHttpServer()).put(route).set(auth()).send(missingBrief).expect(400);
    await request(app.getHttpServer()).put(route).set(auth()).send({ ...source(0, "Unsafe"), files: [{ path: "../../escape.js", content: "bad" }] }).expect(400);
    await request(app.getHttpServer()).put(route).set(auth()).send({ ...source(0, "Negative"), revision: -1 }).expect(400);
    expect(await prisma.storeSourceProject.count({ where: { storeId } })).toBe(0);
  });

  it("accepts only one simultaneous first save and leaves live content and editor revisions intact", async () => {
    const before = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, siteDocument: true, websiteDraft: true, websiteRevision: true } });
    const results = await Promise.all(["A", "B"].map((label) => request(app.getHttpServer()).put(route).set(auth()).send(source(0, label))));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await prisma.storeSourceVersion.count({ where: { storeId } })).toBe(1);
    expect(await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, siteDocument: true, websiteDraft: true, websiteRevision: true } })).toEqual(before);
    const publicStore = await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/store`).expect(200);
    expect(publicStore.text).not.toContain("__sourceMustStayInert");
    expect(publicStore.body).not.toHaveProperty("sourceProject");
    expect((globalThis as any).__sourceMustStayInert).toBeUndefined();
  });

  it("exports source as an attachment and restores without destroying history", async () => {
    const first = await request(app.getHttpServer()).get(`${route}/versions/1`).set(auth()).expect(200);
    expect(first.headers["cache-control"]).toBe("private, no-store");
    const download = await request(app.getHttpServer()).get(`${route}/versions/1/export`).set(auth()).buffer(true).parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => done(null, Buffer.concat(chunks)));
      response.on("error", done);
    }).expect(200);
    expect(download.headers["content-type"]).toContain("application/zip");
    expect(download.headers["content-disposition"]).toMatch(/^attachment; filename="storefront-r1-/);
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect(download.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    await request(app.getHttpServer()).put(route).set(auth()).send({ ...source(1, "New"), brief: { ...source(1, "New").brief, visualDirection: "Another design" } }).expect(200);
    await request(app.getHttpServer()).post(`${route}/versions/1/restore`).set(auth()).send({ revision: 1 }).expect(409);
    const restored = await request(app.getHttpServer()).post(`${route}/versions/1/restore`).set(auth()).send({ revision: 2 }).expect(201);
    expect(restored.body).toMatchObject({ revision: 3, restoredFrom: 1, digest: first.body.digest });
    const history = await request(app.getHttpServer()).get(route).set(auth()).expect(200);
    expect(history.body.versions.map((version: { revision: number }) => version.revision)).toEqual([3, 2, 1]);
    expect(history.body.versions[0]).not.toHaveProperty("snapshot");
  });
  it("edits a text file without resending assets and rejects stale or foreign edits", async () => {
    const body = { revision: 3, path: "README.md", content: "Updated independent source instructions" };
    await request(app.getHttpServer()).patch(`${route}/file`).set(auth(foreignToken)).send(body).expect(404);
    const saved = await request(app.getHttpServer()).patch(`${route}/file`).set(auth()).send(body).expect(200);
    expect(saved.body.revision).toBe(4);
    await request(app.getHttpServer()).patch(`${route}/file`).set(auth()).send(body).expect(409);
    const current = await request(app.getHttpServer()).get(`${route}/versions/4`).set(auth()).expect(200);
    expect(current.body.snapshot.files.find((file: { path: string }) => file.path === "README.md").content).toBe(body.content);
  });

  it("persists source chat in the existing infrastructure without mixing website conversations", async () => {
    await request(app.getHttpServer()).get(`${route}/conversation`).expect(401);
    await request(app.getHttpServer()).get(`${route}/conversation`).set(auth(foreignToken)).expect(404);
    await request(app.getHttpServer()).post(`${route}/messages`).set(auth(foreignToken)).send({revision:4,instruction:"Crea una carta editorial"}).expect(404);
    const generator = jest.spyOn(app.get(SourceGenerationService), "generate").mockImplementation((merchantId, id, input) => app.get(SourceProjectsService).save(merchantId, id, source(input.revision, "Carta editorial")));
    const sent = await request(app.getHttpServer()).post(`${route}/messages`).set(auth()).send({revision:4,instruction:"Crea una carta editorial para mi café"}).expect(201);
    expect(sent.body.revision.revision).toBe(5);
    expect(sent.body.assistantMessage.metadata.sourceRevision).toBe(5);
    const history = await request(app.getHttpServer()).get(`${route}/conversation`).set(auth()).expect(200);
    expect(history.body.messages.map((message: { role: string }) => message.role)).toEqual(["USER", "ASSISTANT"]);
    const owner = await prisma.store.findUniqueOrThrow({where:{id:storeId}});
    expect((await app.get(StoreAgentService).conversation(owner.merchantId,storeId)).messages).toEqual([]);
    await request(app.getHttpServer()).post(`${route}/messages`).set(auth()).send({revision:4,instruction:"Cambia la portada"}).expect(409);
    expect(generator).toHaveBeenCalledTimes(1);
    generator.mockRestore();
  });

});
