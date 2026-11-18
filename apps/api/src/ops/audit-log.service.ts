import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** An entry as JSON: its chain number is a BigInt, which JSON cannot carry. */
export const auditEntryJson = <T extends { seq: bigint }>(entry: T) => ({ ...entry, seq: String(entry.seq) });

export interface AuditLogEntryInput {
  actorType: string;
  actorId: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Written inside the same transaction as the action it records — an audit entry that can vanish on rollback isn't one you can trust. */
  async record(tx: Prisma.TransactionClient, entry: AuditLogEntryInput): Promise<void> {
    await tx.auditLogEntry.create({
      data: { ...entry, metadata: entry.metadata as Prisma.InputJsonValue | undefined },
    });
  }

  async list(limit = 50) {
    return (await this.prisma.auditLogEntry.findMany({ orderBy: { createdAt: "desc" }, take: limit })).map(auditEntryJson);
  }

  /**
   * Recomputes the whole hash chain in the database (ISO M-04): each entry's hash from its own fields and the previous
   * hash, with the same SQL function the insert trigger uses. `head` is the value to keep outside the database each day;
   * a later run that no longer reaches it means history was rewritten.
   */
  async verify(): Promise<{ ok: boolean; entries: number; head: { seq: string; hash: string } | null; firstBrokenSeq: string | null }> {
    const [row] = await this.prisma.$queryRaw<Array<{ entries: bigint; first_broken: bigint | null; head_seq: bigint | null; head_hash: string | null }>>`
      WITH chain AS (
        SELECT e."seq", e."hash", e."prevHash",
               audit_log_entry_hash(e."prevHash", e) AS computed,
               coalesce(lag(e."hash") OVER (ORDER BY e."seq"), 'genesis') AS expected_prev
        FROM "AuditLogEntry" e
      )
      SELECT count(*) AS entries,
             min("seq") FILTER (WHERE "hash" <> computed OR "prevHash" <> expected_prev) AS first_broken,
             (SELECT "seq" FROM chain ORDER BY "seq" DESC LIMIT 1) AS head_seq,
             (SELECT "hash" FROM chain ORDER BY "seq" DESC LIMIT 1) AS head_hash
      FROM chain`;
    return {
      ok: row.first_broken === null,
      entries: Number(row.entries),
      head: row.head_seq === null ? null : { seq: String(row.head_seq), hash: row.head_hash! },
      firstBrokenSeq: row.first_broken === null ? null : String(row.first_broken),
    };
  }
}
