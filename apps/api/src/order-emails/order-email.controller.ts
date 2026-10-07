import { Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { EmailProvider } from '../dashboard/interfaces/email-provider.interface';
import { EMAIL_PROVIDER } from '../dashboard/tokens';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { OrderEmailService } from './order-email.service';

/**
 * Lets a merchant read the email their buyers receive before a real buyer does, and
 * mail themselves a copy. Both routes sit under the source-project prefix beside
 * SketchStudioController, because what they preview is part of the authored store.
 */
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project')
export class OrderEmailController {
  constructor(
    private readonly orderEmail: OrderEmailService,
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  /**
   * Scoped to the caller, never `findUnique` by id: a store's authored email carries its
   * brand, and the id is in the URL where any authenticated merchant could put someone
   * else's. A store the caller does not own is indistinguishable from one that is absent.
   */
  private async ownedStore(merchantId: string, storeId: string): Promise<{ name: string }> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  @Get('order-email/preview')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async preview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    const store = await this.ownedStore(merchant.id, storeId);
    return this.orderEmail.renderForStore(storeId, this.orderEmail.sampleData(store.name));
  }

  /**
   * The address comes from the authenticated session and nothing else — never the body,
   * or this becomes a way to mail arbitrary people from the store's own sender. A secret
   * key authenticates a merchant but carries no dashboard user, so it has no address and
   * is refused rather than defaulted to something.
   */
  @Post('order-email/test-send')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async testSend(
    @CurrentMerchant() merchant: { id: string },
    @Param('storeId') storeId: string,
    @Req() req: { merchantUser?: { email?: string } },
  ) {
    const store = await this.ownedStore(merchant.id, storeId);
    const to = req.merchantUser?.email;
    if (!to) throw new ForbiddenException('Sign in to the dashboard to send yourself a test');

    const { html } = await this.orderEmail.renderForStore(storeId, this.orderEmail.sampleData(store.name));
    await this.email.send({
      to,
      subject: `Prueba · Recibo de tu compra en ${store.name}`,
      // Sent with every message, and the only thing a client without HTML will show.
      body: `Esta es una vista previa del correo que recibe tu cliente después de pagar en ${store.name}.\n\nLos datos de la orden son de ejemplo.`,
      html,
    });
    return { sent: true };
  }
}
