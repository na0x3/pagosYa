import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentIntentStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
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

  async create(merchantId: string, dto: CreateRefundDto) {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { id: dto.paymentIntentId, merchantId },
      include: { transactions: { where: { type: TransactionType.AUTHORIZATION, status: TransactionStatus.SUCCEEDED } } },
    });
    if (!intent) throw new NotFoundException("PaymentIntent not found");
    if (intent.status !== PaymentIntentStatus.SUCCEEDED) {
      throw new BadRequestException("Only succeeded PaymentIntents can be refunded");
    }
    const originalTransaction = intent.transactions[0];
    if (!originalTransaction?.railReference) {
      throw new BadRequestException("PaymentIntent has no settled transaction to refund");
    }

    const amount = dto.amount ?? intent.amount;
    if (amount > intent.amount) {
      throw new BadRequestException("Refund amount cannot exceed the original PaymentIntent amount");
    }

    const rail = this.railRegistry.get(originalTransaction.railId as any);
    const result = await rail.refund({
      railReference: originalTransaction.railReference,
      amount,
      reason: dto.reason,
      idempotencyKey: `refund_${intent.id}_${amount}`,
    });

    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });

      const refundTransaction = await tx.transaction.create({
        data: {
          paymentIntentId: intent.id,
          type: TransactionType.REFUND,
          railId: originalTransaction.railId,
          amount,
          status: result.status === "succeeded" ? TransactionStatus.SUCCEEDED : TransactionStatus.FAILED,
          railReference: result.railReference,
          rawResponse: result.raw as Prisma.InputJsonValue,
        },
      });

      if (result.status === "succeeded") {
        const lines = this.ledger.buildRefundJournal({
          merchantId,
          transactionId: refundTransaction.id,
          amount,
          settlementMode: merchant.settlementMode,
        });
        await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), lines, intent.currency);
        await this.webhooks.enqueueEvent(tx, merchantId, "refund.succeeded", {
          paymentIntentId: intent.id,
          amount,
        });
      }

      return refundTransaction;
    });
  }
}
