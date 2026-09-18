import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { ArticleDto, BundleDto, BundleStatusDto, ReviewDto, ReviewQueryDto, ReviewStatusDto } from './commerce-content.dto';
import { CommerceContentService } from './commerce-content.service';
import { StoresService } from './stores.service';

@UseGuards(MerchantAuthGuard)
@Controller('v1/stores/:storeId/commerce-content')
export class CommerceContentController {
  constructor(private readonly content: CommerceContentService) {}
  @Get() list(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string) { return this.content.list(m.id, id); }
  @Get('reviews') reviews(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Query() query: ReviewQueryDto) { return this.content.reviews(m.id, id, query); }
  @Put('articles') save(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: ArticleDto) { return this.content.saveArticle(m.id, id, dto); }
  @Post('bundles') bundle(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Body() dto: BundleDto) { return this.content.createBundle(m.id, id, dto); }
  @Patch('bundles/:bundleId') bundleStatus(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('bundleId') bundle: string, @Body() dto: BundleStatusDto) { return this.content.bundleStatus(m.id, id, bundle, dto.active); }
  @Patch('reviews/:reviewId') moderate(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Param('reviewId') review: string, @Body() dto: ReviewStatusDto) { return this.content.moderate(m.id, id, review, dto.status); }
}
@Controller('v1/stores/public/:slug/content')
export class CommerceContentPublicController {
  constructor(private readonly content: CommerceContentService, private readonly stores: StoresService) {}
  @Get() async list(@Param('slug') slug: string, @Query('locale') locale?: string) { const store = await this.stores.findActiveBySlugPublic(slug); return this.content.publicContent(store.id, locale); }
  @Post('reviews') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async review(@Param('slug') slug: string, @Body() dto: ReviewDto) { const store = await this.stores.findActiveBySlugPublic(slug); return this.content.review(store.id, dto); }
}
