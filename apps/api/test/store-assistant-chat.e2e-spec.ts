process.env.ASSISTANT_ENABLED = 'true';
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';
import { ASSISTANT_MODEL_FACTORY } from '../src/store-assistant/assistant-model';
import { money } from '../src/store-knowledge/store-knowledge';

describe('POST /v1/stores/public/:slug/assistant/chat', () => {
  let app: INestApplication, db: PrismaService, store: any, product: any;
  const turns: any[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER).useValue({ send: jest.fn() })
      .overrideProvider(ASSISTANT_MODEL_FACTORY).useValue(() => ({ modelName: 'gpt-5.6-luna', model: async () => turns.shift() ?? { calls: [], text: 'Listo.' } }))
      .compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    db = app.get(PrismaService);
    const merchant = (await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'ChatOwner', email: 'chat-owner@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body;
    store = (await request(app.getHttpServer()).post('/v1/stores').set({ Authorization: `Bearer ${merchant.testKeys.secretKey}` }).send({ name: 'Café Yungas' }).expect(201)).body;
    await db.store.update({ where: { id: store.id }, data: { publicVisibility: true, publishedSourceRevision: 1, contactPhone: '+591 70000000' } as any });
    product = await db.paymentLink.create({ data: { storeId: store.id, name: 'Café en grano', description: 'Tostado medio', amount: 6000 } });
  });
  afterAll(async () => { await app.close(); });
  const chat = (body: object) => request(app.getHttpServer()).post(`/v1/stores/public/${store.slug}/assistant/chat`).send(body);

  it('falls back while the store has not switched the assistant on', async () => {
    expect((await chat({ message: 'hola' }).expect(200)).body).toEqual({ conversationId: null, fallback: 'contact' });
  });

  it('answers with a live product card and stores the conversation', async () => {
    await db.storeAssistant.create({ data: { storeId: store.id, enabled: true } });
    const price = money(6000, 'BOB');
    turns.push({ calls: [{ name: 'buscar_productos', arguments: JSON.stringify({ consulta: 'cafe grano', categoria: null }), callId: 'c1' }] }, { calls: [], text: `El Café en grano cuesta ${price}.` });
    const body = (await chat({ message: '¿Tienen café en grano?' }).expect(200)).body;
    expect(body.reply.text).toBe(`El Café en grano cuesta ${price}.`);
    expect(body.reply.blocks).toEqual([{ type: 'products', items: [expect.objectContaining({ id: product.id, price, addKey: product.id })] }]);
    const saved = await db.assistantConversation.findUnique({ where: { id: body.conversationId }, include: { messages: true } });
    expect(saved?.messages.map((m) => m.role).sort()).toEqual(['assistant', 'buyer']);
  });

  it('replaces an invented price', async () => {
    turns.push({ calls: [], text: 'Hoy está a Bs 10.' });
    const body = (await chat({ message: 'precio?' }).expect(200)).body;
    expect(body.reply.text).toBe('Prefiero no darte un dato que no pude confirmar. Te paso con la tienda.');
  });

  it('rejects messages over 500 characters', async () => {
    await chat({ message: 'a'.repeat(501) }).expect(400);
  });

  it('rejects whitespace-only messages and malformed product ids', async () => {
    await chat({ message: '   ' }).expect(400);
    await chat({ message: 'hola', productId: 'bad id; drop' }).expect(400);
  });
});
