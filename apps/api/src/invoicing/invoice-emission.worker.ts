import { Inject, Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InvoiceStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InvoicingService } from "./invoicing.service";
import { INVOICING_PROVIDER } from "./tokens";
import { InvoicingProvider } from "./interfaces/invoicing-provider.interface";

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 5_000;
const PROCESSING_LEASE_MS = 5 * 60_000;

/** Polls due Invoice rows and emits them via SIN (or the mock). Mirrors WebhookDeliveryWorker's claim/backoff shape. */
@Injectable()
export class InvoiceEmissionWorker {
  private readonly logger = new Logger(InvoiceEmissionWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicing: InvoicingService,
    @Inject(INVOICING_PROVIDER) private readonly provider: InvoicingProvider,
  ) {}

  @Interval(3_000)
  async emitDueInvoices(): Promise<void> {
    const candidates = await this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      include: { merchant: { include: { invoicingProfile: true } } },
      take: 25,
    });

    for (const invoice of candidates) {
      // Optimistic-concurrency claim, same reasoning as WebhookDeliveryWorker:
      // guards against two overlapping ticks emitting the same invoice twice.
      const claim = await this.prisma.invoice.updateMany({
        where: { id: invoice.id, status: invoice.status, attempts: invoice.attempts },
        data: { attempts: { increment: 1 }, nextRetryAt: new Date(Date.now() + PROCESSING_LEASE_MS) },
      });
      if (claim.count === 0) continue;

      await this.emitOne({ ...invoice, attempts: invoice.attempts + 1 });
    }
  }

  private async emitOne(invoice: {
    id: string;
    amount: number;
    currency: string;
    customerName: string;
    customerDocument: string;
    attempts: number;
    merchant: { invoicingProfile: { id: string; nit: string; cuis: string | null; sucursal: number; puntoVenta: number; cufd: string | null; cufdExpiresAt: Date | null } | null };
  }): Promise<void> {
    const profile = invoice.merchant.invoicingProfile;
    if (!profile?.cuis) {
      // Profile was removed/never finished setup after this invoice was
      // enqueued — nothing to do until it's configured again.
      await this.scheduleRetry(invoice.id, invoice.attempts, "invoicing_profile_not_configured");
      return;
    }

    try {
      const cufd = await this.invoicing.ensureFreshCufd(profile);
      const result = await this.provider.emitInvoice({
        nit: profile.nit,
        cuis: profile.cuis,
        cufd,
        sucursal: profile.sucursal,
        puntoVenta: profile.puntoVenta,
        amount: invoice.amount,
        currency: invoice.currency,
        customerName: invoice.customerName,
        customerDocument: invoice.customerDocument,
        idempotencyKey: `invoice_${invoice.id}`,
      });

      if (result.status === "emitted") {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.EMITTED, cuf: result.cuf, cufd, emittedAt: new Date(), nextRetryAt: null },
        });
        return;
      }

      await this.scheduleRetry(invoice.id, invoice.attempts, result.failureReason ?? "unknown_error");
    } catch (error) {
      await this.scheduleRetry(invoice.id, invoice.attempts, (error as Error).message);
    }
  }

  /**
   * Logs here, not at each call site, so severity always reflects whether
   * this failure is still retrying (warn — expected, self-healing) or has
   * exhausted every attempt (error — nobody is coming back to this invoice,
   * worth a human's attention; also visible via GET /internal/delivery_failures).
   */
  private async scheduleRetry(invoiceId: string, attempts: number, failureReason: string): Promise<void> {
    const exhausted = attempts >= MAX_ATTEMPTS;
    const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
    if (exhausted) {
      this.logger.error(`Invoice ${invoiceId} exhausted all ${MAX_ATTEMPTS} attempts, giving up: ${failureReason}`);
    } else {
      this.logger.warn(`Invoice ${invoiceId} emission attempt ${attempts}/${MAX_ATTEMPTS} failed, retrying: ${failureReason}`);
    }
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.FAILED,
        failureReason,
        nextRetryAt: exhausted ? null : new Date(Date.now() + backoffMs),
      },
    });
  }
}
