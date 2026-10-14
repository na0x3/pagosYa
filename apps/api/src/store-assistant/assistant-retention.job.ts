import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_MS = 90 * 24 * 3_600_000;
const BATCH_SIZE = 1000;
const MAX_BATCHES = 200;
const LOCK_TIMEOUT_MS = 120_000;

/** Conversations older than 90 days are deleted; unanswered questions (no contact details) stay. Every replica runs it; the advisory lock lets one through. */
@Injectable()
export class AssistantRetentionJob {
  private readonly logger = new Logger(AssistantRetentionJob.name);
  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 3 * * *', { name: 'assistant-retention', timeZone: 'America/La_Paz' })
  async run(now = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('assistant-retention')) AS locked`;
      if (!lock?.locked) return;
      const cutoff = new Date(now.getTime() - RETENTION_MS);
      let deleted = 0;
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const rows = await tx.assistantConversation.findMany({ where: { lastMessageAt: { lt: cutoff } }, select: { id: true }, take: BATCH_SIZE });
        if (rows.length) {
          await tx.assistantConversation.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
          deleted += rows.length;
        }
        if (rows.length < BATCH_SIZE) break;
      }
      if (deleted) this.logger.log(`deleted ${deleted} assistant conversations older than 90 days`);
    }, { timeout: LOCK_TIMEOUT_MS });
  }
}
