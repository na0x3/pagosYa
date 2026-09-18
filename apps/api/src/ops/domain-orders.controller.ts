import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentOpsUser } from "./decorators/current-ops-user.decorator";
import { DomainOrderActionDto } from "./dto/domain-order-action.dto";
import { DomainOrdersService } from "./domain-orders.service";
import { OpsAuthGuard } from "./guards/ops-auth.guard";
import { SupportActor } from "./support.service";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/domain_orders")
export class DomainOrdersController {
  constructor(private readonly domainOrders: DomainOrdersService) {}

  @Get()
  list(@Query("query") query?: string) {
    return this.domainOrders.list(query);
  }

  @Get(":id")
  dossier(@Param("id") id: string) {
    return this.domainOrders.dossier(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string, @Body() dto: DomainOrderActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.domainOrders.retry(id, dto.reason, actor);
  }

  @Post(":id/reconcile")
  reconcile(@Param("id") id: string, @Body() dto: DomainOrderActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.domainOrders.markReconciled(id, dto.reason, actor);
  }
}
