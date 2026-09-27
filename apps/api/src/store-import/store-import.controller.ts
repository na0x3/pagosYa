import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { ConfirmImportDto, ShopifyCsvDto, ShopifyUrlDto } from './dto';
import { StoreImportService } from './store-import.service';

class DesignDto { @IsIn(['same', 'redesign']) option!: 'same' | 'redesign'; }

@Controller('v1/store-imports') @UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
export class StoreImportController {
  constructor(private readonly imports: StoreImportService) {}
  @Post('shopify') @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  shopify(@CurrentMerchant() m: { id: string }, @Body() dto: ShopifyUrlDto) { return this.imports.previewUrl(m.id, dto.url); }
  @Post('shopify-csv') @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  csv(@CurrentMerchant() m: { id: string }, @Body() dto: ShopifyCsvDto) { return this.imports.previewCsv(m.id, dto.csv, dto.name, dto.host); }
  @Get(':id') get(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.imports.get(m.id, id); }
  @Post(':id/confirm') confirm(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: ConfirmImportDto) { return this.imports.confirm(m.id, id, dto); }
  @Post(':id/retry') retry(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.imports.retry(m.id, id); }
  @Post(':id/design') design(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: DesignDto) { return this.imports.requestDesign(m.id, id, dto.option); }
}
