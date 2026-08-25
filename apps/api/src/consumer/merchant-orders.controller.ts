import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { ConsumerService } from "./consumer.service";
import { UpdateOrderFulfillmentDto } from "./dto/update-order-fulfillment.dto";

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/orders")
export class MerchantOrdersController {
  constructor(private readonly consumers: ConsumerService) {}

  @Patch(":id/fulfillment")
  updateFulfillment(
    @CurrentMerchant() merchant: { id: string },
    @Param("id") id: string,
    @Body() dto: UpdateOrderFulfillmentDto,
  ) {
    return this.consumers.updateOrderStatus(merchant.id, id, dto.status);
  }
}
