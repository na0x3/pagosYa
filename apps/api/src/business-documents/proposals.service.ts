import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessDocumentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import type { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { StructuredCompletionService } from "../ai/structured-completion";
import { BusinessDocumentsService, OPEN_PROPOSAL } from "./business-documents.service";
import type { DocumentBlock } from "./business-document-snapshot";
import {
  allowedAmounts,
  buildProposalContext,
  draftToDocument,
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
import type { DraftProposalDto, RegenerateProposalSectionDto } from "./dto/business-document.dto";

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
    const drafted = draftToDocument(result.data, { catalog: context.catalog, allowed: allowedAmounts([dto.brief, dto.budgetHint]) });
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
    const allowed = allowedAmounts([stored?.brief, stored?.budgetHint]);
    context.catalog.forEach((entry) => allowed.add(entry.price));
    doc.items.forEach((item) => { if (item.unitAmount > 0) { allowed.add(item.unitAmount); allowed.add(item.amount); } });
    if (doc.totalAmount > 0) allowed.add(doc.totalAmount);
    return { block: sectionToBlock(result.data, block, allowed) };
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

  // ── helpers ───────────────────────────────────────────────────────────

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
