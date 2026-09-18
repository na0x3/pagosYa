import { Body, Controller, Delete, Get, Header, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Response } from 'express';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { StorePagesService } from './store-pages.service';
class RedirectDto { @IsString() @MaxLength(200) fromPath!: string; @IsString() @MaxLength(200) toPath!: string; }
@Controller('v1/stores/:storeId/commerce/redirects') @UseGuards(MerchantAuthGuard)
export class StoreRedirectsController {
  constructor(private readonly pages: StorePagesService) {}
  @Get() list(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string) { return this.pages.redirects(m.id, s); }
  @Post() save(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string, @Body() dto: RedirectDto) { return this.pages.saveRedirect(m.id, s, dto.fromPath, dto.toPath); }
  @Delete(':id') remove(@CurrentMerchant() m: { id: string }, @Param('storeId') s: string, @Param('id') id: string) { return this.pages.deleteRedirect(m.id, s, id); }
}
@Controller('v1/stores/public/:slug')
export class StorePagesController {
  constructor(private readonly pages: StorePagesService) {}
  @Get('pages') @Header('Content-Type', 'text/html; charset=utf-8') @Header('Cache-Control', 'no-cache')
  archive(@Param('slug') s: string, @Query('page') page?: string) { return this.pages.archive(s, page === undefined ? 1 : Number(page)); }
  @Get('pages/*path')
  async article(@Param('slug') s: string, @Param('path') path: string | string[], @Res() response: Response) {
    const result = await this.pages.page(s, '/' + (Array.isArray(path) ? path.join('/') : path));
    response.set({ 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (result.location) return response.redirect(301, result.location);
    return response.type('html').send(result.html);
  }
  @Get('rss.xml') @Header('Content-Type', 'application/rss+xml; charset=utf-8') @Header('Cache-Control', 'no-cache')
  feed(@Param('slug') s: string) { return this.pages.feed(s); }
  @Get('sitemap.xml') @Header('Content-Type', 'application/xml; charset=utf-8') @Header('Cache-Control', 'no-cache')
  sitemap(@Param('slug') s: string) { return this.pages.sitemap(s); }
}
