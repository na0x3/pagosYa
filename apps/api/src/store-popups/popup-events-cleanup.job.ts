import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Popups 2.0 part 2 (spec 2026-11-21 §4): shopper events are kept 180 days. */
@Injectable()
export class PopupEventsCleanupJob {
  constructor(private readonly prisma: PrismaService) {}
  @Cron('45 3 * * *', { name: 'popup-events-cleanup', timeZone: 'America/La_Paz' })
  async nightly() { await this.run(); }
  async run(now = Date.now()) {
    const { count } = await this.prisma.storePopupEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 180 * 86_400_000) } } });
    return count;
  }
}
