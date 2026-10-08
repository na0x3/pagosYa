import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ComplaintActor, ComplaintEventType, ComplaintOutcome, ComplaintStatus, OpsRole, Prisma, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { AuditLogService } from "../ops/audit-log.service";
import { RefundsService } from "../refunds/refunds.service";
import { SettlementAdminService } from "../settlement/settlement-admin.service";
import { laPazDayStart } from "../settlement/settlement-dates";
import { EXTENSION_BUSINESS_DAYS, MERCHANT_BUSINESS_DAYS, addBusinessDays, businessDaysBetween } from "./complaint-dates";
import { lockComplaint, recordComplaintEvent } from "./complaint-events";
import { assertCan, nextStatus } from "./complaint-state";
import { ComplaintMailer } from "./complaint-mailer";
import { toCsv } from "./complaint-csv";

export type ComplaintOpsActor = { id: string; name: string; email: string; role: OpsRole };

const label = (actor: ComplaintOpsActor) => `${actor.name} <${actor.email}>`;
const OPEN: ComplaintStatus[] = [ComplaintStatus.RECEIVED, ComplaintStatus.IN_REVIEW, ComplaintStatus.WAITING_MERCHANT];

type StoredComplaint = NonNullable<Awaited<ReturnType<PrismaService["complaint"]["findUnique"]>>>;

/** EMAIL_FAILED events not followed by an EMAIL_SENT of the same kind. Events must be in createdAt order. */
function railFailureReason(raw: Prisma.JsonValue | null): string {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const reason = [value.error, value.message, value.reason].find((candidate) => typeof candidate === "string");
  return typeof reason === "string" ? reason.slice(0, 200) : "";
}

export function unresolvedEmailFailures(events: Array<{ type: ComplaintEventType; meta: Prisma.JsonValue | null }>): string[] {
  const open = new Set<string>();
  for (const event of events) {
    const kind = (event.meta as { kind?: string } | null)?.kind;
    if (!kind) continue;
    if (event.type === ComplaintEventType.EMAIL_FAILED) open.add(kind);
    if (event.type === ComplaintEventType.EMAIL_SENT) open.delete(kind);
  }
  return [...open];
}

