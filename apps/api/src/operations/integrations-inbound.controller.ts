import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { InboundStockSyncDto, InboundSubscriptionSyncDto } from "./dto/operations.dto";
import { IntegrationsService } from "./integrations.service";

@ApiTags("integrations")
// Every call runs argon2.verify on the connection secret: a cap keeps a known connection id from burning CPU.
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller("v1/integrations")
export class IntegrationsInboundController {
  constructor(private readonly integrations: IntegrationsService) {}
  @Post(":id/ping")
  verifyConnection(@Param("id") id: string, @Headers("x-pagosya-sync-secret") headerSecret: string | undefined, @Headers("authorization") authorization: string | undefined) {
    return this.integrations.verifyIntegrationInbound(id, this.secret(headerSecret, authorization));
  }

  @Post(":id/stock")
  syncStock(@Param("id") id: string, @Headers("x-pagosya-sync-secret") headerSecret: string | undefined, @Headers("authorization") authorization: string | undefined, @Body() dto: InboundStockSyncDto) {
    return this.integrations.syncStockInbound(id, this.secret(headerSecret, authorization), dto);
  }

  @Post(":id/subscriptions")
  syncSubscriptions(@Param("id") id: string, @Headers("x-pagosya-sync-secret") headerSecret: string | undefined, @Headers("authorization") authorization: string | undefined, @Body() dto: InboundSubscriptionSyncDto) {
    return this.integrations.syncSubscriptionsInbound(id, this.secret(headerSecret, authorization), dto);
  }

  private secret(headerSecret: string | undefined, authorization: string | undefined): string {
    return headerSecret || (authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "");
  }
}
