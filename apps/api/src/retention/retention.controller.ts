import { BadRequestException, Body, Controller, Get, Header, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PopupGameService } from '../store-popups/popup-game.service';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { RetentionService, publicRetentionSettings } from './retention.service';
import { PrismaService } from '../prisma/prisma.service';
import { findActiveStoreBySlug } from '../stores/active-store';
import { PopupGameDto, RedeemComebackDto, RetentionCampaignDto, RetentionCartDto, RetentionEmailDto, RetentionPaymentCardDto, RetentionSettingsDto, RetentionSubscribeDto } from './retention.dto';
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
  constructor(private readonly retention: RetentionService, private readonly games: PopupGameService) {}
  @Get() overview(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.retention.overview(m.id, id); }
  /** Spec 2026-11-09 popup games: the Studio's «Juego» panel — on/off, the top prize, the question. */
  @Put('game') async game(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: PopupGameDto) {
    await this.retention.owner(m.id, id);
    let saved = dto.game === 'off' ? await this.games.disable(id) : dto.game ? await this.games.enable(id, dto.game) : null;
    if (dto.topPrize !== undefined) saved = await this.games.setTopPrize(id, dto.topPrize);
    if (dto.question !== undefined) saved = await this.games.setQuestion(id, dto.question);
    return saved ?? {};
  }
  @Get('popup-preview') popupPreview(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.retention.popupPreview(m.id, id); }
  @Put() save(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: RetentionSettingsDto) { return this.retention.save(m.id, id, dto); }
  @Post('suggestions/dismiss') dismissSuggestions(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.retention.dismissSuggestions(m.id, id); }
  @Post('redeem') redeem(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: RedeemComebackDto) { return this.retention.redeem(m.id, id, dto.code); }
  @Post('campaigns') draft(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: RetentionCampaignDto) { return this.retention.draft(m.id, id, dto); }
  @Post('campaigns/:campaignId/send') send(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('campaignId') campaign: string) { return this.retention.queueCampaign(m.id, id, campaign); }
}
@Controller('v1/stores/public/:slug/retention')
export class RetentionPublicController {
  constructor(private readonly retention: RetentionService, private readonly prisma: PrismaService, private readonly games: PopupGameService) {}
  /** Spec 2026-11-09 popup games: the server draws and signs the prize; the code itself only comes with a valid claim. */
  @Post('play') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async play(@Param('slug') slug: string) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const result = await this.games.play(store.id);
    if (!result) throw new BadRequestException('Este juego no está disponible.');
    return result;
  }
  @Get() async settings(@Param('slug') slug: string, @Query('visit') visit?: string) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    // Spec 2026-11-09 A/B tests: a B visitor of a running popup test sees B's popup.
    const { settings: s } = await this.retention.settingsFor(store.id, typeof visit === 'string' && visit.length <= 64 ? visit : undefined);
    const shown: Record<string, unknown> = { ...publicRetentionSettings(s, store.slug), ...(s.signupEnabled ? { signupVisual: await this.retention.signupVisual(store.id) } : {}) };
    // Review 2026-11-09: only prizes that can still be won; fewer than two → the plain popup (never a game that cannot be played).
    if (shown.popupGame) {
      const slices = await this.games.activeSlices(store.id);
      if (slices.length >= 2) shown.popupGameSlices = slices; else { delete shown.popupGame; delete shown.popupGameSlices; delete shown.popupQuestion; }
    }
    return shown;
  }
  @Post('subscribe') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async subscribe(@Param('slug') slug: string, @Body() dto: RetentionSubscribeDto) { return this.retention.subscribe(await findActiveStoreBySlug(this.prisma, slug), dto.email, dto); }
  @Post('unsubscribe/:token') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async unsubscribe(@Param('slug') slug: string, @Param('token') token: string) { return this.retention.unsubscribe((await findActiveStoreBySlug(this.prisma, slug)).id, token); }
  @Post('cards') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestCard(@Param('slug') slug: string, @Body() dto: RetentionEmailDto) { return this.retention.requestCard(await findActiveStoreBySlug(this.prisma, slug), dto.email); }
  @Get('cards/:token') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 30, ttl: 60000 } })
  async card(@Param('slug') slug: string, @Param('token') token: string) { return this.retention.card((await findActiveStoreBySlug(this.prisma, slug)).id, token); }
  @Post('carts') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async cart(@Param('slug') slug: string, @Body() dto: RetentionCartDto) { return this.retention.saveCart((await findActiveStoreBySlug(this.prisma, slug)).id, dto); }
  @Get('carts/:token') @Throttle({ default: { limit: 30, ttl: 60000 } })
  async restore(@Param('slug') slug: string, @Param('token') token: string) { return this.retention.restoreCart((await findActiveStoreBySlug(this.prisma, slug)).id, token); }
}
