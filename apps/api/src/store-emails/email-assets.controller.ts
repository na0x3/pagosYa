import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { EMAIL_ICONS } from './email-image-url';

const FILE = new RegExp(`^(?:${EMAIL_ICONS.join('|')})-(?:dark|light)\\.png$`);

/** Public: email clients fetch these with no session. Only the fixed icon set is reachable. */
@Controller('v1/email-assets')
export class EmailAssetsController {
  @Get('icons/:file')
  async icon(@Param('file') file: string, @Res() res: Response) {
    if (!FILE.test(file)) throw new NotFoundException();
    let bytes: Buffer;
    try { bytes = await readFile(kitPath('emails', 'icons', file)); } catch { throw new NotFoundException(); }
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    res.send(bytes);
  }
}
