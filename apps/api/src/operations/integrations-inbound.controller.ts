import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { InboundStockSyncDto, InboundSubscriptionSyncDto } from "./dto/operations.dto";
import { OperationsService } from "./operations.service";

@ApiTags("integrations")
@Controller("v1/integrations")
export class IntegrationsInboundController {
  constructor(private readonly operations: OperationsService) {}
  @Post(":id/ping")
  verifyConnection(@Param("id") id: string, @Headers("x-pagosya-sync-secret") headerSecret: string | undefined, @Headers("authorization") authorization: string | undefined) {
    return this.operations.verifyIntegrationInbound(id, this.secret(headerSecret, authorization));
  }

  @Post(":id/stock")
  syncStock(@Param("id") id: string, @Headers("x-pagosya-sync-secret") headerSecret: string | undefined, @Headers("authorization") authorization: string | undefined, @Body() dto: InboundStockSyncDto) {
    return this.operations.syncStockInbound(id, this.secret(headerSecret, authorization), dto);
  }

  @Post(":id/subscriptions")
  syncSubscriptions(@Param("id") id: string, @Headers("x-pagosya-sync-secret") headerSecret: string | undefined, @Headers("authorization") authorization: string | undefined, @Body() dto: InboundSubscriptionSyncDto) {
    return this.operations.syncSubscriptionsInbound(id, this.secret(headerSecret, authorization), dto);
  }

  private secret(headerSecret: string | undefined, authorization: string | undefined): string {
    return headerSecret || (authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "");
  }
}
