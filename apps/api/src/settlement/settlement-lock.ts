import { Prisma } from "@prisma/client";

/**
 * Serialises release, refund drawdown, seizure and the daily payout check-and-create per merchant, so two of them
 * never spend the same held money.
 *
 * Only correct at READ COMMITTED (Postgres's and Prisma's default): each statement after the lock takes a fresh
 * snapshot, so it sees what the previous lock holder committed. Callers must not run release, refund or seizure in a
 * RepeatableRead or Serializable transaction — there the snapshot is taken at the transaction's first query, which
 * can predate the lock, and the balances read after it would be stale.
 */
export async function lockMerchantSettlement(tx: Prisma.TransactionClient, merchantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${merchantId}`}))`;
}
