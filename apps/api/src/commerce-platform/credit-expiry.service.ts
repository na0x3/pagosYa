import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentIntentsService } from '../payment-intents/payment-intents.service';
@Injectable()
export class CreditExpiryService {
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly payments: PaymentIntentsService) {}
  @Interval(60000)
  async releaseAbandoned() {
    if (this.running) return; this.running = true;
    try {
      const before = new Date(Date.now() - 30 * 60000);
      // Prisma stores UTC in timestamp-without-time-zone columns. Cast the ISO string explicitly.
      // Filter before limiting so pending QR payments cannot starve abandoned carts.
      const intents = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p.id FROM "PaymentIntent" p JOIN "StoreCreditReservation" r ON r."paymentIntentId" = p.id
        WHERE r.status = 'RESERVED' AND r."createdAt" < ${before.toISOString()}::timestamp
          AND p.status IN ('REQUIRES_PAYMENT_METHOD', 'REQUIRES_CONFIRMATION')
        ORDER BY r."createdAt" ASC LIMIT 100
      `;
      for (const intent of intents) await this.payments.cancelById(intent.id, before);
    } finally { this.running = false; }
  }
}
