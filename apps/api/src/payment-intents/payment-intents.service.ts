import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { PaymentIntentStatus, PaymentLinkStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
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

const idPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);
const secretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 24);

function formatAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

type ProductVariant = { id: string; name: string; amount: number; stock?: number | null };
type CartInventoryLine = { paymentLinkId: string; variantId?: string; quantity: number; name: string; variantName?: string };

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
      ((entry as Record<string, unknown>).amount as number) > 0 &&
      (!("stock" in entry) ||
        (entry as Record<string, unknown>).stock === null ||
        (Number.isInteger((entry as Record<string, unknown>).stock) &&
          ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
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
  ) {}

  async create(merchantId: string, livemode: boolean, dto: CreatePaymentIntentDto) {
    const id = `pi_${idPart()}`;
    const clientSecret = `${id}_secret_${secretPart()}`;

    return this.prisma.paymentIntent.create({
      data: {
        id,
        merchantId,
        amount: dto.amount,
        currency: dto.currency ?? "BOB",
        description: dto.description,
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

  async listForMerchant(merchantId: string) {
    return this.prisma.paymentIntent.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 50 });
  }

  async findByClientSecret(clientSecret: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { clientSecret },
      include: { merchant: { select: { name: true } } },
    });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    return intent;
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
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    const nextStatus = transition(intent.status, PaymentIntentEvent.CANCEL);
    return this.prisma.paymentIntent.update({ where: { id }, data: { status: nextStatus } });
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
        { id: string; status: PaymentIntentStatus; confirmationAttempts: number; merchantId: string; metadata: Prisma.JsonValue }[]
      >`
        SELECT id, status, "confirmationAttempts", "merchantId", metadata FROM "PaymentIntent" WHERE id = ${paymentIntentId} FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException("PaymentIntent not found");

      const confirmedStatus = transition(current.status, PaymentIntentEvent.CONFIRM);

      await this.assertCartStillAvailable(tx, current.metadata);

      const paymentMethod = await this.paymentMethods.findOrCreate(tx, current.merchantId, dto.paymentMethod);
      const rail = this.railRegistry.getForMethodType(paymentMethod.type);
      const processingStatus = transition(confirmedStatus, PaymentIntentEvent.AUTHORIZE_START);

      const updated = await tx.paymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: processingStatus,
          paymentMethodType: paymentMethod.type,
          paymentMethodId: paymentMethod.id,
          railId: rail.railId,
          confirmationAttempts: { increment: 1 },
          customerName: dto.customerName,
          customerDocument: dto.customerDocument,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
        },
      });

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
    const result = await rail.authorize({
      paymentIntentId: intentId,
      amount,
      currency,
      paymentMethod: { type: dto.paymentMethod.type, token: dto.paymentMethod.token, metadata: dto.paymentMethod.metadata },
      idempotencyKey,
    });

    return this.applyRailResult(intentId, merchantId, railId, result, TransactionType.AUTHORIZATION);
  }

  /** Invoked by the internal rail-callback endpoint to resolve a `requires_action` intent. */
  async applyCallbackResult(paymentIntentId: string, result: RailResult) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId } });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    if (!intent.railId) throw new BadRequestException("PaymentIntent has no associated rail");

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
        await this.invoicing.enqueueInvoice(tx, merchantId, {
          paymentIntentId: updated.id,
          amount: updated.amount,
          currency: updated.currency,
          customerName: current.customerName,
          customerDocument: current.customerDocument,
        });
        await this.decrementStockForCart(tx, current.metadata);
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
      const cart = (intent.metadata as { cart?: { name: string; variantName?: string; quantity: number; unitAmount: number }[] } | null)?.cart;
      const itemLines = cart
        ? cart
            .map(
              (line) =>
                `- ${line.name}${line.variantName ? ` (${line.variantName})` : ""} x${line.quantity}: ${formatAmount(line.unitAmount * line.quantity, intent.currency)}`,
            )
            .join("\n") + "\n"
        : "";

      await this.email.send({
        to: intent.customerEmail,
        subject: `Recibo de tu compra en ${merchantName}`,
        body: `Hola${intent.customerName ? ` ${intent.customerName}` : ""},\n\nTu pago fue confirmado.\n\nOrden: ${intent.id}\n${itemLines}Total: ${formatAmount(intent.amount, intent.currency)}\n\nGracias por tu compra.`,
      });
    } catch (err) {
      this.logger.warn(`Failed to send receipt email for ${intent.id}: ${(err as Error).message}`);
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

    const links = await tx.paymentLink.findMany({ where: { id: { in: cart.map((line) => line.paymentLinkId) } } });
    const requestedByLinkId = new Map<string, number>();
    const requestedByVariant = new Map<string, { quantity: number; variant: ProductVariant; productName: string }>();
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
      requestedByLinkId.set(line.paymentLinkId, (requestedByLinkId.get(line.paymentLinkId) ?? 0) + line.quantity);
    }

    for (const [paymentLinkId, quantity] of requestedByLinkId) {
      const link = links.find((candidate) => candidate.id === paymentLinkId)!;
      if (link.stock !== null && link.stock < quantity) {
        throw new BadRequestException(`Solo quedan ${link.stock} unidades de "${link.name}"`);
      }
    }
    for (const { quantity, variant, productName } of requestedByVariant.values()) {
      if (variant.stock !== undefined && variant.stock !== null && variant.stock < quantity) {
        throw new BadRequestException(`Solo quedan ${variant.stock} unidades de "${productName} (${variant.name})"`);
      }
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
    for (const line of cart) {
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
    }
    for (const [paymentLinkId, quantity] of requestedByLinkId) {
      await tx.paymentLink.updateMany({
        where: { id: paymentLinkId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
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
