import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { StoreVoiceService } from './store-voice.service';

class AssumedFactRevisionDto { @IsInt() @Min(1) revision!: number; }
class AssumedFactEditDto extends AssumedFactRevisionDto { @IsString() @MinLength(1) @MaxLength(160) text!: string; }

/** «Datos que YAPI supuso» (spec 2026-10-14 store voice, part 5). */
@ApiTags('storefront-source-projects')
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/source-project/assumed-facts')
export class StoreVoiceController {
  constructor(private readonly voice: StoreVoiceService) {}

  @Get()
  list(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Query('revision', ParseIntPipe) revision: number) {
    return this.voice.list(merchant.id, storeId, revision);
  }

  @Post(':id/confirm')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  confirm(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string, @Body() body: AssumedFactRevisionDto) {
    return this.voice.confirm(merchant.id, storeId, id, body.revision);
  }

  @Post(':id/edit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  edit(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string, @Body() body: AssumedFactEditDto) {
    return this.voice.edit(merchant.id, storeId, id, body.revision, body.text);
  }

  @Post(':id/remove')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  remove(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string, @Param('id') id: string, @Body() body: AssumedFactRevisionDto) {
    return this.voice.remove(merchant.id, storeId, id, body.revision);
  }
}

/** Mi tienda's count of facts waiting on each store. */
@ApiTags('storefront-source-projects')
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller('v1/assumed-facts')
export class AssumedFactCountsController {
  constructor(private readonly voice: StoreVoiceService) {}

  @Get('counts')
  counts(@CurrentMerchant() merchant: { id: string }) {
    return this.voice.pendingCounts(merchant.id);
  }
}
