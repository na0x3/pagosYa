import { Injectable } from "@nestjs/common";
import { Prisma, PaymentMethodType } from "@prisma/client";
import { createHash } from "node:crypto";

@Injectable()
export class PaymentMethodsService {
  /** Idempotent by (merchant, token): re-confirming with the same test token reuses the same row. */
  async findOrCreate(
    tx: Prisma.TransactionClient,
    merchantId: string,
    input: { type: PaymentMethodType; token: string; metadata?: Record<string, unknown> },
  ) {
    // Provider tokens are bearer-like credentials. Persist a one-way stable
    // fingerprint for deduplication, never the replayable token itself.
    const tokenFingerprint = `sha256:${createHash("sha256").update(input.token).digest("hex")}`;
    return tx.paymentMethod.upsert({
      where: { merchantId_token: { merchantId, token: tokenFingerprint } },
      update: {},
      create: {
        merchantId,
        type: input.type,
        token: tokenFingerprint,
        last4: input.token.slice(-4),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
