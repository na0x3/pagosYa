import { Injectable } from "@nestjs/common";
import { SettlementHoldStatus, SettlementMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementBalance, merchantBalances } from "./settlement-balances";
import { ScheduledRelease, buildReleaseSchedule } from "./settlement-schedule";

const SCHEDULE_WINDOW_DAYS = 60;

export interface MerchantSettlementPolicy { level: number; levelName: string; delayDays: number; reserveBps: number; reserveDays: number }
export interface NextLevelPolicy { level: number; name: string; delayDays: number; reserveBps: number; reserveDays: number }
/** policy is null for a non-AGGREGATOR merchant: pagosYa never holds their money, so there is nothing to schedule. */
export interface SettlementSchedule { policy: MerchantSettlementPolicy | null; nextLevel: NextLevelPolicy | null; releases: ScheduledRelease[] }

@Injectable()
export class SettlementQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: SettlementPolicyService,
  ) {}

  balances(merchantId: string): Promise<SettlementBalance[]> {
    return merchantBalances(this.prisma, merchantId);
  }

  async payoutsHeld(merchantId: string): Promise<boolean> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { payoutHeldAt: true } });
    return Boolean(merchant?.payoutHeldAt);
  }

  /** Merchant-facing: the conditions in plain numbers and upcoming releases. Never includes the hold reason. */
  async schedule(merchantId: string, now = new Date()): Promise<SettlementSchedule> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { level: true, settlementMode: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true },
    });
    if (merchant.settlementMode !== SettlementMode.AGGREGATOR) return { policy: null, nextLevel: null, releases: [] };
    const [effective, levelPolicy, next, holds] = await Promise.all([
      this.policies.resolve(this.prisma, merchantId),
      this.prisma.merchantLevelPolicy.findUnique({ where: { level: merchant.level } }),
      merchant.level < 3 ? this.prisma.merchantLevelPolicy.findUnique({ where: { level: merchant.level + 1 } }) : Promise.resolve(null),
      this.prisma.settlementHold.findMany({
        where: { merchantId, status: { in: [SettlementHoldStatus.PENDING, SettlementHoldStatus.RESERVE_HELD] } },
        select: { status: true, currency: true, pendingAmount: true, reserveAmount: true, availableAt: true, reserveReleaseAt: true },
      }),
    ]);
    const customConditions = merchant.payoutDelayDaysOverride != null || merchant.reserveBpsOverride != null || merchant.reserveDaysOverride != null;
    const until = new Date(now.getTime() + SCHEDULE_WINDOW_DAYS * 24 * 60 * 60_000);
    return {
      policy: { level: merchant.level, levelName: levelPolicy?.name ?? `Nivel ${merchant.level}`, ...effective },
      nextLevel: next && next.liveEnabled && !customConditions
        ? { level: next.level, name: next.name, delayDays: next.payoutDelayDays, reserveBps: next.reserveBps, reserveDays: next.reserveDays }
        : null,
      releases: buildReleaseSchedule(holds, until),
    };
  }
}
