import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { FUNNEL_EVENTS, StoreFunnelService, type FunnelEvent } from './store-funnel.service';
class FunnelInput {
  @IsUUID('4') sessionId!: string;
  @IsIn(FUNNEL_EVENTS) event!: FunnelEvent;
  @IsOptional() @IsIn(['delivery', 'pickup']) method?: 'delivery' | 'pickup';
}
@Controller('v1/stores/public/:slug/funnel')
export class StoreFunnelController {
  constructor(private readonly funnel: StoreFunnelService) {}
  @Post() @Throttle({ default: { limit: 60, ttl: 60000 } })
  record(@Param('slug') slug: string, @Body() body: FunnelInput) { return this.funnel.record(slug, body.sessionId, body.event, body.method); }
}
