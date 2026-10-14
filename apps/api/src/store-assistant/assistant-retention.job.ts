import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_MS = 90 * 24 * 3_600_000;

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
      const { count } = await tx.assistantConversation.deleteMany({ where: { lastMessageAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
      if (count) this.logger.log(`deleted ${count} assistant conversations older than 90 days`);
    });
  }
}
