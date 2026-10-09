import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ProductPageWriterService } from './product-page-writer.service';

@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/products/:productId/page')
export class ProductPageController {
  constructor(private readonly writer: ProductPageWriterService, private readonly prisma: PrismaService) {}

  /** Rewrites YAPI's own sections for one product; the merchant's edits stay. */
  @Post('regenerate')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async regenerate(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('productId') productId: string) {
    await this.writer.fill(storeId, productId, 'regenerate', merchant.id);
    return this.prisma.paymentLink.findFirstOrThrow({ where: { id: productId, storeId, store: { merchantId: merchant.id } }, select: { highlights: true, contentBlocks: true } });
  }
}
