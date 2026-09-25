import { PaymentIntentStatus, Prisma, RewardKind } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/** Stateless reads shared by RewardsService and MerchantSessionService (which cannot depend on RewardsModule). */
export type Db = PrismaService | Prisma.TransactionClient;

export function countStoreSales(db: Db, merchantId: string, storeId: string) {
  return db.paymentIntent.count({ where: { merchantId, status: PaymentIntentStatus.SUCCEEDED, livemode: true, metadata: { path: ["storeId"], equals: storeId } } });
}

export async function gameXpForStore(db: Db, storeId: string) {
  const sum = await db.rewardGrant.aggregate({ where: { storeId, kind: RewardKind.XP }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

export async function aiCreditsGrantedSince(db: Db, merchantId: string, since: Date) {
  const sum = await db.rewardGrant.aggregate({ where: { merchantId, kind: RewardKind.AI_CREDITS, createdAt: { gte: since } }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

export async function aiCreditBalance(db: Db, merchantId: string) {
  const granted = await db.rewardGrant.aggregate({ where: { merchantId, kind: RewardKind.AI_CREDITS }, _sum: { amount: true } });
  const redeemed = await db.aiCreditRedemption.aggregate({ where: { merchantId }, _sum: { credits: true } });
  return (granted._sum.amount ?? 0) - (redeemed._sum.credits ?? 0);
}

/** One free spin per Bolivia day, plus one per RESPIN won that day. */
export async function wheelSpinsToday(db: Db, merchantUserId: string, day: string) {
  const spins = await db.dailyWheelSpin.findMany({ where: { merchantUserId, day }, select: { grant: { select: { kind: true } } } });
  const respins = spins.filter((spin) => spin.grant.kind === RewardKind.RESPIN).length;
  return { used: spins.length, allowed: 1 + respins };
}
