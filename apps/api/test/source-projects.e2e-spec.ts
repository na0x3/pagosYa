import { StoresService } from '../src/stores/stores.service';
import { requestedSourceProducts, requestedSourceProductOperations } from '../src/stores/source-products';
import { SourceConversationService } from '../src/stores/source-conversation.service';
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
      { path: 'index.html', content: '<h1>Shop</h1>' },
      { path: 'commerce.js', content: '// Platform runtime is excluded from estimates' },
      { path: 'assets/logo.png', content: 'YWJj', encoding: 'base64' as const },
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

  it('requires the first website to start through YAPI chat, including the direct API', async () => {
    const generator = jest.spyOn(app.get(SourceGenerationService), 'generate');
    try {
      const result = await request(app.getHttpServer()).post(`${route}/generate`).set(auth())
        .send({ revision: 0, brief: source(0, 'First').brief, instruction: 'Create now' }).expect(400);
      expect(result.body.message).toContain('preguntas de YAPI');
      expect(generator).not.toHaveBeenCalled();
    } finally { generator.mockRestore(); }
  });

  it("persists contextual replies and accepts free conversation through the HTTP DTO", async () => {
    const decide = jest.spyOn(app.get(SourceConversationService), 'decide').mockResolvedValue({
      action: 'reply', reply: '¿Tienes fotos de tus productos? También podemos empezar sin ellas.',
      summary: 'Cafetería. Fotos opcionales; uso pendiente.', generationInstruction: '', imageUses: [],
    });
    try {
      const first = await request(app.getHttpServer()).get(`${route}/conversation`).set(auth()).expect(200);
      expect(first.body.setup).toMatchObject({step:'conversation',options:[]});
      await request(app.getHttpServer()).post(`${route}/messages`).set(auth()).send({revision:0,instruction:'Tengo una cafetería',setupStep:'conversation'}).expect(201);
      decide.mockResolvedValueOnce({action:'reply',reply:'¿Prefieres subir fotos o empezar sin ellas?',summary:'Cafetería. Fotos opcionales; uso pendiente.',generationInstruction:'',imageUses:[]});
      const reply = await request(app.getHttpServer()).post(`${route}/messages`).set(auth()).send({revision:0,instruction:'La luna es de queso',setupStep:'conversation'}).expect(201);
      expect(reply.body).not.toHaveProperty('revision');
      const restored = await request(app.getHttpServer()).get(`${route}/conversation`).set(auth()).expect(200);
      expect(restored.body.setup.prompt).toBe('¿Prefieres subir fotos o empezar sin ellas?');
      expect(restored.body.messages).toHaveLength(4);
      expect(restored.body.messages.at(-1).metadata.sourceSetup.answers).toEqual({context:'Cafetería. Fotos opcionales; uso pendiente.'});
      expect((await request(app.getHttpServer()).get(route).set(auth()).expect(200)).body.revision).toBe(0);
    } finally { decide.mockRestore(); }
  });

  it("requires authentication and ownership on all source routes", async () => {
    await request(app.getHttpServer()).get(route).expect(401);
    await request(app.getHttpServer()).get(`${route}/catalog`).expect(401);
    await request(app.getHttpServer()).get(`${route}/catalog`).set(auth(foreignToken)).expect(404);
    const catalog = await request(app.getHttpServer()).get(`${route}/catalog`).set(auth()).expect(200);
    expect(catalog.body.storeName).toBe("Original public store");
    expect(catalog.body.items).toEqual([]);
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
    const decide = jest.spyOn(app.get(SourceConversationService), 'decide').mockResolvedValue({action:'generate',reply:'',summary:'Café editorial.',generationInstruction:'Crea una carta editorial para mi café',imageUses:[]});
    const generator = jest.spyOn(app.get(SourceGenerationService), "generate").mockImplementation(async (merchantId, id, input) => ({ ...await app.get(SourceProjectsService).save(merchantId, id, source(input.revision, "Carta editorial")), generation: { id: "test-run", requestedModel: "auto", model: "gpt-5.6-terra", credits: 0, maxCredits: 50, attempts: [], durationMs: 0, status: "COMPLETED" } }));
    const sent = await request(app.getHttpServer()).post(`${route}/messages`).set(auth()).send({revision:4,instruction:"Crea una carta editorial para mi café"}).expect(201);
    expect(sent.body.revision.revision).toBe(5);
    expect(sent.body.assistantMessage.metadata.sourceRevision).toBe(5);
    const history = await request(app.getHttpServer()).get(`${route}/conversation`).set(auth()).expect(200);
    expect(history.body.messages).toHaveLength(6);
    expect(history.body.messages.slice(-2).map((message: { role: string }) => message.role)).toEqual(["USER", "ASSISTANT"]);
    const owner = await prisma.store.findUniqueOrThrow({where:{id:storeId}});
    expect((await app.get(StoreAgentService).conversation(owner.merchantId,storeId)).messages).toEqual([]);
    await request(app.getHttpServer()).post(`${route}/messages`).set(auth()).send({revision:4,instruction:"Cambia la portada"}).expect(409);
    expect(generator).toHaveBeenCalledTimes(1);
    generator.mockRestore(); decide.mockRestore();
  });

  it("authenticates estimates and usage, validates model choices, and never spends on estimates", async () => {
    const estimate = { revision: 5, instruction: 'Cambia el color del título', model: 'auto', maxCredits: 10 };
    await request(app.getHttpServer()).get(`${route}/usage`).expect(401);
    await request(app.getHttpServer()).get(`${route}/usage`).set(auth(foreignToken)).expect(404);
    await request(app.getHttpServer()).post(`${route}/estimate`).set(auth(foreignToken)).send(estimate).expect(404);
    await request(app.getHttpServer()).post(`${route}/estimate`).set(auth()).send({ ...estimate, model: 'arbitrary-model' }).expect(400);
    const result = await request(app.getHttpServer()).post(`${route}/estimate`).set(auth()).send(estimate).expect(201);
    expect(result.body.model).toBe('gpt-5.6-luna');
    expect(result.body.maxCredits).toBe(10);
    expect(await prisma.storeSourceGeneration.count({ where: { storeId } })).toBe(0);
  });

  it("aggregates authored size without returning images and restricts it to the merchant", async () => {
    const owner = await prisma.store.findUniqueOrThrow({where: {id: storeId}});
    const projects = app.get(SourceProjectsService);
    const size = await projects.authoredSize(owner.merchantId, storeId, 5);
    expect(size).toBe('<h1>Shop</h1>'.length + 'index.html'.length + 32);
    expect(await projects.authoredSize('foreign', storeId, 5)).toBe(0);
    expect(await projects.current(owner.merchantId, storeId)).toMatchObject({revision: 5, slug});
  });

  it("serializes active generations and settles usage in the same transaction as a revision", async () => {
    const data = { storeId, activeStoreId: storeId, baseRevision: 5, requestedModel: 'auto', model: 'gpt-5.6-terra', maxCredits: 50 };
    const run = await prisma.storeSourceGeneration.create({ data });
    await expect(prisma.storeSourceGeneration.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    const owner = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const projects = app.get(SourceProjectsService);
    await prisma.store.update({where: {id: storeId}, data: {checkoutMode: 'whatsapp'}});
    const settlement = { id: run.id, enablePayments: true, data: { credits: 3, status: 'COMPLETED', activeStoreId: null, revision: 6, completedAt: new Date() } };
    await expect(projects.save(owner.merchantId, storeId, source(4, 'Stale'), settlement)).rejects.toThrow('otra sesión');
    expect(await prisma.storeSourceGeneration.findUnique({ where: { id: run.id } })).toMatchObject({ credits: 0, status: 'RUNNING' });
    expect((await prisma.store.findUniqueOrThrow({where: {id: storeId}})).checkoutMode).toBe('whatsapp');
    await projects.save(owner.merchantId, storeId, source(5, 'Generated'), settlement);
    expect((await prisma.store.findUniqueOrThrow({where: {id: storeId}})).checkoutMode).toBe('payment');
    expect(await prisma.storeSourceGeneration.findUnique({ where: { id: run.id } })).toMatchObject({ credits: 3, status: 'COMPLETED', revision: 6, activeStoreId: null });
    const history = await request(app.getHttpServer()).get(`${route}/usage`).set(auth()).expect(200);
    expect(history.body.runs[0]).toMatchObject({ credits: 3, revision: 6 });
  });

  it("saves motion as an owned revision without generation credits and rejects stale updates", async () => {
    const input = source(6, 'Motion-ready');
    input.files.push({path:'config.js',content:'window.PAGOSYA_CONFIG = {"slug":"test"};'});
    await request(app.getHttpServer()).put(route).set(auth()).send(input).expect(200);
    const usageBefore = await prisma.storeSourceGeneration.count({where:{storeId}});
    await request(app.getHttpServer()).patch(`${route}/motion`).send({revision:7,motion:'subtle'}).expect(401);
    await request(app.getHttpServer()).patch(`${route}/motion`).set(auth(foreignToken)).send({revision:7,motion:'subtle'}).expect(404);
    await request(app.getHttpServer()).patch(`${route}/motion`).set(auth()).send({revision:7,motion:'invalid'}).expect(400);
    await request(app.getHttpServer()).patch(`${route}/motion`).set(auth()).send({revision:7,motion:'off'}).expect(200);
    await request(app.getHttpServer()).patch(`${route}/motion`).set(auth()).send({revision:7,motion:'expressive'}).expect(409);
    const saved = await request(app.getHttpServer()).get(`${route}/versions/8`).set(auth()).expect(200);
    expect(saved.body.snapshot.files.find((f:any)=>f.path==='config.js').content).toContain('"motion":"off"');
    expect(saved.body.snapshot.files.find((f:any)=>f.path==='commerce.js').content).toContain('pagosya-motion:start');
    expect(saved.body.snapshot.files.find((f:any)=>f.path==='index.html').content).toBe('<h1>Shop</h1>');
    expect(await prisma.storeSourceGeneration.count({where:{storeId}})).toBe(usageBefore);
  });

  it('commits requested products with their source revision and rolls back every product if saving fails', async () => {
    const owner = await prisma.store.findUniqueOrThrow({where:{id:storeId}});
    const projects = app.get(SourceProjectsService);
    const run = await prisma.storeSourceGeneration.create({data:{storeId,activeStoreId:storeId,baseRevision:8,requestedModel:'auto',model:'gpt-5.6-terra',maxCredits:50}});
    const settlement = {id:run.id,products:[{name:'Matcha frío',amount:3500,currency:'BOB',description:'Matcha con hielo'}],data:{status:'COMPLETED',activeStoreId:null,revision:9}};
    const input = source(8,'Con Matcha');
    input.files.push({path:'config.js',content:'window.PAGOSYA_CONFIG = {"data":{"items":[]}};'});
    const before = await prisma.paymentLink.count({where:{storeId}});
    // A cancelled generation fails after catalog insertion; the database must roll everything back.
    await prisma.storeSourceGeneration.update({where:{id:run.id},data:{status:'INTERRUPTED',activeStoreId:null}});
    await expect(projects.save(owner.merchantId,storeId,input,settlement)).rejects.toThrow('expiró');
    expect(await prisma.paymentLink.count({where:{storeId}})).toBe(before);
    expect((await projects.current(owner.merchantId,storeId)).revision).toBe(8);
    await prisma.storeSourceGeneration.update({where:{id:run.id},data:{status:'RUNNING',activeStoreId:storeId}});
    const saved = await projects.save(owner.merchantId,storeId,input,settlement);
    expect(saved.createdProducts).toHaveLength(1);
    const product = await prisma.paymentLink.findUniqueOrThrow({where:{id:saved.createdProducts[0].id}});
    expect(product).toMatchObject({storeId,name:'Matcha frío',amount:3500,status:'ACTIVE'});
    const version = await projects.version(owner.merchantId,storeId,9);
    expect(JSON.stringify(version.snapshot)).toContain(product.id);
    await expect(projects.save(owner.merchantId,storeId,input,settlement)).rejects.toThrow('otra sesión');
    expect(await prisma.paymentLink.count({where:{storeId}})).toBe(before+1);
  });

  it('creates merchant-defined combinations through HTTP and checks exact color-size inventory', async () => {
    const dimensions = [{ name: 'Material', value: 'Algodón' }, { name: 'Corte', value: 'Recto' }, { name: 'Cuello', value: 'Redondo' }, { name: 'Manga', value: 'Larga' }];
    const variants = [['Azul', 'S', 0], ['Blanco', 'S', 5], ['Azul', 'M', 1], ['Blanco', 'M', 0]].map(([color, size, stock]) => ({
      name: '', amount: 12000, stock, options: [{ name: 'Color', value: color }, { name: 'Talla', value: size }, ...dimensions],
    }));
    const response = await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({ name: 'Camisa configurable', amount: 12000, currency: 'BOB', variants }).expect(201);
    const product = await prisma.paymentLink.findUniqueOrThrow({ where: { id: response.body.id } });
    const saved = product.variants as any[];
    expect(saved.map(v => v.stock)).toEqual([0, 5, 1, 0]);
    const owner = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { status: 'ACTIVE' } });
    await prisma.store.update({ where: { id: storeId }, data: { status: 'ACTIVE', sourcePublicationPaused: false } });
    const service = app.get(StoresService);
    const publicStore = await service.getStorePublic(slug, { trackView: false, ownerMerchantId: owner.merchantId });
    expect(publicStore.items.find(p => p.id === product.id)?.variants[1]).toMatchObject({ options: saved[1].options, purchaseLimit: 5 });
    const quote = (variantId: string, quantity = 1) => service.createCartCheckout(slug, { items: [{ paymentLinkId: product.id, variantId, quantity }] }, true);
    await expect(quote(saved[0].id)).rejects.toThrow();
    await expect(quote(saved[1].id, 6)).rejects.toThrow();
    await expect(quote('not-a-combination')).rejects.toThrow();
    expect(await quote(saved[1].id, 2)).toMatchObject({ subtotal: 24000 });
    // Another checkout changed White/S while the merchant was editing Blue/M.
    await prisma.paymentLink.update({ where: { id: product.id }, data: { variants: saved.map((v, i) => i === 1 ? { ...v, stock: 4 } : v), stock: 5 } });
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/payment_links/${product.id}`).set(auth()).send({ variants: saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, options: v.options, ...(i === 2 ? { stock: 2 } : {}) })) }).expect(200);
    const updated = await prisma.paymentLink.findUniqueOrThrow({ where: { id: product.id } });
    expect((updated.variants as any[]).map(v => [v.id, v.stock])).toEqual(saved.map((v, i) => [v.id, [0, 4, 2, 0][i]]));
  });

  it('persists chat combinations and enforces their identity, price and stock in checkout', async()=>{
    const owner=await prisma.store.findUniqueOrThrow({where:{id:storeId}});
    const projects=app.get(SourceProjectsService);
    const revision=(await projects.current(owner.merchantId,storeId)).revision;
    const instruction='Crea producto Camisa por Bs 120, color Negro talla M, color Blanco talla L +Bs 20, 5 de cada una';
    const variant={name:null,options:[{name:'Color',value:'Negro'},{name:'Talla',value:'M'}],amount:null,priceText:null,stock:5,stockText:'5 de cada una',imageUrl:null};
    const products=requestedSourceProducts([{name:'Camisa',description:'',amount:12000,currency:'BOB',priceText:'Bs 120',imageUrls:[],variants:[variant,{...variant,options:[{name:'Color',value:'Blanco'},{name:'Talla',value:'L'}],amount:14000,priceText:'+Bs 20'}]}],instruction,new Set());
    const run=await prisma.storeSourceGeneration.create({data:{storeId,activeStoreId:storeId,baseRevision:revision,requestedModel:'auto',model:'test',maxCredits:50}});
    const input=source(revision,'Combinaciones');input.files.push({path:'config.js',content:'window.PAGOSYA_CONFIG = {"data":{"items":[]}};'});
    const saved=await projects.save(owner.merchantId,storeId,input,{id:run.id,products,data:{status:'COMPLETED',activeStoreId:null,revision:revision+1}});
    const product=await prisma.paymentLink.findUniqueOrThrow({where:{id:saved.createdProducts[0].id}});
    const variants=product.variants as any[];
    expect(product).toMatchObject({amount:12000,stock:10});
    expect(variants.map(v=>[v.name,v.amount,v.stock])).toEqual([['Negro / M',12000,5],['Blanco / L',14000,5]]);
    const publicStore=await app.get(StoresService).getStorePublic(slug,{trackView:false,ownerMerchantId:owner.merchantId});
    expect(publicStore.items.find(item=>item.id===product.id)?.variants[0]).toMatchObject({id:variants[0].id,options:variant.options,purchaseLimit:5});
    const updates=requestedSourceProductOperations([{action:'update',productId:product.id,variantOperations:[{action:'update',variantId:variants[1].id,name:null,options:null,amount:null,priceText:null,stock:0,stockText:'agotado',imageUrl:null}]}], 'Marca la talla L como agotado',[{...product,variants} as any],new Set());
    // A purchase changed a different combination after the model received context.
    await prisma.paymentLink.update({where:{id:product.id},data:{variants:[{...variants[0],stock:4},variants[1]],stock:9}});
    const editRun=await prisma.storeSourceGeneration.create({data:{storeId,activeStoreId:storeId,baseRevision:revision+1,requestedModel:'auto',model:'test',maxCredits:50}});
    await projects.save(owner.merchantId,storeId,{...input,revision:revision+1},{id:editRun.id,productOperations:updates,data:{status:'COMPLETED',activeStoreId:null,revision:revision+2}});
    const updated=await prisma.paymentLink.findUniqueOrThrow({where:{id:product.id}});
    expect(updated.variants).toEqual([{...variants[0],stock:4},{...variants[1],stock:0}]);expect(updated.stock).toBe(4);
    await prisma.merchant.update({where:{id:owner.merchantId},data:{status:'ACTIVE'}});
    await prisma.store.update({where:{id:storeId},data:{status:'ACTIVE',sourcePublicationPaused:false}});
    const checkout=app.get(StoresService);
    await expect(checkout.createCartCheckout(slug,{items:[{paymentLinkId:product.id,quantity:1}]},true)).rejects.toThrow(/opción/);
    await expect(checkout.createCartCheckout(slug,{items:[{paymentLinkId:product.id,variantId:'foreign',quantity:1}]},true)).rejects.toThrow();
    await expect(checkout.createCartCheckout(slug,{items:[{paymentLinkId:product.id,variantId:variants[1].id,quantity:1}]},true)).rejects.toThrow();
    await expect(checkout.createCartCheckout(slug,{items:[{paymentLinkId:product.id,variantId:variants[0].id,quantity:5}]},true)).rejects.toThrow();
    const quote=await checkout.createCartCheckout(slug,{items:[{paymentLinkId:product.id,variantId:variants[0].id,quantity:2}]},true);
    expect(JSON.stringify(quote)).toContain('24000');
  });

});
