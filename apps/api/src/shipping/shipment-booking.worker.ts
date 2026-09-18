import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentsService, errorText } from './shipments.service';

@Injectable()
export class ShipmentBookingWorker {
  private readonly logger = new Logger(ShipmentBookingWorker.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly shipments: ShipmentsService) {}

  @Interval('shipment-booking', 30_000)
  async run() { await this.tick().catch(error => this.logger.error(`Shipment booking failed: ${errorText(error)}`)); }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.shipment.findMany({ where: { status: 'BOOKING', nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: 'asc' }, take: 20, select: { id: true } });
      // One bad shipment must not stop the others in this tick.
      for (const { id } of due) {
        try { await this.shipments.book(id); } catch (error) { this.logger.error(`Shipment ${id} booking failed: ${errorText(error)}`); }
      }
      return due.length;
    } finally { this.running = false; }
  }
}
