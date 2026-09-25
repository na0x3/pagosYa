import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { StoreAnalyticsService } from './store-analytics.service';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
class AnalyticsQuery {
  @IsOptional() @Matches(DAY) from?: string;
  @IsOptional() @Matches(DAY) to?: string;
  @IsOptional() @IsIn(['day']) granularity?: 'day';
}

/** Batched storefront events. The body is a plain object on purpose: it is normalised by hand so an unknown field
 * is dropped rather than refused, and one stale event does not lose its batch (see normalizeAnalyticsBatch). */
@Controller('v1/stores/public/:slug/events')
export class StoreAnalyticsPublicController {
  constructor(private readonly analytics: StoreAnalyticsService) {}
  @Post() @HttpCode(202) @Throttle({ default: { limit: 30, ttl: 60000 } })
  record(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @Headers('user-agent') userAgent?: string, @Headers('sec-gpc') gpc?: string) {
    return this.analytics.ingest(slug, body, { userAgent, gpc: gpc === '1' });
  }
}

/** The merchant's analytics for G2: totals, daily series, products, CTAs, devices, referrers, checkout drop-off. */
@Controller('v1/stores/:storeId/analytics')
@UseGuards(MerchantAuthGuard)
export class StoreAnalyticsController {
  constructor(private readonly analytics: StoreAnalyticsService) {}
  @Get()
  report(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query() query: AnalyticsQuery) {
    return this.analytics.report(merchant.id, storeId, query);
  }
}
