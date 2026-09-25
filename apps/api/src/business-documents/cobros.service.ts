import { ConflictException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessDocumentStatus, MerchantStatus, PaymentIntentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import type { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { paymentCheckoutUrl } from "../operations/operations-helpers";
import { BusinessDocumentsService } from "./business-documents.service";
import { businessDocumentLink } from "./cobro-payment";
import type { DocumentSnapshot } from "./business-document-snapshot";
import { DEVELOPMENT_DOCUMENT_LINK_SECRET, readDocumentLinkToken } from "./document-link-token";

const S = BusinessDocumentStatus;

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
        if (existing.status === PaymentIntentStatus.REQUIRES_PAYMENT_METHOD || existing.status === PaymentIntentStatus.FAILED) {
          await tx.paymentIntent.update({ where: { id: existing.id }, data: { status: PaymentIntentStatus.CANCELED } });
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

  // ── helpers ───────────────────────────────────────────────────────────

  private checkout(intent: { id: string; clientSecret: string }) {
    return { paymentIntentId: intent.id, clientSecret: intent.clientSecret, checkoutUrl: paymentCheckoutUrl(this.config, intent.clientSecret) };
  }

  private secret() {
    return this.config.get<string>("app.documentLinkSecret") ?? DEVELOPMENT_DOCUMENT_LINK_SECRET;
  }
}
