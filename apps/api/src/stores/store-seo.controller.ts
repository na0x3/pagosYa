import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { StoreSeoService } from './store-seo.service';
@Controller('v1/store-discovery')
export class StoreDiscoveryController {
  constructor(private readonly seo: StoreSeoService) {}
  @Get() @Header('Cache-Control', 'public, max-age=60') directory() { return this.seo.directory(); }
}
@Controller('v1/stores/public/:slug/seo')
export class StoreSeoController {
  constructor(private readonly seo: StoreSeoService) {}
  @Get() @Header('Cache-Control', 'no-cache')
  document(@Param('slug') slug: string, @Query('productId') productId?: string, @Query('page') page?: string) { return this.seo.document(slug, productId, page); }
  @Get('sitemap.xml') @Header('Content-Type', 'application/xml; charset=utf-8') @Header('Cache-Control', 'no-cache')
  sitemap(@Param('slug') slug: string, @Query('part') part?: string) { return this.seo.sitemap(slug, part === undefined ? undefined : Number(part)); }
  @Get('llms.txt') @Header('Content-Type', 'text/plain; charset=utf-8') @Header('Cache-Control', 'no-cache')
  llms(@Param('slug') slug: string) { return this.seo.llms(slug); }
}
