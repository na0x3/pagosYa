import { Prisma } from "@prisma/client";

/** Serialises release, refund drawdown and seizure per merchant, so two of them never spend the same held money. */
export async function lockMerchantSettlement(tx: Prisma.TransactionClient, merchantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${merchantId}`}))`;
}
