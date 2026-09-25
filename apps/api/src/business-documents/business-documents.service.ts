import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessDocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import type { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { buildDocumentEmail } from "./business-document-email";
import { renderBusinessDocumentPdf } from "./business-document-pdf";
import {
  buildSnapshot,
  computeTotals,
  documentNumberLabel,
  findPlaceholders,
  snapshotSha256,
  type DocumentSnapshot,
} from "./business-document-snapshot";
import { createDocumentLinkToken, DEVELOPMENT_DOCUMENT_LINK_SECRET, readDocumentLinkToken } from "./document-link-token";
import type { AcceptanceContext } from "../legal/terms-acceptance.service";
import type {
  BusinessDocumentItemDto,
  CreateBusinessDocumentDto,
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
});

const DEFAULT_DOCUMENT_EMAILS_PER_DAY = 200;

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

type DocumentWithItems = Prisma.BusinessDocumentGetPayload<{ include: { items: true } }>;

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
  ) {}

  // ── merchant ──────────────────────────────────────────────────────────

  async create(merchantId: string, storeId: string, dto: CreateBusinessDocumentDto) {
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
        content: (dto.content ?? []) as unknown as Prisma.InputJsonValue,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        items: { create: totals.items.map((item, position) => ({ position, ...item })) },
        events: { create: [{ type: "created" }] },
      },
    });
    return this.view(await this.load(storeId, created.id));
  }

  async list(merchantId: string, storeId: string, query: ListBusinessDocumentsQueryDto) {
    await this.ownedStore(merchantId, storeId);
    const rows = await this.prisma.businessDocument.findMany({
      where: { storeId, ...(query.kind && { kind: query.kind }), ...(query.status && { status: query.status }) },
      include: { items: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => this.view(row));
  }

  async get(merchantId: string, storeId: string, id: string) {
    await this.ownedStore(merchantId, storeId);
    const doc = await this.prisma.businessDocument.findFirst({
      where: { id, storeId },
      include: {
        items: { orderBy: { position: "asc" } },
        versions: { select: { version: true, sha256: true, sentAt: true, createdAt: true }, orderBy: { version: "asc" } },
        events: { orderBy: { at: "asc" }, take: 200 },
      },
    });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    return {
      ...this.view(doc),
      versions: doc.versions,
      events: doc.events.map(({ id: eventId, type, version, at, data }) => ({ id: eventId, type, version, at, data })),
    };
  }

  async update(merchantId: string, storeId: string, id: string, dto: UpdateBusinessDocumentDto) {
    await this.ownedStore(merchantId, storeId);
    const initial = await this.load(storeId, id);
    if (FINAL.includes(initial.status)) throw new ConflictException("Este documento ya no se puede editar");
    const customer = await this.customerFields(storeId, dto, dto.businessCustomerId === undefined);
    const pricedItems = dto.items ? await this.pricedItems(storeId, dto.items) : null;
    await this.prisma.$transaction(async (tx) => {
      // Totals come from the row this transaction reads, not from the first read.
      const doc = await tx.businessDocument.findFirst({ where: { id, storeId }, include: { items: { orderBy: { position: "asc" } } } });
      if (!doc) throw new NotFoundException("Documento no encontrado");
      if (FINAL.includes(doc.status)) throw new ConflictException("Este documento ya no se puede editar");
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
          ...(dto.content !== undefined && { content: dto.content as unknown as Prisma.InputJsonValue }),
          ...(dto.dueAt !== undefined && { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
          ...(dto.validUntil !== undefined && { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }),
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
        const pdf = await renderBusinessDocumentPdf({ storeName: store.name, numberLabel: sent.snapshot.numberLabel, version: sent.version, sha256: sent.sha256, snapshot: sent.snapshot });
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
  async publicView(token: string, context: AcceptanceContext) {
    const { doc, version, snapshot } = await this.publicVersion(token);
    const store = await this.prisma.store.findUnique({ where: { id: doc.storeId }, select: { name: true, logoUrl: true } });
    const storeView = { name: store?.name ?? "", logoUrl: store?.logoUrl ?? null };
    if (doc.status === S.VOIDED) {
      return { kind: doc.kind, numberLabel: snapshot.numberLabel, title: snapshot.title, status: doc.status, voidedAt: doc.voidedAt, store: storeView };
    }
    const status = (await this.recordView(doc.id, version.version, context)) && doc.status === S.SENT ? S.VIEWED : doc.status;
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
    };
  }

  /** The frozen version as a PDF; a voided one carries only its header and an ANULADO stamp on every page. */
  async publicPdf(token: string) {
    const { doc, version, snapshot } = await this.publicVersion(token);
    const store = await this.prisma.store.findUnique({ where: { id: doc.storeId }, select: { name: true } });
    const voided = doc.status === S.VOIDED;
    const buffer = await renderBusinessDocumentPdf({
      storeName: store?.name ?? "",
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
      select: { id: true, storeId: true, kind: true, status: true, currentVersion: true, voidedAt: true },
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
   * A per-store cap on document emails in the last 24 hours, counted from the
   * `emailed` events, so a compromised or careless account cannot spam from
   * the platform sender. Soft under concurrency: two sends at the edge may both pass.
   */
  private async assertEmailQuota(tx: Prisma.TransactionClient, storeId: string) {
    const limit = this.config.get<number>("app.documentEmailsPerDay") ?? DEFAULT_DOCUMENT_EMAILS_PER_DAY;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sent = await tx.businessDocumentEvent.count({ where: { type: "emailed", at: { gte: since }, document: { storeId } } });
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
    const doc = await this.prisma.businessDocument.findFirst({ where: { id, storeId }, include: { items: { orderBy: { position: "asc" } } } });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    return doc;
  }

  /** A CRM customer fills any customer field the merchant did not type. */
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
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      publicUrl: doc.currentVersion > 0 ? this.publicUrl(doc.id) : null,
    };
  }
}
