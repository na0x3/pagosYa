import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { SendSourceMessageDto } from './dto/send-source-message.dto';
import { SourceChatJobsService } from './source-chat-jobs.service';
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/source-project/chat-jobs')
export class SourceChatJobsController {
  constructor(private readonly jobs: SourceChatJobsService) {}
  @Post() @Throttle({ default: { limit: 12, ttl: 60000 } })
  create(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Body() input: SendSourceMessageDto) { return this.jobs.create(merchant.id, storeId, input); }
  @Get() @Header('Cache-Control', 'private, no-store')
  latest(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) { return this.jobs.latest(merchant.id, storeId); }
  @Get(':id') @Header('Cache-Control', 'private, no-store')
  get(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string) { return this.jobs.get(merchant.id, storeId, id); }
  @Post(':id/cancel')
  cancel(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string) { return this.jobs.cancel(merchant.id, storeId, id); }
}
