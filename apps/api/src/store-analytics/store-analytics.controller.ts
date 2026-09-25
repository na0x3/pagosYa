import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StoreAnalyticsService } from './store-analytics.service';

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
