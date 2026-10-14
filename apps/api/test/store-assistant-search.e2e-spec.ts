import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';
import { searchInfo, searchProductIds } from '../src/store-assistant/assistant-search';

describe('store assistant search (Postgres, Spanish)', () => {
  let app: INestApplication, db: PrismaService, store: any, other: any;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue({ send: jest.fn() }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
    db = app.get(PrismaService);
    const merchant = (await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'SearchOwner', email: 'search-owner@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body;
    const auth = { Authorization: `Bearer ${merchant.testKeys.secretKey}` };
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth).send({ name: 'Lana Viva' }).expect(201)).body;
    other = (await request(app.getHttpServer()).post('/v1/stores').set(auth).send({ name: 'Otra' }).expect(201)).body;
    await db.paymentLink.create({ data: { storeId: store.id, name: 'Chompa de alpaca', description: 'Tejida a mano en La Paz', amount: 25000 } });
    await db.paymentLink.create({ data: { storeId: store.id, name: 'Gorro', description: 'Lana de oveja', amount: 8000, status: 'ARCHIVED' } as any });
    await db.paymentLink.create({ data: { storeId: other.id, name: 'Chompa roja', amount: 1000 } });
    await db.storeArticle.create({ data: { storeId: store.id, slug: 'historia', title: 'Nuestra historia', excerpt: '', body: 'Empezamos en Sucre en 1998 con un taller familiar.', author: 'Ana', publishedAt: new Date(Date.now() - 60_000) } });
    await db.storeArticle.create({ data: { storeId: store.id, slug: 'borrador', title: 'Borrador secreto', excerpt: '', body: 'Sucre secreto', author: 'Ana', publishedAt: null } });
  });
  afterAll(async () => { await app.close(); });

  it('finds plurals and accents, only active products of this store', async () => {
    const ids = await searchProductIds(db, store.id, 'chompas');
    expect(ids).toHaveLength(1);
    expect(await searchProductIds(db, store.id, 'gorro')).toEqual([]);
    expect(await searchProductIds(db, store.id, 'tejida a mano', 'zapatos')).toEqual([]);
  });

  it('searches published articles and the store passages, never drafts', async () => {
    const found = await searchInfo(db, store.id, 'sucre', [{ title: 'Envíos', body: 'Hacemos envíos a todo el país.' }]);
    expect(found.map((p) => p.title)).toEqual(['Nuestra historia']);
    expect((await searchInfo(db, store.id, 'envio', [{ title: 'Envíos', body: 'Hacemos envíos a todo el país.' }])).map((p) => p.title)).toEqual(['Envíos']);
  });
});
