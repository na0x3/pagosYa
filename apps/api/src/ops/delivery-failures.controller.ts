import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { DeliveryFailuresService } from "./delivery-failures.service";

@ApiTags("ops")
@Controller("internal/delivery_failures")
export class DeliveryFailuresController {
  constructor(private readonly deliveryFailures: DeliveryFailuresService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  summary() {
    return this.deliveryFailures.summary();
  }
}
