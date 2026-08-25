import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentIntentStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RailRegistry } from "../rails/rail-registry.service";
import { LedgerService } from "../ledger/ledger.service";
import { WebhookDispatcherService } from "../webhooks/webhook-dispatcher.service";
import { CreateRefundDto } from "./dto/create-refund.dto";

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly railRegistry: RailRegistry,
    private readonly ledger: LedgerService,
    private readonly webhooks: WebhookDispatcherService,
  ) {}

  async create(merchantId: string, dto: CreateRefundDto, idempotencyKey?: string) {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("A valid Idempotency-Key header (8-128 characters) is required for refunds");
    }

    const reservation = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; amount: number; currency: string; status: PaymentIntentStatus }>
      >`
        SELECT id, amount, currency, status FROM "PaymentIntent"
        WHERE id = ${dto.paymentIntentId} AND "merchantId" = ${merchantId}
        FOR UPDATE
      `;
      const intent = rows[0];
      if (!intent) throw new NotFoundException("PaymentIntent not found");
      if (intent.status !== PaymentIntentStatus.SUCCEEDED) {
        throw new BadRequestException("Only succeeded PaymentIntents can be refunded");
      }

      const originalTransaction = await tx.transaction.findFirst({
        where: {
          paymentIntentId: intent.id,
          type: TransactionType.AUTHORIZATION,
          status: TransactionStatus.SUCCEEDED,
        },
        orderBy: { createdAt: "asc" },
      });
      if (!originalTransaction?.railReference) {
        throw new BadRequestException("PaymentIntent has no settled transaction to refund");
      }

      const amount = dto.amount ?? intent.amount;
      const reserved = await tx.transaction.aggregate({
        where: {
          paymentIntentId: intent.id,
          type: TransactionType.REFUND,
          status: { in: [TransactionStatus.PENDING, TransactionStatus.SUCCEEDED] },
        },
        _sum: { amount: true },
      });
      const refundable = intent.amount - (reserved._sum.amount ?? 0);
      if (amount > refundable) {
        throw new BadRequestException(`Refund amount exceeds the remaining refundable amount (${refundable})`);
      }

      const refundTransaction = await tx.transaction.create({
        data: {
          paymentIntentId: intent.id,
          type: TransactionType.REFUND,
          railId: originalTransaction.railId,
          amount,
          status: TransactionStatus.PENDING,
        },
      });
      return { intent, originalTransaction, refundTransaction };
    });

    const rail = this.railRegistry.get(reservation.originalTransaction.railId as any);
    let result;
    try {
      result = await rail.refund({
        railReference: reservation.originalTransaction.railReference!,
        amount: reservation.refundTransaction.amount,
        reason: dto.reason,
        idempotencyKey: `refund_${createHash("sha256").update(`${merchantId}:${idempotencyKey}`).digest("hex")}`,
      });
    } catch (error) {
      await this.prisma.transaction.update({
        where: { id: reservation.refundTransaction.id },
        data: {
          status: TransactionStatus.FAILED,
          rawResponse: { error: "provider_request_failed" },
        },
      });
      throw error;
    }

    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });
      const status = result.status === "succeeded" ? TransactionStatus.SUCCEEDED : TransactionStatus.FAILED;
      const refundTransaction = await tx.transaction.update({
        where: { id: reservation.refundTransaction.id },
        data: {
          status,
          railReference: result.railReference,
          rawResponse: result.raw as Prisma.InputJsonValue,
        },
      });

      if (status === TransactionStatus.SUCCEEDED) {
        const lines = this.ledger.buildRefundJournal({
          merchantId,
          transactionId: refundTransaction.id,
          amount: refundTransaction.amount,
          settlementMode: merchant.settlementMode,
        });
        await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), lines, reservation.intent.currency);
        await this.webhooks.enqueueEvent(tx, merchantId, "refund.succeeded", {
          paymentIntentId: reservation.intent.id,
          amount: refundTransaction.amount,
        });
      }

      return refundTransaction;
    });
  }
}
