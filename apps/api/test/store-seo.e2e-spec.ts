import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Public storefront discovery', () => {
  let app: INestApplication, db: PrismaService, store: any, product: any;
  const path = (suffix = '') => `/v1/stores/public/${store.slug}/seo${suffix}`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init(); db = app.get(PrismaService);
    const merchant = (await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'SEO tests', email: 'seo@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body;
    const auth = { Authorization: `Bearer ${merchant.testKeys.secretKey}` };
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth).send({ name: 'Café & origen' }).expect(201)).body;
    product = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth).send({ name: 'Café recién tostado', amount: 10000, currency: 'BOB' }).expect(201)).body;
    await db.paymentLink.update({ where: { id: product.id }, data: { discountPercent: 20, discountStartsAt: new Date(Date.now() - 86400000), discountEndsAt: new Date(Date.now() + 86400000), stock: 0 } });
    const snapshot = (title: string) => ({ schemaVersion: 1, brief: { audience: 'PRIVATE STRATEGY' }, files: [
      { path: 'index.html', content: `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>Café de los Yungas.</p></body></html>` },
      { path: 'pages/about.html', content: '<html><head><title>Nuestro origen</title></head><body><p>Hecho en Bolivia.</p></body></html>' },
      { path: 'pages/secret.html', content: '<html><head><title>Sin indexar</title><meta name="robots" content="noindex"></head><body>Accesible pero fuera de buscadores</body></html>' },
      { path: 'checkout.html', content: '<h1>Checkout</h1>' },
    ] });
    await db.storeSourceProject.create({ data: { storeId: store.id, revision: 2, versions: { create: [1, 2].map(revision => ({ revision, label: 'SEO test', digest: `seo-${revision}`, snapshot: snapshot(revision === 1 ? 'Publicado' : 'PRIVATE DRAFT') })) } } });
    await db.store.update({ where: { id: store.id }, data: { publishedSourceRevision: 1 } });
  });
  afterAll(async () => { await app?.close(); });
  it('renders only published copy and current prices, with no private brief or invented ratings', async () => {
    const home = (await request(app.getHttpServer()).get(path()).expect(200)).body;
    expect(home.head).toContain('<title>Publicado</title>'); expect(home.body).toContain('Café de los Yungas.');
    expect(JSON.stringify(home)).not.toMatch(/PRIVATE STRATEGY|PRIVATE DRAFT|aggregateRating/);
    const detail = (await request(app.getHttpServer()).get(path(`?productId=${product.id}`)).expect(200)).body;
    expect(detail.canonical).toContain(`/s/${store.slug}/p/${product.id}`);
    expect(detail.head).toContain('"price":"80.00"'); expect(detail.head).toContain('https://schema.org/OutOfStock');
    expect(detail.body).toContain('BOB 80.00');
    await request(app.getHttpServer()).get(path('?productId=missing')).expect(404);
    await request(app.getHttpServer()).get(path('?page=checkout.html')).expect(404);
  });
  it('keeps noindex pages accessible but excludes them and personal data from discovery files', async () => {
    const hidden = (await request(app.getHttpServer()).get(path('?page=pages%2Fsecret.html')).expect(200)).body;
    expect(hidden.noindex).toBe(true); expect(hidden.head).toContain('noindex, nofollow');
    for (const file of ['sitemap.xml', 'llms.txt']) {
      const result = await request(app.getHttpServer()).get(path('/' + file)).expect(200);
      expect(result.text).toContain(product.id); expect(result.text).toContain('about.html');
      expect(result.text).not.toMatch(/secret.html|checkout.html|PRIVATE|recover=|comeback=|unsubscribe=/);
    }
    await request(app.getHttpServer()).get(path('/sitemap.xml?part=2')).expect(404);
  });
  it('uses only verified domains and stops exposing paused stores', async () => {
    await db.customDomain.create({ data: { storeId: store.id, hostname: 'cafe-seo.test', verificationToken: 'seo-domain-test', status: 'PENDING' } });
    expect((await request(app.getHttpServer()).get(path()).expect(200)).body.canonical).not.toContain('cafe-seo.test');
    await db.customDomain.update({ where: { hostname: 'cafe-seo.test' }, data: { status: 'ACTIVE', verifiedAt: new Date() } });
    expect((await request(app.getHttpServer()).get(path(`?productId=${product.id}`)).expect(200)).body.canonical).toBe(`https://cafe-seo.test/p/${product.id}`);
    expect((await request(app.getHttpServer()).get(path('/sitemap.xml')).expect(200)).text).toContain('https://cafe-seo.test/');
    await db.store.update({ where: { id: store.id }, data: { sourcePublicationPaused: true } });
    for (const suffix of ['', '/sitemap.xml', '/llms.txt']) await request(app.getHttpServer()).get(path(suffix)).expect(404);
    expect((await request(app.getHttpServer()).get('/v1/store-discovery').expect(200)).body.some((s: any) => s.home.includes(store.slug))).toBe(false);
  });
});
