import { queueStoreEmail } from '../email-workspace/email-workspace.config';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentIntentStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RailRegistry } from "../rails/rail-registry.service";
import { LedgerService } from "../ledger/ledger.service";
import { WebhookDispatcherService } from "../webhooks/webhook-dispatcher.service";
import { CreateRefundDto } from "./dto/create-refund.dto";
import type { DlocalConfig } from "../config/configuration";
import { pricingForRail } from "../international/fx";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import type { DlocalRefundNotification } from "../rails/adapters/dlocal/dlocal.types";
import { ShipmentsService } from "../shipping/shipments.service";
import { emitStoreEvent } from "../extensions/store-events";

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly railRegistry: RailRegistry,
    private readonly ledger: LedgerService,
    private readonly webhooks: WebhookDispatcherService,
    private readonly config: ConfigService,
    private readonly shipments: ShipmentsService,
  ) {}

  async create(merchantId: string, dto: CreateRefundDto, idempotencyKey?: string) {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("A valid Idempotency-Key header (8-128 characters) is required for refunds");
    }

    const reservation = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; amount: number; currency: string; status: PaymentIntentStatus; livemode: boolean; customerEmail: string | null; customerName: string | null; metadata?: { platformPurchase?: string } }>
      >`
        SELECT id, amount, currency, status, livemode, "customerEmail", "customerName", metadata FROM "PaymentIntent"
        WHERE id = ${dto.paymentIntentId} AND "merchantId" = ${merchantId}
        FOR UPDATE
      `;
      const intent = rows[0];
      if (!intent) throw new NotFoundException("PaymentIntent not found");
      if (intent.status !== PaymentIntentStatus.SUCCEEDED) {
        throw new BadRequestException("Only succeeded PaymentIntents can be refunded");
      }
      if (intent.metadata?.platformPurchase === 'domain') {
        const domain = await tx.domainOrder.findUnique({ where: { paymentIntentId: intent.id } });
        if (domain?.registrationStartedAt) throw new BadRequestException('El registro de este dominio ya comenzó. Soporte debe conciliarlo con el registrador antes de reembolsar.');
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
      // A pending rail refund (dLocal) keeps its reservation and is settled by the
      // refund notification; only a definite outcome moves money in the ledger now.
      const status =
        result.status === "succeeded" ? TransactionStatus.SUCCEEDED
        : result.status === "pending" ? TransactionStatus.PENDING
        : TransactionStatus.FAILED;
      const refundTransaction = await tx.transaction.update({
        where: { id: reservation.refundTransaction.id },
        data: {
          status,
          railReference: result.railReference,
          rawResponse: result.raw as Prisma.InputJsonValue,
        },
      });

      if (status === TransactionStatus.SUCCEEDED) {
        await this.postSucceededRefund(tx, {
          merchantId,
          intent: reservation.intent,
          refundTransaction,
          railId: reservation.originalTransaction.railId,
        });
      }

      return refundTransaction;
    });
  }

  /**
   * Resolves a refund that dLocal accepted asynchronously. The refund row is found
   * by dLocal's refund id, or, for a refund whose request timed out, by the
   * `refund:<paymentId>` placeholder when exactly one is pending. Anything that
   * can't be matched safely, or contradicts what we recorded, goes to ops.
   */
  async applyDlocalRefundNotification(notification: DlocalRefundNotification): Promise<"applied" | "pending" | "duplicate" | "ignored" | "escalated"> {
    const refundId = notification.id;
    const paymentId = notification.payment_id;
    const outcome = notification.status;
    if (!refundId || !paymentId) {
      this.logger.warn(`dLocal refund notification without refund id or payment id (${refundId ?? "?"} / ${paymentId ?? "?"}); ignoring`);
      return "ignored";
    }
    const bound = { ...notification, id: refundId, payment_id: paymentId };

    let row = await this.prisma.transaction.findFirst({
      where: { type: TransactionType.REFUND, railId: "dlocal", railReference: refundId },
    });
    if (!row) {
      const timedOut = await this.prisma.transaction.findMany({
        where: { type: TransactionType.REFUND, railId: "dlocal", railReference: `refund:${paymentId}`, status: TransactionStatus.PENDING },
        take: 2,
      });
      const inFlight = timedOut.length === 0 && await this.prisma.transaction.findFirst({
        where: {
          type: TransactionType.REFUND, railId: "dlocal", railReference: null, status: TransactionStatus.PENDING,
          paymentIntent: { transactions: { some: { type: TransactionType.AUTHORIZATION, railId: "dlocal", railReference: paymentId } } },
        },
        select: { id: true },
      });
      if (inFlight) {
        // The refund request is still being recorded (dLocal answered and notified
        // before our write committed). A non-2xx makes dLocal deliver it again.
        throw new ConflictException("dLocal refund is still being recorded; retry later");
      }
      if (timedOut.length === 1) {
        row = timedOut[0];
      } else if (timedOut.length > 1) {
        return this.escalateRefund(bound, null, "hay varios reembolsos pendientes sin respuesta para este pago");
      } else if (outcome === "SUCCESS") {
        return this.escalateRefund(bound, null, "no corresponde a ningún reembolso registrado");
      } else {
        this.logger.warn(`dLocal refund ${refundId} (${outcome}) for payment ${paymentId} matches no recorded refund; ignoring`);
        return "ignored";
      }
    }
    const refundRow = row;

    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: refundRow.paymentIntentId },
      select: { id: true, merchantId: true, livemode: true, amount: true, currency: true, customerEmail: true, customerName: true },
    });
    const payment = await this.prisma.transaction.findFirst({
      where: { paymentIntentId: intent.id, type: TransactionType.AUTHORIZATION, railId: "dlocal", railReference: paymentId },
    });
    if (!payment) return this.escalateRefund(bound, intent.merchantId, `el pago no coincide con el cobro ${intent.id}`);
    if (notification.amount !== undefined && Math.round(Number(notification.amount) * 100) !== refundRow.amount) {
      return this.escalateRefund(bound, intent.merchantId, `el monto no coincide con el reembolso registrado (${refundRow.amount} centavos)`);
    }
    if (notification.currency !== undefined && notification.currency !== intent.currency) {
      return this.escalateRefund(bound, intent.merchantId, `la moneda no coincide con el cobro (${intent.currency})`);
    }

    const decision = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: TransactionStatus }[]>`
        SELECT status FROM "Transaction" WHERE id = ${refundRow.id} FOR UPDATE
      `;
      const current = locked[0]?.status;
      const raw = notification as unknown as Prisma.InputJsonValue;
      if (outcome === "SUCCESS") {
        if (current === TransactionStatus.SUCCEEDED) return "duplicate" as const;
        if (current !== TransactionStatus.PENDING) return "conflict" as const;
        const refundTransaction = await tx.transaction.update({
          where: { id: refundRow.id },
          data: { status: TransactionStatus.SUCCEEDED, railReference: refundId, rawResponse: raw },
        });
        await this.postSucceededRefund(tx, { merchantId: intent.merchantId, intent, refundTransaction, railId: refundRow.railId });
        return "applied" as const;
      }
      if (outcome === "REJECTED") {
        if (current === TransactionStatus.FAILED) return "duplicate" as const;
        if (current !== TransactionStatus.PENDING) return "conflict" as const;
        await tx.transaction.update({
          where: { id: refundRow.id },
          data: { status: TransactionStatus.FAILED, railReference: refundId, rawResponse: raw },
        });
        return "applied" as const;
      }
      if (current === TransactionStatus.PENDING && refundRow.railReference !== refundId) {
        await tx.transaction.update({ where: { id: refundRow.id }, data: { railReference: refundId } });
      }
      return "pending" as const;
    });

    if (decision === "conflict") {
      return this.escalateRefund(bound, intent.merchantId, `contradice el estado ya registrado del reembolso ${refundRow.id}`);
    }
    return decision;
  }

  private async escalateRefund(notification: DlocalRefundNotification & { id: string; payment_id: string }, merchantId: string | null, reason: string): Promise<"escalated"> {
    const message = `dLocal refund ${notification.id} (${notification.status}) for payment ${notification.payment_id} could not be applied: ${reason}`;
    this.logger.error(message);
    const owner = merchantId ?? (await this.prisma.transaction.findFirst({
      where: { type: TransactionType.AUTHORIZATION, railId: "dlocal", railReference: notification.payment_id },
      select: { paymentIntent: { select: { merchantId: true } } },
    }))?.paymentIntent.merchantId;
    if (!owner) {
      this.logger.error(`No merchant found for dLocal refund ${notification.id}; needs manual review without a support case`);
      return "escalated";
    }
    await openOpsCaseOnce(this.prisma, {
      merchantId: owner,
      dedupeKey: notification.id,
      summary: `Reembolso internacional dLocal ${notification.id} (pago ${notification.payment_id}, estado ${notification.status}): ${reason}. Conciliar con dLocal.`,
    });
    return "escalated";
  }

  /** Ledger, merchant webhook and store mail for a refund whose money has left. */
  private async postSucceededRefund(
    tx: Prisma.TransactionClient,
    params: {
      merchantId: string;
      intent: { id: string; livemode: boolean; amount: number; currency: string; customerEmail: string | null; customerName: string | null };
      refundTransaction: { id: string; amount: number };
      railId: string;
    },
  ) {
    const { merchantId, intent, refundTransaction } = params;
    const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const order = tx.storeOrder?.findUnique ? await tx.storeOrder.findUnique({ where: { paymentIntentId: intent.id } }) : null;
    if (intent.livemode && order) await queueStoreEmail(tx,order.storeId,'REFUND',refundTransaction.id,intent.customerEmail,{store:order.storeName,order:order.id,customer:intent.customerName || 'cliente',amount:`${(refundTransaction.amount/100).toFixed(2)} ${intent.currency}`});
    if (order) {
      // A full refund stops the order's shipment (spec flow 4); a partial refund leaves it alone.
      const refunded = await tx.transaction.aggregate({
        where: { paymentIntentId: intent.id, type: TransactionType.REFUND, status: TransactionStatus.SUCCEEDED },
        _sum: { amount: true },
      });
      if ((refunded._sum.amount ?? 0) >= intent.amount) await this.shipments.cancelForOrder(tx, order.id);
    }
    const lines = this.ledger.buildRefundJournal({
      merchantId,
      transactionId: refundTransaction.id,
      amount: refundTransaction.amount,
      settlementMode: merchant.settlementMode,
      pricing: pricingForRail(params.railId, this.config.get<DlocalConfig>("app.dlocal")!),
    });
    await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), lines, intent.currency);
    await this.webhooks.enqueueEvent(tx, merchantId, "refund.succeeded", {
      paymentIntentId: intent.id,
      amount: refundTransaction.amount,
    });
    if (order) await emitStoreEvent(tx, order.storeId, "refund.succeeded", { paymentIntentId: intent.id, orderId: order.id, amount: refundTransaction.amount });
  }
}
