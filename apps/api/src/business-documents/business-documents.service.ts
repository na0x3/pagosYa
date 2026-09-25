import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessDocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { UploadsService } from "../uploads/uploads.service";
import type { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { buildDocumentEmail } from "./business-document-email";
import { renderBusinessDocumentPdf } from "./business-document-pdf";
import { renderContractPdf, type ContractPdfSignature } from "./contract-pdf";
import { contractMetaBlock, splitContractContent } from "./contract-terms";
import { contractPublicFields, contractStateWhere, expireContract, OPEN_CONTRACT, signingSummary, waitingFor, type SignatureRow } from "./contract-state";
import { cancelStaleCheckout } from "./cobro-payment";
import { sha256Hex } from "../legal/legal-documents.service";
import {
  buildSnapshot,
  canonicalJson,
  computeTotals,
  documentNumberLabel,
  findPlaceholders,
  snapshotSha256,
  type DocumentSnapshot,
} from "./business-document-snapshot";
import {
  createDocumentLinkToken,
  createDocumentPreviewToken,
  DEVELOPMENT_DOCUMENT_LINK_SECRET,
  readDocumentLinkToken,
  readDocumentPreviewToken,
} from "./document-link-token";
import type { AcceptanceContext } from "../legal/terms-acceptance.service";
import type {
  BusinessDocumentItemDto,
  CreateBusinessDocumentDto,
  DocumentListState,
  ListBusinessDocumentsQueryDto,
  SendBusinessDocumentDto,
  UpdateBusinessDocumentDto,
  VoidBusinessDocumentDto,
} from "./dto/business-document.dto";

const S = BusinessDocumentStatus;

/** A paid cobro needs a refund and a signed contract is evidence: neither is voided here. */
const NOT_VOIDABLE: BusinessDocumentStatus[] = [S.PAID, S.SIGNED, S.VOIDED];

/** Accepted, signed, paid, declined, expired or voided documents are records, not drafts. */
const FINAL: BusinessDocumentStatus[] = [S.ACCEPTED, S.SIGNED, S.PAID, S.DECLINED, S.EXPIRED, S.VOIDED];

/** A voided document keeps its identity (kind, number, title) and loses everything else. */
const revokedSnapshot = (snapshot: DocumentSnapshot): DocumentSnapshot => ({
  ...snapshot,
  customer: { name: null, email: null, phone: null, document: null },
  items: [],
  subtotalAmount: 0,
  discountAmount: 0,
  totalAmount: 0,
  dueAt: null,
  validUntil: null,
  blocks: [],
  contract: undefined,
});

const DEFAULT_DOCUMENT_EMAILS_PER_DAY = 200;

/** A merchant preview link stays valid this long (it only suppresses the view record). */
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

/** A cobro the customer can still pay: sent and not closed. Overdue stays payable. */
const PAYABLE: BusinessDocumentStatus[] = [S.SENT, S.VIEWED, S.OVERDUE];

/** The events that say how (and whether properly) a cobro was paid. */
const PAYMENT_EVENTS = ["paid", "paid_manually", "payment_after_close", "payment_mismatch"];

/**
 * What the list and the detail show about a cobro's payment: a test-mode payment (not real money),
 * one marked by hand, and payments the merchant has to refund or reconcile.
 */
export function paymentFlags(events: Array<{ type: string; data: Prisma.JsonValue | null }>) {
  const livemodeFalse = (data: Prisma.JsonValue | null) => Boolean(data && typeof data === "object" && !Array.isArray(data) && data.livemode === false);
  return {
    testMode: events.some((event) => event.type === "paid" && livemodeFalse(event.data)),
    manual: events.some((event) => event.type === "paid_manually"),
    afterClose: events.some((event) => event.type === "payment_after_close"),
    mismatch: events.some((event) => event.type === "payment_mismatch"),
  };
}

/** The cobros tabs as a filter: "open" includes overdue (money still owed); overdue does not wait for the worker. */
export function cobroStateWhere(state: DocumentListState, now: Date): Prisma.BusinessDocumentWhereInput {
  if (state === "paid") return { status: S.PAID };
  if (state === "open") return { status: { in: PAYABLE } };
  if (state === "draft") return { status: S.DRAFT };
  if (state === "closed") return { status: { in: [S.VOIDED, S.EXPIRED] } };
  if (state === "accepted") return { status: S.ACCEPTED };
  return { OR: [{ status: S.OVERDUE }, { status: { in: [S.SENT, S.VIEWED] }, dueAt: { lt: now } }] };
}

/** A proposal the customer can still accept or comment on (until its validity passes). */
export const OPEN_PROPOSAL: BusinessDocumentStatus[] = [S.SENT, S.VIEWED, S.CHANGES_REQUESTED];

/** The proposals tabs: past its validity a proposal is closed at once, without waiting for the worker. */
export function proposalStateWhere(state: DocumentListState, now: Date): Prisma.BusinessDocumentWhereInput {
  if (state === "draft") return { status: S.DRAFT };
  if (state === "accepted") return { status: S.ACCEPTED };
  if (state === "open") return { status: { in: OPEN_PROPOSAL }, OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
  if (state === "closed") return { OR: [{ status: { in: [S.EXPIRED, S.VOIDED, S.DECLINED] } }, { status: { in: OPEN_PROPOSAL }, validUntil: { lt: now } }] };
  return { status: { in: [] } };
}

/**
 * A proposal past its validity is closed: conditional (never over an accepted or voided one),
 * recorded once per version. Used on read, when the customer acts, and by the worker.
 */
export async function expireProposal(db: Pick<Prisma.TransactionClient, "businessDocument" | "businessDocumentEvent">, id: string, version: number, now = new Date()) {
  const { count } = await db.businessDocument.updateMany({
    where: { id, kind: "PROPOSAL", status: { in: OPEN_PROPOSAL }, validUntil: { lt: now } },
    data: { status: S.EXPIRED },
  });
  if (count) {
    await db.businessDocumentEvent.createMany({ data: [{ documentId: id, type: "expired", version, dedupeKey: `expired:v${version}` }], skipDuplicates: true });
  }
  return count > 0;
}

type ProposalPublicFields = { validUntil: Date | null; acceptable: boolean; acceptance: { name: string; at: Date } | null; changesRequestedAt: Date | null };

const pastValidity = () => new UnprocessableEntityException("La validez de la propuesta ya pasó: elige una fecha futura.");

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

type DocumentWithItems = Prisma.BusinessDocumentGetPayload<{ include: { items: true } }> & { signatures?: SignatureRow[] };

/**
 * A contract's content always starts with its one `contract` block (the parties); a save that
 * leaves it out keeps the stored one. Other kinds never keep a `contract` block.
 */
function normalizeContent(kind: string, content: unknown, previous: unknown): unknown[] {
  const blocks = Array.isArray(content) ? (content as Array<{ type?: string }>) : [];
  if (kind !== "CONTRACT") return blocks.filter((block) => block?.type !== "contract");
  const hasMeta = blocks.some((block) => block?.type === "contract");
  const { meta, clauses } = splitContractContent(hasMeta ? blocks : [...(Array.isArray(previous) ? (previous as unknown[]).filter((block) => (block as { type?: string })?.type === "contract") : []), ...blocks]);
  return [contractMetaBlock(meta), ...clauses];
}

const customerSignedConflict = () => new ConflictException("Tu cliente ya firmó esta versión: fírmala o anúlala para cambiarla.");

/**
 * What the merchant edits, hashed. Two tabs compare it (If-Match on PATCH) so one never silently
 * overwrites the other; a send, a customer's view or a status change leaves it as it was.
 */
export function editTag(doc: DocumentWithItems): string {
  const iso = (value: Date | null) => (value ? value.toISOString() : null);
  return sha256Hex(canonicalJson({
    title: doc.title,
    currency: doc.currency,
    businessCustomerId: doc.businessCustomerId,
    customer: [doc.customerName, doc.customerEmail, doc.customerPhone, doc.customerDocument],
    discountAmount: doc.discountAmount,
    content: doc.content,
    dueAt: iso(doc.dueAt),
    validUntil: iso(doc.validUntil),
    autoReminders: doc.autoReminders,
    items: [...doc.items].sort((a, b) => a.position - b.position).map((item) => [item.description, item.quantity, item.unitAmount, item.paymentLinkId ?? null]),
  })).slice(0, 24);
}

const SIGNATURE_FIELDS = { role: true, name: true, method: true, version: true, signedAt: true } as const;

function contractSigning(doc: { content: Prisma.JsonValue; currentVersion: number; status: BusinessDocumentStatus; signatures?: SignatureRow[] }) {
  const summary = signingSummary(doc.signatures, doc.currentVersion);
  const order = splitContractContent(doc.content).meta.signingOrder;
  const next = doc.currentVersion > 0 && OPEN_CONTRACT.includes(doc.status) ? waitingFor(order, summary.merchantSigned, summary.customerSigned) : null;
  return { ...summary, order, waitingFor: next };
}

const sameTag = (header: string, tag: string) => header.split(",").some((value) => value.trim().replace(/^W\//, "").replace(/"/g, "") === tag);

/**
 * Cobros, proposals and contracts share one lifecycle: a draft the merchant
 * edits, and on every send an immutable, hashed version the customer sees
 * through a signed link. D1–D3 add their own transitions on top.
 */
@Injectable()
export class BusinessDocumentsService {
  private readonly logger = new Logger(BusinessDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Optional() private readonly uploads?: UploadsService,
  ) {}

  // ── merchant ──────────────────────────────────────────────────────────

  /** `createdData`: what the "created" event records (e.g. `{ fromProposal }`). */
  async create(merchantId: string, storeId: string, dto: CreateBusinessDocumentDto, createdData?: Prisma.InputJsonValue) {
    await this.ownedStore(merchantId, storeId);
    const customer = await this.customerFields(storeId, dto);
    const items = await this.pricedItems(storeId, dto.items ?? []);
    const totals = computeTotals(items, dto.discountAmount ?? 0);
    const created = await this.prisma.businessDocument.create({
      data: {
        storeId,
        merchantId,
        kind: dto.kind,
        title: dto.title,
        currency: dto.currency ?? "BOB",
        ...customer,
        subtotalAmount: totals.subtotalAmount,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        content: normalizeContent(dto.kind, dto.content ?? [], []) as unknown as Prisma.InputJsonValue,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        autoReminders: dto.autoReminders ?? true,
        items: { create: totals.items.map((item, position) => ({ position, ...item })) },
        events: { create: [{ type: "created", ...(createdData !== undefined && { data: createdData }) }] },
      },
    });
    return this.view(await this.load(storeId, created.id));
  }

  /**
   * Newest first, one page at a time (`limit`, then `cursor` = the last id of the previous page).
   * `state` is the cobros tab, computed here so a tab is never limited to the rows already loaded.
   */
  async list(merchantId: string, storeId: string, query: ListBusinessDocumentsQueryDto) {
    await this.ownedStore(merchantId, storeId);
    const rows = await this.prisma.businessDocument.findMany({
      where: { storeId, ...(query.kind && { kind: query.kind }), ...(query.status && { status: query.status }), ...(query.state && (query.kind === "PROPOSAL" ? proposalStateWhere : query.kind === "CONTRACT" ? contractStateWhere : cobroStateWhere)(query.state, new Date())) },
      include: { items: { orderBy: { position: "asc" } }, events: { where: { type: { in: PAYMENT_EVENTS } }, select: { type: true, data: true } }, signatures: { select: SIGNATURE_FIELDS } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit ?? 100,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    return rows.map(({ events, ...row }) => ({ ...this.view(row), payment: paymentFlags(events) }));
  }

  async get(merchantId: string, storeId: string, id: string) {
    await this.ownedStore(merchantId, storeId);
    const doc = await this.prisma.businessDocument.findFirst({
      where: { id, storeId },
      include: {
        items: { orderBy: { position: "asc" } },
        versions: { select: { version: true, sha256: true, sentAt: true, createdAt: true }, orderBy: { version: "asc" } },
        events: { orderBy: { at: "asc" }, take: 200 },
        signatures: { select: SIGNATURE_FIELDS },
      },
    });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    return {
      ...this.view(doc),
      payment: paymentFlags(doc.events),
      // The merchant's "ver como cliente": the same page, without recording a view.
      previewUrl: doc.currentVersion > 0
        ? `${this.publicUrl(doc.id)}?preview=${createDocumentPreviewToken(doc.id, this.secret(), new Date(Date.now() + PREVIEW_TTL_MS))}`
        : null,
      versions: doc.versions,
      events: doc.events.map(({ id: eventId, type, version, at, data }) => ({ id: eventId, type, version, at, data })),
    };
  }

  /** `ifMatch`: the editTag the editor loaded; a different current tag means another tab saved first (409). */
  async update(merchantId: string, storeId: string, id: string, dto: UpdateBusinessDocumentDto, ifMatch?: string) {
    await this.ownedStore(merchantId, storeId);
    const initial = await this.load(storeId, id);
    if (FINAL.includes(initial.status)) throw new ConflictException("Este documento ya no se puede editar");
    // The row's validity is what the customer's link obeys: a sent proposal never gets one in the past.
    if (initial.kind === "PROPOSAL" && initial.status !== S.DRAFT && dto.validUntil && new Date(dto.validUntil).getTime() < Date.now()) throw pastValidity();
    // A contract the customer already signed is evidence: it is signed or voided, not edited (D3).
    const contract = initial.kind === "CONTRACT";
    if (contract && (await this.customerSignedCurrent(this.prisma, id, initial.currentVersion))) throw customerSignedConflict();
    const customer = await this.customerFields(storeId, dto, dto.businessCustomerId === undefined);
    const pricedItems = dto.items ? await this.pricedItems(storeId, dto.items) : null;
    await this.prisma.$transaction(async (tx) => {
      // A conditional save holds the row, so two tabs cannot both pass the check below.
      if (ifMatch || contract) await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      // Totals come from the row this transaction reads, not from the first read.
      const doc = await tx.businessDocument.findFirst({ where: { id, storeId }, include: { items: { orderBy: { position: "asc" } } } });
      if (!doc) throw new NotFoundException("Documento no encontrado");
      if (FINAL.includes(doc.status)) throw new ConflictException("Este documento ya no se puede editar");
      if (contract && (await this.customerSignedCurrent(tx, id, doc.currentVersion))) throw customerSignedConflict();
      if (ifMatch && !sameTag(ifMatch, editTag(doc))) {
        throw new ConflictException("Este documento cambió en otra pestaña o dispositivo. Recarga para ver la última versión antes de seguir editando.");
      }
      const totals = computeTotals(pricedItems ?? doc.items, dto.discountAmount ?? doc.discountAmount);
      // Conditional and written first, so a void, payment or signature landing meanwhile refuses the whole edit.
      const { count } = await tx.businessDocument.updateMany({
        where: { id, status: { notIn: FINAL } },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...customer,
          subtotalAmount: totals.subtotalAmount,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          ...(dto.content !== undefined && { content: normalizeContent(doc.kind, dto.content, doc.content) as unknown as Prisma.InputJsonValue }),
          ...(dto.dueAt !== undefined && { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
          ...(dto.validUntil !== undefined && { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }),
          ...(dto.autoReminders !== undefined && { autoReminders: dto.autoReminders }),
        },
      });
      if (!count) throw new ConflictException("Este documento ya no se puede editar");
      if (pricedItems) {
        await tx.businessDocumentItem.deleteMany({ where: { documentId: id } });
        await tx.businessDocumentItem.createMany({
          data: totals.items.map((item, position) => ({
            documentId: id,
            position,
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            amount: item.amount,
            paymentLinkId: item.paymentLinkId ?? null,
          })),
        });
      }
    });
    return this.view(await this.load(storeId, id));
  }

  async remove(merchantId: string, storeId: string, id: string) {
    await this.ownedStore(merchantId, storeId);
    const doc = await this.load(storeId, id);
    if (doc.currentVersion > 0) throw new ConflictException("Un documento enviado no se elimina: anúlalo");
    await this.prisma.businessDocument.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Freezes the current content as a new version (unless nothing changed since
   * the last one), numbers the document on its first send, and delivers it.
   */
  async send(merchantId: string, storeId: string, id: string, dto: SendBusinessDocumentDto) {
    const store = await this.ownedStore(merchantId, storeId);
    // A fast answer from the first read; the transaction re-checks the row it writes.
    this.assertSendable(await this.load(storeId, id), dto.message);

    let sent: { version: number; sha256: string; snapshot: DocumentSnapshot; eventId: string; to: string | null } | undefined;
    for (let attempt = 0; !sent; attempt += 1) {
      try {
        sent = await this.prisma.$transaction(async (tx) => {
          // Re-read inside the attempt: a concurrent send may have numbered or versioned it.
          const doc = await tx.businessDocument.findFirst({ where: { id, storeId }, include: { items: { orderBy: { position: "asc" } } } });
          if (!doc) throw new NotFoundException("Documento no encontrado");
          this.assertSendable(doc, dto.message);
          // Only the email channel is capped; a link-only send (WhatsApp, copy) never is.
          if (dto.email !== false && doc.customerEmail) await this.assertEmailQuota(tx, storeId);
          const number = doc.number ?? ((await tx.businessDocument.aggregate({ where: { storeId, kind: doc.kind }, _max: { number: true } }))._max.number ?? 0) + 1;
          const snapshot = buildSnapshot({ ...doc, number });
          const sha256 = snapshotSha256(snapshot);
          const now = new Date();
          const latest = doc.currentVersion
            ? await tx.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version: doc.currentVersion } } })
            : null;
          // Every write is conditional on a non-final status, so a void, payment or signature
          // committed after this read is never overwritten.
          const notFinal = { id, status: { notIn: FINAL } };
          const to = doc.customerEmail;
          // A changed contract would orphan the customer's signature on the version they signed.
          if (doc.kind === "CONTRACT" && (!latest || latest.sha256 !== sha256) && (await this.customerSignedCurrent(tx, id, doc.currentVersion))) throw customerSignedConflict();
          if (latest && latest.sha256 === sha256) {
            const { count } = await tx.businessDocument.updateMany({ where: notFinal, data: { sentAt: now } });
            if (!count) throw new ConflictException("Este documento ya no se puede enviar");
            const event = await tx.businessDocumentEvent.create({ data: { documentId: id, type: "sent", version: doc.currentVersion, data: { resend: true } } });
            return { version: doc.currentVersion, sha256, snapshot, eventId: event.id, to };
          }
          const version = doc.currentVersion + 1;
          // The number is written first, so a collision fails before anything else is written.
          const { count } = await tx.businessDocument.updateMany({ where: notFinal, data: { number, status: S.SENT, currentVersion: version, sentAt: now } });
          if (!count) throw new ConflictException("Este documento ya no se puede enviar");
          await tx.businessDocumentVersion.create({
            data: { documentId: id, version, sha256, content: snapshot as unknown as Prisma.InputJsonValue, sentAt: now },
          });
          const event = await tx.businessDocumentEvent.create({ data: { documentId: id, type: "sent", version, data: { sha256 } } });
          return { version, sha256, snapshot, eventId: event.id, to };
        });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 4) continue;
        if (isUniqueViolation(error)) throw new ConflictException("Otro envío está en curso. Intenta nuevamente.");
        throw error;
      }
    }

    const publicUrl = this.publicUrl(id);
    let emailed = false;
    const to = sent.to;
    if (dto.email !== false && to) {
      try {
        const pdfInput = {
          storeName: store.name,
          logo: await this.storeLogo(store.logoUrl),
          numberLabel: sent.snapshot.numberLabel,
          version: sent.version,
          sha256: sent.sha256,
          snapshot: sent.snapshot,
        };
        // A contract's PDF carries the signatures already on this version (the merchant's, when they signed first).
        const signatures = sent.snapshot.kind === "CONTRACT" ? await this.prisma.businessDocumentSignature.findMany({ where: { documentId: id, version: sent.version } }) : [];
        const pdf = sent.snapshot.kind === "CONTRACT" ? await renderContractPdf({ ...pdfInput, signatures: signatures as unknown as ContractPdfSignature[] }) : await renderBusinessDocumentPdf(pdfInput);
        const message = buildDocumentEmail({ storeName: store.name, snapshot: sent.snapshot, publicUrl, message: dto.message });
        await this.email.send({
          to,
          subject: message.subject,
          body: message.text,
          html: message.html,
          replyTo: store.contactEmail ?? undefined,
          attachments: [{ filename: `${sent.snapshot.numberLabel}.pdf`, contentType: "application/pdf", content: pdf.toString("base64") }],
          // One key per delivery (the send event), so a deliberate re-send is not deduplicated away.
          idempotencyKey: `business-document/${sent.eventId}`,
          failLoudly: true,
        });
        emailed = true;
        await this.prisma.businessDocumentEvent.create({ data: { documentId: id, type: "emailed", version: sent.version, data: { to } } });
      } catch (error) {
        this.logger.warn(`Business document ${id} v${sent.version} email failed: ${(error as Error).message}`);
        await this.prisma.businessDocumentEvent.create({
          data: { documentId: id, type: "email_failed", version: sent.version, data: { to, reason: (error as Error).message.slice(0, 200) } },
        });
      }
    }
    return { document: this.view(await this.load(storeId, id)), publicUrl, emailed };
  }

  async void(merchantId: string, storeId: string, id: string, dto: VoidBusinessDocumentDto) {
    await this.ownedStore(merchantId, storeId);
    const doc = await this.load(storeId, id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Conditional, so a payment or signature landing meanwhile is never voided over.
      const { count } = await tx.businessDocument.updateMany({
        where: { id, status: { notIn: NOT_VOIDABLE } },
        data: { status: S.VOIDED, voidedAt: now },
      });
      if (!count) throw new ConflictException("Este documento ya no se puede anular");
      // A checkout the customer has not started is closed with it; one already in progress
      // (a QR on screen) is left to finish, and a payment then lands as payment_after_close.
      // The document row is held from here on; the intent is never waited for (lock order in
      // cobro-payment.ts cancelStaleCheckout).
      if (doc.paymentIntentId) await cancelStaleCheckout(tx, doc.paymentIntentId);
      await tx.businessDocumentEvent.create({
        data: { documentId: id, type: "voided", version: doc.currentVersion || null, ...(dto.reason && { data: { reason: dto.reason } }) },
      });
    });
    return this.view(await this.load(storeId, id));
  }

  // ── public link ───────────────────────────────────────────────────────

  /**
   * What the customer's link shows: the latest sent version exactly as frozen,
   * plus the store's name and logo. Opening it records "viewed" once per version.
   * Voiding revokes the content: a voided link keeps only the store, number,
   * title, status and void date — no customer data, items or blocks.
   */
  async publicView(token: string, context: AcceptanceContext, previewToken?: string) {
    const { doc, version, snapshot } = await this.publicVersion(token);
    const store = await this.prisma.store.findUnique({
      where: { id: doc.storeId },
      select: { name: true, logoUrl: true, contactEmail: true, contactPhone: true },
    });
    if (doc.status === S.VOIDED) {
      const storeView = { name: store?.name ?? "", logoUrl: store?.logoUrl ?? null };
      return { kind: doc.kind, numberLabel: snapshot.numberLabel, title: snapshot.title, status: doc.status, voidedAt: doc.voidedAt, store: storeView };
    }
    const storeView = {
      name: store?.name ?? "",
      logoUrl: store?.logoUrl ?? null,
      contactEmail: store?.contactEmail ?? null,
      contactPhone: store?.contactPhone ?? null,
    };
    // A proposal past its validity closes now, without waiting for the worker.
    let current = doc.status;
    if (doc.kind === "PROPOSAL" && OPEN_PROPOSAL.includes(current) && doc.validUntil && doc.validUntil.getTime() < Date.now()) {
      await expireProposal(this.prisma, doc.id, version.version);
      current = S.EXPIRED;
    }
    // So does a contract past its signing deadline (D3).
    if (doc.kind === "CONTRACT" && OPEN_CONTRACT.includes(current) && doc.validUntil && doc.validUntil.getTime() < Date.now()) {
      await expireContract(this.prisma, doc.id, version.version);
      current = S.EXPIRED;
    }
    // The merchant looking at their own document is not the customer opening it.
    const preview = Boolean(previewToken) && readDocumentPreviewToken(previewToken!, this.secret()) === doc.id;
    const viewed = !preview && (await this.recordView(doc.id, version.version, context));
    const status = viewed && current === S.SENT ? S.VIEWED : current;
    // Proposals (D2) add their validity and acceptance; cobros keep exactly their D1 fields.
    const proposal = doc.kind === "PROPOSAL" ? await this.proposalFields(doc.id, status, doc.validUntil) : undefined;
    // Contracts (D3) add who signed, who is next and where the code goes.
    const contract = doc.kind === "CONTRACT" ? await contractPublicFields(this.prisma, { id: doc.id, status, currentVersion: version.version, validUntil: doc.validUntil }, snapshot) : undefined;
    return {
      kind: doc.kind,
      numberLabel: snapshot.numberLabel,
      status,
      version: version.version,
      sha256: version.sha256,
      sentAt: version.sentAt,
      updatedAfterFirstSend: version.version > 1,
      store: storeView,
      document: snapshot,
      dueAt: doc.dueAt,
      paidAt: doc.paidAt,
      payable: doc.kind === "INVOICE" && PAYABLE.includes(status),
      preview,
      // undefined (left out of the JSON) for a cobro.
      validUntil: proposal?.validUntil ?? contract?.validUntil,
      acceptable: proposal?.acceptable,
      acceptance: proposal?.acceptance,
      changesRequestedAt: proposal?.changesRequestedAt,
      signing: contract?.signing,
    };
  }

  /** Proposals (D2): validity, whether it can still be accepted, and who accepted it (name only). */
  private async proposalFields(documentId: string, status: BusinessDocumentStatus, validUntil: Date | null): Promise<ProposalPublicFields> {
    const [accepted, changes] = await Promise.all([
      status === S.ACCEPTED ? this.prisma.businessDocumentEvent.findFirst({ where: { documentId, type: "accepted" } }) : Promise.resolve(null),
      status === S.CHANGES_REQUESTED ? this.prisma.businessDocumentEvent.findFirst({ where: { documentId, type: "changes_requested" }, orderBy: { at: "desc" } }) : Promise.resolve(null),
    ]);
    const acceptedData = (accepted?.data ?? null) as { name?: string } | null;
    return {
      validUntil,
      acceptable: OPEN_PROPOSAL.includes(status),
      acceptance: accepted ? { name: acceptedData?.name ?? "", at: accepted.at } : null,
      changesRequestedAt: changes?.at ?? null,
    };
  }

  /** The frozen version as a PDF; a voided one carries only its header and an ANULADO stamp on every page. */
  async publicPdf(token: string) {
    const { doc, version, snapshot } = await this.publicVersion(token);
    const store = await this.prisma.store.findUnique({ where: { id: doc.storeId }, select: { name: true, logoUrl: true } });
    const voided = doc.status === S.VOIDED;
    if (doc.kind === "CONTRACT") {
      // The contract with its signatures (and, once anyone signed, the evidence page).
      const signatures = await this.prisma.businessDocumentSignature.findMany({ where: { documentId: doc.id, version: version.version } });
      const buffer = await renderContractPdf({
        storeName: store?.name ?? "",
        logo: await this.storeLogo(store?.logoUrl ?? null),
        numberLabel: snapshot.numberLabel,
        version: version.version,
        sha256: version.sha256,
        snapshot,
        signatures: signatures as unknown as ContractPdfSignature[],
        voidedAt: voided ? (doc.voidedAt ?? new Date()).toISOString() : null,
      });
      return { buffer, filename: `${snapshot.numberLabel}${doc.status === S.SIGNED ? "-firmado" : ""}.pdf` };
    }
    const buffer = await renderBusinessDocumentPdf({
      storeName: store?.name ?? "",
      logo: await this.storeLogo(store?.logoUrl ?? null),
      numberLabel: snapshot.numberLabel,
      version: version.version,
      sha256: version.sha256,
      snapshot: voided ? revokedSnapshot(snapshot) : snapshot,
      voidedAt: voided ? (doc.voidedAt ?? new Date()).toISOString() : null,
    });
    return { buffer, filename: `${snapshot.numberLabel}.pdf` };
  }

  private async publicVersion(token: string) {
    const notFound = () => new NotFoundException("No encontramos este documento");
    const id = readDocumentLinkToken(token, this.secret());
    if (!id) throw notFound();
    const doc = await this.prisma.businessDocument.findUnique({
      where: { id },
      select: { id: true, storeId: true, kind: true, status: true, currentVersion: true, voidedAt: true, dueAt: true, paidAt: true, validUntil: true },
    });
    // A never-sent draft answers exactly like a bad token.
    if (!doc || doc.currentVersion < 1) throw notFound();
    const version = await this.prisma.businessDocumentVersion.findUnique({
      where: { documentId_version: { documentId: id, version: doc.currentVersion } },
    });
    if (!version) throw notFound();
    return { doc, version, snapshot: version.content as unknown as DocumentSnapshot };
  }

  /** True when this call recorded the view; false when this version was already viewed. */
  private async recordView(documentId: string, version: number, context: AcceptanceContext): Promise<boolean> {
    try {
      await this.prisma.businessDocumentEvent.create({
        data: { documentId, type: "viewed", version, ipAddress: context.ipAddress, userAgent: context.userAgent, dedupeKey: `viewed:v${version}` },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
    const now = new Date();
    await this.prisma.businessDocument.updateMany({ where: { id: documentId, status: S.SENT }, data: { status: S.VIEWED } });
    await this.prisma.businessDocument.updateMany({ where: { id: documentId, viewedAt: null }, data: { viewedAt: now } });
    return true;
  }

  // ── helpers ───────────────────────────────────────────────────────────

  /**
   * The store's uploaded logo as bytes for the PDF header. Only our own uploads
   * are read (never a remote URL); a missing or unreadable file means no logo.
   */
  async storeLogo(logoUrl: string | null | undefined): Promise<Buffer | null> {
    const filename = /^\/v1\/uploads\/([^/?#]+)$/.exec(logoUrl ?? "")?.[1];
    if (!filename || !this.uploads) return null;
    try {
      return await this.uploads.getBuffer(filename);
    } catch (error) {
      this.logger.warn(`Store logo ${filename} unreadable for a document PDF: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * A per-store cap on document emails in the last 24 hours, counted from the
   * `emailed` events, so a compromised or careless account cannot spam from
   * the platform sender. Soft under concurrency: two sends at the edge may both pass.
   */
  async assertEmailQuota(tx: Prisma.TransactionClient, storeId: string) {
    const limit = this.config.get<number>("app.documentEmailsPerDay") ?? DEFAULT_DOCUMENT_EMAILS_PER_DAY;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Reminder emails leave from the same sender, so they count too; a WhatsApp reminder does not.
    const sent =
      // Proposal notifications to the merchant leave from the same sender too (D2).
      (await tx.businessDocumentEvent.count({ where: { type: { in: ["emailed", "merchant_notified", "sign_code_sent"] }, at: { gte: since }, document: { storeId } } }))
      + (await tx.businessDocumentEvent.count({ where: { type: "reminded", data: { path: ["channel"], equals: "email" }, at: { gte: since }, document: { storeId } } }));
    if (sent >= limit) {
      throw new HttpException(
        `Alcanzaste el límite de ${limit} correos de documentos por día para esta tienda. Comparte el enlace por WhatsApp o cópialo, o vuelve a enviarlo por correo mañana.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** What makes a document sendable, checked on whichever read is about to be written from. */
  private assertSendable(doc: DocumentWithItems, message?: string) {
    if (FINAL.includes(doc.status)) throw new ConflictException("Este documento ya no se puede enviar");
    const placeholders = findPlaceholders(buildSnapshot(doc), [message]);
    if (placeholders.length) throw new UnprocessableEntityException(`Completa los datos pendientes antes de enviar: ${placeholders.join(", ")}`);
    if (doc.kind === "INVOICE" && doc.totalAmount <= 0) throw new UnprocessableEntityException("Agrega al menos un ítem con monto para enviar el cobro");
    if (doc.kind === "PROPOSAL" && doc.validUntil && doc.validUntil.getTime() < Date.now()) throw pastValidity();
    if (doc.kind === "CONTRACT") {
      if (!doc.customerEmail) throw new UnprocessableEntityException("Agrega el correo del cliente: ahí le llega el código para firmar.");
      if (doc.validUntil && doc.validUntil.getTime() < Date.now()) throw new UnprocessableEntityException("La fecha límite para firmar ya pasó: elige una fecha futura.");
    }
  }

  /** D3: the customer signed the version their link shows (so the merchant can only sign or void). */
  private async customerSignedCurrent(db: Pick<Prisma.TransactionClient, "businessDocumentSignature">, id: string, version: number) {
    if (version < 1) return false;
    return (await db.businessDocumentSignature.count({ where: { documentId: id, version, role: "CUSTOMER" } })) > 0;
  }

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, merchantId },
      select: { id: true, name: true, logoUrl: true, contactEmail: true },
    });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  private async load(storeId: string, id: string): Promise<DocumentWithItems> {
    const doc = await this.prisma.businessDocument.findFirst({ where: { id, storeId }, include: { items: { orderBy: { position: "asc" } }, signatures: { select: SIGNATURE_FIELDS } } });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    return doc;
  }

  /**
   * Precedence, field by field: what the merchant sent wins — a value, or `null` for a field they
   * cleared — and only a field they did not send at all is filled from the CRM row.
   */
  private async customerFields(storeId: string, dto: Partial<CreateBusinessDocumentDto>, keepLink = false) {
    const typed = {
      ...(dto.customerName !== undefined && { customerName: dto.customerName || null }),
      ...(dto.customerEmail !== undefined && { customerEmail: dto.customerEmail?.toLowerCase() || null }),
      ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone || null }),
      ...(dto.customerDocument !== undefined && { customerDocument: dto.customerDocument || null }),
    };
    if (keepLink || !dto.businessCustomerId) return { ...(!keepLink && { businessCustomerId: null }), ...typed };
    const customer = await this.prisma.businessCustomer.findFirst({ where: { id: dto.businessCustomerId, storeId } });
    if (!customer) throw new NotFoundException("Cliente no encontrado");
    return {
      businessCustomerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerDocument: customer.document,
      ...typed,
    };
  }

  private async pricedItems(storeId: string, items: BusinessDocumentItemDto[]) {
    const linked = [...new Set(items.map((item) => item.paymentLinkId).filter((value): value is string => Boolean(value)))];
    if (linked.length && (await this.prisma.paymentLink.count({ where: { id: { in: linked }, storeId } })) !== linked.length) {
      throw new NotFoundException("Producto no encontrado");
    }
    return items.map((item) => ({ description: item.description, quantity: item.quantity, unitAmount: item.unitAmount, paymentLinkId: item.paymentLinkId ?? null }));
  }

  private secret() {
    return this.config.get<string>("app.documentLinkSecret") ?? DEVELOPMENT_DOCUMENT_LINK_SECRET;
  }

  publicUrl(id: string) {
    const origin = (this.config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174").replace(/\/$/, "");
    return `${origin}/d/${createDocumentLinkToken(id, this.secret())}`;
  }

  private view(doc: DocumentWithItems) {
    return {
      id: doc.id,
      kind: doc.kind,
      number: doc.number,
      numberLabel: documentNumberLabel(doc.kind, doc.number),
      status: doc.status,
      title: doc.title,
      currency: doc.currency,
      businessCustomerId: doc.businessCustomerId,
      customer: { name: doc.customerName, email: doc.customerEmail, phone: doc.customerPhone, document: doc.customerDocument },
      items: doc.items.map(({ id: itemId, description, quantity, unitAmount, amount, paymentLinkId }) => ({ id: itemId, description, quantity, unitAmount, amount, paymentLinkId })),
      subtotalAmount: doc.subtotalAmount,
      discountAmount: doc.discountAmount,
      totalAmount: doc.totalAmount,
      content: doc.content,
      dueAt: doc.dueAt,
      validUntil: doc.validUntil,
      currentVersion: doc.currentVersion,
      sentAt: doc.sentAt,
      viewedAt: doc.viewedAt,
      voidedAt: doc.voidedAt,
      paidAt: doc.paidAt,
      paymentIntentId: doc.paymentIntentId,
      autoReminders: doc.autoReminders,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      editTag: editTag(doc),
      publicUrl: doc.currentVersion > 0 ? this.publicUrl(doc.id) : null,
      // Contracts (D3): the current version's signatures and who signs next; undefined (left out) otherwise.
      signing: doc.kind === "CONTRACT" ? contractSigning(doc) : undefined,
    };
  }
}
