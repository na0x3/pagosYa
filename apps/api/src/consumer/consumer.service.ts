import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConsumerAffiliationStatus, DebtRecordStatus, OrderFulfillmentStatus, Prisma, StoreStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { normalizeCustomerDocument, DebtCollectionsService } from "../debt-collections/debt-collections.service";
import { readOrderTrackingToken } from "./order-tracking-token";

const secretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 32);
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

const ORDER_TRANSITIONS: Partial<Record<OrderFulfillmentStatus, OrderFulfillmentStatus[]>> = {
  PAID: [OrderFulfillmentStatus.PREPARING, OrderFulfillmentStatus.READY_FOR_PICKUP, OrderFulfillmentStatus.SHIPPED, OrderFulfillmentStatus.CANCELED, OrderFulfillmentStatus.REFUNDED],
  PREPARING: [OrderFulfillmentStatus.READY_FOR_PICKUP, OrderFulfillmentStatus.SHIPPED, OrderFulfillmentStatus.CANCELED],
  READY_FOR_PICKUP: [OrderFulfillmentStatus.DELIVERED, OrderFulfillmentStatus.CANCELED],
  SHIPPED: [OrderFulfillmentStatus.DELIVERED, OrderFulfillmentStatus.CANCELED],
  DELIVERED: [OrderFulfillmentStatus.REFUNDED],
};

