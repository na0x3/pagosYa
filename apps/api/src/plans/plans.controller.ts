import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MerchantSessionGuard } from '../dashboard/guards/merchant-session.guard';
import { OpsAuthGuard } from '../ops/guards/ops-auth.guard';
import { CurrentOpsUser } from '../ops/decorators/current-ops-user.decorator';
import { SupportService } from '../ops/support.service';
import { PLANS } from './plans';
import { GrantCreditsDto, PlanDto } from './plans.dto';
import { PlansService, type PlansAdmin } from './plans.service';

interface MerchantRequest { merchant: { id: string }; merchantUser: { id: string; email: string } }

/** The merchant's plan, its YAPI credits this month and the plans it can move to (Studio + panel). */
@ApiTags('dashboard-plan')
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller('v1/dashboard/plan')
export class DashboardPlanController {
  constructor(private readonly plans: PlansService, private readonly support: SupportService) {}

  @Get()
  async current(@Req() request: MerchantRequest) {
    return { ...await this.plans.summary(request.merchant.id), plans: this.plans.plans() };
  }

  /** Ops assigns plans by hand (owner 2026-11-07): the request reaches their support inbox. */
  @Post('request')
  async requestPlan(@Req() request: MerchantRequest, @Body() dto: PlanDto) {
    const current = await this.plans.planOf(request.merchant.id);
    const wanted = PLANS[dto.plan];
    await this.support.createMerchantCase(request.merchant.id, request.merchantUser,
      { category: 'STORES', summary: `Quiero cambiar mi plan de ${current.name} a ${wanted.name}.` });
    return { requested: wanted.id };
  }
}

/** The plans for the public website's pricing (no session): the same list the Studio shows. */
@ApiTags('plans')
@Controller('v1/plans')
export class PublicPlansController {
  constructor(private readonly plans: PlansService) {}
  @Get() list() { return { plans: this.plans.plans() }; }
}

@ApiTags('ops')
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller('internal/merchants/:id')
export class OpsPlanController {
  constructor(private readonly plans: PlansService) {}

  @Get('plan') summary(@Param('id') id: string) { return this.plans.summary(id); }

  @Patch('plan')
  setPlan(@Param('id') id: string, @Body() dto: PlanDto, @CurrentOpsUser() actor: PlansAdmin) { return this.plans.setPlan(id, dto.plan, actor); }

  @Post('credits')
  grant(@Param('id') id: string, @Body() dto: GrantCreditsDto, @CurrentOpsUser() actor: PlansAdmin) { return this.plans.grantCredits(id, dto.credits, dto.reason, actor); }
}
