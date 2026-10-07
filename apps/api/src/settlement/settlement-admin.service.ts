import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { LedgerAccount, LedgerDirection, OpsRole, Prisma, SettlementHoldStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { AuditLogService } from "../ops/audit-log.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { SettlementQueryService } from "./settlement-query.service";
import { accountBalance } from "./settlement-balances";
import { lockMerchantSettlement } from "./settlement-lock";
import { takeFromReserve } from "./settlement-drawdown";

export type SettlementActor = { id: string; name: string; email: string; role: OpsRole };

const label = (actor: SettlementActor) => `${actor.name} <${actor.email}>`;

@Injectable()
export class SettlementAdminService {
  private readonly logger = new Logger(SettlementAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly auditLog: AuditLogService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly query: SettlementQueryService,
  ) {}

  private assertAdmin(actor: SettlementActor) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede hacer esto");
  }

  private audit(tx: Prisma.TransactionClient, actor: SettlementActor, action: string, merchantId: string, metadata: Record<string, unknown>) {
    return this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action, targetType: "Merchant", targetId: merchantId, metadata });
  }

  async overview(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true, payoutHoldReason: true, payoutHeldAt: true, payoutHeldByLabel: true },
    });
    if (!merchant) throw new NotFoundException("Comercio no encontrado");
    const [balances, schedule] = await Promise.all([this.query.balances(merchantId), this.query.schedule(merchantId)]);
    return {
      merchantId,
      overrides: { payoutDelayDaysOverride: merchant.payoutDelayDaysOverride, reserveBpsOverride: merchant.reserveBpsOverride, reserveDaysOverride: merchant.reserveDaysOverride },
      hold: merchant.payoutHeldAt ? { reason: merchant.payoutHoldReason ?? "", heldAt: merchant.payoutHeldAt, heldBy: merchant.payoutHeldByLabel ?? "" } : null,
      policy: schedule.policy,
      balances,
      releases: schedule.releases,
    };
  }

  async updateOverrides(merchantId: string, data: { payoutDelayDaysOverride?: number | null; reserveBpsOverride?: number | null; reserveDaysOverride?: number | null }, actor: SettlementActor) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const select = { id: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true } as const;
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select });
      if (!before) throw new NotFoundException("Comercio no encontrado");
      const after = await tx.merchant.update({ where: { id: merchantId }, data, select });
      await this.audit(tx, actor, "settlement.overrides_updated", merchantId, { before, after });
      return after;
    });
  }

  /** Any ops user: stopping money fast matters more than who does it. Lifting is admin-only. */
  async placeHold(merchantId: string, reason: string, actor: SettlementActor): Promise<{ held: true }> {
    const trimmed = reason.trim();
    if (trimmed.length < 8) throw new BadRequestException("Escribe el motivo de la retención (mínimo 8 caracteres).");
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true, payoutHeldAt: true } });
      if (!before) throw new NotFoundException("Comercio no encontrado");
      if (before.payoutHeldAt) throw new ConflictException("Los pagos de este comercio ya están retenidos.");
      await tx.merchant.update({ where: { id: merchantId }, data: { payoutHoldReason: trimmed, payoutHeldAt: new Date(), payoutHeldByLabel: label(actor) } });
      await this.audit(tx, actor, "settlement.hold_placed", merchantId, { reason: trimmed });
    });
    await this.notifyHold(merchantId);
    return { held: true };
  }

  async liftHold(merchantId: string, actor: SettlementActor): Promise<{ held: false }> {
    this.assertAdmin(actor);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true, payoutHeldAt: true, payoutHoldReason: true, payoutHeldByLabel: true } });
      if (!before) throw new NotFoundException("Comercio no encontrado");
      if (!before.payoutHeldAt) throw new BadRequestException("Este comercio no tiene pagos retenidos.");
      await tx.merchant.update({ where: { id: merchantId }, data: { payoutHoldReason: null, payoutHeldAt: null, payoutHeldByLabel: null } });
      await this.audit(tx, actor, "settlement.hold_lifted", merchantId, { reason: before.payoutHoldReason, heldBy: before.payoutHeldByLabel, heldAt: before.payoutHeldAt });
    });
    return { held: false };
  }

  /** Restitution to a buyer for confirmed fraud, paid out of this merchant's reserve. */
  async seize(merchantId: string, data: { amount: number; currency: string; reason: string; externalReference: string }, actor: SettlementActor) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await lockMerchantSettlement(tx, merchantId);
      const merchant = await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
      if (!merchant) throw new NotFoundException("Comercio no encontrado");
      const reserve = await accountBalance(tx, merchantId, LedgerAccount.RESERVE, data.currency);
      if (data.amount > reserve) {
        throw new BadRequestException(`La reserva en ${data.currency} es ${(reserve / 100).toFixed(2)}; no puedes retirar más.`);
      }
      const holds = await tx.settlementHold.findMany({
        where: { merchantId, currency: data.currency, status: SettlementHoldStatus.RESERVE_HELD },
        select: { id: true, paymentIntentId: true, status: true, pendingAmount: true, reserveAmount: true, createdAt: true },
      });
      const updates = takeFromReserve(data.amount, holds);
      const taken = updates.reduce((sum, u) => sum + (holds.find((h) => h.id === u.id)!.reserveAmount - u.reserveAmount), 0);
      if (taken !== data.amount) {
        // The RESERVE ledger and the RESERVE_HELD holds should always agree; never post a seizure the holds can't back.
        this.logger.error(`Reserve seizure refused: merchant ${merchantId} ${data.currency} asked ${data.amount}, reserve ledger ${reserve}, holds cover ${taken}`);
        throw new InternalServerErrorException("La reserva del comercio no cuadra con sus retenciones; revisa antes de retirar.");
      }
      for (const update of updates) {
        await tx.settlementHold.update({ where: { id: update.id }, data: { reserveAmount: update.reserveAmount, status: update.status } });
      }
      const ledgerGroupId = this.ledger.generateGroupId();
      await this.ledger.postJournalEntry(tx, ledgerGroupId, [
        { account: LedgerAccount.RESERVE, direction: LedgerDirection.DEBIT, amount: data.amount, merchantId },
        { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.CREDIT, amount: data.amount, merchantId },
      ], data.currency);
      const seizure = await tx.reserveSeizure.create({
        data: { merchantId, amount: data.amount, currency: data.currency, reason: data.reason.trim(), externalReference: data.externalReference.trim(), opsUserId: actor.id, opsLabel: label(actor), ledgerGroupId },
      });
      await this.audit(tx, actor, "settlement.reserve_seized", merchantId, { amount: data.amount, currency: data.currency, reason: seizure.reason, externalReference: seizure.externalReference, ledgerGroupId });
      return seizure;
    });
  }

  listHolds() {
    return this.prisma.merchant.findMany({
      where: { payoutHeldAt: { not: null } },
      select: { id: true, name: true, email: true, payoutHoldReason: true, payoutHeldAt: true, payoutHeldByLabel: true },
      orderBy: { payoutHeldAt: "desc" },
    });
  }

  /** Best effort, after the hold commits. Never includes the internal reason. */
  private async notifyHold(merchantId: string): Promise<void> {
    try {
      const users = await this.prisma.merchantUser.findMany({ where: { merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
      for (const user of users) {
        await this.email.send({
          to: user.email,
          subject: "Tus pagos en pagosYa están en pausa",
          body: "Pausamos temporalmente los desembolsos a tu cuenta bancaria mientras revisamos tu cuenta. Tus ventas siguen registradas y no pierdes ningún saldo.\n\nEscríbenos a soporte desde tu panel para saber qué necesitamos.",
        }).catch((error) => this.logger.warn(`Payout hold email to ${user.email} failed: ${(error as Error).message}`));
      }
    } catch (error) {
      this.logger.warn(`Payout hold notification for ${merchantId} failed: ${(error as Error).message}`);
    }
  }
}
