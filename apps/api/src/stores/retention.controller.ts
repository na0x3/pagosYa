import { Body, Controller, Get, Header, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { RetentionService } from './retention.service';
import { StoresService } from './stores.service';
import { RedeemComebackDto, RetentionCampaignDto, RetentionCartDto, RetentionEmailDto, RetentionPaymentCardDto, RetentionSettingsDto, RetentionSubscribeDto } from './retention.dto';
@Controller('v1/retention/payment-card')
export class RetentionPaymentController {
  constructor(private readonly retention: RetentionService) {}
  @Post() @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 30, ttl: 60000 } })
  card(@Body() dto: RetentionPaymentCardDto) { return this.retention.paymentCard(dto.trackingToken); }
  @Post('email') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 5, ttl: 60000 } })
  email(@Body() dto: RetentionPaymentCardDto) { return this.retention.emailPaymentCard(dto.trackingToken); }
}
@Controller('v1/stores/:storeId/retention')
@UseGuards(MerchantAuthGuard)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}
  @Get() overview(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.retention.overview(m.id, id); }
  @Put() save(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: RetentionSettingsDto) { return this.retention.save(m.id, id, dto); }
  @Post('redeem') redeem(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: RedeemComebackDto) { return this.retention.redeem(m.id, id, dto.code); }
  @Post('campaigns') draft(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: RetentionCampaignDto) { return this.retention.draft(m.id, id, dto); }
  @Post('campaigns/:campaignId/send') send(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('campaignId') campaign: string) { return this.retention.queueCampaign(m.id, id, campaign); }
}
@Controller('v1/stores/public/:slug/retention')
export class RetentionPublicController {
  constructor(private readonly retention: RetentionService, private readonly stores: StoresService) {}
  @Get() async settings(@Param('slug') slug: string) {
    const store = await this.stores.findActiveBySlugPublic(slug);
    const s = await this.retention.settings(store.id);
    return { comebackEnabled: s.comebackEnabled, visitsRequired: s.visitsRequired, rewardLabel: s.rewardLabel, signupEnabled: s.signupEnabled, signupTitle: s.signupTitle, signupBody: s.signupBody, signupButton: s.signupButton, recoveryEnabled: s.recoveryEnabled, ...(s.signupEnabled ? { signupVisual: await this.retention.signupVisual(store.id) } : {}) };
  }
  @Post('subscribe') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async subscribe(@Param('slug') slug: string, @Body() dto: RetentionSubscribeDto) { return this.retention.subscribe(await this.stores.findActiveBySlugPublic(slug), dto.email, dto); }
  @Post('unsubscribe/:token') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async unsubscribe(@Param('slug') slug: string, @Param('token') token: string) { return this.retention.unsubscribe((await this.stores.findActiveBySlugPublic(slug)).id, token); }
  @Post('cards') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestCard(@Param('slug') slug: string, @Body() dto: RetentionEmailDto) { return this.retention.requestCard(await this.stores.findActiveBySlugPublic(slug), dto.email); }
  @Get('cards/:token') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 30, ttl: 60000 } })
  async card(@Param('slug') slug: string, @Param('token') token: string) { return this.retention.card((await this.stores.findActiveBySlugPublic(slug)).id, token); }
  @Post('carts') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async cart(@Param('slug') slug: string, @Body() dto: RetentionCartDto) { return this.retention.saveCart((await this.stores.findActiveBySlugPublic(slug)).id, dto); }
  @Get('carts/:token') @Throttle({ default: { limit: 30, ttl: 60000 } })
  async restore(@Param('slug') slug: string, @Param('token') token: string) { return this.retention.restoreCart((await this.stores.findActiveBySlugPublic(slug)).id, token); }
}
