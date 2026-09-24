import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REWARD_RANDOM } from '../src/rewards/reward-random';

// Scripted randomness: each test pushes the exact values the service will draw, in order.
const draws: number[] = [];
const scriptedRandom = { int: (max: number) => { const next = draws.shift(); if (next === undefined) throw new Error('No scripted draw left'); return next % max; } };

describe('Rewards: daily wheel and Horizonte board', () => {
  let app: INestApplication, prisma: PrismaService, merchantId: string, storeId: string, foreignStoreId: string, session: string, merchantUserId: string;
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${session}` });
  let saleSeq = 0;
  const sell = (count: number, target = storeId) => prisma.paymentIntent.createMany({ data: Array.from({ length: count }, () => ({ merchantId, amount: 1000, clientSecret: `pi_secret_rewards_${++saleSeq}_${Date.now()}`, status: 'SUCCEEDED' as const, metadata: { storeId: target } })) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(REWARD_RANDOM).useValue(scriptedRandom).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    const owner = await http().post('/v1/merchants').send({ name: 'Rewards Owner', email: 'rewards-owner@test.example', settlementMode: 'AGGREGATOR' }).expect(201);
    merchantId = owner.body.merchant.id;
    storeId = (await http().post('/v1/stores').set({ Authorization: `Bearer ${owner.body.testKeys.secretKey}` }).send({ name: 'Rewards Store' }).expect(201)).body.id;
    const other = await http().post('/v1/merchants').send({ name: 'Rewards Other', email: 'rewards-other@test.example', settlementMode: 'AGGREGATOR' }).expect(201);
    foreignStoreId = (await http().post('/v1/stores').set({ Authorization: `Bearer ${other.body.testKeys.secretKey}` }).send({ name: 'Foreign Store' }).expect(201)).body.id;
    const password = 'Correct-password-2026!';
    merchantUserId = (await prisma.merchantUser.create({ data: { merchantId, email: 'rewards-owner-user@test.example', hashedPassword: await argon2.hash(password), emailVerifiedAt: new Date() } })).id;
    session = (await http().post('/v1/dashboard/login').send({ email: 'rewards-owner-user@test.example', password }).expect(201)).body.token;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(async () => {
    draws.length = 0;
    await prisma.aiCreditRedemption.deleteMany({ where: { merchantId } });
    await prisma.dailyWheelSpin.deleteMany({ where: { merchantUserId } });
    await prisma.rewardGrant.deleteMany({ where: { merchantId } });
    await prisma.boardState.deleteMany({ where: { storeId } });
    await prisma.paymentIntent.deleteMany({ where: { merchantId } });
  });

  it("reports a fresh state and hides other merchants' stores", async () => {
    const state = (await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).set(auth()).expect(200)).body;
    expect(state).toMatchObject({ wheel: { available: true, spinsUsed: 0, spinsAllowed: 1 }, board: { position: 0, rollsAvailable: 0, salesUntilNextRoll: 10 }, bonusXp: 0, aiCreditBalance: 0, aiCreditMonthlyCap: 50 });
    expect(state.wheel.segments).toHaveLength(9);
    expect(state.board.tiles).toHaveLength(24);
    expect(state.stickers).toHaveLength(9);
    await http().get(`/v1/dashboard/rewards?storeId=${foreignStoreId}`).set(auth()).expect(404);
    await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).expect(401);
  });
});
