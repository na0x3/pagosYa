import { readFile } from 'node:fs/promises';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

const fontLine = (font: typeof SOURCE_FONT_CATALOG[number]) => `assets/${font.id}.ttf (${font.family}, ${font.personality.join(' ')}, ${font.role === 'both' ? 'display or text' : font.role}, weight${font.weights.includes('–') ? 's' : ''} ${font.weights})`;
export const SOURCE_FONT_CHOICES = `Optional self-hosted fonts are available: ${SOURCE_FONT_CATALOG.map(fontLine).join('; ')}. Select by the concept, not a default pairing, and not the fonts every store uses; a single family with strong scale contrast is valid. Declare @font-face with font-display:swap and the correct variable weight range for each chosen file in styles.css. The server bundles only referenced fonts with their licenses. Uploaded brand fonts and confirmed merchant choices take precedence. Do not fetch remote fonts or automatically combine Georgia with Arial.`;

/** Keep exports independent and local edits byte-preserving; unused fonts add no download weight. */
export async function withSourceFonts(files: SourceProjectFileDto[]): Promise<SourceProjectFileDto[]> {
  const result = [...files];
  const source = files.filter(f => /\.(css|html)$/.test(f.path)).map(f => f.content).join('\n');
  for (const { id: name } of SOURCE_FONT_CATALOG) {
    if (!source.includes(`assets/${name}.ttf`)) continue;
    for (const [filename, encoding] of [[`${name}.ttf`, 'base64'], [`${name}-OFL.txt`, 'utf8']] as const) {
      const path = `assets/${filename}`;
      if (!result.some(file => file.path === path)) result.push({ path, encoding, content: (await readFile(kitPath('fonts', filename))).toString(encoding) });
    }
  }
  return result;
}
