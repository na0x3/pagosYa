import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SellingService } from './selling.service';

/** «La tienda que vende sola» (spec 2026-11-16): once a day, 04:00 La Paz. Only the replica that wins the transaction-scoped advisory
 *  lock runs (the payout batch's pattern: the lock holder stays open while the work runs on other pooled connections). */
@Injectable()
export class SellingJob {
  private readonly log = new Logger(SellingJob.name);
  constructor(private readonly prisma: PrismaService, private readonly selling: SellingService) {}

  @Cron('0 4 * * *', { name: 'daily-selling', timeZone: 'America/La_Paz' })
  async run(now = new Date()): Promise<void> {
    try {
      await this.prisma.$transaction(async tx => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('daily-selling')) AS locked`;
        if (!lock?.locked) return;
        await this.selling.runDaily(now);
      }, { timeout: 30 * 60_000, maxWait: 10_000 });
    } catch (error) { this.log.error(`daily selling run failed: ${String((error as Error)?.message ?? error)}`); }
  }
}
