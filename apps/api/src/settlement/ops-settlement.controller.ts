import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { SettlementActor, SettlementAdminService } from "./settlement-admin.service";
import { SettlementOverridesDto } from "./dto/settlement-overrides.dto";
import { PlacePayoutHoldDto } from "./dto/place-payout-hold.dto";
import { ReserveSeizureDto } from "./dto/reserve-seizure.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal")
export class OpsSettlementController {
  constructor(private readonly admin: SettlementAdminService) {}

  @Get("merchants/:id/settlement") overview(@Param("id") id: string) { return this.admin.overview(id); }

  @Patch("merchants/:id/settlement")
  updateOverrides(@Param("id") id: string, @Body() dto: SettlementOverridesDto, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.updateOverrides(id, dto, actor);
  }

  @Post("merchants/:id/payout_hold")
  placeHold(@Param("id") id: string, @Body() dto: PlacePayoutHoldDto, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.placeHold(id, dto.reason, actor);
  }

  @Delete("merchants/:id/payout_hold")
  liftHold(@Param("id") id: string, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.liftHold(id, actor);
  }

  @Post("merchants/:id/reserve_seizures")
  seize(@Param("id") id: string, @Body() dto: ReserveSeizureDto, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.seize(id, dto, actor);
  }

  @Get("payout_holds") listHolds() { return this.admin.listHolds(); }
}
