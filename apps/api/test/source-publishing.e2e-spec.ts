import { SourceGenerationService } from '../src/stores/source-generation.service';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Published source and two-version sales tests', () => {
  let app: INestApplication, prisma: PrismaService, token: string, foreign: string, storeId: string, slug: string, productId: string, route: string, testId: string, visitToken: string;
  const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
  const source = (revision: number, title: string) => ({ revision, label: title, brief: { businessType:'Café',audience:'Vecinos',primaryAction:'Comprar',visualDirection:'Editorial' }, files: [
    {path:'index.html',content:`<h1>${title}</h1><button data-cart-open>Pedido</button><div data-pagosya-catalog></div><div data-pagosya-cart></div><script src="config.js"></script><script src="commerce.js"></script>`},
    {path:'config.js',content:'window.PAGOSYA_CONFIG = {"slug":"cafe"};'}, {path:'commerce.js',content:'// commerce'},
    {path:'package.json',content:'{"name":"test","scripts":{"build":"node build.mjs"}}'}, {path:'build.mjs',content:'// build'}, {path:'README.md',content:'Source project'},
  ] });
  beforeAll(async () => {
    const module = await Test.createTestingModule({imports:[AppModule]}).compile(); app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true})); await app.init(); prisma=app.get(PrismaService);
    for (const name of ['PublishOwner','PublishForeign']) {
      const created=await request(app.getHttpServer()).post('/v1/merchants').send({name,email:`${name}@test.example`,settlementMode:'AGGREGATOR'}).expect(201);
      if(name==='PublishOwner') token=created.body.testKeys.secretKey; else foreign=created.body.testKeys.secretKey;
    }
    const store=await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({name:'Test Store'}).expect(201);
    storeId=store.body.id;slug=store.body.slug;route=`/v1/stores/${storeId}/source-project`;
    const product=await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({name:'Café',amount:10000,currency:'BOB'}).expect(201);productId=product.body.id;
  });
  afterAll(async()=>{await app?.close();});
  it('keeps drafts private, publishes explicitly, and preserves the live revision during edits', async()=>{
    await request(app.getHttpServer()).put(route).set(auth()).send(source(0,'A')).expect(200);
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site`).expect(200)).body).toEqual({published:false});
    await request(app.getHttpServer()).post(`${route}/publish`).send({revision:1,publicationVersion:0}).expect(401);
    await request(app.getHttpServer()).post(`${route}/publish`).set(auth(foreign)).send({revision:1,publicationVersion:0}).expect(404);
    const published=await request(app.getHttpServer()).post(`${route}/publish`).set(auth()).send({revision:1,publicationVersion:0}).expect(201);
    expect(published.body).toMatchObject({revision:1,version:1});
    await request(app.getHttpServer()).put(route).set(auth()).send(source(1,'B')).expect(200);
    const generation = jest.spyOn(app.get(SourceGenerationService), 'generate').mockResolvedValueOnce({ revision: 3 } as any);
    await request(app.getHttpServer()).post(`${route}/alternative`).set(auth()).send({revision:2,instruction:'Más claridad',model:'gpt-5.6-luna',maxCredits:8}).expect(201);
    expect(generation).toHaveBeenCalledWith(expect.any(String),storeId,expect.objectContaining({revision:2,baseRevision:1,model:'gpt-5.6-luna',maxCredits:8}));
    generation.mockRestore();
    const live=await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site`).expect(200);
    expect(live.headers['cache-control']).toBe('private, no-store');
    expect(live.body.revision).toBe(1);
    expect(live.body.snapshot.files.some((f:any)=>f.path==='package.json')).toBe(false);
    expect(live.body.snapshot.files.find((f:any)=>f.path==='index.html').content).toContain('<h1>A</h1>');
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/store`).expect(200)).body.publishedSourceRevision).toBe(1);
  });
  it('pins two revisions, assigns visitors consistently and rejects concurrent publication changes', async()=>{
    await request(app.getHttpServer()).post(`${route}/experiments`).set(auth()).send({revision:1,publicationVersion:1}).expect(400);
    const started=await request(app.getHttpServer()).post(`${route}/experiments`).set(auth()).send({revision:2,publicationVersion:1}).expect(201);
    testId=started.body.experiment.id;expect(started.body.version).toBe(2);
    await request(app.getHttpServer()).post(`${route}/experiments`).set(auth()).send({revision:2,publicationVersion:1}).expect(409);
    await request(app.getHttpServer()).post(`${route}/publish`).set(auth()).send({revision:2,publicationVersion:2}).expect(409);
    await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site?visitorId=invalid`).expect(400);
    const visitor=randomUUID();
    const visits=await Promise.all([1,2].map(()=>request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site?visitorId=${visitor}`).expect(200)));
    expect(visits[0].body.revision).toBe(visits[1].body.revision);expect(visits[0].body.visitToken).toBe(visits[1].body.visitToken);visitToken=visits[0].body.visitToken;
    expect(await prisma.storeSourceVisit.count({where:{experimentId:testId}})).toBe(1);
    const preview=await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site`).expect(200);
    expect(preview.body.visitToken).toBeNull();expect(await prisma.storeSourceVisit.count({where:{experimentId:testId}})).toBe(1);
    await request(app.getHttpServer()).post(`${route}/experiments/finish`).set(auth()).send({experimentId:testId,publicationVersion:2,apply:true}).expect(400);
    await request(app.getHttpServer()).put(route).set(auth()).send(source(2,'Private C')).expect(200);
    const repeat=await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site?visitorId=${visitor}`).expect(200);
    expect(repeat.body.revision).toBe(visits[0].body.revision);
  });
  it('attributes confirmed payments on the server, deduplicates buyers, and subtracts refunds', async()=>{
    const pay=async(sourceVisitToken=visitToken)=> (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({sourceVisitToken,items:[{paymentLinkId:productId,quantity:1}]}).expect(201)).body;
    const checkout=await pay();
    const order=await prisma.storeOrder.findUniqueOrThrow({where:{paymentIntentId:checkout.id}});expect(order.sourceVisitId).not.toBeNull();
    const state=async()=> (await request(app.getHttpServer()).get(route).set(auth()).expect(200)).body.publication;
    await prisma.paymentIntent.update({where:{id:checkout.id},data:{status:'SUCCEEDED'}});
    expect((await state()).experiment.variants.reduce((n:number,v:any)=>n+v.buyers,0)).toBe(0);
    await prisma.paymentIntent.update({where:{id:checkout.id},data:{livemode:true}});
    await prisma.transaction.create({data:{paymentIntentId:checkout.id,type:'REFUND',status:'SUCCEEDED',amount:2500,railId:'test'}});
    const another=await pay();await prisma.paymentIntent.update({where:{id:another.id},data:{livemode:true,status:'SUCCEEDED'}});
    const stats=(await state()).experiment.variants.find((v:any)=>v.buyers);
    expect(stats).toMatchObject({buyers:1,paidOrders:2,revenue:[{currency:'BOB',amount:17500}]});
    await prisma.transaction.create({data:{paymentIntentId:checkout.id,type:'REFUND',status:'SUCCEEDED',amount:7500,railId:'test'}});
    expect((await state()).experiment.variants.find((v:any)=>v.buyers)).toMatchObject({buyers:1,paidOrders:1,revenue:[{currency:'BOB',amount:10000}]});
    const forged=await pay('x'.repeat(32));expect((await prisma.storeOrder.findUniqueOrThrow({where:{paymentIntentId:forged.id}})).sourceVisitId).toBeNull();
    const other=await request(app.getHttpServer()).post('/v1/stores').set(auth(foreign)).send({name:'Other'}).expect(201);
    const product=await request(app.getHttpServer()).post(`/v1/stores/${other.body.id}/payment_links`).set(auth(foreign)).send({name:'Otro',amount:10000,currency:'BOB'}).expect(201);
    const foreignPay=await request(app.getHttpServer()).post(`/v1/stores/public/${other.body.slug}/cart-checkout`).send({sourceVisitToken:visitToken,items:[{paymentLinkId:product.body.id,quantity:1}]}).expect(201);
    expect((await prisma.storeOrder.findUniqueOrThrow({where:{paymentIntentId:foreignPay.body.id}})).sourceVisitId).toBeNull();
  });
  it('stops safely and only applies an evidence-backed winner after merchant action', async()=>{
    await request(app.getHttpServer()).post(`${route}/experiments/finish`).set(auth(foreign)).send({experimentId:testId,publicationVersion:2,apply:false}).expect(404);
    const stopped=await request(app.getHttpServer()).post(`${route}/experiments/finish`).set(auth()).send({experimentId:testId,publicationVersion:2,apply:false}).expect(201);
    expect(stopped.body).toMatchObject({revision:1,version:3,experiment:{status:'STOPPED'}});
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site?visitorId=${randomUUID()}`).expect(200)).body.revision).toBe(1);
    const second=await request(app.getHttpServer()).post(`${route}/experiments`).set(auth()).send({revision:2,publicationVersion:3}).expect(201);
    const id=second.body.experiment.id;
    await prisma.storeSourceExperiment.update({where:{id},data:{startedAt:new Date(Date.now()-8*86400000)}});
    const owner=await prisma.store.findUniqueOrThrow({where:{id:storeId}});
    for(const variant of ['A','B']) {
      await prisma.storeSourceVisit.createMany({data:Array.from({length:1000},(_,i)=>({id:`${id}-${variant}-${i}`,experimentId:id,visitorHash:`${variant}-${i}`,token:`${id}-${variant}-${i}`,variant}))});
      for(let i=0;i<(variant==='A'?20:100);i++) {
        const intent=await prisma.paymentIntent.create({data:{merchantId:owner.merchantId,amount:1000,currency:'BOB',status:'SUCCEEDED',livemode:true,clientSecret:`${id}-${variant}-${i}`}});
        await prisma.storeOrder.create({data:{paymentIntentId:intent.id,merchantId:owner.merchantId,storeId,storeName:'Test',items:[],amount:1000,sourceVisitId:`${id}-${variant}-${i}`}});
      }
    }
    const applied=await request(app.getHttpServer()).post(`${route}/experiments/finish`).set(auth()).send({experimentId:id,publicationVersion:4,apply:true}).expect(201);
    expect(applied.body).toMatchObject({revision:2,version:5,experiment:{status:'COMPLETED',winner:'B'}});
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site?visitorId=${randomUUID()}`).expect(200)).body.revision).toBe(2);
  });
  it('toggles public visibility without losing revisions and keeps owner preview available', async () => {
    const before = (await request(app.getHttpServer()).get(route).set(auth()).expect(200)).body.publication;
    await request(app.getHttpServer()).post(`${route}/visibility`).set(auth(foreign)).send({published:false,publicationVersion:before.version}).expect(404);
    const off = (await request(app.getHttpServer()).post(`${route}/visibility`).set(auth()).send({published:false,publicationVersion:before.version}).expect(201)).body;
    expect(off).toMatchObject({active:false,revision:before.revision,version:before.version+1});
    await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/store`).expect(404);
    await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site`).expect(404);
    await request(app.getHttpServer()).get(`${route}/catalog`).set(auth()).expect(200);
    await request(app.getHttpServer()).get(`${route}/versions/3`).set(auth()).expect(200);
    await request(app.getHttpServer()).post(`${route}/visibility`).set(auth()).send({published:true,publicationVersion:before.version}).expect(409);
    const on = (await request(app.getHttpServer()).post(`${route}/visibility`).set(auth()).send({published:true,publicationVersion:off.version}).expect(201)).body;
    expect(on).toMatchObject({active:true,revision:before.revision});
    await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/store`).expect(200);
  });

  it('makes contact opt-in, saves its setting with a revision, and uses the same renderer for live and preview', async () => {
    expect((await prisma.store.findUniqueOrThrow({where:{id:storeId}})).contactFormEnabled).toBe(false);
    await request(app.getHttpServer()).patch(`${route}/contact-form`).set(auth(foreign)).send({revision:3,enabled:true}).expect(404);
    await request(app.getHttpServer()).patch(`${route}/contact-form`).set(auth()).send({revision:3,enabled:true}).expect(200);
    await request(app.getHttpServer()).patch(`${route}/contact-form`).set(auth()).send({revision:3,enabled:false}).expect(409);
    expect((await prisma.store.findUniqueOrThrow({where:{id:storeId}})).contactFormEnabled).toBe(true);
    const preview = (await request(app.getHttpServer()).get(`${route}/versions/4`).set(auth()).expect(200)).body;
    const live = (await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/source-site`).expect(200)).body;
    const file = (v:any,path:string)=>v.snapshot.files.find((f:any)=>f.path===path).content;
    expect(file(preview,'index.html')).toContain('data-pagosya-contact');
    expect(file(preview,'commerce.js')).toBe(file(live,'commerce.js'));
    expect(file(preview,'config.js')).toContain('"contactFormEnabled":true');
    await request(app.getHttpServer()).patch(`${route}/contact-form`).set(auth()).send({revision:4,enabled:false}).expect(200);
    expect((await request(app.getHttpServer()).get(`/v1/stores/public/${slug}/store`).expect(200)).body.contactFormEnabled).toBe(false);
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/leads`).send({name:'Client',email:'client@example.com',message:'Hello',items:[]}).expect(400);
  });

  it('deduplicates funnel sessions and counts only server-confirmed live payment completions', async () => {
    const sessionId = randomUUID(); const endpoint = `/v1/stores/public/${slug}/funnel`;
    const results = await Promise.all([1,2,3].map(() => request(app.getHttpServer()).post(endpoint).send({sessionId,event:'add_to_cart'}).expect(201)));
    expect(new Set(results.map(row=>row.body.token)).size).toBe(1);
    const funnelToken = results[0].body.token;
    await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'checkout_started'}).expect(201);
    await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'payment_completed'}).expect(400);
    await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'delivery_selected',address:'Must never be stored'}).expect(400);
    const purchase = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({funnelToken,items:[{paymentLinkId:productId,quantity:1}]}).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({where:{paymentIntentId:purchase.id}});
    expect(order.funnelVisitId).not.toBeNull();
    const summary = async()=> (await request(app.getHttpServer()).get(`/v1/stores/${storeId}/growth/insights`).set(auth()).expect(200)).body.funnel;
    expect(await summary()).toMatchObject({visitors:1,cartAdds:1,checkoutStarts:1,paymentCompletions:0});
    await prisma.paymentIntent.update({where:{id:purchase.id},data:{status:'SUCCEEDED'}});
    expect((await summary()).paymentCompletions).toBe(0);
    await prisma.paymentIntent.update({where:{id:purchase.id},data:{livemode:true}});
    expect((await summary()).paymentCompletions).toBe(1);
    await request(app.getHttpServer()).get(`/v1/stores/${storeId}/growth/insights`).set(auth(foreign)).expect(404);
  });

});
