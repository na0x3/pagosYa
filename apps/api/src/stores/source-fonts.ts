import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const SOURCE_FONT_CHOICES = `Optional self-hosted fonts are available: assets/bricolage.ttf (Bricolage Grotesque, expressive compact sans, weights 200–800), assets/fraunces.ttf (Fraunces, soft characterful serif, weights 100–900), assets/instrument.ttf (Instrument Sans, clear contemporary sans, weights 400–700), assets/oswald.ttf (Oswald, condensed display sans, weights 200–700), assets/instrument-serif.ttf (Instrument Serif, heritage display serif, weight 400). Select by the concept, not a default pairing; a single family with strong scale contrast is valid. Declare @font-face with font-display:swap and the correct variable weight range for each chosen file in styles.css. The server bundles only referenced fonts with their licenses. Uploaded brand fonts and confirmed merchant choices take precedence. Do not fetch remote fonts or automatically combine Georgia with Arial.`;

/** Keep exports independent and local edits byte-preserving; unused fonts add no download weight. */
export async function withSourceFonts(files: SourceProjectFileDto[]): Promise<SourceProjectFileDto[]> {
  const result = [...files];
  const source = files.filter(f => /\.(css|html)$/.test(f.path)).map(f => f.content).join('\n');
  for (const name of ['bricolage', 'fraunces', 'instrument', 'oswald', 'instrument-serif']) {
    if (!source.includes(`assets/${name}.ttf`)) continue;
    for (const [filename, encoding] of [[`${name}.ttf`, 'base64'], [`${name}-OFL.txt`, 'utf8']] as const) {
      const path = `assets/${filename}`;
      if (!result.some(file => file.path === path)) result.push({ path, encoding, content: (await readFile(join(__dirname, 'source-kit', 'fonts', filename))).toString(encoding) });
    }
  }
  return result;
}
