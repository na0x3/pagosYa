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
    await db.paymentLink.create({ data: { storeId: store.id, name: 'ÁRBOL de NAVIDAD', amount: 5000 } });
    await db.paymentLink.create({ data: { storeId: store.id, name: 'Zapatos', amount: 5000 } });
    await db.storeReview.create({ data: { storeId: store.id, orderId: 'o1', productId: 'x1', displayName: 'Lucía', rating: 5, body: 'Calidad zafiro increíble', status: 'PUBLISHED' } });
    await db.storeReview.create({ data: { storeId: store.id, orderId: 'o2', productId: 'x2', displayName: 'Pedro', rating: 4, body: 'Detalle turquesa pendiente', status: 'PENDING' } });
    await db.storeArticle.create({ data: { storeId: store.id, slug: 'futuro', title: 'Anuncio futuro', excerpt: '', body: 'Lanzamiento esmeralda', author: 'Ana', publishedAt: new Date(Date.now() + 3 * 3_600_000) } });
    await db.storeArticle.create({ data: { storeId: other.id, slug: 'ajeno', title: 'Artículo ajeno', excerpt: '', body: 'Historia ambar de otra tienda', author: 'Ana', publishedAt: new Date(Date.now() - 60_000) } });
  });
  afterAll(async () => { await app.close(); });

  it('finds plurals and accents, only active products of this store', async () => {
    const ids = await searchProductIds(db, store.id, 'chompas');
    expect(ids).toHaveLength(1);
    expect(await searchProductIds(db, store.id, 'gorro')).toEqual([]);
    expect(await searchProductIds(db, store.id, 'tejida a mano', 'zapatos')).toEqual([]);
  });

  it('folds capital accents', async () => {
    expect(await searchProductIds(db, store.id, 'arbol')).toHaveLength(1);
  });

  it('treats % and _ in a category literally', async () => {
    expect(await searchProductIds(db, store.id, 'zapatos', '%')).toEqual([]);
    expect(await searchProductIds(db, store.id, 'zapatos', '_')).toEqual([]);
  });

  it('finds published reviews only, and only published articles of this store', async () => {
    expect((await searchInfo(db, store.id, 'zafiro', [])).map((p) => p.title)).toEqual(['Reseña de Lucía']);
    expect(await searchInfo(db, store.id, 'turquesa', [])).toEqual([]);
    expect(await searchInfo(db, store.id, 'esmeralda', [])).toEqual([]);
    expect(await searchInfo(db, store.id, 'ambar', [])).toEqual([]);
  });

  it('returns the part of a long passage around the match', async () => {
    const body = `${'Relleno de tienda. '.repeat(160)}Los envíos a Pando salen los jueves.`;
    const [hit] = await searchInfo(db, store.id, 'pando', [{ title: 'Envíos', body }]);
    expect(hit.body).toContain('Pando');
    expect(hit.body.length).toBeLessThan(900);
  });

  it('searches published articles and the store passages, never drafts', async () => {
    const found = await searchInfo(db, store.id, 'sucre', [{ title: 'Envíos', body: 'Hacemos envíos a todo el país.' }]);
    expect(found.map((p) => p.title)).toEqual(['Nuestra historia']);
    expect((await searchInfo(db, store.id, 'envio', [{ title: 'Envíos', body: 'Hacemos envíos a todo el país.' }])).map((p) => p.title)).toEqual(['Envíos']);
  });
});
