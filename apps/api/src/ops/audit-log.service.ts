import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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
    return this.prisma.auditLogEntry.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
}
