import {
  ConflictException,
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
import { createDocumentLinkToken, DEVELOPMENT_DOCUMENT_LINK_SECRET } from "./document-link-token";
import type {
  BusinessDocumentItemDto,
  CreateBusinessDocumentDto,
  ListBusinessDocumentsQueryDto,
  SendBusinessDocumentDto,
  UpdateBusinessDocumentDto,
} from "./dto/business-document.dto";

const S = BusinessDocumentStatus;

/** Accepted, signed, paid, declined, expired or voided documents are records, not drafts. */
const FINAL: BusinessDocumentStatus[] = [S.ACCEPTED, S.SIGNED, S.PAID, S.DECLINED, S.EXPIRED, S.VOIDED];

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
    const doc = await this.load(storeId, id);
    if (FINAL.includes(doc.status)) throw new ConflictException("Este documento ya no se puede editar");
    const customer = await this.customerFields(storeId, dto, dto.businessCustomerId === undefined);
    const items = dto.items ? await this.pricedItems(storeId, dto.items) : doc.items;
    const totals = computeTotals(items, dto.discountAmount ?? doc.discountAmount);
    await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
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
      await tx.businessDocument.update({
        where: { id },
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
    const initial = await this.load(storeId, id);
    if (FINAL.includes(initial.status)) throw new ConflictException("Este documento ya no se puede enviar");
    const placeholders = findPlaceholders(buildSnapshot(initial));
    if (placeholders.length) throw new UnprocessableEntityException(`Completa los datos pendientes antes de enviar: ${placeholders.join(", ")}`);
    if (initial.kind === "INVOICE" && initial.totalAmount <= 0) throw new UnprocessableEntityException("Agrega al menos un ítem con monto para enviar el cobro");

    let sent: { version: number; sha256: string; snapshot: DocumentSnapshot; eventId: string } | undefined;
    for (let attempt = 0; !sent; attempt += 1) {
      try {
        sent = await this.prisma.$transaction(async (tx) => {
          // Re-read inside the attempt: a concurrent send may have numbered or versioned it.
          const doc = await tx.businessDocument.findFirst({ where: { id, storeId }, include: { items: { orderBy: { position: "asc" } } } });
          if (!doc) throw new NotFoundException("Documento no encontrado");
          const number = doc.number ?? ((await tx.businessDocument.aggregate({ where: { storeId, kind: doc.kind }, _max: { number: true } }))._max.number ?? 0) + 1;
          const snapshot = buildSnapshot({ ...doc, number });
          const sha256 = snapshotSha256(snapshot);
          const now = new Date();
          const latest = doc.currentVersion
            ? await tx.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version: doc.currentVersion } } })
            : null;
          if (latest && latest.sha256 === sha256) {
            await tx.businessDocument.update({ where: { id }, data: { sentAt: now } });
            const event = await tx.businessDocumentEvent.create({ data: { documentId: id, type: "sent", version: doc.currentVersion, data: { resend: true } } });
            return { version: doc.currentVersion, sha256, snapshot, eventId: event.id };
          }
          const version = doc.currentVersion + 1;
          // The number is written first, so a collision fails before anything else is written.
          await tx.businessDocument.update({ where: { id }, data: { number, status: S.SENT, currentVersion: version, sentAt: now } });
          await tx.businessDocumentVersion.create({
            data: { documentId: id, version, sha256, content: snapshot as unknown as Prisma.InputJsonValue, sentAt: now },
          });
          const event = await tx.businessDocumentEvent.create({ data: { documentId: id, type: "sent", version, data: { sha256 } } });
          return { version, sha256, snapshot, eventId: event.id };
        });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 4) continue;
        if (isUniqueViolation(error)) throw new ConflictException("Otro envío está en curso. Intenta nuevamente.");
        throw error;
      }
    }

    const publicUrl = this.publicUrl(id);
    let emailed = false;
    const to = initial.customerEmail;
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

  // ── helpers ───────────────────────────────────────────────────────────

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
