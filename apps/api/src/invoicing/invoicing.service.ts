import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { INVOICING_PROVIDER } from "./tokens";
import { InvoicingProvider } from "./interfaces/invoicing-provider.interface";
import { UpsertInvoicingProfileDto } from "./dto/upsert-invoicing-profile.dto";

@Injectable()
export class InvoicingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVOICING_PROVIDER) private readonly provider: InvoicingProvider,
  ) {}

  /** Registers/updates a merchant's SIN invoicing profile and (re)issues a CUIS for it. */
  async upsertProfile(merchantId: string, dto: UpsertInvoicingProfileDto) {
    const sucursal = dto.sucursal ?? 0;
    const puntoVenta = dto.puntoVenta ?? 0;

    const { cuis } = await this.provider.ensureCuis({
      nit: dto.nit,
      razonSocial: dto.razonSocial,
      sucursal,
      puntoVenta,
    });

    return this.prisma.merchantInvoicingProfile.upsert({
      where: { merchantId },
      create: { merchantId, nit: dto.nit, razonSocial: dto.razonSocial, sucursal, puntoVenta, cuis, cuisIssuedAt: new Date() },
      update: { nit: dto.nit, razonSocial: dto.razonSocial, sucursal, puntoVenta, cuis, cuisIssuedAt: new Date() },
    });
  }

  async getProfile(merchantId: string) {
    const profile = await this.prisma.merchantInvoicingProfile.findUnique({ where: { merchantId } });
    return profile ?? { status: "NOT_CONFIGURED" as const };
  }

  /**
   * Creates a PENDING Invoice for a just-succeeded PaymentIntent, in the same
   * transaction as the payment's state change — transactional outbox, same
   * pattern as WebhookDispatcherService.enqueueEvent. No-op if the merchant
   * hasn't configured an invoicing profile: invoicing is opt-in and must
   * never block the payment flow.
   */
  async enqueueInvoice(
    tx: Prisma.TransactionClient,
    merchantId: string,
    params: {
      paymentIntentId: string;
      amount: number;
      currency: string;
      customerName?: string | null;
      customerDocument?: string | null;
    },
  ): Promise<void> {
    const profile = await tx.merchantInvoicingProfile.findUnique({ where: { merchantId } });
    if (!profile?.cuis) return;

    await tx.invoice.create({
      data: {
        merchantId,
        paymentIntentId: params.paymentIntentId,
        amount: params.amount,
        currency: params.currency,
        customerName: params.customerName || "SIN NOMBRE",
        customerDocument: params.customerDocument || "0",
        nextRetryAt: new Date(),
      },
    });
  }

  async getForPaymentIntent(merchantId: string, paymentIntentId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { merchantId, paymentIntentId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  /** Refreshes the profile's CUFD if missing/expired (SIN's real ones are valid ~24h). Used by InvoiceEmissionWorker. */
  async ensureFreshCufd(profile: { id: string; cuis: string | null; cufd: string | null; cufdExpiresAt: Date | null }): Promise<string> {
    if (!profile.cuis) throw new Error(`Invoicing profile ${profile.id} has no CUIS`);
    if (profile.cufd && profile.cufdExpiresAt && profile.cufdExpiresAt > new Date()) {
      return profile.cufd;
    }

    const { cufd, expiresAt } = await this.provider.requestCufd({ cuis: profile.cuis });
    await this.prisma.merchantInvoicingProfile.update({
      where: { id: profile.id },
      data: { cufd, cufdExpiresAt: expiresAt },
    });
    return cufd;
  }
}
