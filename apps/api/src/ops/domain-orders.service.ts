import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SupportCaseStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "./audit-log.service";
import { SupportActor, actorLabel } from "./support.service";

const QUEUE_STATUSES = ["REVIEW_REQUIRED", "AWAITING_PAYMENT", "REGISTERING", "CONNECTING"];
const RECONCILED_MESSAGE = "Soporte revisó y cerró esta compra de dominio. Si tienes dudas, responde en tu caso de soporte.";
const RETRY_MESSAGE = "Soporte reactivó tu compra y estamos intentando registrar el dominio otra vez. No vuelvas a pagar.";

@Injectable()
export class DomainOrdersService {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  /**
   * The queue an operator works from: everything still in flight, escalated
   * orders first. Terminal orders appear only when searched for by name, and
   * QUOTED rows never do — nobody paid for them and nothing is stuck.
   */
  async list(query?: string) {
    const search = query?.trim();
    const rows = await this.prisma.domainOrder.findMany({
      where: search
        ? { status: { not: "QUOTED" }, OR: [{ hostname: { contains: search, mode: "insensitive" } }, { id: search }] }
        : { status: { in: QUEUE_STATUSES } },
      include: { store: { select: { id: true, name: true, merchantId: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.sort((a, b) => Number(b.status === "REVIEW_REQUIRED") - Number(a.status === "REVIEW_REQUIRED"));
  }

  /** Everything about one order in a single read, so nobody has to join it by hand. */
  async dossier(id: string) {
    const order = await this.prisma.domainOrder.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true, merchantId: true, merchant: { select: { name: true, email: true } } } },
        domains: { select: { id: true, hostname: true, status: true, verifiedAt: true, lastCheckedAt: true, hostingId: true } },
        paymentIntent: {
          select: {
            id: true, status: true, amount: true, currency: true, railId: true, livemode: true, createdAt: true, updatedAt: true,
            transactions: { select: { id: true, type: true, status: true, amount: true, createdAt: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("Domain order not found");
    const [supportCase, audit] = await Promise.all([
      this.prisma.supportCase.findFirst({ where: { summary: { contains: id } }, orderBy: { createdAt: "desc" } }),
      this.prisma.auditLogEntry.findMany({ where: { targetType: "DomainOrder", targetId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    return { ...order, supportCase, audit };
  }

  /**
   * Both operator actions run only on the escalation queue: this is a tool for
   * orders support has been handed, not a general status editor, and every use
   * has to be answerable afterwards from the audit log.
   */
  private async requireEscalatedOrder(id: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException("A reason is required");
    const order = await this.prisma.domainOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Domain order not found");
    if (order.status !== "REVIEW_REQUIRED") throw new BadRequestException("Only a REVIEW_REQUIRED order can be acted on");
    return order;
  }

  /** Puts an escalated order back in front of the fulfilment loop. */
  async retry(id: string, reason: string, actor: SupportActor) {
    const order = await this.requireEscalatedOrder(id, reason);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.domainOrder.update({
        where: { id },
        data: {
          // advance() branches on the order's fields rather than its status, so
          // the stage it resumes at is derived the same way advance derives it.
          status: order.providerOrderId ? "CONNECTING" : "AWAITING_PAYMENT",
          attempts: 0,
          leaseUntil: null,
          // Only an unregistered order needs its 24-hour conciliation window
          // re-armed; register() is keyed on the order id and stays idempotent.
          ...(order.providerOrderId ? {} : { registrationStartedAt: null }),
          retriedAt: now,
          nextAttemptAt: now,
          message: RETRY_MESSAGE,
        },
      });
      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "domain_order.retried",
        targetType: "DomainOrder",
        targetId: id,
        metadata: { hostname: order.hostname, from: order.status, to: updated.status, reason: reason.trim() },
      });
      return updated;
    });
  }

  /**
   * Records that a human settled the order outside the system — refunded it, or
   * gave up on it — and frees the hostname for everyone else. It moves no money:
   * refunds have their own path, and `advance` reads real refund transactions.
   */
  async markReconciled(id: string, reason: string, actor: SupportActor) {
    const order = await this.requireEscalatedOrder(id, reason);
    return this.prisma.$transaction(async (tx) => {
      await tx.customDomain.deleteMany({ where: { domainOrderId: id } });
      const updated = await tx.domainOrder.update({
        where: { id },
        data: { status: "CANCELED", message: RECONCILED_MESSAGE },
      });
      // needsReview writes the order id into the case summary; that is the only
      // link between the two rows.
      const supportCase = await tx.supportCase.findFirst({ where: { summary: { contains: id } }, orderBy: { createdAt: "desc" } });
      if (supportCase && supportCase.status !== SupportCaseStatus.RESOLVED) {
        await tx.supportCase.update({
          where: { id: supportCase.id },
          data: { status: SupportCaseStatus.RESOLVED, resolution: reason.trim(), closedAt: new Date() },
        });
      }
      await this.auditLog.record(tx, {
        actorType: "OPS_USER",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: "domain_order.reconciled",
        targetType: "DomainOrder",
        targetId: id,
        metadata: { hostname: order.hostname, from: order.status, caseId: supportCase?.id ?? null, reason: reason.trim() },
      });
      return updated;
    });
  }
}
