import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { AbandonedCartsService, type AbandonedCartDays } from './abandoned-carts.service';

class AbandonedCartsQuery { @IsOptional() @IsIn(['7', '30']) days?: string; }

@Controller('v1/stores/:storeId/abandoned-carts')
@UseGuards(MerchantAuthGuard)
export class AbandonedCartsController {
  constructor(private readonly carts: AbandonedCartsService) {}
  /** Crecer › Carritos abandonados: who left with what, newest first, and how many anonymous sessions did too. */
  @Get() list(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Query() q: AbandonedCartsQuery) {
    return this.carts.list(m.id, id, Number(q.days || 7) as AbandonedCartDays);
  }
}
