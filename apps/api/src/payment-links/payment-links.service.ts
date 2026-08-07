import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { MerchantStatus, PaymentLinkStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";
import { UpdatePaymentLinkDto } from "./dto/update-payment-link.dto";
import { CartCheckoutDto } from "./dto/cart-checkout.dto";

const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_DESCRIPTION_LENGTH = 480;

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
            imageUrl: dto.imageUrl,
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

  async update(merchantId: string, id: string, dto: UpdatePaymentLinkDto) {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, merchantId } });
    if (!link) throw new NotFoundException("Payment link not found");
    // Explicit-field spread, not `{...dto}` — an edit call that omits a field (e.g. no
    // new photo) must leave it untouched, not clobber it to undefined.
    return this.prisma.paymentLink.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
      },
    });
  }

  /** Public — no auth, called by the checkout page's landing view before any payment exists. */
  async findActiveBySlugPublic(slug: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { slug },
      include: { merchant: { select: { name: true, logoUrl: true, backgroundColor: true } } },
    });
    if (!link || link.status !== PaymentLinkStatus.ACTIVE) throw new NotFoundException("Payment link not found");
    return link;
  }

  /**
   * Public — any of a merchant's link slugs opens their whole catalog, not just that one
   * item, so a customer buying several things checks out once instead of generating a
   * separate QR per item. There is no separate "store slug" concept — reusing link slugs
   * as the entry point keeps this to one link type instead of two.
   */
  async getStoreBySlug(slug: string) {
    const link = await this.findActiveBySlugPublic(slug);
    const items = await this.prisma.paymentLink.findMany({
      where: { merchantId: link.merchantId, status: PaymentLinkStatus.ACTIVE },
      orderBy: { createdAt: "asc" },
    });
    return {
      merchantId: link.merchantId,
      merchantName: link.merchant.name,
      logoUrl: link.merchant.logoUrl,
      backgroundColor: link.merchant.backgroundColor,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        amount: item.amount,
        currency: item.currency,
      })),
    };
  }

  /** Public — turns a cart (one or more items, from the same merchant as `slug`) into a
   * single PaymentIntent, i.e. one payment/one QR for the whole cart. */
  async createCartCheckout(slug: string, dto: CartCheckoutDto) {
    const link = await this.findActiveBySlugPublic(slug);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: link.merchantId } });

    const quantityByLinkId = new Map<string, number>();
    for (const item of dto.items) {
      quantityByLinkId.set(item.paymentLinkId, (quantityByLinkId.get(item.paymentLinkId) ?? 0) + item.quantity);
    }

    const links = await this.prisma.paymentLink.findMany({
      where: { id: { in: [...quantityByLinkId.keys()] }, merchantId: link.merchantId, status: PaymentLinkStatus.ACTIVE },
    });
    if (links.length !== quantityByLinkId.size) {
      throw new BadRequestException("Uno o más productos del carrito ya no están disponibles");
    }

    const currency = links[0].currency;
    if (links.some((l) => l.currency !== currency)) {
      throw new BadRequestException("Todos los productos del carrito deben usar la misma moneda");
    }

    let amount = 0;
    const cartLines: { paymentLinkId: string; name: string; quantity: number; unitAmount: number }[] = [];
    for (const l of links) {
      const quantity = quantityByLinkId.get(l.id)!;
      amount += l.amount * quantity;
      cartLines.push({ paymentLinkId: l.id, name: l.name, quantity, unitAmount: l.amount });
    }

    let description = cartLines.map((line) => `${line.name} x${line.quantity}`).join(", ");
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…";
    }

    const livemode = merchant.status === MerchantStatus.ACTIVE;
    const intent = await this.paymentIntents.create(link.merchantId, livemode, {
      amount,
      currency,
      description,
      metadata: { cart: cartLines },
    });

    return { ...intent, merchantName: merchant.name, cartDescription: description };
  }
}