@Injectable()
export class ComplaintOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly mailer: ComplaintMailer,
    private readonly files: PrivateFilesService,
    private readonly refunds: RefundsService,
    private readonly settlementAdmin: SettlementAdminService,
  ) {}

  private assertAdmin(actor: ComplaintOpsActor) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede hacer esto");
  }

  /** Loads the complaint, runs one action, writes its audit entry in the same transaction, returns the fresh detail. */
  private async mutate(id: string, actor: ComplaintOpsActor, action: string, work: (tx: Prisma.TransactionClient, complaint: StoredComplaint) => Promise<Record<string, unknown>>) {
    await this.prisma.$transaction(async (tx) => {
      await lockComplaint(tx, id);
      const complaint = await tx.complaint.findUnique({ where: { id } });
      if (!complaint) throw new NotFoundException("Reclamo no encontrado");
      const metadata = await work(tx, complaint);
      await this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action, targetType: "Complaint", targetId: id, metadata: { number: complaint.number, ...metadata } });
    });
    return this.get(id);
  }

  async list(filter: { status?: ComplaintStatus; q?: string }, now = new Date()) {
    const q = filter.q?.trim();
    const rows = await this.prisma.complaint.findMany({
      where: {
        status: filter.status ?? { in: OPEN },
        ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { buyerEmail: { contains: q, mode: "insensitive" } }, { merchant: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: 200,
      include: {
        merchant: { select: { id: true, name: true } },
        assignedOpsUser: { select: { id: true, name: true } },
        paymentIntent: { select: { livemode: true } },
        events: { where: { type: { in: [ComplaintEventType.EMAIL_FAILED, ComplaintEventType.EMAIL_SENT] } }, select: { type: true, meta: true }, orderBy: { createdAt: "asc" } },
      },
    });
    const soon = addBusinessDays(now, 1);
    return rows.map((row) => {
      const answered = row.status === ComplaintStatus.ANSWERED;
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        category: row.category,
        buyerName: row.buyerName,
        buyerEmail: row.buyerEmail,
        merchant: row.merchant,
        receivedAt: row.receivedAt,
        dueAt: row.dueAt,
        assignedTo: row.assignedOpsUser,
        overdue: !answered && row.dueAt.getTime() < now.getTime(),
        dueSoon: !answered && row.dueAt.getTime() >= now.getTime() && row.dueAt.getTime() <= soon.getTime(),
        emailFailed: unresolvedEmailFailures(row.events).length > 0,
        test: row.paymentIntent ? !row.paymentIntent.livemode : false,
      };
    });
  }

  async get(id: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      include: {
        paymentIntent: { select: { id: true, amount: true, currency: true, status: true, livemode: true, createdAt: true } },
        merchant: { select: { id: true, name: true, email: true, payoutHeldAt: true } },
        assignedOpsUser: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, fileName: true, contentType: true, sizeBytes: true, uploadedBy: true } } } },
      },
    });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    const sameEmailCount = await this.prisma.complaint.count({ where: { buyerEmail: complaint.buyerEmail, id: { not: id } } });
    const { paymentIntent, ...rest } = complaint;
    return { ...rest, payment: paymentIntent, sameEmailCount };
  }

  take(id: string, actor: ComplaintOpsActor) {
    return this.mutate(id, actor, "complaint.taken", async (tx, complaint) => {
      assertCan("take", complaint.status);
      await tx.complaint.update({ where: { id }, data: { assignedOpsUserId: actor.id, status: nextStatus("take", complaint.status) } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.TAKEN, actor: ComplaintActor.OPS, actorId: actor.id });
      return {};
    });
  }

  link(id: string, data: { paymentIntentId?: string; merchantId?: string }, actor: ComplaintOpsActor) {
    return this.mutate(id, actor, "complaint.linked", async (tx, complaint) => {
      assertCan("link", complaint.status);
      let merchantId: string;
      let paymentIntentId = complaint.paymentIntentId;
      if (data.paymentIntentId) {
        const payment = await tx.paymentIntent.findUnique({ where: { id: data.paymentIntentId }, select: { id: true, merchantId: true } });
        if (!payment) throw new BadRequestException("No existe un pago con esa referencia.");
        paymentIntentId = payment.id;
        merchantId = payment.merchantId;
      } else if (data.merchantId) {
        if (!(await tx.merchant.findUnique({ where: { id: data.merchantId }, select: { id: true } }))) throw new BadRequestException("Comercio no encontrado.");
        if (complaint.paymentIntentId) {
          const linked = await tx.paymentIntent.findUnique({ where: { id: complaint.paymentIntentId }, select: { merchantId: true } });
          if (linked && linked.merchantId !== data.merchantId) throw new BadRequestException("El pago vinculado es de otro comercio.");
        }
        merchantId = data.merchantId;
      } else {
        throw new BadRequestException("Indica un pago o un comercio.");
      }
      // A different merchant never inherits the previous one's question: the ask is taken back and ops asks again.
      const reassigned = complaint.merchantId !== null && complaint.merchantId !== merchantId;
      await tx.complaint.update({
        where: { id },
        data: {
          paymentIntentId,
          merchantId,
          ...(reassigned ? { merchantDueAt: null, status: complaint.status === ComplaintStatus.WAITING_MERCHANT ? ComplaintStatus.IN_REVIEW : complaint.status } : {}),
        },
      });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.LINKED, actor: ComplaintActor.OPS, actorId: actor.id, meta: { paymentIntentId, merchantId, previousMerchantId: complaint.merchantId } });
      return { paymentIntentId, merchantId, previousMerchantId: complaint.merchantId };
    });
  }

  note(id: string, body: string, actor: ComplaintOpsActor) {
    return this.mutate(id, actor, "complaint.note_added", async (tx, complaint) => {
      assertCan("note", complaint.status);
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.NOTE, actor: ComplaintActor.OPS, actorId: actor.id, body: body.trim() });
      return {};
    });
  }

  async askMerchant(id: string, question: string, actor: ComplaintOpsActor, now = new Date()) {
    const detail = await this.mutate(id, actor, "complaint.merchant_asked", async (tx, complaint) => {
      assertCan("askMerchant", complaint.status);
      if (!complaint.merchantId) throw new ConflictException("Vincula el reclamo a un comercio primero.");
      const merchantDueAt = addBusinessDays(now, MERCHANT_BUSINESS_DAYS);
      await tx.complaint.update({ where: { id }, data: { status: nextStatus("askMerchant", complaint.status), merchantDueAt } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.MERCHANT_ASKED, actor: ComplaintActor.OPS, actorId: actor.id, body: question.trim(), meta: { merchantDueAt: merchantDueAt.toISOString(), merchantId: complaint.merchantId } });
      return { merchantDueAt: merchantDueAt.toISOString() };
    });
    await this.mailer.send("MERCHANT_ASKED", id);
    return detail;
  }

  async extend(id: string, reason: string, actor: ComplaintOpsActor, now = new Date()) {
    this.assertAdmin(actor);
    const detail = await this.mutate(id, actor, "complaint.extended", async (tx, complaint) => {
      assertCan("extend", complaint.status);
      if (complaint.extendedAt) throw new ConflictException("El plazo ya se extendió una vez.");
      const dueAt = addBusinessDays(complaint.dueAt, EXTENSION_BUSINESS_DAYS);
      await tx.complaint.update({ where: { id }, data: { dueAt, extendedAt: now, extensionReason: reason.trim() } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.EXTENDED, actor: ComplaintActor.OPS, actorId: actor.id, body: reason.trim(), meta: { from: complaint.dueAt.toISOString(), to: dueAt.toISOString() } });
      return { from: complaint.dueAt.toISOString(), to: dueAt.toISOString() };
    });
    await this.mailer.send("EXTENDED", id);
    return detail;
  }

  async answer(id: string, data: { outcome: ComplaintOutcome; answer: string }, actor: ComplaintOpsActor, now = new Date()) {
    this.assertAdmin(actor);
    const detail = await this.mutate(id, actor, "complaint.answered", async (tx, complaint) => {
      assertCan("answer", complaint.status);
      await tx.complaint.update({ where: { id }, data: { status: nextStatus("answer", complaint.status), outcome: data.outcome, answer: data.answer.trim(), answeredAt: now } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.ANSWERED, actor: ComplaintActor.OPS, actorId: actor.id, body: data.answer.trim(), meta: { outcome: data.outcome } });
      return { outcome: data.outcome };
    });
    await this.mailer.send("ANSWERED", id);
    return detail;
  }

  /**
   * The refund runs in RefundsService's own transaction (it draws from the merchant's held funds, sub-project 3).
   * The console sends one requestId per refund form: a REFUND_REQUESTED marker for it is written under the complaint's
   * row lock before the rail is called, so a double click or a retry after a timeout never refunds twice. Only a
   * refund the rail made (or is still making) is recorded as REFUNDED; a declined one is REFUND_FAILED and ops is told
   * to pay the buyer another way.
   */
  async refund(id: string, request: { amount?: number; requestId: string }, actor: ComplaintOpsActor) {
    this.assertAdmin(actor);
    const complaint = await this.prisma.$transaction(async (tx) => {
      await lockComplaint(tx, id);
      const found = await tx.complaint.findUnique({ where: { id } });
      if (!found) throw new NotFoundException("Reclamo no encontrado");
      assertCan("refund", found.status);
      if (!found.paymentIntentId || !found.merchantId) throw new ConflictException("Vincula el reclamo a un pago primero.");
      const repeated = await tx.complaintEvent.findFirst({ where: { complaintId: id, type: ComplaintEventType.REFUND_REQUESTED, meta: { path: ["requestId"], equals: request.requestId } } });
      if (repeated) throw new ConflictException("Este reembolso ya se pidió.");
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.REFUND_REQUESTED, actor: ComplaintActor.OPS, actorId: actor.id, meta: { requestId: request.requestId, amount: request.amount ?? null } });
      return found;
    });
    const refund = await this.refunds.create(
      complaint.merchantId!,
      { paymentIntentId: complaint.paymentIntentId!, ...(request.amount ? { amount: request.amount } : {}), reason: `Reclamo ${complaint.number}` },
      `complaint-${id}-${request.requestId}`,
    );
    if (refund.status === TransactionStatus.FAILED) {
      const reason = railFailureReason(refund.rawResponse);
      await this.mutate(id, actor, "complaint.refund_failed", async (tx) => {
        await recordComplaintEvent(tx, id, { type: ComplaintEventType.REFUND_FAILED, actor: ComplaintActor.OPS, actorId: actor.id, body: reason, meta: { refundId: refund.id, amount: refund.amount, requestId: request.requestId } });
        return { refundId: refund.id, amount: refund.amount, reason };
      });
      throw new UnprocessableEntityException(`El medio de pago no hizo el reembolso${reason ? ` (${reason})` : ""}. Haz una transferencia manual al comprador y regístrala en una nota.`);
    }
    return this.mutate(id, actor, "complaint.refunded", async (tx) => {
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.REFUNDED, actor: ComplaintActor.OPS, actorId: actor.id, meta: { refundId: refund.id, amount: refund.amount, status: refund.status, requestId: request.requestId } });
      return { refundId: refund.id, amount: refund.amount, status: refund.status };
    });
  }

  async pausePayouts(id: string, reason: string, actor: ComplaintOpsActor) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    assertCan("pausePayouts", complaint.status);
    if (!complaint.merchantId) throw new ConflictException("Vincula el reclamo a un comercio primero.");
    await this.settlementAdmin.placeHold(complaint.merchantId, `Reclamo ${complaint.number}: ${reason.trim()}`, actor);
    return this.mutate(id, actor, "complaint.payouts_paused", async (tx) => {
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.PAYOUTS_PAUSED, actor: ComplaintActor.OPS, actorId: actor.id, body: reason.trim() });
      return { merchantId: complaint.merchantId };
    });
  }

  async attachment(id: string, attachmentId: string) {
    const attachment = await this.prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId: id } });
    if (!attachment) throw new NotFoundException("Archivo no encontrado");
    return { bytes: await this.files.get(attachment.storageKey), fileName: attachment.fileName, contentType: attachment.contentType };
  }

  async exportCsv(from: string, to: string): Promise<string> {
    const start = laPazDayStart(new Date(`${from}T12:00:00Z`), 0);
    const end = laPazDayStart(new Date(`${to}T12:00:00Z`), 1);
    const rows = await this.prisma.complaint.findMany({
      where: { receivedAt: { gte: start, lt: end } },
      orderBy: { receivedAt: "asc" },
      include: { merchant: { select: { name: true } } },
    });
    const iso = (at: Date | null) => (at ? at.toISOString() : null);
    return toCsv(
      rows.map((row) => ({
        numero: row.number,
        recibido: iso(row.receivedAt),
        vence: iso(row.dueAt),
        extendido: iso(row.extendedAt),
        respondido: iso(row.answeredAt),
        dias_habiles: row.answeredAt ? businessDaysBetween(row.receivedAt, row.answeredAt) : null,
        categoria: row.category,
        pedido: row.request,
        resultado: row.outcome,
        estado: row.status,
        comercio: row.merchant?.name ?? row.storeNameGiven,
        pago: row.paymentIntentId,
      })),
      ["numero", "recibido", "vence", "extendido", "respondido", "dias_habiles", "categoria", "pedido", "resultado", "estado", "comercio", "pago"],
    );
  }
}
