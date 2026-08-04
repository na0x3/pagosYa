import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { PaymentIntentStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RailRegistry } from "../rails/rail-registry.service";
import { PaymentMethodsService } from "../payment-methods/payment-methods.service";
import { LedgerService } from "../ledger/ledger.service";
import { WebhookDispatcherService } from "../webhooks/webhook-dispatcher.service";
import { RailResult } from "../rails/interfaces/payment-rail-adapter.interface";
import { CreatePaymentIntentDto } from "./dto/create-payment-intent.dto";
import { ConfirmPaymentIntentDto } from "./dto/confirm-payment-intent.dto";
import { PaymentIntentEvent, transition } from "./payment-intent.state-machine";

const idPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);
const secretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 24);

@Injectable()
export class PaymentIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly railRegistry: RailRegistry,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly ledger: LedgerService,
    private readonly webhooks: WebhookDispatcherService,
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

  async findByClientSecret(clientSecret: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { clientSecret } });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    return intent;
  }

  async cancel(merchantId: string, id: string) {
    const intent = await this.findByIdForMerchant(merchantId, id);
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
        { id: string; status: PaymentIntentStatus; confirmationAttempts: number; merchantId: string }[]
      >`
        SELECT id, status, "confirmationAttempts", "merchantId" FROM "PaymentIntent" WHERE id = ${paymentIntentId} FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException("PaymentIntent not found");

      const confirmedStatus = transition(current.status, PaymentIntentEvent.CONFIRM);

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
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: PaymentIntentStatus; amount: number }[]>`
        SELECT status, amount FROM "PaymentIntent" WHERE id = ${paymentIntentId} FOR UPDATE
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
      } else if (result.status === "failed") {
        await this.webhooks.enqueueEvent(tx, merchantId, "payment_intent.failed", {
          id: updated.id,
          amount: updated.amount,
          currency: updated.currency,
          status: updated.status,
          error: updated.lastError,
        });
      }

      return { paymentIntent: updated, railResult: result };
    });
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
