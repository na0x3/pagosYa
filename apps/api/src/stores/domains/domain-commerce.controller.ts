import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MerchantAuthGuard } from '../../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../../auth/decorators/current-merchant.decorator';
import { DomainCommerceService } from './domain-commerce.service';
import { DomainCheckoutDto, DomainQuoteDto, DomainSearchDto } from './domain-commerce.dto';

@Controller('v1/stores/:storeId/domain-shop')
@UseGuards(MerchantAuthGuard)
@Throttle({ default: { limit: 15, ttl: 60_000 } })
export class DomainCommerceController {
  constructor(private readonly domains: DomainCommerceService) {}
  @Get() list(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string) { return this.domains.list(merchant.id, id); }
  @Post('search') search(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string, @Body() dto: DomainSearchDto) { return this.domains.search(merchant.id, id, dto.query); }
  @Post('quotes') quote(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string, @Body() dto: DomainQuoteDto) { return this.domains.quote(merchant.id, id, dto.hostname); }
  @Post('checkout') checkout(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string, @Body() dto: DomainCheckoutDto) { return this.domains.checkout(merchant.id, id, dto); }
  @Post('orders/:orderId/cancel') cancel(@CurrentMerchant() merchant: { id: string }, @Param('storeId') id: string, @Param('orderId') order: string) { return this.domains.cancel(merchant.id, id, order); }
}