@Injectable()
export class ConsumerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly debts: DebtCollectionsService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  private trackedOrderId(token: string): string {
    const secret = this.config.get<string>("app.orderTrackingSecret") ?? "";
    const orderId = secret ? readOrderTrackingToken(token, secret) : null;
    if (!orderId) throw new NotFoundException("No encontramos ese seguimiento de pedido");
    return orderId;
  }

  async trackOrder(token: string) {
    const orderId = this.trackedOrderId(token);
    const order = await this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: {
        paymentIntent: { select: { status: true } },
        statusEvents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new NotFoundException("No encontramos ese seguimiento de pedido");
    const [store, delivery] = await Promise.all([
      this.prisma.store.findUnique({
        where: { id: order.storeId },
        select: { slug: true, logoUrl: true, contactPhone: true, contactEmail: true },
      }),
      this.prisma.deliveryAssignment.findUnique({
        where: { orderId: order.id },
        select: { status: true, estimatedAt: true, deliveredAt: true },
      }),
    ]);
    return {
      reference: order.id.slice(-8).toUpperCase(),
      storeName: order.storeName,
      items: order.items,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentIntent.status,
      status: order.status,
      fulfillment: order.fulfillmentLocationName ? {
        locationName: order.fulfillmentLocationName,
        method: order.fulfillmentMethod,
        readyAt: order.fulfillmentReadyAt,
      } : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      statusEvents: order.statusEvents.map((event) => ({ status: event.status, createdAt: event.createdAt })),
      store,
      delivery,
    };
  }

  async claimTrackedOrder(userId: string, token: string) {
    const orderId = this.trackedOrderId(token);
    const [user, order] = await Promise.all([
      this.prisma.consumerUser.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.storeOrder.findUnique({
        where: { id: orderId },
        include: { paymentIntent: { select: { customerEmail: true } } },
      }),
    ]);
    if (!order) throw new NotFoundException("No encontramos ese seguimiento de pedido");
    const orderEmail = order.paymentIntent.customerEmail?.trim().toLowerCase();
    if (!orderEmail || orderEmail !== user.email.trim().toLowerCase()) {
      throw new ForbiddenException("Ingresa con el mismo correo que usaste al pagar para guardar este pedido");
    }
    await this.prisma.$transaction([
      this.prisma.storeOrder.update({ where: { id: order.id }, data: { consumerUserId: user.id } }),
      this.prisma.paymentIntent.update({ where: { id: order.paymentIntentId }, data: { consumerUserId: user.id } }),
    ]);
    return { claimed: true };
  }

  async signup(nameInput: string, emailInput: string, carnetInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const carnet = normalizeCustomerDocument(carnetInput);
    if (carnet.length < 4) throw new BadRequestException("Escribe un carnet válido");
    const existing = await this.prisma.consumerUser.findFirst({ where: { OR: [{ email }, { carnet }] } });
    const canVerify = !existing || (existing.email === email && existing.carnet === carnet && !existing.emailVerifiedAt);
    if (canVerify) {
      const user = existing ?? await this.prisma.consumerUser.create({
        data: { name: nameInput.trim(), email, carnet, hashedPassword: await argon2.hash(password) },
      });
      await this.prisma.consumerVerificationToken.deleteMany({ where: { consumerUserId: user.id } });
      const token = secretPart();
      await this.prisma.consumerVerificationToken.create({
        data: { consumerUserId: user.id, hashedToken: await argon2.hash(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
      });
      const origin = this.config.get<string>("app.consumerDashboardOrigin") ?? "http://localhost:4324";
      try {
        await this.email.send({
          to: email,
          subject: "Confirma tu cuenta Mi pagosYa",
          body: `Confirma tu correo para activar Mi pagosYa:\n${origin}/?verify=${token}\n\nEl enlace expira en 24 horas.`,
          failLoudly: true,
        });
      } catch {
        throw new ServiceUnavailableException("No pudimos enviar el correo de verificación. Revisa la dirección e inténtalo nuevamente.");
      }
    }
    return { message: "Si los datos pueden registrarse, revisa tu correo para confirmar la cuenta." };
  }

  async verifyEmail(token: string) {
    const candidates = await this.prisma.consumerVerificationToken.findMany({ where: { expiresAt: { gt: new Date() } } });
    for (const candidate of candidates) {
      if (!(await argon2.verify(candidate.hashedToken, token))) continue;
      const user = await this.prisma.consumerUser.update({
        where: { id: candidate.consumerUserId },
        data: { emailVerifiedAt: new Date() },
      });
      await this.prisma.consumerVerificationToken.deleteMany({ where: { consumerUserId: user.id } });
      const intents = await this.prisma.paymentIntent.findMany({
        where: { consumerUserId: null, customerEmail: { equals: user.email, mode: Prisma.QueryMode.insensitive } },
        select: { id: true },
      });
      const ids = intents.map((intent) => intent.id);
      if (ids.length) {
        await this.prisma.$transaction([
          this.prisma.paymentIntent.updateMany({ where: { id: { in: ids } }, data: { consumerUserId: user.id } }),
          this.prisma.storeOrder.updateMany({ where: { paymentIntentId: { in: ids } }, data: { consumerUserId: user.id } }),
        ]);
      }
      return { verified: true };
    }
    throw new UnauthorizedException("El enlace de confirmación venció o no es válido");
  }

  async dashboard(userId: string) {
    const user = await this.prisma.consumerUser.findUniqueOrThrow({ where: { id: userId } });
    const [orders, payments, affiliations, offers] = await Promise.all([
      this.prisma.storeOrder.findMany({
        where: { consumerUserId: user.id },
        include: { paymentIntent: { select: { status: true } }, statusEvents: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.paymentIntent.findMany({
        where: { consumerUserId: user.id },
        include: { merchant: { select: { name: true } }, invoice: { select: { status: true, cuf: true, emittedAt: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.affiliations(user.id),
      this.affiliationOffers(user.id),
    ]);
    return {
      profile: { id: user.id, name: user.name, email: user.email, carnetMasked: `•••• ${user.carnet.slice(-4)}` },
      summary: {
        purchases: orders.length,
        activeInstitutions: affiliations.length,
        pendingObligations: affiliations.reduce((sum, item) => sum + item.pendingCount, 0),
        pendingAmount: affiliations.reduce((sum, item) => sum + item.pendingAmount, 0),
      },
      orders,
      payments: payments.map((payment) => ({
        id: payment.id,
        merchantName: payment.merchant.name,
        description: payment.description,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        invoice: payment.invoice,
        kind: (payment.metadata as { debt?: unknown } | null)?.debt ? "OBLIGATION" : "PURCHASE",
      })),
      affiliations,
      affiliationOffers: offers,
    };
  }

  async affiliationOffers(userId: string) {
    const user = await this.prisma.consumerUser.findUniqueOrThrow({ where: { id: userId } });
    const accepted = await this.prisma.consumerInstitutionAffiliation.findMany({
      where: { consumerUserId: user.id, status: ConsumerAffiliationStatus.ACTIVE },
      select: { storeId: true },
    });
    return this.prisma.store.findMany({
      where: {
        id: { notIn: accepted.map((item) => item.storeId) },
        status: StoreStatus.ACTIVE,
        debtCollectionLinks: {
          some: {
            status: "ACTIVE",
            debts: { some: { normalizedDocument: user.carnet, customerEmail: user.email } },
          },
        },
      },
      select: { id: true, name: true, logoUrl: true, tagline: true },
      orderBy: { name: "asc" },
    });
  }

  async acceptAffiliation(userId: string, storeId: string) {
    const user = await this.prisma.consumerUser.findUniqueOrThrow({ where: { id: userId } });
    const match = await this.prisma.debtRecord.findFirst({
      where: {
        normalizedDocument: user.carnet,
        customerEmail: user.email,
        debtCollectionLink: { storeId, status: "ACTIVE", store: { status: StoreStatus.ACTIVE } },
      },
      select: { id: true },
    });
    if (!match) throw new ForbiddenException("La institución no tiene una invitación verificada para esta cuenta");
    return this.prisma.consumerInstitutionAffiliation.upsert({
      where: { consumerUserId_storeId: { consumerUserId: user.id, storeId } },
      create: { consumerUserId: user.id, storeId },
      update: { status: ConsumerAffiliationStatus.ACTIVE, acceptedAt: new Date(), revokedAt: null },
      include: { store: { select: { name: true, logoUrl: true } } },
    });
  }

  async affiliations(userId: string) {
    const user = await this.prisma.consumerUser.findUniqueOrThrow({ where: { id: userId } });
    const rows = await this.prisma.consumerInstitutionAffiliation.findMany({
      where: { consumerUserId: user.id, status: ConsumerAffiliationStatus.ACTIVE },
      include: { store: { select: { id: true, name: true, logoUrl: true, tagline: true } } },
      orderBy: { acceptedAt: "desc" },
    });
    return Promise.all(rows.map(async (row) => {
      const debts = await this.prisma.debtRecord.findMany({
        where: { normalizedDocument: user.carnet, debtCollectionLink: { storeId: row.storeId, status: "ACTIVE" } },
        select: { amount: true, status: true, customerName: true },
      });
      const pending = debts.filter((debt) => debt.status === DebtRecordStatus.PENDING);
      return {
        id: row.id,
        store: row.store,
        acceptedAt: row.acceptedAt,
        pendingCount: pending.length,
        pendingAmount: pending.reduce((sum, debt) => sum + debt.amount, 0),
        people: [...new Set(debts.map((debt) => debt.customerName))],
      };
    }));
  }

  async obligations(userId: string, affiliationId: string) {
    const { user, affiliation } = await this.activeAffiliation(userId, affiliationId);
    const debts = await this.prisma.debtRecord.findMany({
      where: { normalizedDocument: user.carnet, debtCollectionLink: { storeId: affiliation.storeId, status: "ACTIVE" } },
      include: { debtCollectionLink: { select: { name: true } } },
      orderBy: [{ customerName: "asc" }, { createdAt: "desc" }],
    });
    return {
      institution: affiliation.store,
      obligations: debts.map((debt) => ({
        id: debt.id,
        personName: debt.customerName,
        concept: debt.description || debt.debtCollectionLink.name,
        collectionName: debt.debtCollectionLink.name,
        reference: debt.reference,
        amount: debt.amount,
        currency: debt.currency,
        status: debt.status,
        paidAt: debt.paidAt,
      })),
    };
  }

  async checkoutObligations(userId: string, affiliationId: string, debtRecordIds: string[]) {
    const { user, affiliation } = await this.activeAffiliation(userId, affiliationId);
    const slug = affiliation.store.debtPortalSlug
      ?? (await this.prisma.debtCollectionLink.findFirst({ where: { storeId: affiliation.storeId, status: "ACTIVE" }, select: { slug: true } }))?.slug;
    if (!slug) throw new NotFoundException("La institución no tiene un portal de cobro activo");
    return this.debts.checkout(slug, user.carnet, debtRecordIds, user.id);
  }

  async revokeAffiliation(userId: string, affiliationId: string) {
    const affiliation = await this.prisma.consumerInstitutionAffiliation.findFirst({ where: { id: affiliationId, consumerUserId: userId } });
    if (!affiliation) throw new NotFoundException("Afiliación no encontrada");
    return this.prisma.consumerInstitutionAffiliation.update({
      where: { id: affiliation.id },
      data: { status: ConsumerAffiliationStatus.REVOKED, revokedAt: new Date() },
    });
  }

  async updateOrderStatus(merchantId: string, orderId: string, status: OrderFulfillmentStatus) {
    const order = await this.prisma.storeOrder.findFirst({ where: { id: orderId, merchantId } });
    if (!order) throw new NotFoundException("Pedido no encontrado");
    if (!(ORDER_TRANSITIONS[order.status] ?? []).includes(status)) {
      throw new BadRequestException(`No se puede cambiar un pedido de ${order.status} a ${status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.storeOrder.updateMany({ where: { id: order.id, status: order.status }, data: { status } });
      if (changed.count !== 1) throw new BadRequestException("El pedido cambió mientras lo actualizabas; vuelve a cargarlo");
      await tx.storeOrderStatusEvent.create({ data: { orderId: order.id, status } });
      return tx.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
    });
  }

  private async activeAffiliation(userId: string, affiliationId: string) {
    const [user, affiliation] = await Promise.all([
      this.prisma.consumerUser.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.consumerInstitutionAffiliation.findFirst({
        where: { id: affiliationId, consumerUserId: userId, status: ConsumerAffiliationStatus.ACTIVE },
        include: { store: true },
      }),
    ]);
    if (!affiliation) throw new NotFoundException("Afiliación no encontrada");
    return { user, affiliation };
  }
}
