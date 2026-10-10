/** REPORTING ONLY (spec 2026-10-09 live evaluation): counts vibecoded tells in a candidate's source and whether the
 * signature's vocabulary landed. Never a gate, never rewrites anything. */
import { sourceEyebrowSections } from './source-design';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceSignature } from './source-signature';

export type SignatureTellReport = { eyebrowSections: number; marquee: boolean; topRevealClass: { name: string; uses: number } | null; fonts: string[]; vocabularyFound: string[]; vocabularyMissing: string[] };

const CLASS_ATTRIBUTE = /class(?:Name)?=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
const REVEAL = /\b((?:reveal|fade|blur-in|slide-up|rise)[\w-]*|animate-[\w-]+)\b/g;

export function signatureTellReport(files: SourceProjectFileDto[], signature?: SourceSignature): SignatureTellReport {
  const text = files.filter(file => file.encoding !== 'base64');
  const markup = text.filter(file => /\.(html|tsx|jsx)$/.test(file.path)).map(file => file.content).join('\n');
  const css = text.filter(file => file.path.endsWith('.css')).map(file => file.content).join('\n');
  const reveals = new Map<string, number>();
  for (const attribute of markup.matchAll(CLASS_ATTRIBUTE)) {
    for (const match of (attribute[1] ?? attribute[2] ?? attribute[3] ?? '').matchAll(REVEAL)) reveals.set(match[1], (reveals.get(match[1]) ?? 0) + 1);
  }
  const top = [...reveals].sort((a, b) => b[1] - a[1])[0];
  const fonts = [...new Set([...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)]
    .map(match => match[1].split(',')[0].trim().replace(/^['"]|['"]$/g, ''))
    .filter(name => name && !name.startsWith('var(') && !['inherit', 'initial', 'unset'].includes(name)))];
  const lower = markup.toLowerCase();
  const vocabulary = signature?.vocabulary ?? [];
  return {
    eyebrowSections: sourceEyebrowSections(files),
    marquee: /marquee/i.test(markup + css),
    topRevealClass: top ? { name: top[0], uses: top[1] } : null,
    fonts,
    vocabularyFound: vocabulary.filter(word => lower.includes(word.toLowerCase())),
    vocabularyMissing: vocabulary.filter(word => !lower.includes(word.toLowerCase())),
  };
}
