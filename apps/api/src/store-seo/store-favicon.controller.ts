import { Controller, Get, Headers, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { faviconSize } from './store-favicon';
import { StoreFaviconService } from './store-favicon.service';

@Controller('v1/stores/public/:slug')
export class StoreFaviconController {
  constructor(private readonly favicons: StoreFaviconService) {}

  @Get('favicon.png')
  async favicon(@Param('slug') slug: string, @Query('size') size: string | undefined, @Headers('if-none-match') ifNoneMatch: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.send(await this.favicons.favicon(slug, faviconSize(size)), 'image/png', ifNoneMatch, res);
  }

  @Get('logo.svg')
  async logo(@Param('slug') slug: string, @Headers('if-none-match') ifNoneMatch: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.send(await this.favicons.logoSvg(slug), 'image/svg+xml; charset=utf-8', ifNoneMatch, res);
  }

  private send(result: { body: Buffer; etag: string }, type: string, ifNoneMatch: string | undefined, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('ETag', result.etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ifNoneMatch === result.etag) { res.status(304); return; }
    res.setHeader('Content-Type', type);
    return new StreamableFile(result.body);
  }
}
