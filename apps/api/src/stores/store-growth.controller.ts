import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { StoreGrowthService } from './store-growth.service';

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
}
