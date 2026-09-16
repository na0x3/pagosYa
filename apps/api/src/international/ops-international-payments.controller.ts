import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { SupportActor } from "../ops/support.service";
import { InternationalActionDto } from "./dto/international-action.dto";
import { InternationalPaymentsService } from "./international-payments.service";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/international_payments")
export class OpsInternationalPaymentsController {
  constructor(private readonly international: InternationalPaymentsService) {}

  @Get()
  list() {
    return this.international.listRequests();
  }

  @Post(":merchantId/approve")
  approve(@Param("merchantId") merchantId: string, @Body() dto: InternationalActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.international.decide(merchantId, "approve", dto.reason, actor);
  }

  @Post(":merchantId/reject")
  reject(@Param("merchantId") merchantId: string, @Body() dto: InternationalActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.international.decide(merchantId, "reject", dto.reason, actor);
  }
}
