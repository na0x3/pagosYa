import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface SettlementPolicy {
  delayDays: number;
  reserveBps: number;
  reserveDays: number;
}

export type SettlementDb = Prisma.TransactionClient | PrismaService;

/** Used only if a level has no policy row: hold long and keep a reserve rather than pay out unchecked. */
export const STRICT_FALLBACK_POLICY: SettlementPolicy = { delayDays: 30, reserveBps: 1000, reserveDays: 90 };

@Injectable()
export class SettlementPolicyService {
  private readonly logger = new Logger(SettlementPolicyService.name);

  /** Override first, then the level's policy, then the strict fallback — field by field. Never throws for a missing policy: the buyer has already paid. */
  async resolve(db: SettlementDb, merchantId: string): Promise<SettlementPolicy> {
    const merchant = await db.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { level: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true },
    });
    const policy = await db.merchantLevelPolicy.findUnique({ where: { level: merchant.level } });
    if (!policy) this.logger.error(`No MerchantLevelPolicy for level ${merchant.level} (merchant ${merchantId}); using the strict settlement fallback`);
    const base = policy
      ? { delayDays: policy.payoutDelayDays, reserveBps: policy.reserveBps, reserveDays: policy.reserveDays }
      : STRICT_FALLBACK_POLICY;
    return {
      delayDays: merchant.payoutDelayDaysOverride ?? base.delayDays,
      reserveBps: merchant.reserveBpsOverride ?? base.reserveBps,
      reserveDays: merchant.reserveDaysOverride ?? base.reserveDays,
    };
  }
}
