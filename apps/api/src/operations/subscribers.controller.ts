import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { ListSubscribersQuery, SubscriberActionDto, SubscriptionSettingsDto } from "./dto/subscribers.dto";
import { SubscribersService } from "./subscribers.service";

type MerchantRequest = { merchant: { id: string } };

@ApiTags("subscriptions")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId/subscriptions")
export class SubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}
  @Get() list(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Query() query: ListSubscribersQuery) { return this.subscribers.list(req.merchant.id, storeId, query); }
  @Get("summary") summary(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.subscribers.summary(req.merchant.id, storeId); }
  @Put("settings") settings(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: SubscriptionSettingsDto) { return this.subscribers.setEnabled(req.merchant.id, storeId, dto.enabled, dto.membershipGraceDays); }
  @Post("products/:productId/reprice") reprice(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("productId") productId: string) { return this.subscribers.reprice(req.merchant.id, storeId, productId); }
  @Patch(":id") act(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: SubscriberActionDto) { return this.subscribers.act(req.merchant.id, storeId, id, dto.action); }
  @Post(":id/resend") resend(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string) { return this.subscribers.resend(req.merchant.id, storeId, id); }
}
