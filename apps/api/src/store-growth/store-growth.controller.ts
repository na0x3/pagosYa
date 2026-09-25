import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { StoreGrowthService, type GrowthPeriodDays, type InsightAction } from './store-growth.service';

class InboxQuery {
  @IsOptional() @IsIn(['NEW', 'READ', 'RESOLVED']) status?: string;
  @IsOptional() @IsString() @MaxLength(60) before?: string;
}
class LeadStatus { @IsIn(['NEW', 'READ', 'RESOLVED']) status!: string; }
class PartnerInput {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Matches(/\S/) @MaxLength(120) name!: string;
  @IsInt() @Min(0) @Max(10000) commissionBps!: number;
}
class PartnerStatus { @IsBoolean() active!: boolean; }
class OverviewQuery { @IsOptional() @IsIn(['7', '30', '90']) days?: string; }
class InsightStateInput { @IsIn(['dismiss', 'snooze', 'restore']) action!: InsightAction; }
/** An engine id: a rule, optionally `:` and the thing it is about (product id, step, CTA label or host). */
const INSIGHT_ID = /^[a-z][a-z-]{1,40}(?::[A-Za-z0-9._-]{1,120})?$/;
@Controller('v1/stores/:storeId/growth')
@UseGuards(MerchantAuthGuard)
export class StoreGrowthController {
  constructor(private readonly growth: StoreGrowthService) {}
  @Get('inbox') inbox(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Query() q: InboxQuery) { return this.growth.inbox(m.id, id, q.status, q.before); }
  @Patch('inbox/:leadId') updateLead(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('leadId') lead: string, @Body() body: LeadStatus) { return this.growth.updateLead(m.id, id, lead, body.status); }
  @Get('partners') partners(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.growth.partners(m.id, id); }
  @Post('partners') create(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() body: PartnerInput) { return this.growth.createPartner(m.id, id, body.name, body.commissionBps); }
  @Patch('partners/:partnerId') updatePartner(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('partnerId') partner: string, @Body() body: PartnerStatus) { return this.growth.updatePartner(m.id, id, partner, body.active); }
  @Get('insights') insights(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.growth.insights(m.id, id); }
  /** G2 "Crecimiento": KPIs, funnel, clicks, products, devices, referrers, weekly summary and the ranked insights. */
  @Get('overview') overview(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Query() q: OverviewQuery) {
    return this.growth.overview(m.id, id, Number(q.days || 30) as GrowthPeriodDays);
  }
  @Put('insights/:insightId') setInsightState(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('insightId') insightId: string, @Body() body: InsightStateInput) {
    if (!INSIGHT_ID.test(insightId)) throw new BadRequestException('Sugerencia no válida');
    return this.growth.setInsightState(m.id, id, insightId, body.action);
  }
  @Delete('insights') restoreInsights(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.growth.restoreInsights(m.id, id); }
}
