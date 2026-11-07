import { Prisma } from "@prisma/client";
import { complaintYear } from "./complaint-dates";

export function formatComplaintNumber(year: number, n: number): string {
  return `R-${year}-${String(n).padStart(6, "0")}`;
}

/** One atomic upsert: concurrent filings each get their own number, and a rolled-back filing gives its number back. */
export async function nextComplaintNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = complaintYear(now);
  const [row] = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "ComplaintCounter" ("year", "last") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "last" = "ComplaintCounter"."last" + 1
    RETURNING "last"`;
  return formatComplaintNumber(year, Number(row.last));
}
