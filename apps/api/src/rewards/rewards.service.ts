import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RewardKind, RewardSource } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AI_CREDIT_MONTHLY_CAP, BOARD_LAYOUT, BOARD_SALES_PER_ROLL, BOARD_TILES, CAP_FALLBACK_XP, PRIZES, STICKERS, TIPS, WHEEL_SEGMENTS, boliviaDayKey, boliviaMonthStart, pickWeighted, type PrizeKey, type RandomSource } from "./reward-policy";
import { aiCreditBalance, aiCreditsGrantedSince, countStoreSales, gameXpForStore, wheelSpinsToday, type Db } from "./reward-queries";
import { REWARD_RANDOM } from "./reward-random";

export interface GrantContext { merchantId: string; merchantUserId: string; storeId: string }
export interface GrantView {
  id: string;
  prize: PrizeKey;
  kind: RewardKind;
  amount: number;
  convertedFrom: RewardKind | null;
  sticker: { id: string; icon: string; name: string; rare: boolean; isNew: boolean } | null;
  tip: { id: string; kind: "mission" | "tip"; text: string } | null;
}

/** Draws, stores and reports prizes. The dashboard only ever animates what this returns. */
@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService, @Inject(REWARD_RANDOM) private readonly random: RandomSource) {}

  async state(merchantId: string, merchantUserId: string, storeId: string, now = new Date()) {
    await this.assertStore(merchantId, storeId);
    const day = boliviaDayKey(now);
    const [spins, board, sales, bonusXp, owned, balance, thisMonth] = await Promise.all([
      wheelSpinsToday(this.prisma, merchantUserId, day),
      this.prisma.boardState.findUnique({ where: { storeId } }),
      countStoreSales(this.prisma, merchantId, storeId),
      gameXpForStore(this.prisma, storeId),
      this.ownedStickers(this.prisma, merchantUserId),
      aiCreditBalance(this.prisma, merchantId),
      aiCreditsGrantedSince(this.prisma, merchantId, boliviaMonthStart(now)),
    ]);
    const rollsUsed = board?.rollsUsed ?? 0;
    return {
      wheel: this.wheelView(day, spins),
      board: {
        position: board?.position ?? 0,
        rollsUsed,
        rollsAvailable: Math.max(0, Math.floor(sales / BOARD_SALES_PER_ROLL) - rollsUsed),
        salesUntilNextRoll: BOARD_SALES_PER_ROLL - (sales % BOARD_SALES_PER_ROLL),
        lapsCompleted: board?.lapsCompleted ?? 0,
        tiles: [...BOARD_LAYOUT],
      },
      bonusXp,
      stickers: STICKERS.map((sticker) => ({ ...sticker, owned: owned.has(sticker.id) })),
      aiCreditBalance: balance,
      aiCreditsThisMonth: thisMonth,
      aiCreditMonthlyCap: AI_CREDIT_MONTHLY_CAP,
    };
  }

  async spinWheel(merchantId: string, merchantUserId: string, storeId: string, now = new Date()) {
    await this.assertStore(merchantId, storeId);
    const day = boliviaDayKey(now);
    const alreadySpun = () => new ConflictException("Ya usaste tu giro de hoy.");
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockMerchant(tx, merchantId);
      const spins = await wheelSpinsToday(tx, merchantUserId, day);
      if (spins.used >= spins.allowed) throw alreadySpun();
      const segmentIndex = pickWeighted(this.random);
      const grant = await this.grant(tx, { merchantId, merchantUserId, storeId }, WHEEL_SEGMENTS[segmentIndex].key, RewardSource.WHEEL, now);
      await tx.dailyWheelSpin.create({ data: { merchantUserId, day, attempt: spins.used, grantId: grant.id } });
      return { segmentIndex, grant };
    }).catch((error: unknown) => {
      // The (merchantUserId, day, attempt) key is the last line of defence behind the merchant lock.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw alreadySpun();
      throw error;
    });
    return { ...result, wheel: this.wheelView(day, await wheelSpinsToday(this.prisma, merchantUserId, day)) };
  }

  async rollBoard(merchantId: string, merchantUserId: string, storeId: string, now = new Date()) {
    await this.assertStore(merchantId, storeId);
    const noRolls = () => new ConflictException("Todavía no tienes tiros. Cada 10 ventas ganas uno.");
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockMerchant(tx, merchantId);
      const board = await tx.boardState.upsert({ where: { storeId }, create: { storeId, merchantId }, update: {} });
      const sales = await countStoreSales(tx, merchantId, storeId);
      if (Math.floor(sales / BOARD_SALES_PER_ROLL) - board.rollsUsed <= 0) throw noRolls();
      const die = this.random.int(6) + 1;
      const from = board.position;
      const lapCompleted = from + die >= BOARD_TILES;
      const to = (from + die) % BOARD_TILES;
      const moved = await tx.boardState.updateMany({
        where: { storeId, rollsUsed: board.rollsUsed },
        data: { position: to, rollsUsed: { increment: 1 }, ...(lapCompleted ? { lapsCompleted: { increment: 1 } } : {}) },
      });
      if (moved.count !== 1) throw noRolls();
      const grant = await this.grant(tx, { merchantId, merchantUserId, storeId }, BOARD_LAYOUT[to], RewardSource.BOARD, now);
      return { die, from, to, lapCompleted, grant };
    });
    const { board } = await this.state(merchantId, merchantUserId, storeId, now);
    return { ...result, board };
  }

  protected wheelView(day: string, spins: { used: number; allowed: number }) {
    return { available: spins.used < spins.allowed, day, spinsUsed: spins.used, spinsAllowed: spins.allowed, segments: WHEEL_SEGMENTS.map((segment) => segment.key) };
  }

  protected async assertStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } });
    if (!store) throw new NotFoundException("Tienda no encontrada");
  }

  /** Serialises every grant for one merchant so the monthly credit cap, "new sticker first" and roll counts hold under concurrency. */
  protected async lockMerchant(tx: Prisma.TransactionClient, merchantId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${merchantId}))::text`;
  }

  private async ownedStickers(db: Db, merchantUserId: string) {
    const rows = await db.rewardGrant.findMany({ where: { merchantUserId, kind: RewardKind.STICKER }, distinct: ["stickerId"], select: { stickerId: true } });
    return new Set(rows.map((row) => row.stickerId).filter((id): id is string => !!id));
  }

  protected async grant(tx: Prisma.TransactionClient, ctx: GrantContext, key: PrizeKey, source: RewardSource, now: Date): Promise<GrantView> {
    const prize = PRIZES[key];
    let kind = prize.kind as RewardKind;
    let amount = prize.amount;
    let convertedFrom: RewardKind | null = null;
    let sticker: GrantView["sticker"] = null;
    let tip: GrantView["tip"] = null;

    if (kind === RewardKind.AI_CREDITS) {
      const granted = await aiCreditsGrantedSince(tx, ctx.merchantId, boliviaMonthStart(now));
      if (granted + amount > AI_CREDIT_MONTHLY_CAP) { convertedFrom = RewardKind.AI_CREDITS; kind = RewardKind.XP; amount = CAP_FALLBACK_XP; }
    }
    if (kind === RewardKind.STICKER) {
      const owned = await this.ownedStickers(tx, ctx.merchantUserId);
      const pool = STICKERS.filter((candidate) => candidate.rare === !!prize.rare);
      const fresh = pool.filter((candidate) => !owned.has(candidate.id));
      const choices = fresh.length ? fresh : pool;
      const chosen = choices[this.random.int(choices.length)];
      sticker = { ...chosen, isNew: !owned.has(chosen.id) };
    }
    if (kind === RewardKind.TIP) tip = TIPS[this.random.int(TIPS.length)];

    const row = await tx.rewardGrant.create({ data: { ...ctx, source, kind, amount, convertedFrom, stickerId: sticker?.id ?? null, tipId: tip?.id ?? null, createdAt: now } });
    return { id: row.id, prize: key, kind, amount, convertedFrom, sticker, tip };
  }
}
