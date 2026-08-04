import { Injectable } from "@nestjs/common";
import { Prisma, PaymentMethodType } from "@prisma/client";

@Injectable()
export class PaymentMethodsService {
  /** Idempotent by (merchant, token): re-confirming with the same test token reuses the same row. */
  async findOrCreate(
    tx: Prisma.TransactionClient,
    merchantId: string,
    input: { type: PaymentMethodType; token: string; metadata?: Record<string, unknown> },
  ) {
    return tx.paymentMethod.upsert({
      where: { merchantId_token: { merchantId, token: input.token } },
      update: {},
      create: {
        merchantId,
        type: input.type,
        token: input.token,
        last4: input.token.slice(-4),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
