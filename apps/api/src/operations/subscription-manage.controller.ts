import { Body, Controller, Get, Header, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { PublicSubscriptionActionDto } from "./dto/subscribers.dto";
import { SubscribersService } from "./subscribers.service";

@ApiTags("subscriptions")
@Controller("v1/subscriptions/public/:token")
export class SubscriptionManageController {
  constructor(private readonly subscribers: SubscribersService) {}
  @Get() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Header("Cache-Control", "no-store")
  view(@Param("token") token: string) { return this.subscribers.publicView(token); }
  @Post("actions") @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Header("Cache-Control", "no-store")
  act(@Param("token") token: string, @Body() dto: PublicSubscriptionActionDto) { return this.subscribers.publicAct(token, dto); }
}
