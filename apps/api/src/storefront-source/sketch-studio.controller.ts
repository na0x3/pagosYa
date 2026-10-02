import { Body, Controller, Get, Header, Put, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsDefined, IsInt, Min } from 'class-validator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { CompileBudget, MerchantThrottlerGuard } from './source-compile-budget';
import { SketchStudioService } from './sketch-studio.service';

class UpdateSketchDto {
  @IsInt() @Min(1) revision!: number;
  /** Intentionally untyped: repairSketch is the validator and never rejects. */
  @IsDefined() sketch!: unknown;
}

@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project')
export class SketchStudioController {
  constructor(private readonly sketches: SketchStudioService) {}

  @Get('sketch')
  @Header('Cache-Control', 'private, no-store')
  get(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    return this.sketches.get(merchant.id, storeId);
  }

  @Put('sketch')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @CompileBudget()
  update(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() body: UpdateSketchDto) {
    return this.sketches.update(merchant.id, storeId, body);
  }
}
