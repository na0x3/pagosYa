import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

/** Public, OFL-licensed kit fonts for the style cards' script-less iframes (their origin is "null", so CORS is *). */
@Controller('v1/source-fonts')
export class SourceFontsController {
  @Get(':file')
  async font(@Param('file') file: string, @Res() res: { setHeader(name: string, value: string): void; send(body: Buffer): void }) {
    const font = SOURCE_FONT_CATALOG.find(entry => entry.file === file);
    if (!font) throw new NotFoundException('Fuente no encontrada.');
    const data = await readFile(kitPath(`fonts/${font.file}`));
    res.setHeader('Content-Type', 'font/ttf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(data);
  }
}
