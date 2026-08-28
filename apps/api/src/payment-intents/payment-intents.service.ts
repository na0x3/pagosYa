import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { customAlphabet } from "nanoid";
import { DebtRecordStatus, OrderFulfillmentStatus, PaymentIntentStatus, PaymentLinkStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RailRegistry } from "../rails/rail-registry.service";
import { PaymentMethodsService } from "../payment-methods/payment-methods.service";
import { LedgerService } from "../ledger/ledger.service";
import { WebhookDispatcherService } from "../webhooks/webhook-dispatcher.service";
import { InvoicingService } from "../invoicing/invoicing.service";
import { RailResult } from "../rails/interfaces/payment-rail-adapter.interface";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { CreatePaymentIntentDto } from "./dto/create-payment-intent.dto";
import { ConfirmPaymentIntentDto } from "./dto/confirm-payment-intent.dto";
import { PaymentIntentEvent, transition } from "./payment-intent.state-machine";
import { createOrderTrackingToken } from "../consumer/order-tracking-token";
import { completeEventReservationPayment } from "../events/events-payment.bridge";

const idPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);
const secretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 24);
const DEVELOPMENT_ORDER_TRACKING_SECRET = "development-only-order-tracking-secret-change-me";

function formatAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

type ProductVariant = { id: string; name: string; amount: number; stock?: number | null };
type CartInventoryLine = {
  paymentLinkId: string;
  variantId?: string;
  quantity: number;
  name: string;
  variantName?: string;
  extras?: ProductExtra[];
  unitAmount: number;
};
type ProductExtra = {
  id: string;
  name: string;
  amount: number;
  required: boolean;
  groupName?: string;
  freeAllowance?: number;
  inventoryKey?: string;
  inventoryName?: string;
  stock?: number;
};

function readProductVariants(value: Prisma.JsonValue): ProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ProductVariant =>
      !!entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).id === "string" &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      Number.isInteger((entry as Record<string, unknown>).amount) &&
      ((entry as Record<string, unknown>).amount as number) >= 0 &&
      (!("stock" in entry) ||
        (entry as Record<string, unknown>).stock === null ||
        (Number.isInteger((entry as Record<string, unknown>).stock) &&
          ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
}

function readProductExtras(value: Prisma.JsonValue): ProductExtra[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ProductExtra =>
    !!entry && typeof entry === "object" && !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>).id === "string" &&
    typeof (entry as Record<string, unknown>).name === "string" &&
    Number.isInteger((entry as Record<string, unknown>).amount) &&
    ((entry as Record<string, unknown>).amount as number) >= 0 &&
    typeof (entry as Record<string, unknown>).required === "boolean" &&
    (!("stock" in entry) || (Number.isInteger((entry as Record<string, unknown>).stock) && ((entry as Record<string, unknown>).stock as number) >= 0))
  );
}

function readLocationStocks(value: Prisma.JsonValue): Record<string, number | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, stock]) => stock === null || (Number.isInteger(stock) && (stock as number) >= 0))) as Record<string, number | null>;
}

