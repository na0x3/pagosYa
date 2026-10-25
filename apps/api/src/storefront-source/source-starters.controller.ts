import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { SourceProjectRevisionDto } from './dto/save-source-project.dto';
import { CompileBudget, MerchantThrottlerGuard } from './source-compile-budget';
import { SourceStartersService } from './source-starters.service';

/** «Probar otro estilo» (spec 2026-10-24 §2): the next-best starters for a new store, and a rebuild from one of them. */
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project/starters')
export class SourceStartersController {
  constructor(private readonly starters: SourceStartersService) {}

  @Get('alternatives') @Header('Cache-Control', 'private, no-store')
  alternatives(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    return this.starters.alternatives(merchant.id, storeId);
  }

  @Post(':starterId')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @CompileBudget()
  swap(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('starterId') starterId: string, @Body() input: SourceProjectRevisionDto) {
    return this.starters.swap(merchant.id, storeId, starterId, input.revision);
  }
}
