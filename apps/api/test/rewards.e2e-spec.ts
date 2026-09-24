import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REWARD_RANDOM } from '../src/rewards/reward-random';
import { RewardsService } from '../src/rewards/rewards.service';

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

  // pickWeighted draws int(1000). Ranges by segment: STICKER_COMMON 0-269, XP_25 270-519, AI_CREDITS_5 520-554,
  // TIP 555-684, XP_50 685-824, RESPIN 825-874, STICKER_RARE 875-944, XP_200 945-994, AI_CREDITS_25 995-999.
  const WHEEL_DRAW = { STICKER_COMMON: 0, XP_25: 270, AI_CREDITS_5: 520, TIP: 555, XP_50: 685, RESPIN: 825, STICKER_RARE: 875, XP_200: 945, AI_CREDITS_25: 995 } as const;
  const spin = () => http().post('/v1/dashboard/rewards/wheel/spin').set(auth()).send({ storeId });

  it('grants one free spin per Bolivia day and rejects the second', async () => {
    draws.push(WHEEL_DRAW.XP_50);
    const first = (await spin().expect(201)).body;
    expect(first).toMatchObject({ segmentIndex: 4, grant: { prize: 'XP_50', kind: 'XP', amount: 50 }, wheel: { available: false, spinsUsed: 1 } });
    await spin().expect(409);
    expect((await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).set(auth()).expect(200)).body.bonusXp).toBe(50);
  });

  it('lets a RESPIN prize unlock exactly one more spin the same day', async () => {
    draws.push(WHEEL_DRAW.RESPIN);
    expect((await spin().expect(201)).body.wheel).toMatchObject({ available: true, spinsUsed: 1, spinsAllowed: 2 });
    draws.push(WHEEL_DRAW.XP_25);
    expect((await spin().expect(201)).body.wheel).toMatchObject({ available: false, spinsUsed: 2 });
    await spin().expect(409);
  });

  it('gives exactly one prize when two tabs spin at once', async () => {
    draws.push(WHEEL_DRAW.XP_25, WHEEL_DRAW.XP_25);
    const statuses = (await Promise.all([spin(), spin()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await prisma.rewardGrant.count({ where: { merchantId } })).toBe(1);
  });

  it('hands out a sticker the merchant does not own before repeating one', async () => {
    await prisma.rewardGrant.createMany({ data: ['parrot', 'llama', 'cactus', 'pineapple', 'rainbow', 'trumpet'].map((stickerId) => ({ merchantId, storeId, merchantUserId, source: 'WHEEL' as const, kind: 'STICKER' as const, stickerId })) });
    draws.push(WHEEL_DRAW.STICKER_COMMON, 0);
    expect((await spin().expect(201)).body.grant.sticker).toMatchObject({ id: 'coffee', isNew: true });
  });

  it('converts AI credits to 200 XP once the monthly cap is reached', async () => {
    await prisma.rewardGrant.create({ data: { merchantId, storeId, merchantUserId, source: 'BOARD', kind: 'AI_CREDITS', amount: 48 } });
    draws.push(WHEEL_DRAW.AI_CREDITS_5);
    expect((await spin().expect(201)).body.grant).toMatchObject({ prize: 'AI_CREDITS_5', kind: 'XP', amount: 200, convertedFrom: 'AI_CREDITS' });
  });

  it('tells the dashboard whether to open the wheel after the daily login', async () => {
    expect((await http().post('/v1/dashboard/daily-login-reward').set(auth()).expect(201)).body.wheelAvailable).toBe(true);
    draws.push(WHEEL_DRAW.XP_25);
    await spin().expect(201);
    expect((await http().post('/v1/dashboard/daily-login-reward').set(auth()).expect(201)).body.wheelAvailable).toBe(false);
  });

  it('re-opens the free spin at 00:00 Bolivia, not 00:00 UTC', async () => {
    const service = app.get(RewardsService);
    draws.push(WHEEL_DRAW.XP_25);
    await service.spinWheel(merchantId, merchantUserId, storeId, new Date('2026-09-25T03:59:00Z'));
    expect((await service.state(merchantId, merchantUserId, storeId, new Date('2026-09-25T03:59:30Z'))).wheel.available).toBe(false);
    expect((await service.state(merchantId, merchantUserId, storeId, new Date('2026-09-25T04:00:30Z'))).wheel.available).toBe(true);
  });
});
