import { Body, Controller, Get, Header, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { SellingService } from './selling.service';

/** «Tu tienda esta semana» and «Mejora automática» (spec 2026-11-16). */
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/selling')
export class SellingController {
  constructor(private readonly selling: SellingService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  summary(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) { return this.selling.summary(merchant.id, storeId); }
  @Post(':changeId/undo')
  undo(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('changeId') changeId: string) { return this.selling.undo(merchant.id, storeId, changeId); }
  @Patch()
  set(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: { autoImprove?: unknown }) {
    return this.selling.setAutoImprove(merchant.id, storeId, body?.autoImprove === true);
  }
}
