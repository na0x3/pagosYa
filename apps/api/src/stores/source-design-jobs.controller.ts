import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { SourceDesignJobsService } from './source-design-jobs.service';
export class SourceDesignJobDto {
  @IsUUID() requestId!: string;
  @IsInt() @Min(1) revision!: number;
  @IsString() @MaxLength(200) page!: string;
  @IsOptional() @IsString() @MaxLength(120) productId?: string;
  @IsInt() @Min(1) @Max(500) maxCredits!: number;
  @IsOptional() @IsIn([1, 2]) maxRepairs?: number;
}
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/source-project/design-jobs')
export class SourceDesignJobsController {
  constructor(private readonly jobs: SourceDesignJobsService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  latest(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) { return this.jobs.latest(merchant.id, storeId); }
  @Get(':id') @Header('Cache-Control', 'private, no-store')
  get(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string) { return this.jobs.get(merchant.id, storeId, id); }
  @Post() @Throttle({ default: { limit: 3, ttl: 60000 } })
  create(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: SourceDesignJobDto) { return this.jobs.create(merchant.id, storeId, input); }
  @Post(':id/cancel')
  cancel(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string) { return this.jobs.cancel(merchant.id, storeId, id); }
  @Post(':id/resume') @Throttle({ default: { limit: 3, ttl: 60000 } })
  resume(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string) { return this.jobs.resume(merchant.id, storeId, id); }
}
