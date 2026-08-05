import { Injectable, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { MerchantStatus, PaymentLinkStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";

const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  async create(merchantId: string, dto: CreatePaymentLinkDto) {
    // Collisions are astronomically unlikely at 8 chars of a 36-char alphabet, but
    // the unique constraint means a retry is cheap insurance rather than a 500.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.paymentLink.create({
          data: {
            merchantId,
            slug: slugPart(),
            name: dto.name,
            description: dto.description,
            amount: dto.amount,
            currency: dto.currency ?? "BOB",
          },
        });
      } catch (err) {
        const isUniqueSlugClash = (err as { code?: string })?.code === "P2002";
        if (!isUniqueSlugClash || attempt === 4) throw err;
      }
    }
    throw new Error("unreachable");
  }

  async listForMerchant(merchantId: string) {
    return this.prisma.paymentLink.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" } });
  }

  async archive(merchantId: string, id: string) {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, merchantId } });
    if (!link) throw new NotFoundException("Payment link not found");
    return this.prisma.paymentLink.update({ where: { id }, data: { status: PaymentLinkStatus.ARCHIVED } });
  }

  /** Public — no auth, called by the checkout page's landing view before any payment exists. */
  async findActiveBySlugPublic(slug: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { slug },
      include: { merchant: { select: { name: true } } },
    });
    if (!link || link.status !== PaymentLinkStatus.ACTIVE) throw new NotFoundException("Payment link not found");
    return link;
  }

  /** Public — turns a link visit into a real PaymentIntent, the step a merchant backend
   * would normally do server-side. This IS that server-side call, just triggered by the
   * link instead of a merchant's own code. */
  async createCheckoutFromLink(slug: string) {
    const link = await this.findActiveBySlugPublic(slug);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: link.merchantId } });
    const livemode = merchant.status === MerchantStatus.ACTIVE;

    const intent = await this.paymentIntents.create(link.merchantId, livemode, {
      amount: link.amount,
      currency: link.currency,
      description: link.name,
      metadata: { paymentLinkId: link.id },
    });

    return { ...intent, merchantName: merchant.name };
  }
}
