import { Body, Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { LimitsAdmin, LimitsAdminService } from "./limits-admin.service";
import { UpdatePolicyDto } from "./dto/update-policy.dto";
import { UpdateLimitSettingsDto } from "./dto/update-settings.dto";
import { MerchantLimitsDto } from "./dto/merchant-limits.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal")
export class OpsLimitsController {
  constructor(private readonly admin: LimitsAdminService) {}

  @Get("limits/policies") policies() { return this.admin.listPolicies(); }

  @Patch("limits/policies/:level")
  updatePolicy(@Param("level", ParseIntPipe) level: number, @Body() dto: UpdatePolicyDto, @CurrentOpsUser() actor: LimitsAdmin) {
    return this.admin.updatePolicy(level, dto, actor);
  }

  @Get("limits/settings") settings() { return this.admin.getSettings(); }

  @Patch("limits/settings")
  updateSettings(@Body() dto: UpdateLimitSettingsDto, @CurrentOpsUser() actor: LimitsAdmin) {
    return this.admin.updateSettings(dto.usdToBobRate, actor);
  }

  @Get("limits/near_limit") nearLimit() { return this.admin.nearLimit(); }

  @Patch("merchants/:id/limits")
  updateMerchant(@Param("id") id: string, @Body() dto: MerchantLimitsDto, @CurrentOpsUser() actor: LimitsAdmin) {
    return this.admin.updateMerchant(id, dto, actor);
  }
}
