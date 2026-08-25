import { Controller, Get, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { ConsumerService } from "./consumer.service";

@ApiTags("order-tracking")
@Controller("v1/orders/track")
export class OrderTrackingController {
  constructor(private readonly consumers: ConsumerService) {}

  @Get(":token")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  track(@Param("token") token: string) {
    return this.consumers.trackOrder(token);
  }
}
