import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OpsRole, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../ops/audit-log.service";
import { laPazMonth } from "./limits.service";

export type LimitsAdmin = { id: string; name: string; email: string; role: OpsRole };
export type NearLimitRow = { merchantId: string; name: string; email: string; level: number; used: number; monthlyLimit: number; percent: number };

@Injectable()
export class LimitsAdminService {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  private assertAdmin(actor: LimitsAdmin) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede cambiar límites");
  }

  private audit(tx: Prisma.TransactionClient, actor: LimitsAdmin, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
    return this.auditLog.record(tx, {
      actorType: "OPS_USER",
      actorId: actor.id,
      actorLabel: `${actor.name} <${actor.email}>`,
      action,
      targetType,
      targetId,
      metadata: { before, after },
    });
  }

  listPolicies() {
    return this.prisma.merchantLevelPolicy.findMany({ orderBy: { level: "asc" } });
  }

  async updatePolicy(level: number, data: { monthlyLimit?: number | null; perPaymentLimit?: number | null; liveEnabled?: boolean }, actor: LimitsAdmin) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.merchantLevelPolicy.findUnique({ where: { level } });
      if (!before) throw new NotFoundException("Nivel no encontrado");
      const after = await tx.merchantLevelPolicy.update({ where: { level }, data });
      await this.audit(tx, actor, "limits.policy_updated", "MerchantLevelPolicy", String(level), before, after);
      return after;
    });
  }

  getSettings() {
    return this.prisma.limitSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  }

  async updateSettings(usdToBobRate: number, actor: LimitsAdmin) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.limitSettings.findUnique({ where: { id: "singleton" } });
      if (!before) throw new NotFoundException("Configuración de límites no encontrada");
      const after = await tx.limitSettings.update({ where: { id: "singleton" }, data: { usdToBobRate } });
      await this.audit(tx, actor, "limits.settings_updated", "LimitSettings", "singleton", before, after);
      return after;
    });
  }

  async updateMerchant(merchantId: string, data: { level?: number; monthlyLimitOverride?: number | null; perPaymentLimitOverride?: number | null }, actor: LimitsAdmin) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const select = { id: true, level: true, monthlyLimitOverride: true, perPaymentLimitOverride: true } as const;
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select });
      if (!before) throw new NotFoundException("Comercio no encontrado");
      const after = await tx.merchant.update({ where: { id: merchantId }, data, select });
      await this.audit(tx, actor, "limits.merchant_updated", "Merchant", merchantId, before, after);
      return after;
    });
  }

  nearLimit(now = new Date()) {
    const month = laPazMonth(now);
    return this.prisma.$queryRaw<NearLimitRow[]>`
      SELECT m.id AS "merchantId", m.name, m.email, m.level,
             (v.reserved + v.settled)::int AS used,
             COALESCE(m."monthlyLimitOverride", p."monthlyLimit")::int AS "monthlyLimit",
             FLOOR(100.0 * (v.reserved + v.settled)::numeric / NULLIF(COALESCE(m."monthlyLimitOverride", p."monthlyLimit")::numeric, 0))::int AS percent
      FROM "MerchantMonthlyVolume" v
      JOIN "Merchant" m ON m.id = v."merchantId"
      LEFT JOIN "MerchantLevelPolicy" p ON p.level = m.level
      WHERE v.month = ${month}
        AND (v.reserved + v.settled)::bigint * 10 >= COALESCE(m."monthlyLimitOverride", p."monthlyLimit")::bigint * 8
      ORDER BY percent DESC
    `;
  }
}
