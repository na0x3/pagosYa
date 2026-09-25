import { ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessDocumentStatus, MerchantStatus, PaymentIntentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import type { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { paymentCheckoutUrl } from "../operations/operations-helpers";
import { BusinessDocumentsService } from "./business-documents.service";
import { businessDocumentLink, cancelStaleCheckout } from "./cobro-payment";
import { buildDocumentEmail, type DocumentReminderStage } from "./business-document-email";
import { renderBusinessDocumentPdf } from "./business-document-pdf";
import type { DocumentSnapshot } from "./business-document-snapshot";
import type { RemindCobroDto, ShareCobroDto } from "./dto/business-document.dto";
import { DEVELOPMENT_DOCUMENT_LINK_SECRET, readDocumentLinkToken } from "./document-link-token";

const S = BusinessDocumentStatus;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Sent and not closed: the customer still owes it. Overdue stays payable. */
const OPEN: BusinessDocumentStatus[] = [S.SENT, S.VIEWED, S.OVERDUE];

/** Between two email reminders of the same cobro, manual or automatic. */
const REMINDER_COOLDOWN_MS = 6 * HOUR_MS;

/**
 * Automatic reminders (spec §2.7). The due date is the end of that day in Bolivia,
 * so "due" opens at 09:00 La Paz on the due day; "overdue" is 3 days late and
 * closes after 10, so an old backlog is never mailed after a deploy.
 */
const DUE_REMINDER_OPENS_BEFORE_MS = 15 * HOUR_MS;
const DUE_REMINDER_MIN_AGE_MS = DAY_MS;
const OVERDUE_REMINDER_AFTER_MS = 3 * DAY_MS;
const OVERDUE_REMINDER_UNTIL_MS = 10 * DAY_MS;

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

type Suggestion = { businessCustomerId: string | null; name: string; email: string | null; phone: string | null; document: string | null; source: "crm" | "cobro" | "buyer" };

/** A checkout still worth handing back to the customer. */
const REUSABLE_INTENT: PaymentIntentStatus[] = [
  PaymentIntentStatus.REQUIRES_PAYMENT_METHOD,
  PaymentIntentStatus.REQUIRES_CONFIRMATION,
  PaymentIntentStatus.REQUIRES_ACTION,
  PaymentIntentStatus.PROCESSING,
];

/**
 * D1: what turns a business document of kind INVOICE into a cobro the customer
 * pays — the checkout behind the public link, reminders, overdue and the
 * customer picker. Drafting, sending and the link itself stay in
 * BusinessDocumentsService (D0).
 */
@Injectable()
export class CobrosService {
  private readonly logger = new Logger(CobrosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly documents: BusinessDocumentsService,
  ) {}

  // ── public: pay ───────────────────────────────────────────────────────

  /**
   * The checkout for the latest *sent* version's total. One open checkout per
   * version is reused; the document row is locked so two taps on Pagar get the same one.
   */
  async pay(token: string) {
    const notFound = () => new NotFoundException("No encontramos este cobro");
    const id = readDocumentLinkToken(token, this.secret());
    if (!id) throw notFound();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessDocument" WHERE id = ${id} FOR UPDATE`;
      const doc = await tx.businessDocument.findUnique({ where: { id } });
      if (!doc || doc.currentVersion < 1 || doc.kind !== "INVOICE") throw notFound();
      if (doc.status === S.VOIDED) throw new ConflictException("Este cobro fue anulado. Si tienes dudas, escríbele al comercio.");
      if (doc.status === S.PAID) throw new ConflictException("Este cobro ya está pagado. ¡Gracias!");
      if (doc.status === S.EXPIRED) throw new ConflictException("Este cobro venció y ya no se puede pagar. Pídele al comercio uno nuevo.");
      const version = await tx.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version: doc.currentVersion } } });
      if (!version) throw notFound();
      const snapshot = version.content as unknown as DocumentSnapshot;
      if (snapshot.totalAmount <= 0) throw new UnprocessableEntityException("Este cobro no tiene un monto para pagar");

      const existing = doc.paymentIntentId ? await tx.paymentIntent.findUnique({ where: { id: doc.paymentIntentId } }) : null;
      if (existing) {
        if (existing.status === PaymentIntentStatus.SUCCEEDED) throw new ConflictException("Este cobro ya está pagado. ¡Gracias!");
        const sameCharge = businessDocumentLink(existing.metadata)?.version === doc.currentVersion
          && existing.amount === snapshot.totalAmount
          && existing.currency === snapshot.currency;
        if (sameCharge && REUSABLE_INTENT.includes(existing.status)) return this.checkout(existing);
        // A checkout the customer never started (or that failed) is closed; one in progress
        // (a QR on screen) is left to finish, and the paid hook records whichever succeeds.
        // Never waits for the intent's lock (see cancelStaleCheckout for the lock order).
        if (existing.status === PaymentIntentStatus.REQUIRES_PAYMENT_METHOD || existing.status === PaymentIntentStatus.FAILED) {
          await cancelStaleCheckout(tx, existing.id);
        }
      }

      const store = await tx.store.findUnique({ where: { id: doc.storeId }, select: { name: true, status: true } });
      const merchant = await tx.merchant.findUnique({ where: { id: doc.merchantId }, select: { status: true } });
      // The subscriptions rule: real money only once both the merchant and the store are live.
      const livemode = merchant?.status === MerchantStatus.ACTIVE && store?.status === "ACTIVE";
      const intent = await this.paymentIntents.createInTransaction(tx, doc.merchantId, livemode, {
        amount: snapshot.totalAmount,
        currency: snapshot.currency,
        description: `${snapshot.numberLabel} · ${snapshot.title} · ${store?.name ?? ""}`.slice(0, 250),
        // The frozen customer: the checkout prefills it and the SIN factura gets the NIT/CI.
        customerName: snapshot.customer.name ?? undefined,
        customerEmail: snapshot.customer.email ?? undefined,
        customerPhone: snapshot.customer.phone ?? undefined,
        customerDocument: snapshot.customer.document ?? undefined,
        metadata: { storeId: doc.storeId, businessDocument: { documentId: id, version: doc.currentVersion, numberLabel: snapshot.numberLabel } },
      }, "buyer");
      await tx.businessDocument.update({ where: { id }, data: { paymentIntentId: intent.id } });
      await tx.businessDocumentEvent.create({ data: { documentId: id, type: "checkout_started", version: doc.currentVersion, data: { paymentIntentId: intent.id } } });
      return this.checkout(intent);
    });
  }

  // ── merchant: reminders, sharing, customers ───────────────────────────

  /**
   * "Recordar". Email sends the reminder (HTML + PDF) through the store's daily
   * cap, at most once every 6 hours per cobro; WhatsApp only records it, since
   * the dashboard opens wa.me itself.
   */
  async remind(merchantId: string, storeId: string, id: string, dto: RemindCobroDto) {
    const store = await this.ownedStore(merchantId, storeId);
    const doc = await this.openCobro(storeId, id, "Solo puedes recordar un cobro enviado que aún no se pagó");
    if (dto.channel === "whatsapp") {
      await this.prisma.businessDocumentEvent.create({ data: { documentId: id, type: "reminded", version: doc.currentVersion, data: { channel: "whatsapp", automatic: false } } });
      return { emailed: false };
    }
    const snapshot = await this.latestSnapshot(id, doc.currentVersion);
    const to = snapshot.customer.email;
    if (!to) throw new UnprocessableEntityException("Este cliente no tiene correo. Recuérdaselo por WhatsApp o agrega su correo y vuelve a enviar el cobro.");
    const last = await this.prisma.businessDocumentEvent.findFirst({
      where: { documentId: id, type: "reminded", data: { path: ["channel"], equals: "email" }, at: { gte: new Date(Date.now() - REMINDER_COOLDOWN_MS) } },
      orderBy: { at: "desc" },
    });
    if (last) {
      const hours = Math.max(1, Math.ceil((last.at.getTime() + REMINDER_COOLDOWN_MS - Date.now()) / HOUR_MS));
      throw new ConflictException(`Ya le enviaste un recordatorio por correo hace poco. Podrás enviar otro en ${hours} h; mientras tanto, recuérdaselo por WhatsApp.`);
    }
    const event = await this.prisma.$transaction(async (tx) => {
      await this.documents.assertEmailQuota(tx, storeId);
      return tx.businessDocumentEvent.create({ data: { documentId: id, type: "reminded", version: doc.currentVersion, data: { channel: "email", automatic: false, to } } });
    });
    const emailed = await this.deliverReminder({ id, version: doc.currentVersion, snapshot, to, store, stage: "manual", eventId: event.id });
    return { emailed };
  }

  /** The dashboard's WhatsApp and Copiar enlace, for the timeline. */
  async shared(merchantId: string, storeId: string, id: string, dto: ShareCobroDto) {
    await this.ownedStore(merchantId, storeId);
    const doc = await this.prisma.businessDocument.findFirst({ where: { id, storeId }, select: { id: true, currentVersion: true, status: true } });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    if (doc.currentVersion < 1 || doc.status === S.VOIDED) throw new ConflictException("Este documento no tiene un enlace para compartir");
    await this.prisma.businessDocumentEvent.create({ data: { documentId: id, type: "shared", version: doc.currentVersion, data: { channel: dto.channel } } });
    return { shared: true };
  }

  /**
   * Who the merchant is likely charging: the store's CRM first, then customers of
   * earlier cobros, then recent paying buyers — one row per person, at most 12.
   */
  async customerSuggestions(merchantId: string, storeId: string, q?: string): Promise<Suggestion[]> {
    await this.ownedStore(merchantId, storeId);
    const term = q?.trim().slice(0, 80);
    const like = (fields: string[]) => (term ? { OR: fields.map((field) => ({ [field]: { contains: term, mode: "insensitive" as const } })) } : {});
    const [crm, cobros, buyers] = await Promise.all([
      this.prisma.businessCustomer.findMany({
        where: { storeId, ...like(["name", "email", "phone"]) },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      this.prisma.businessDocument.findMany({
        where: { storeId, customerName: { not: null }, ...like(["customerName", "customerEmail", "customerPhone"]) },
        select: { customerName: true, customerEmail: true, customerPhone: true, customerDocument: true, businessCustomerId: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      this.prisma.paymentIntent.findMany({
        where: { merchantId, status: PaymentIntentStatus.SUCCEEDED, customerName: { not: null }, metadata: { path: ["storeId"], equals: storeId }, ...like(["customerName", "customerEmail", "customerPhone"]) },
        select: { customerName: true, customerEmail: true, customerPhone: true, customerDocument: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    const rows: Suggestion[] = [
      ...crm.map((row) => ({ businessCustomerId: row.id, name: row.name, email: row.email, phone: row.phone, document: row.document, source: "crm" as const })),
      ...cobros.map((row) => ({ businessCustomerId: row.businessCustomerId, name: row.customerName!, email: row.customerEmail, phone: row.customerPhone, document: row.customerDocument, source: "cobro" as const })),
      ...buyers.map((row) => ({ businessCustomerId: null, name: row.customerName!, email: row.customerEmail, phone: row.customerPhone, document: row.customerDocument, source: "buyer" as const })),
    ];
    const seen = new Set<string>();
    const unique: Suggestion[] = [];
    for (const row of rows) {
      const keys = [row.email?.trim().toLowerCase(), row.phone?.replace(/\D/g, ""), row.name.trim().toLocaleLowerCase("es-BO")].filter((key): key is string => Boolean(key));
      if (keys.some((key) => seen.has(key))) continue;
      keys.forEach((key) => seen.add(key));
      unique.push({ ...row, email: row.email || null, phone: row.phone || null, document: row.document || null });
      if (unique.length === 12) break;
    }
    return unique;
  }

  // ── worker ────────────────────────────────────────────────────────────

  /** Overdue first, so a reminder three days late finds the cobro already marked. */
  async runMaintenance(now = new Date()) {
    const overdue = await this.markOverdue(now);
    const reminders = await this.sendAutomaticReminders(now);
    return { overdue, reminders };
  }

  private async markOverdue(now: Date) {
    const late = await this.prisma.businessDocument.findMany({
      where: { kind: "INVOICE", status: { in: [S.SENT, S.VIEWED] }, dueAt: { lt: now } },
      select: { id: true, currentVersion: true },
      take: 500,
    });
    let marked = 0;
    for (const doc of late) {
      const { count } = await this.prisma.businessDocument.updateMany({ where: { id: doc.id, status: { in: [S.SENT, S.VIEWED] } }, data: { status: S.OVERDUE } });
      if (!count) continue;
      marked += 1;
      await this.prisma.businessDocumentEvent.createMany({
        data: [{ documentId: doc.id, type: "overdue", version: doc.currentVersion, dedupeKey: `overdue:v${doc.currentVersion}` }],
        skipDuplicates: true,
      });
    }
    return marked;
  }

  private async sendAutomaticReminders(now: Date) {
    const candidates = await this.prisma.businessDocument.findMany({
      where: {
        kind: "INVOICE",
        status: { in: OPEN },
        autoReminders: true,
        customerEmail: { not: null },
        dueAt: { gte: new Date(now.getTime() - OVERDUE_REMINDER_UNTIL_MS), lte: new Date(now.getTime() + DUE_REMINDER_OPENS_BEFORE_MS) },
      },
      select: { id: true, storeId: true, currentVersion: true, dueAt: true, sentAt: true },
      take: 500,
    });
    let sent = 0;
    for (const doc of candidates) {
      const stage = this.reminderStage(doc.dueAt!, doc.sentAt, now);
      if (!stage) continue;
      try {
        if (await this.sendAutomaticReminder(doc, stage)) sent += 1;
      } catch (error) {
        this.logger.warn(`Automatic reminder for ${doc.id} failed: ${(error as Error).message}`);
      }
    }
    return sent;
  }

  private reminderStage(dueAt: Date, sentAt: Date | null, now: Date): Exclude<DocumentReminderStage, "manual"> | null {
    const due = dueAt.getTime();
    const at = now.getTime();
    if (at >= due - DUE_REMINDER_OPENS_BEFORE_MS && at <= due && sentAt && sentAt.getTime() <= at - DUE_REMINDER_MIN_AGE_MS) return "due";
    if (at >= due + OVERDUE_REMINDER_AFTER_MS && at <= due + OVERDUE_REMINDER_UNTIL_MS) return "overdue";
    return null;
  }

  /** Claimed with a dedupeKey before the email leaves, so two API instances never both send it. */
  private async sendAutomaticReminder(doc: { id: string; storeId: string; currentVersion: number }, stage: "due" | "overdue") {
    const snapshot = await this.latestSnapshot(doc.id, doc.currentVersion);
    const to = snapshot.customer.email;
    if (!to) return false;
    const store = await this.prisma.store.findUnique({ where: { id: doc.storeId }, select: { name: true, contactEmail: true, logoUrl: true } });
    if (!store) return false;
    let eventId: string;
    try {
      eventId = await this.prisma.$transaction(async (tx) => {
        await this.documents.assertEmailQuota(tx, doc.storeId);
        const event = await tx.businessDocumentEvent.create({
          data: { documentId: doc.id, type: "reminded", version: doc.currentVersion, dedupeKey: `reminder:${stage}:v${doc.currentVersion}`, data: { channel: "email", automatic: true, stage, to } },
        });
        return event.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return false; // already sent for this version
      if (error instanceof HttpException && error.getStatus() === 429) return false; // over the store's cap: next run
      throw error;
    }
    return this.deliverReminder({ id: doc.id, version: doc.currentVersion, snapshot, to, store, stage, eventId });
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private async deliverReminder(input: {
    id: string;
    version: number;
    snapshot: DocumentSnapshot;
    to: string;
    store: { name: string; contactEmail: string | null; logoUrl: string | null };
    stage: DocumentReminderStage;
    eventId: string;
  }): Promise<boolean> {
    const { snapshot, store } = input;
    try {
      const version = await this.prisma.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: input.id, version: input.version } } });
      const pdf = await renderBusinessDocumentPdf({
        storeName: store.name,
        logo: await this.documents.storeLogo(store.logoUrl),
        numberLabel: snapshot.numberLabel,
        version: input.version,
        sha256: version?.sha256 ?? "",
        snapshot,
      });
      const message = buildDocumentEmail({ storeName: store.name, snapshot, publicUrl: this.documents.publicUrl(input.id), reminder: input.stage });
      await this.email.send({
        to: input.to,
        subject: message.subject,
        body: message.text,
        html: message.html,
        replyTo: store.contactEmail ?? undefined,
        attachments: [{ filename: `${snapshot.numberLabel}.pdf`, contentType: "application/pdf", content: pdf.toString("base64") }],
        idempotencyKey: `business-document/${input.eventId}`,
        failLoudly: true,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Cobro ${input.id} reminder email failed: ${(error as Error).message}`);
      await this.prisma.businessDocumentEvent.create({
        data: { documentId: input.id, type: "email_failed", version: input.version, data: { to: input.to, reminder: input.stage, reason: (error as Error).message.slice(0, 200) } },
      });
      return false;
    }
  }

  private async openCobro(storeId: string, id: string, refusal: string) {
    const doc = await this.prisma.businessDocument.findFirst({ where: { id, storeId } });
    if (!doc) throw new NotFoundException("Documento no encontrado");
    if (doc.kind !== "INVOICE" || doc.currentVersion < 1 || !OPEN.includes(doc.status)) throw new ConflictException(refusal);
    return doc;
  }

  private async latestSnapshot(id: string, version: number) {
    const row = await this.prisma.businessDocumentVersion.findUnique({ where: { documentId_version: { documentId: id, version } } });
    if (!row) throw new NotFoundException("Documento no encontrado");
    return row.content as unknown as DocumentSnapshot;
  }

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, name: true, contactEmail: true, logoUrl: true } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  private checkout(intent: { id: string; clientSecret: string }) {
    return { paymentIntentId: intent.id, clientSecret: intent.clientSecret, checkoutUrl: paymentCheckoutUrl(this.config, intent.clientSecret) };
  }

  private secret() {
    return this.config.get<string>("app.documentLinkSecret") ?? DEVELOPMENT_DOCUMENT_LINK_SECRET;
  }
}
