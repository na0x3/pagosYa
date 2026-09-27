import { Controller, Get, Header, Param } from '@nestjs/common';
import { StoreFeedsService } from './store-feeds.service';

@Controller('v1/stores/public/:slug/feeds')
export class StoreFeedsController {
  constructor(private readonly feeds: StoreFeedsService) {}
  @Get(':file') @Header('Content-Type', 'application/xml; charset=utf-8') @Header('Cache-Control', 'public, max-age=3600')
  feed(@Param('slug') slug: string, @Param('file') file: string) { return this.feeds.feed(slug, file); }
}
