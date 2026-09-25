import { ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessDocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import type { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { StructuredCompletionService } from "../ai/structured-completion";
import { BusinessDocumentsService, expireProposal, OPEN_PROPOSAL } from "./business-documents.service";
import { computeTotals, documentNumberLabel, type DocumentBlock, type DocumentSnapshot } from "./business-document-snapshot";
import { DEVELOPMENT_DOCUMENT_LINK_SECRET, readDocumentLinkToken } from "./document-link-token";
import { buildProposalMerchantEmail } from "./proposal-email";
import type { AcceptanceContext } from "../legal/terms-acceptance.service";
import {
  buildProposalContext,
  draftToDocument,
  merchantAllowed,
  merchantEvidence,
  proposalDraftSchema,
  proposalSectionSchema,
  proposalSystemPrompt,
  proposalUserMessage,
  sectionSystemPrompt,
  sectionToBlock,
  sectionUserMessage,
  type ProposalBrief,
  type ProposalDraftOutput,
  type ProposalSectionOutput,
  type ProposalTone,
} from "./proposal-draft";
import type { AcceptProposalDto, CreateCobroFromProposalDto, DraftProposalDto, RegenerateProposalSectionDto, RequestProposalChangesDto } from "./dto/business-document.dto";

const S = BusinessDocumentStatus;

const DAY_MS = 24 * 60 * 60 * 1000;
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000; // Bolivia is UTC-4 all year.

/** Accepted, signed, paid, declined, expired or voided: no more edits (D0's FINAL). */
const FINAL: BusinessDocumentStatus[] = [S.ACCEPTED, S.SIGNED, S.PAID, S.DECLINED, S.EXPIRED, S.VOIDED];

/** How long a new proposal stays valid unless the merchant picks another date. */
export const DEFAULT_VALIDITY_DAYS = 15;

/** 23:59:59 in La Paz, `days` from today in La Paz. */
export function endOfLaPazDay(days: number, now = new Date()): Date {
  const shifted = new Date(now.getTime() - LA_PAZ_OFFSET_MS);
  const day = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + days * DAY_MS;
  return new Date(day + DAY_MS - 1000 + LA_PAZ_OFFSET_MS);
}

/** How many "Pedir cambios" one proposal takes in 24 hours: enough for a conversation, not a relay. */
const CHANGE_REQUESTS_PER_DAY = 5;

type ProposalRow = { id: string; storeId: string; merchantId: string; kind: string; number: number | null; title: string; currency: string; totalAmount: number; currentVersion: number };

type BriefEventData = { brief: string; budgetHint: string | null; deadline: string | null; tone: ProposalTone; model: string };

/**
 * D2: proposals on top of D0 documents — YAPI drafts them (prices only from the catalog
 * or the merchant's own words), the customer accepts or asks for changes on the public
 * link, and an accepted one becomes a cobro. Drafting, sending and the link stay in D0.
 */
@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly documents: BusinessDocumentsService,
    private readonly ai: StructuredCompletionService,
  ) {}

  // ── merchant: AI ──────────────────────────────────────────────────────

  /** "Crear borrador con IA": one metered call (luna), then a DRAFT the merchant edits. */
  async draft(merchantId: string, storeId: string, dto: DraftProposalDto) {
    const store = await this.ownedStore(merchantId, storeId);
    const context = await this.context(store);
    const tone = dto.tone ?? "formal";
    const brief: ProposalBrief = { brief: dto.brief.trim(), customerName: dto.customerName, budgetHint: dto.budgetHint, deadline: dto.deadline, tone };
    const result = await this.ai.structuredCompletion<ProposalDraftOutput>({
      storeId,
      stage: "proposal-draft",
      system: proposalSystemPrompt(tone),
      user: proposalUserMessage(context, brief),
      schema: proposalDraftSchema,
      maxOutputTokens: 6000,
    });
    const drafted = draftToDocument(result.data, { catalog: context.catalog, merchant: merchantEvidence(dto.brief, dto.budgetHint), currency: "BOB" });
    const doc = await this.documents.create(merchantId, storeId, {
      kind: "PROPOSAL",
      title: drafted.title,
      ...(dto.customerName?.trim() && { customerName: dto.customerName.trim() }),
      ...(dto.customerEmail?.trim() && { customerEmail: dto.customerEmail.trim() }),
      ...(dto.customerPhone?.trim() && { customerPhone: dto.customerPhone.trim() }),
      items: drafted.items,
      content: drafted.content,
      validUntil: endOfLaPazDay(DEFAULT_VALIDITY_DAYS).toISOString(),
    });
    const data: BriefEventData = { brief: brief.brief, budgetHint: dto.budgetHint?.trim() || null, deadline: dto.deadline?.trim() || null, tone, model: result.model };
    await this.prisma.businessDocumentEvent.create({ data: { documentId: doc.id, type: "ai_drafted", data } });
    return { ...doc, ai: { model: result.model } };
  }

  /** "Regenerar con IA" on one block: returned, not saved (the editor autosaves what the merchant keeps). */
  async regenerateSection(merchantId: string, storeId: string, id: string, dto: RegenerateProposalSectionDto) {
    const store = await this.ownedStore(merchantId, storeId);
    const doc = await this.prisma.businessDocument.findFirst({ where: { id, storeId }, include: { items: { orderBy: { position: "asc" } } } });
    if (!doc || doc.kind !== "PROPOSAL") throw new NotFoundException("Propuesta no encontrada");
    if (FINAL.includes(doc.status)) throw new ConflictException("Esta propuesta ya no se puede editar");
    const event = await this.prisma.businessDocumentEvent.findFirst({ where: { documentId: id, type: "ai_drafted" }, orderBy: { at: "desc" } });
    const stored = (event?.data ?? null) as BriefEventData | null;
    const context = await this.context(store);
    const tone = stored?.tone ?? "formal";
    const blocks = Array.isArray(doc.content) ? (doc.content as unknown as DocumentBlock[]) : [];
    const block: DocumentBlock = { type: dto.block.type, ...(dto.block.title !== undefined && { title: dto.block.title }), ...(dto.block.text !== undefined && { text: dto.block.text }), ...(dto.block.items !== undefined && { items: dto.block.items }) };
    const result = await this.ai.structuredCompletion<ProposalSectionOutput>({
      storeId,
      stage: "proposal-section",
      system: sectionSystemPrompt(tone, block.type),
      user: sectionUserMessage({
        brief: stored ? { brief: stored.brief, customerName: doc.customerName, budgetHint: stored.budgetHint, deadline: stored.deadline, tone } : null,
        title: doc.title,
        sections: blocks.map((entry) => entry.title ?? "").filter(Boolean),
        block,
        instruction: dto.instruction,
        context,
      }),
      schema: proposalSectionSchema,
      maxOutputTokens: 2000,
    });
    // Allowed money: what the merchant wrote, the catalog, and the proposal's own lines and total.
    const allowed = merchantAllowed(merchantEvidence(stored?.brief, stored?.budgetHint), doc.currency);
    context.catalog.forEach((entry) => { if (entry.currency === doc.currency) allowed.add(entry.price); });
    doc.items.forEach((item) => { if (item.unitAmount > 0) { allowed.add(item.unitAmount); allowed.add(item.amount); } });
    if (doc.totalAmount > 0) allowed.add(doc.totalAmount);
    return { block: sectionToBlock(result.data, block, allowed, doc.currency) };
  }

  // ── merchant: header ──────────────────────────────────────────────────

  /** The Propuestas header over every proposal of the store: counts per tab and values per currency. */
  async summary(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const now = new Date();
    const base = { storeId, kind: "PROPOSAL" as const };
    const [byStatus, late, accepted] = await Promise.all([
      this.prisma.businessDocument.groupBy({ by: ["status", "currency"], where: base, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.businessDocument.groupBy({ by: ["status", "currency"], where: { ...base, status: { in: OPEN_PROPOSAL }, validUntil: { lt: now } }, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.businessDocumentEvent.findMany({ where: { type: "accepted", at: { gte: new Date(now.getTime() - 30 * DAY_MS) }, document: base }, select: { documentId: true } }),
    ]);
    const acceptedIds = [...new Set(accepted.map((event) => event.documentId))];
    const acceptedRows = acceptedIds.length
      ? await this.prisma.businessDocument.groupBy({ by: ["currency"], where: { ...base, id: { in: acceptedIds }, status: S.ACCEPTED }, _sum: { totalAmount: true } })
      : [];
    const count = (rows: typeof byStatus, statuses: BusinessDocumentStatus[]) => rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row._count._all, 0);
    const sum = (rows: Array<{ currency: string; status?: BusinessDocumentStatus; _sum: { totalAmount: number | null } }>, currency: string, statuses?: BusinessDocumentStatus[]) =>
      rows.filter((row) => row.currency === currency && (!statuses || statuses.includes(row.status!))).reduce((total, row) => total + (row._sum.totalAmount ?? 0), 0);
    const lateCount = late.reduce((total, row) => total + row._count._all, 0);
    const currencies = [...new Set(byStatus.map((row) => row.currency))].sort((a, b) => (a === "BOB" ? -1 : b === "BOB" ? 1 : a.localeCompare(b)));
    return {
      counts: {
        all: count(byStatus, Object.values(S)),
        draft: count(byStatus, [S.DRAFT]),
        open: count(byStatus, OPEN_PROPOSAL) - lateCount,
        changes: count(byStatus, [S.CHANGES_REQUESTED]) - count(late, [S.CHANGES_REQUESTED]),
        accepted: count(byStatus, [S.ACCEPTED]),
        closed: count(byStatus, [S.EXPIRED, S.VOIDED, S.DECLINED]) + lateCount,
      },
      totals: currencies.map((currency) => ({
        currency,
        open: sum(byStatus, currency, OPEN_PROPOSAL) - sum(late, currency),
        accepted30: sum(acceptedRows, currency),
      })),
    };
  }

  // ── merchant: accepted → cobro ────────────────────────────────────────

  /**
   * "Crear cobro": an INVOICE from the accepted version exactly as the customer accepted it
   * (frozen items, discount, currency, customer), linked both ways, then frozen like D1's
   * one-tap create. A second tap, or a retry after a failed send, returns the same cobro.
   */
  async createCobro(merchantId: string, storeId: string, id: string, dto: CreateCobroFromProposalDto) {
    await this.ownedStore(merchantId, storeId);
    const linked = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const doc = await tx.businessDocument.findFirst({ where: { id, storeId } });
      if (!doc || doc.kind !== "PROPOSAL") throw new NotFoundException("Propuesta no encontrada");
      const link = await tx.businessDocumentEvent.findFirst({ where: { documentId: id, type: "cobro_created" } });
      const existingId = ((link?.data ?? {}) as { cobroId?: string }).cobroId;
      if (existingId && (await tx.businessDocument.findFirst({ where: { id: existingId, storeId }, select: { id: true } }))) return { cobroId: existingId, created: false };
      if (doc.status !== S.ACCEPTED) throw new ConflictException("Solo una propuesta aceptada se convierte en cobro.");
      const accepted = await tx.businessDocumentEvent.findFirst({ where: { documentId: id, type: "accepted" } });
      const acceptedBy = (accepted?.data ?? {}) as { name?: string; email?: string; version?: number };
      const version = await tx.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version: acceptedBy.version ?? doc.currentVersion } } });
      if (!version) throw new NotFoundException("Propuesta no encontrada");
      const snapshot = version.content as unknown as DocumentSnapshot;
      const priced = snapshot.items.filter((item) => item.unitAmount > 0);
      if (!priced.length) throw new UnprocessableEntityException("Esta propuesta no tiene ítems con precio. Crea el cobro a mano desde Cobros.");
      const subtotal = priced.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
      const totals = computeTotals(priced.map(({ description, quantity, unitAmount }) => ({ description, quantity, unitAmount })), Math.min(snapshot.discountAmount, subtotal));
      const acceptedOn = new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(accepted?.at ?? new Date());
      const cobro = await tx.businessDocument.create({
        data: {
          storeId,
          merchantId: doc.merchantId,
          kind: "INVOICE",
          title: snapshot.title.slice(0, 200),
          currency: snapshot.currency,
          businessCustomerId: doc.businessCustomerId,
          customerName: snapshot.customer.name ?? acceptedBy.name ?? null,
          customerEmail: snapshot.customer.email ?? acceptedBy.email ?? null,
          customerPhone: snapshot.customer.phone,
          customerDocument: snapshot.customer.document,
          subtotalAmount: totals.subtotalAmount,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          content: [{ type: "paragraph", text: `Según la propuesta ${snapshot.numberLabel} aceptada el ${acceptedOn}.` }],
          dueAt: dto.dueAt ? new Date(dto.dueAt) : endOfLaPazDay(7),
          autoReminders: true,
          items: { create: totals.items.map((item, position) => ({ position, description: item.description, quantity: item.quantity, unitAmount: item.unitAmount, amount: item.amount })) },
          events: { create: [{ type: "created", data: { fromProposal: { documentId: id, numberLabel: snapshot.numberLabel } } }] },
        },
      });
      await tx.businessDocumentEvent.create({ data: { documentId: id, type: "cobro_created", version: doc.currentVersion, dedupeKey: "cobro", data: { cobroId: cobro.id } } });
      return { cobroId: cobro.id, created: true };
    });
    // Frozen with email off (D1's one-tap create): the dashboard then offers WhatsApp, email and copy.
    let cobro = await this.documents.get(merchantId, storeId, linked.cobroId);
    if (cobro.status === S.DRAFT) {
      await this.documents.send(merchantId, storeId, linked.cobroId, { email: false });
      cobro = await this.documents.get(merchantId, storeId, linked.cobroId);
    }
    return { cobro, created: linked.created, publicUrl: cobro.publicUrl };
  }

  // ── public: the customer's answer ─────────────────────────────────────

  /**
   * "Aceptar propuesta": the customer's typed name and email, the exact version they read
   * (its sha256), the time, IP and user agent — a simple acceptance record, not a signature.
   */
  async accept(token: string, dto: AcceptProposalDto, context: AcceptanceContext) {
    const id = this.tokenId(token);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const doc = await this.lockedProposal(tx, id);
      if (doc.status === S.ACCEPTED) {
        // A double tap (or a second visit) gets the acceptance on record, never a second one.
        const event = await tx.businessDocumentEvent.findFirst({ where: { documentId: id, type: "accepted" } });
        return { kind: "done" as const, name: ((event?.data ?? {}) as { name?: string }).name ?? "", at: event?.at ?? new Date() };
      }
      const closed = await this.closedReason(tx, doc, "aceptar");
      if (closed) return closed;
      if (dto.version !== doc.currentVersion) {
        throw new ConflictException("El comercio actualizó esta propuesta. Vuelve a abrir el enlace para leer la versión nueva antes de aceptarla.");
      }
      const version = await tx.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version: doc.currentVersion } } });
      if (!version) throw new NotFoundException("No encontramos esta propuesta");
      const { count } = await tx.businessDocument.updateMany({ where: { id, status: { in: OPEN_PROPOSAL }, currentVersion: dto.version }, data: { status: S.ACCEPTED } });
      if (!count) throw new ConflictException("Esta propuesta ya no se puede aceptar.");
      const accepted = await this.restoreAcceptedVersion(tx, id, version.content as unknown as DocumentSnapshot);
      const name = dto.name.trim();
      const email = dto.email.trim().toLowerCase();
      const event = await tx.businessDocumentEvent.create({
        data: {
          documentId: id, type: "accepted", version: version.version, ipAddress: context.ipAddress, userAgent: context.userAgent, dedupeKey: "accepted",
          data: { name, email, version: version.version, sha256: version.sha256 },
        },
      });
      return { kind: "accepted" as const, doc: { ...doc, ...accepted }, name, email, at: event.at };
    });
    if (outcome.kind === "closed") throw new ConflictException(outcome.message);
    if (outcome.kind === "accepted") {
      await this.notifyMerchant(outcome.doc, "accepted", { name: outcome.name, email: outcome.email });
    }
    return { status: S.ACCEPTED, acceptance: { name: outcome.name, at: outcome.at } };
  }

  /**
   * "Pedir cambios": the message reaches the merchant three ways — the proposal's timeline,
   * an Inbox conversation with the customer, and an email inside the store's daily cap.
   */
  async requestChanges(token: string, dto: RequestProposalChangesDto, context: AcceptanceContext) {
    const id = this.tokenId(token);
    const name = dto.name?.trim() || null;
    const email = dto.email.trim().toLowerCase();
    const message = dto.message.trim();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const doc = await this.lockedProposal(tx, id);
      if (doc.status === S.ACCEPTED) throw new ConflictException("Esta propuesta ya fue aceptada. Si necesitas algo más, escríbele al comercio.");
      const closed = await this.closedReason(tx, doc, "pedir cambios en");
      if (closed) return closed;
      const recent = await tx.businessDocumentEvent.count({ where: { documentId: id, type: "changes_requested", at: { gte: new Date(Date.now() - DAY_MS) } } });
      if (recent >= CHANGE_REQUESTS_PER_DAY) {
        throw new HttpException("Ya enviaste varios pedidos de cambios hoy. El comercio los está revisando; también puedes escribirle directamente.", HttpStatus.TOO_MANY_REQUESTS);
      }
      const { count } = await tx.businessDocument.updateMany({ where: { id, status: { in: OPEN_PROPOSAL } }, data: { status: S.CHANGES_REQUESTED } });
      if (!count) throw new ConflictException("Esta propuesta ya no admite cambios.");
      const event = await tx.businessDocumentEvent.create({
        data: { documentId: id, type: "changes_requested", version: doc.currentVersion, ipAddress: context.ipAddress, userAgent: context.userAgent, data: { name, email, message, version: doc.currentVersion } },
      });
      // The merchant's Inbox: one conversation per proposal and customer email.
      const subject = `Propuesta ${documentNumberLabel("PROPOSAL", doc.number)}`;
      const thread = await tx.storeInboxThread.findFirst({ where: { storeId: doc.storeId, customerEmail: email, subject } });
      const threadId = thread
        ? (await tx.storeInboxThread.update({ where: { id: thread.id }, data: { unreadForMerchant: true, lastMessageAt: event.at, ...(name && !thread.customerName && { customerName: name }) } })).id
        : (await tx.storeInboxThread.create({ data: { storeId: doc.storeId, merchantId: doc.merchantId, subject, customerEmail: email, customerName: name, unreadForMerchant: true, lastMessageAt: event.at } })).id;
      await tx.storeInboxMessage.create({
        data: { threadId, direction: "INBOUND", fromEmail: email, toEmail: "", body: message, messageId: `proposal.${event.id}@pagosya`, inReplyTo: null, hadAttachments: false },
      });
      return { kind: "requested" as const, doc };
    });
    if (outcome.kind === "closed") throw new ConflictException(outcome.message);
    await this.notifyMerchant(outcome.doc, "changes", { name, email, message });
    return { status: S.CHANGES_REQUESTED };
  }

  /**
   * From acceptance on, the merchant sees exactly what the customer accepted (card, detail, summary,
   * email, cobro): edits saved after that version was sent could never be sent (accepted is final),
   * so the working copy returns to the accepted snapshot. Product links survive where the line did.
   */
  private async restoreAcceptedVersion(tx: Prisma.TransactionClient, id: string, snapshot: DocumentSnapshot) {
    const fields = {
      title: snapshot.title,
      currency: snapshot.currency,
      customerName: snapshot.customer.name,
      customerEmail: snapshot.customer.email,
      customerPhone: snapshot.customer.phone,
      customerDocument: snapshot.customer.document,
      subtotalAmount: snapshot.subtotalAmount,
      discountAmount: snapshot.discountAmount,
      totalAmount: snapshot.totalAmount,
      dueAt: snapshot.dueAt ? new Date(snapshot.dueAt) : null,
      validUntil: snapshot.validUntil ? new Date(snapshot.validUntil) : null,
    };
    await tx.businessDocument.updateMany({ where: { id }, data: { ...fields, content: snapshot.blocks as unknown as Prisma.InputJsonValue } });
    const current = await tx.businessDocumentItem.findMany({ where: { documentId: id }, orderBy: { position: "asc" } });
    const same = current.length === snapshot.items.length
      && snapshot.items.every((item, index) => current[index].description === item.description && current[index].quantity === item.quantity && current[index].unitAmount === item.unitAmount);
    if (!same) {
      const linkOf = (item: DocumentSnapshot["items"][number]) => current.find((row) => row.description === item.description && row.unitAmount === item.unitAmount)?.paymentLinkId ?? null;
      await tx.businessDocumentItem.deleteMany({ where: { documentId: id } });
      await tx.businessDocumentItem.createMany({
        data: snapshot.items.map((item, position) => ({ documentId: id, position, description: item.description, quantity: item.quantity, unitAmount: item.unitAmount, amount: item.amount, paymentLinkId: linkOf(item) })),
      });
    }
    return fields;
  }

  // ── worker ────────────────────────────────────────────────────────────

  /** Open proposals past their validity become EXPIRED (conditional, once per version). */
  async expireOverdue(now = new Date()) {
    const late = await this.prisma.businessDocument.findMany({
      where: { kind: "PROPOSAL", status: { in: OPEN_PROPOSAL }, validUntil: { lt: now } },
      select: { id: true, currentVersion: true },
      take: 500,
    });
    let expired = 0;
    for (const doc of late) if (await expireProposal(this.prisma, doc.id, doc.currentVersion, now)) expired += 1;
    return expired;
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private tokenId(token: string) {
    const id = readDocumentLinkToken(token, this.config.get<string>("app.documentLinkSecret") ?? DEVELOPMENT_DOCUMENT_LINK_SECRET);
    if (!id) throw new NotFoundException("No encontramos esta propuesta");
    return id;
  }

  private async lockedProposal(tx: Prisma.TransactionClient, id: string) {
    const doc = await tx.businessDocument.findUnique({ where: { id } });
    // A cobro, a draft or a bad link answer the same way.
    if (!doc || doc.kind !== "PROPOSAL" || doc.currentVersion < 1) throw new NotFoundException("No encontramos esta propuesta");
    return doc;
  }

  /** Why the customer can no longer act on it, or null. A proposal past its validity is expired here. */
  private async closedReason(tx: Prisma.TransactionClient, doc: { id: string; status: BusinessDocumentStatus; validUntil: Date | null; currentVersion: number }, verb: string) {
    const closed = (message: string) => ({ kind: "closed" as const, message });
    if (doc.status === S.VOIDED) return closed(`Esta propuesta fue anulada y ya no se puede ${verb === "aceptar" ? "aceptar" : "comentar"}. Escríbele al comercio si tienes dudas.`);
    const past = Boolean(doc.validUntil && doc.validUntil.getTime() < Date.now());
    if (doc.status === S.EXPIRED || (past && OPEN_PROPOSAL.includes(doc.status))) {
      // Committed with the transaction; the refusal is thrown after it.
      if (doc.status !== S.EXPIRED) await expireProposal(tx, doc.id, doc.currentVersion);
      return closed("Esta propuesta venció. Pídele al comercio una propuesta actualizada.");
    }
    if (!OPEN_PROPOSAL.includes(doc.status)) return closed(`Ya no puedes ${verb} esta propuesta.`);
    return null;
  }

  /**
   * One email to the merchant (store contact email, else the account's), claimed as a
   * `merchant_notified` event inside the store's daily document email cap. Over the cap, or
   * when delivery fails, the customer's answer is still in the timeline (and the Inbox).
   */
  private async notifyMerchant(doc: ProposalRow, reason: "accepted" | "changes", customer: { name: string | null; email: string; message?: string }) {
    try {
      const [store, merchant] = await Promise.all([
        this.prisma.store.findUnique({ where: { id: doc.storeId }, select: { name: true, contactEmail: true } }),
        this.prisma.merchant.findUnique({ where: { id: doc.merchantId }, select: { email: true } }),
      ]);
      const to = store?.contactEmail || merchant?.email;
      if (!store || !to) return false;
      let eventId: string;
      try {
        eventId = await this.prisma.$transaction(async (tx) => {
          await this.documents.assertEmailQuota(tx, doc.storeId);
          const event = await tx.businessDocumentEvent.create({ data: { documentId: doc.id, type: "merchant_notified", version: doc.currentVersion, data: { to, reason } } });
          return event.id;
        });
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 429) return false; // the store's cap: the timeline has it
        throw error;
      }
      const origin = (this.config.get<string>("app.merchantDashboardOrigin") ?? "http://localhost:4322").replace(/\/$/, "");
      const message = buildProposalMerchantEmail({
        reason,
        storeName: store.name,
        numberLabel: documentNumberLabel("PROPOSAL", doc.number),
        title: doc.title,
        totalAmount: doc.totalAmount,
        currency: doc.currency,
        customerName: customer.name,
        customerEmail: customer.email,
        message: customer.message,
        dashboardUrl: `${origin}/#dashboard-proposals`,
      });
      try {
        await this.email.send({ to, subject: message.subject, body: message.text, html: message.html, replyTo: customer.email, idempotencyKey: `business-document/${eventId}`, failLoudly: true });
        return true;
      } catch (error) {
        this.logger.warn(`Proposal ${doc.id} merchant email failed: ${(error as Error).message}`);
        await this.prisma.businessDocumentEvent.create({ data: { documentId: doc.id, type: "email_failed", version: doc.currentVersion, data: { to, reason, notice: "merchant", error: (error as Error).message.slice(0, 200) } } });
        return false;
      }
    } catch (error) {
      // The customer's answer is already committed; a notification problem never undoes it.
      this.logger.warn(`Proposal ${doc.id} merchant notification failed: ${(error as Error).message}`);
      return false;
    }
  }

  /** What YAPI knows about the store: name, tagline, about, categories and ≤60 active priced products. */
  private async context(store: { id: string; name: string; tagline: string | null; aboutText: string | null }) {
    const [categories, products] = await Promise.all([
      this.prisma.category.findMany({ where: { storeId: store.id }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" }, take: 20 }),
      this.prisma.paymentLink.findMany({
        where: { storeId: store.id, status: "ACTIVE", amount: { gt: 0 } },
        select: { id: true, name: true, amount: true, currency: true, categoryId: true },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
    ]);
    return buildProposalContext(store, categories, products);
  }

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, merchantId },
      select: { id: true, name: true, tagline: true, aboutText: true, contactEmail: true, logoUrl: true },
    });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }
}