@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly railRegistry: RailRegistry,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly ledger: LedgerService,
    private readonly webhooks: WebhookDispatcherService,
    private readonly invoicing: InvoicingService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async create(merchantId: string, livemode: boolean, dto: CreatePaymentIntentDto) {
    return this.createInTransaction(this.prisma, merchantId, livemode, dto);
  }

  async createInTransaction(
    tx: Pick<Prisma.TransactionClient, "paymentIntent">,
    merchantId: string,
    livemode: boolean,
    dto: CreatePaymentIntentDto,
  ) {
    const id = `pi_${idPart()}`;
    const clientSecret = `${id}_secret_${secretPart()}`;

    return tx.paymentIntent.create({
      data: {
        id,
        merchantId,
        amount: dto.amount,
        currency: dto.currency ?? "BOB",
        description: dto.description,
        customerName: dto.customerName?.trim() || undefined,
        customerDocument: dto.customerDocument?.trim() || undefined,
        customerEmail: dto.customerEmail?.trim().toLowerCase() || undefined,
        customerPhone: dto.customerPhone?.trim() || undefined,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        clientSecret,
        livemode,
      },
    });
  }

  async findByIdForMerchant(merchantId: string, id: string) {
    const intent = await this.prisma.paymentIntent.findFirst({ where: { id, merchantId } });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    return intent;
  }

  async checkoutRecipient(intent: {
    customerName: string | null;
    customerDocument: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    metadata: Prisma.JsonValue;
  }) {
    const metadata = intent.metadata && typeof intent.metadata === "object" && !Array.isArray(intent.metadata)
      ? intent.metadata as Prisma.JsonObject
      : {};
    const debt = metadata.debt && typeof metadata.debt === "object" && !Array.isArray(metadata.debt)
      ? metadata.debt as Prisma.JsonObject
      : null;
    const subscription = metadata.subscription && typeof metadata.subscription === "object" && !Array.isArray(metadata.subscription)
      ? metadata.subscription as Prisma.JsonObject
      : null;
    const subscriptionId = typeof subscription?.subscriptionId === "string" ? subscription.subscriptionId : null;
    const storedSubscription = subscriptionId
      ? await this.prisma.customerSubscription.findUnique({
          where: { id: subscriptionId },
          select: { customerName: true, customerEmail: true, customerPhone: true },
        })
      : null;
    const value = {
      name: intent.customerName || (typeof debt?.customerName === "string" ? debt.customerName : null) || storedSubscription?.customerName || null,
      document: intent.customerDocument || (typeof debt?.customerDocument === "string" ? debt.customerDocument : null) || null,
      email: intent.customerEmail || (typeof debt?.customerEmail === "string" ? debt.customerEmail : null) || storedSubscription?.customerEmail || null,
      phone: intent.customerPhone || (typeof debt?.customerPhone === "string" ? debt.customerPhone : null) || storedSubscription?.customerPhone || null,
    };
    return Object.values(value).some(Boolean) ? value : null;
  }

  async listForMerchant(merchantId: string, storeId?: string) {
    return this.prisma.paymentIntent.findMany({
      where: {
        merchantId,
        ...(storeId ? { metadata: { path: ["storeId"], equals: storeId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async findByClientSecret(clientSecret: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { clientSecret },
      include: { merchant: { select: { name: true } } },
    });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    return intent;
  }

  async trackingTokenForPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const order = await this.prisma.storeOrder.findUnique({ where: { paymentIntentId }, select: { id: true } });
    if (!order) return null;
    const secret = this.config?.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET;
    return createOrderTrackingToken(order.id, secret);
  }

  async cancel(merchantId: string, id: string) {
    await this.findByIdForMerchant(merchantId, id);
    return this.cancelById(id);
  }

  /**
   * Shared by the merchant-facing cancel() above and the customer-facing
   * checkout cancel — the latter is reached via ClientSecretGuard, which
   * already scopes the caller to exactly this PaymentIntent, so there's no
   * separate ownership check to do here.
   */
  async cancelById(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: PaymentIntentStatus; metadata: Prisma.JsonValue }[]>`
        SELECT status, metadata FROM "PaymentIntent" WHERE id = ${id} FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException("PaymentIntent not found");
      const nextStatus = transition(current.status, PaymentIntentEvent.CANCEL);
      const hadReservation = (current.metadata as { locationStockReserved?: boolean } | null)?.locationStockReserved === true;
      if (hadReservation) await this.releaseLocationStockForCart(tx, current.metadata);
      const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata as Prisma.JsonObject
        : {};
      const updated = await tx.paymentIntent.update({
        where: { id },
        data: { status: nextStatus, ...(hadReservation ? { metadata: { ...metadata, locationStockReserved: false } as Prisma.InputJsonValue } : {}) },
      });
      const order = await tx.storeOrder.findUnique({ where: { paymentIntentId: id }, select: { id: true, status: true } });
      if (order?.status === OrderFulfillmentStatus.AWAITING_PAYMENT) {
        await tx.storeOrder.update({
          where: { id: order.id },
          data: { status: OrderFulfillmentStatus.CANCELED, statusEvents: { create: { status: OrderFulfillmentStatus.CANCELED } } },
        });
      }
      await tx.appointment.updateMany({
        where: { depositPaymentIntentId: id, status: "PENDING" },
        data: { status: "CANCELED", holdExpiresAt: null },
      });
      return updated;
    });
  }

  /**
   * CONFIRM -> lock the row, validate the transition, resolve+call the rail
   * adapter outside the lock (it may take real network time even for mocks),
   * then finalize the outcome transactionally (status + ledger + webhook
   * outbox all commit together).
   */
  async confirm(paymentIntentId: string, dto: ConfirmPaymentIntentDto) {
    const { intentId, railId, amount, currency, merchantId } = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; status: PaymentIntentStatus; confirmationAttempts: number; merchantId: string; consumerUserId: string | null; metadata: Prisma.JsonValue }[]
      >`
        SELECT id, status, "confirmationAttempts", "merchantId", "consumerUserId", metadata FROM "PaymentIntent" WHERE id = ${paymentIntentId} FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException("PaymentIntent not found");

      const confirmedStatus = transition(current.status, PaymentIntentEvent.CONFIRM);

      await this.assertCartStillAvailable(tx, current.metadata);
      const locationStockReserved = await this.reserveLocationStockForCart(tx, current.metadata);
      const paymentMethod = await this.paymentMethods.findOrCreate(tx, current.merchantId, dto.paymentMethod);
      const rail = this.railRegistry.getForMethodType(paymentMethod.type);
      const processingStatus = transition(confirmedStatus, PaymentIntentEvent.AUTHORIZE_START);
      const debt = (current.metadata as {
        debt?: { customerName?: string; customerDocument?: string; customerEmail?: string; customerPhone?: string };
      } | null)?.debt;
      const normalizedEmail = dto.customerEmail?.trim().toLowerCase();
      const effectiveEmail = debt?.customerEmail?.trim().toLowerCase() || normalizedEmail;
      const matchedConsumer = effectiveEmail
        ? await tx.consumerUser.findFirst({ where: { email: effectiveEmail, emailVerifiedAt: { not: null } }, select: { id: true } })
        : null;
      const consumerUserId = current.consumerUserId ?? matchedConsumer?.id;
      const currentMetadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata as Prisma.JsonObject
        : {};
      const delivery = dto.deliveryRequested
        ? {
            requested: true,
            address: dto.deliveryAddress?.trim() || null,
            ...(dto.customerLatitude !== undefined && dto.customerLongitude !== undefined ? {
              latitude: dto.customerLatitude,
              longitude: dto.customerLongitude,
              accuracyMeters: dto.customerLocationAccuracy ?? null,
            } : {}),
          }
        : null;

      const updated = await tx.paymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: processingStatus,
          paymentMethodType: paymentMethod.type,
          paymentMethodId: paymentMethod.id,
          railId: rail.railId,
          confirmationAttempts: { increment: 1 },
          // The company owns debt identity and amount. Never let a modified
          // public confirm request replace the carnet/name from that record.
          customerName: debt?.customerName || dto.customerName,
          customerDocument: debt?.customerDocument || dto.customerDocument,
          customerEmail: effectiveEmail,
          customerPhone: debt?.customerPhone || dto.customerPhone,
          metadata: { ...currentMetadata, delivery, ...(locationStockReserved ? { locationStockReserved: true } : {}) } as Prisma.InputJsonValue,
          ...(consumerUserId && { consumerUserId }),
        },
      });

      if (consumerUserId) {
        await tx.storeOrder.updateMany({
          where: { paymentIntentId, consumerUserId: null },
          data: { consumerUserId },
        });
      }

      return {
        intentId: updated.id,
        railId: rail.railId,
        amount: updated.amount,
        currency: updated.currency,
        merchantId: updated.merchantId,
      };
    });

    const rail = this.railRegistry.get(railId);
    const idempotencyKey = `confirm_${intentId}`;
    let result: RailResult;
    try {
      result = await rail.authorize({
        paymentIntentId: intentId,
        amount,
        currency,
        paymentMethod: { type: dto.paymentMethod.type, token: dto.paymentMethod.token, metadata: dto.paymentMethod.metadata },
        idempotencyKey,
      });
    } catch (error) {
      await this.applyRailResult(intentId, merchantId, railId, {
        status: "failed",
        railReference: `authorize-error-${intentId}`,
        failureReason: (error as Error).message || "rail_authorization_error",
        raw: { error: (error as Error).message || "rail_authorization_error" },
      }, TransactionType.AUTHORIZATION);
      throw error;
    }

    return this.applyRailResult(intentId, merchantId, railId, result, TransactionType.AUTHORIZATION);
  }

  /** Invoked by authenticated rail callbacks to resolve a `requires_action` intent. */
  async applyCallbackResult(
    paymentIntentId: string,
    result: RailResult,
    expectations: { railId?: string; amount?: number; currency?: string } = {},
  ) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId } });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    if (!intent.railId) throw new BadRequestException("PaymentIntent has no associated rail");
    if (expectations.railId && intent.railId !== expectations.railId) {
      throw new BadRequestException("Callback rail does not match PaymentIntent");
    }
    if (expectations.amount !== undefined && intent.amount !== expectations.amount) {
      throw new BadRequestException("Callback amount does not match PaymentIntent");
    }
    if (expectations.currency && intent.currency !== expectations.currency) {
      throw new BadRequestException("Callback currency does not match PaymentIntent");
    }

    // Payment providers retry webhooks. A repeated notification for the same
    // terminal outcome is an acknowledgement, never a second ledger entry.
    if (
      (intent.status === PaymentIntentStatus.SUCCEEDED && result.status === "succeeded") ||
      (intent.status === PaymentIntentStatus.FAILED && result.status === "failed")
    ) {
      return { paymentIntent: intent, railResult: result };
    }

    return this.applyRailResult(intent.id, intent.merchantId, intent.railId, result, TransactionType.AUTHORIZATION);
  }

  private async applyRailResult(
    paymentIntentId: string,
    merchantId: string,
    railId: string,
    result: RailResult,
    transactionType: TransactionType,
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          status: PaymentIntentStatus;
          amount: number;
          customerName: string | null;
          customerDocument: string | null;
          metadata: Prisma.JsonValue;
        }[]
      >`
        SELECT status, amount, "customerName", "customerDocument", metadata FROM "PaymentIntent" WHERE id = ${paymentIntentId} FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException("PaymentIntent not found");

      const event = this.eventForRailResult(current.status, result.status);
      const nextStatus = transition(current.status, event);

      const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });

      const locationStockReserved = (current.metadata as { locationStockReserved?: boolean } | null)?.locationStockReserved === true;
      if (result.status === "failed" && locationStockReserved) {
        await this.releaseLocationStockForCart(tx, current.metadata);
      }
      const currentMetadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata as Prisma.JsonObject
        : {};

      const transactionRow = await tx.transaction.create({
        data: {
          paymentIntentId,
          type: transactionType,
          railId,
          amount: current.amount,
          status: result.status === "succeeded" ? TransactionStatus.SUCCEEDED : result.status === "failed" ? TransactionStatus.FAILED : TransactionStatus.PENDING,
          railReference: result.railReference,
          rawResponse: result.raw as Prisma.InputJsonValue,
        },
      });

      const updated = await tx.paymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: nextStatus,
          ...(result.status === "failed" && locationStockReserved
            ? { metadata: { ...currentMetadata, locationStockReserved: false } as Prisma.InputJsonValue }
            : {}),
          lastError:
            result.status === "failed"
              ? ({ message: result.failureReason ?? "unknown_error", railReference: result.railReference } as Prisma.InputJsonValue)
              : undefined,
        },
      });

      if (result.status === "succeeded") {
        const lines = this.ledger.buildCaptureJournal({
          merchantId,
          transactionId: transactionRow.id,
          amount: current.amount,
          settlementMode: merchant.settlementMode,
        });
        await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), lines, updated.currency);
        await this.webhooks.enqueueEvent(tx, merchantId, "payment_intent.succeeded", {
          id: updated.id,
          amount: updated.amount,
          currency: updated.currency,
          status: updated.status,
        });
        await completeEventReservationPayment(tx, updated);
        await this.invoicing.enqueueInvoice(tx, merchantId, {
          paymentIntentId: updated.id,
          amount: updated.amount,
          currency: updated.currency,
          customerName: current.customerName,
          customerDocument: current.customerDocument,
        });
        await this.decrementStockForCart(tx, current.metadata);
        await this.recordProductStats(tx, merchantId, current.metadata);
        const order = await tx.storeOrder.findUnique({ where: { paymentIntentId }, select: { id: true, status: true } });
        if (order?.status === OrderFulfillmentStatus.AWAITING_PAYMENT) {
          await tx.storeOrder.update({
            where: { id: order.id },
            data: {
              status: OrderFulfillmentStatus.PAID,
              statusEvents: { create: { status: OrderFulfillmentStatus.PAID } },
            },
          });
        }
        const debtMetadata = (current.metadata as { debt?: { debtRecordId?: string; debtRecordIds?: string[] } } | null)?.debt;
        const debtRecordIds = [...new Set([
          ...(Array.isArray(debtMetadata?.debtRecordIds) ? debtMetadata.debtRecordIds : []),
          ...(debtMetadata?.debtRecordId ? [debtMetadata.debtRecordId] : []),
        ])];
        if (debtRecordIds.length) {
          const paid = await tx.debtRecord.updateMany({
            where: { id: { in: debtRecordIds }, paymentIntentId, status: DebtRecordStatus.PENDING },
            data: { status: DebtRecordStatus.PAID, paidAt: new Date() },
          });
          if (paid.count !== debtRecordIds.length) throw new BadRequestException("Una deuda seleccionada ya no está pendiente");
        }
        await tx.subscriptionInvoice.updateMany({
          where: { paymentIntentId, status: "DUE" },
          data: { status: "PAID", paidAt: new Date() },
        });
        await tx.appointment.updateMany({
          where: { depositPaymentIntentId: paymentIntentId, status: "PENDING" },
          data: { status: "CONFIRMED", holdExpiresAt: null },
        });
      } else if (result.status === "failed") {
        await this.webhooks.enqueueEvent(tx, merchantId, "payment_intent.failed", {
          id: updated.id,
          amount: updated.amount,
          currency: updated.currency,
          status: updated.status,
          error: updated.lastError,
        });
      }

      return { paymentIntent: updated, railResult: result, merchantName: merchant.name };
    });

    // Sent outside the transaction — it's a real network call (unlike the
    // webhook/invoice enqueues above, which just write an outbox row), so it
    // must never hold a DB row lock open while it runs.
    if (outcome.railResult.status === "succeeded") {
      await this.sendReceiptEmail(outcome.paymentIntent, outcome.merchantName);
      await this.sendDebtPaymentNotification(outcome.paymentIntent);
    }

    return { paymentIntent: outcome.paymentIntent, railResult: outcome.railResult };
  }

  /**
   * This is the customer's own receipt for their order — sent on the
   * store/merchant's behalf (subject line, no pagosYa branding), same as the
   * WhatsApp/email contact shown on the checkout receipt screen. Both
   * EmailProvider implementations already catch and log send failures
   * internally, but the try/catch here is a second layer: nothing in this
   * method — a malformed cart, a missing field — should ever be able to turn
   * an already-succeeded payment into a failed confirm() response.
   */
  private async sendReceiptEmail(
    intent: {
      id: string;
      amount: number;
      currency: string;
      customerEmail: string | null;
      customerName: string | null;
      metadata: Prisma.JsonValue;
    },
    merchantName: string,
  ): Promise<void> {
    if (!intent.customerEmail) return;
    try {
      const cart = (intent.metadata as { cart?: CartInventoryLine[] } | null)?.cart;
      const appointment = (intent.metadata as { appointment?: { offeringName?: string; startsAt?: string } } | null)?.appointment;
      const itemLines = cart
        ? cart
            .map(
              (line) =>
                `- ${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${line.extras.map((extra) => extra.name).join(" + ")}` : ""} x${line.quantity}: ${formatAmount(line.unitAmount * line.quantity, intent.currency)}`,
            )
            .join("\n") + "\n"
        : "";

      const order = await this.prisma.storeOrder.findUnique({ where: { paymentIntentId: intent.id }, select: { id: true } });
      const trackingLine = order
        ? `\nSigue tu pedido aquí:\n${(this.config?.get<string>("app.checkoutOrigin") ?? "http://localhost:5174").replace(/\/$/, "")}/track/${createOrderTrackingToken(order.id, this.config?.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET)}\n`
        : "";

      await this.email.send({
        to: intent.customerEmail,
        subject: appointment ? `Cita confirmada en ${merchantName}` : `Recibo de tu compra en ${merchantName}`,
        body: `Hola${intent.customerName ? ` ${intent.customerName}` : ""},\n\nTu pago fue confirmado.${appointment ? `\nServicio: ${appointment.offeringName ?? "Cita"}${appointment.startsAt ? `\nFecha: ${new Date(appointment.startsAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" })}` : ""}` : ""}\n\nOrden: ${intent.id}\n${itemLines}Total: ${formatAmount(intent.amount, intent.currency)}${trackingLine}\nGracias por tu compra.`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send receipt email for ${intent.id}: ${(err as Error).message}`);
    }
  }

  private async sendDebtPaymentNotification(
    intent: {
      id: string;
      amount: number;
      currency: string;
      metadata: Prisma.JsonValue;
    },
  ): Promise<void> {
    const debt = (intent.metadata as {
      debt?: {
        notificationEmail?: string;
        notificationEmails?: string[];
        companyName?: string;
        customerName?: string;
        customerDocument?: string;
        reference?: string | null;
        description?: string | null;
        items?: Array<{ collectionName?: string; reference?: string | null; description?: string | null; amount?: number }>;
      };
    } | null)?.debt;
    const recipients = [...new Set([
      ...(Array.isArray(debt?.notificationEmails) ? debt.notificationEmails : []),
      ...(debt?.notificationEmail ? [debt.notificationEmail] : []),
    ].filter((recipient): recipient is string => Boolean(recipient)))];
    if (!debt || !recipients.length) return;
    try {
      const itemLines = debt.items?.length
        ? `\n\nDeudas pagadas:\n${debt.items.map((item) => `- ${item.collectionName || item.description || "Deuda"}${item.reference ? ` · ${item.reference}` : ""}${Number.isInteger(item.amount) ? `: ${formatAmount(item.amount!, intent.currency)}` : ""}`).join("\n")}`
        : `${debt.reference ? `\nReferencia: ${debt.reference}` : ""}${debt.description ? `\nDetalle: ${debt.description}` : ""}`;
      await Promise.all(recipients.map((recipient) => this.email.send({
        to: recipient,
        subject: debt.items && debt.items.length > 1 ? `Deudas pagadas · ${debt.items.length}` : `Deuda pagada${debt.reference ? ` · ${debt.reference}` : ""}`,
        body: `Se confirmó un pago${debt.companyName ? ` para ${debt.companyName}` : ""}.\n\nOrden: ${intent.id}\nCliente: ${debt.customerName || "Sin nombre"}\nCarnet: ${debt.customerDocument || "Sin carnet"}${itemLines}\nTotal: ${formatAmount(intent.amount, intent.currency)}\n\n${debt.items && debt.items.length > 1 ? "Las deudas seleccionadas quedaron marcadas" : "La deuda quedó marcada"} como pagada en PagosYa.`,
      })));
    } catch (err) {
      this.logger.warn(`Failed to send debt notification for ${intent.id}: ${(err as Error).message}`);
    }
  }


  /**
   * Cart-checkout intents snapshot name/price at creation time (see
   * StoresService.createCartCheckout) but stock and availability can still
   * drift while the customer is filling out the payment form — another
   * buyer checking out first, or the merchant editing/archiving the product.
   * Re-check right before authorizing so a sold-out or removed item blocks
   * the charge outright, instead of charging successfully and only then
   * silently no-oping the stock decrement (see decrementStockForCart's
   * `gte` guard) with an order the merchant can't actually fulfill.
   */
  private async assertCartStillAvailable(tx: Prisma.TransactionClient, metadata: Prisma.JsonValue): Promise<void> {
    const cart = (metadata as { cart?: CartInventoryLine[] } | null)?.cart;
    if (!cart) return;
    const fulfillment = (metadata as { fulfillment?: { locationId?: string; locationName?: string } } | null)?.fulfillment;

    const links = await tx.paymentLink.findMany({ where: { id: { in: cart.map((line) => line.paymentLinkId) } } });
    const requestedByLinkId = new Map<string, number>();
    const requestedByVariant = new Map<string, { quantity: number; variant: ProductVariant; productName: string }>();
    const requestedByExtraPool = new Map<string, { quantity: number; stock: number; name: string }>();
    for (const line of cart) {
      const link = links.find((l) => l.id === line.paymentLinkId);
      if (!link || link.status !== PaymentLinkStatus.ACTIVE) {
        throw new BadRequestException(`"${line.name}" ya no está disponible`);
      }

      const variants = readProductVariants(link.variants);
      if (variants.length > 0) {
        const variant = line.variantId ? variants.find((candidate) => candidate.id === line.variantId) : undefined;
        if (!variant) throw new BadRequestException(`La opción de "${line.name}" ya no está disponible`);
        const key = `${line.paymentLinkId}:${variant.id}`;
        const requested = requestedByVariant.get(key);
        requestedByVariant.set(key, {
          quantity: (requested?.quantity ?? 0) + line.quantity,
          variant,
          productName: link.name,
        });
      }
      if (variants.length === 0 && line.variantId) {
        throw new BadRequestException(`"${line.name}" ya no ofrece esa opción`);
      }
      const currentExtras = readProductExtras(link.extras);
      for (const snapshotExtra of line.extras ?? []) {
        const currentExtra = currentExtras.find((extra) => extra.id === snapshotExtra.id);
        if (!currentExtra) throw new BadRequestException(`"${snapshotExtra.name}" ya no está disponible`);
        if (currentExtra.stock !== undefined && currentExtra.inventoryKey) {
          const requested = requestedByExtraPool.get(currentExtra.inventoryKey);
          requestedByExtraPool.set(currentExtra.inventoryKey, {
            quantity: (requested?.quantity ?? 0) + line.quantity,
            stock: Math.min(requested?.stock ?? currentExtra.stock, currentExtra.stock),
            name: currentExtra.inventoryName || currentExtra.name,
          });
        }
      }
      requestedByLinkId.set(line.paymentLinkId, (requestedByLinkId.get(line.paymentLinkId) ?? 0) + line.quantity);
    }

    for (const [paymentLinkId, quantity] of requestedByLinkId) {
      const link = links.find((candidate) => candidate.id === paymentLinkId)!;
      if (link.stock !== null && link.stock < quantity) {
        throw new BadRequestException(`Solo quedan ${link.stock} unidades de "${link.name}"`);
      }
    }
    if (fulfillment?.locationId) {
      for (const [paymentLinkId, quantity] of requestedByLinkId) {
        const link = links.find((candidate) => candidate.id === paymentLinkId)!;
        const stock = readLocationStocks(link.locationStocks)[fulfillment.locationId] ?? 0;
        if (stock !== null && stock < quantity) {
          throw new BadRequestException(`${fulfillment.locationName || "La ubicación elegida"} ya no tiene suficiente stock de "${link.name}"`);
        }
      }
    }
    for (const { quantity, variant, productName } of requestedByVariant.values()) {
      if (variant.stock !== undefined && variant.stock !== null && variant.stock < quantity) {
        throw new BadRequestException(`Solo quedan ${variant.stock} unidades de "${productName} (${variant.name})"`);
      }
    }
    for (const { quantity, stock, name } of requestedByExtraPool.values()) {
      if (stock < quantity) throw new BadRequestException(`Ya no hay suficiente stock de "${name}"`);
    }
  }

  /**
   * Only cart-checkout intents (StoresService.createCartCheckout) carry a
   * `cart` in metadata — a plain API-created PaymentIntent has none, and
   * that's fine, there's nothing to decrement. The `stock: { gte: quantity }`
   * guard is what actually prevents overselling: it excludes both unlimited
   * stock (null, since `NULL >= n` is never true in SQL) and any row that
   * doesn't have enough left, so a race between two carts can never push
   * stock negative — worst case one decrement silently no-ops.
   */
  private async decrementStockForCart(tx: Prisma.TransactionClient, metadata: Prisma.JsonValue): Promise<void> {
    const cart = (metadata as { cart?: CartInventoryLine[] } | null)?.cart;
    if (!cart) return;
    const requestedByLinkId = new Map<string, number>();
    const requestedByVariant = new Map<string, { paymentLinkId: string; variantId: string; quantity: number; label: string }>();
    const requestedByExtraPool = new Map<string, { quantity: number; name: string }>();
    const requestedByLocationProduct = new Map<string, number>();
    for (const line of cart) {
      requestedByLocationProduct.set(line.paymentLinkId, (requestedByLocationProduct.get(line.paymentLinkId) ?? 0) + line.quantity);
      if (line.variantId) {
        const key = `${line.paymentLinkId}:${line.variantId}`;
        const requested = requestedByVariant.get(key);
        requestedByVariant.set(key, {
          paymentLinkId: line.paymentLinkId,
          variantId: line.variantId,
          quantity: (requested?.quantity ?? 0) + line.quantity,
          label: `${line.name}${line.variantName ? ` (${line.variantName})` : ""}`,
        });
      } else {
        requestedByLinkId.set(line.paymentLinkId, (requestedByLinkId.get(line.paymentLinkId) ?? 0) + line.quantity);
      }
      for (const extra of line.extras ?? []) {
        if (!extra.inventoryKey || extra.stock === undefined) continue;
        const requested = requestedByExtraPool.get(extra.inventoryKey);
        requestedByExtraPool.set(extra.inventoryKey, {
          quantity: (requested?.quantity ?? 0) + line.quantity,
          name: extra.inventoryName || extra.name,
        });
      }
    }
    const locationId = (metadata as { fulfillment?: { locationId?: string } } | null)?.fulfillment?.locationId;
    const locationStockReserved = (metadata as { locationStockReserved?: boolean } | null)?.locationStockReserved === true;
    if (locationId && !locationStockReserved) {
      for (const [paymentLinkId, quantity] of requestedByLocationProduct) {
        const updated = await tx.$executeRaw`
          UPDATE "PaymentLink"
          SET "locationStocks" = CASE
            WHEN "locationStocks" -> ${locationId} = 'null'::jsonb THEN "locationStocks"
            ELSE jsonb_set(
              "locationStocks",
              ARRAY[${locationId}],
              to_jsonb(("locationStocks" ->> ${locationId})::int - ${quantity}),
              true
            )
          END
          WHERE "id" = ${paymentLinkId}
            AND "locationStocks" ? ${locationId}
            AND (
              "locationStocks" -> ${locationId} = 'null'::jsonb
              OR ("locationStocks" ->> ${locationId})::int >= ${quantity}
            )
        `;
        if (updated !== 1) throw new BadRequestException("La ubicación elegida ya no tiene suficiente stock");
      }
    }
    for (const [paymentLinkId, quantity] of requestedByLinkId) {
      const updated = await tx.$executeRaw`
        UPDATE "PaymentLink"
        SET "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" - ${quantity} END
        WHERE "id" = ${paymentLinkId}
          AND ("stock" IS NULL OR "stock" >= ${quantity})
      `;
      if (updated !== 1) throw new BadRequestException("Uno de los productos ya no tiene suficiente stock");
    }
    for (const { paymentLinkId, variantId, quantity, label } of requestedByVariant.values()) {
      // The option inventory lives in the validated JSON snapshot, so update
      // the matching element and the product's derived total in one guarded
      // row update. Missing `stock` keeps legacy shared-stock semantics; null
      // is unlimited; a number is decremented. The WHERE guards make the
      // operation safe against a second checkout racing this transaction.
      const updated = await tx.$executeRaw`
        UPDATE "PaymentLink"
        SET
          "variants" = (
            SELECT jsonb_agg(
              CASE
                WHEN option_value ->> 'id' = ${variantId}
                  AND option_value ? 'stock'
                  AND option_value -> 'stock' <> 'null'::jsonb
                THEN jsonb_set(
                  option_value,
                  '{stock}',
                  to_jsonb((option_value ->> 'stock')::int - ${quantity}),
                  true
                )
                ELSE option_value
              END
              ORDER BY ordinal
            )
            FROM jsonb_array_elements("variants") WITH ORDINALITY AS options(option_value, ordinal)
          ),
          "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" - ${quantity} END
        WHERE "id" = ${paymentLinkId}
          AND ("stock" IS NULL OR "stock" >= ${quantity})
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements("variants") AS options(option_value)
            WHERE option_value ->> 'id' = ${variantId}
              AND (
                NOT (option_value ? 'stock')
                OR option_value -> 'stock' = 'null'::jsonb
                OR (option_value ->> 'stock')::int >= ${quantity}
              )
          )
      `;
      if (updated !== 1) throw new BadRequestException(`Ya no hay suficiente stock de "${label}"`);
    }
    const storeId = (metadata as { storeId?: string } | null)?.storeId;
    if (!storeId && requestedByExtraPool.size) throw new BadRequestException("El pedido no tiene una tienda válida");
    for (const [inventoryKey, { quantity, name }] of requestedByExtraPool) {
      const updated = await tx.$executeRaw`
        UPDATE "PaymentLink"
        SET "extras" = (
          SELECT jsonb_agg(
            CASE
              WHEN extra_value ->> 'inventoryKey' = ${inventoryKey}
                AND extra_value ? 'stock'
                AND (extra_value ->> 'stock')::int >= ${quantity}
              THEN jsonb_set(extra_value, '{stock}', to_jsonb((extra_value ->> 'stock')::int - ${quantity}), true)
              ELSE extra_value
            END
            ORDER BY ordinal
          )
          FROM jsonb_array_elements("extras") WITH ORDINALITY AS extra_rows(extra_value, ordinal)
        )
        WHERE "storeId" = ${storeId}
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("extras") AS extra_rows(extra_value)
            WHERE extra_value ->> 'inventoryKey' = ${inventoryKey}
              AND (extra_value ->> 'stock')::int >= ${quantity}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "PaymentLink" AS pool_link,
              jsonb_array_elements(pool_link."extras") AS pool_rows(extra_value)
            WHERE pool_link."storeId" = ${storeId}
              AND pool_rows.extra_value ->> 'inventoryKey' = ${inventoryKey}
              AND (pool_rows.extra_value ->> 'stock')::int < ${quantity}
          )
      `;
      if (updated < 1) throw new BadRequestException(`Ya no hay suficiente stock de "${name}"`);
    }
  }

  private async reserveLocationStockForCart(tx: Prisma.TransactionClient, metadata: Prisma.JsonValue): Promise<boolean> {
    const cart = (metadata as { cart?: CartInventoryLine[] } | null)?.cart;
    const locationId = (metadata as { fulfillment?: { locationId?: string } } | null)?.fulfillment?.locationId;
    if (!cart || !locationId) return false;
    const requested = new Map<string, number>();
    for (const line of cart) requested.set(line.paymentLinkId, (requested.get(line.paymentLinkId) ?? 0) + line.quantity);
    for (const [paymentLinkId, quantity] of requested) {
      const updated = await tx.$executeRaw`
        UPDATE "PaymentLink"
        SET "locationStocks" = CASE
          WHEN "locationStocks" -> ${locationId} = 'null'::jsonb THEN "locationStocks"
          ELSE jsonb_set(
            "locationStocks",
            ARRAY[${locationId}],
            to_jsonb(("locationStocks" ->> ${locationId})::int - ${quantity}),
            true
          )
        END
        WHERE "id" = ${paymentLinkId}
          AND "locationStocks" ? ${locationId}
          AND (
            "locationStocks" -> ${locationId} = 'null'::jsonb
            OR ("locationStocks" ->> ${locationId})::int >= ${quantity}
          )
      `;
      if (updated !== 1) throw new BadRequestException("La ubicación elegida ya no tiene suficiente stock");
    }
    return true;
  }

  private async releaseLocationStockForCart(tx: Prisma.TransactionClient, metadata: Prisma.JsonValue): Promise<void> {
    const cart = (metadata as { cart?: CartInventoryLine[] } | null)?.cart;
    const locationId = (metadata as { fulfillment?: { locationId?: string } } | null)?.fulfillment?.locationId;
    if (!cart || !locationId) return;
    const requested = new Map<string, number>();
    for (const line of cart) requested.set(line.paymentLinkId, (requested.get(line.paymentLinkId) ?? 0) + line.quantity);
    for (const [paymentLinkId, quantity] of requested) {
      await tx.$executeRaw`
        UPDATE "PaymentLink"
        SET "locationStocks" = CASE
          WHEN "locationStocks" -> ${locationId} = 'null'::jsonb THEN "locationStocks"
          ELSE jsonb_set(
            "locationStocks",
            ARRAY[${locationId}],
            to_jsonb(("locationStocks" ->> ${locationId})::int + ${quantity}),
            true
          )
        END
        WHERE "id" = ${paymentLinkId}
          AND "locationStocks" ? ${locationId}
      `;
    }
  }

  /** Increment compact per-product totals in the same transaction that marks
   * the payment successful. This makes retries atomic and avoids rescanning
   * every historical PaymentIntent for storefront and finance reads. */
  private async recordProductStats(tx: Prisma.TransactionClient, merchantId: string, metadata: Prisma.JsonValue): Promise<void> {
    const snapshot = metadata as { storeId?: string; cart?: CartInventoryLine[] } | null;
    if (!snapshot?.storeId || !Array.isArray(snapshot.cart)) return;

    const totals = new Map<string, { productName: string; quantity: number; revenue: number }>();
    for (const line of snapshot.cart) {
      if (!line?.paymentLinkId || !Number.isInteger(line.quantity) || line.quantity <= 0) continue;
      const unitAmount = Number.isInteger(line.unitAmount) && line.unitAmount > 0 ? line.unitAmount : 0;
      const current = totals.get(line.paymentLinkId) ?? { productName: line.name, quantity: 0, revenue: 0 };
      current.productName = line.name || current.productName;
      current.quantity += line.quantity;
      current.revenue += unitAmount * line.quantity;
      totals.set(line.paymentLinkId, current);
    }

    for (const [paymentLinkId, total] of totals) {
      await tx.storeProductStat.upsert({
        where: { storeId_paymentLinkId: { storeId: snapshot.storeId, paymentLinkId } },
        create: {
          merchantId,
          storeId: snapshot.storeId,
          paymentLinkId,
          productName: total.productName,
          quantity: total.quantity,
          revenue: total.revenue,
        },
        update: {
          productName: total.productName,
          quantity: { increment: total.quantity },
          revenue: { increment: total.revenue },
        },
      });
    }
  }

  private eventForRailResult(from: PaymentIntentStatus, resultStatus: RailResult["status"]): PaymentIntentEvent {
    const isCallback = from === PaymentIntentStatus.REQUIRES_ACTION;
    if (resultStatus === "succeeded") {
      return isCallback ? PaymentIntentEvent.RAIL_CALLBACK_SUCCEEDED : PaymentIntentEvent.AUTHORIZE_SUCCEEDED;
    }
    if (resultStatus === "requires_action" || resultStatus === "pending") {
      return PaymentIntentEvent.AUTHORIZE_REQUIRES_ACTION;
    }
    return isCallback ? PaymentIntentEvent.RAIL_CALLBACK_FAILED : PaymentIntentEvent.AUTHORIZE_FAILED;
  }
}
