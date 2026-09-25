/** Sub-project 3 (illustrated motion): the DNA's motifs become small drawings the platform places and animates.
 * YAPI draws one `motifs/<slug>.svg` per motif in the build step; this module names those files, writes the prompt
 * section, takes the model's files through the allow-list sanitiser, and builds `config.motifs`: enums, the target and
 * the sanitised markup, never the meaning prose. config.js carries the markup because the storefront sandbox cannot
 * fetch (connect-src 'none'); the files stay in the snapshot for the hero <img> and for later edits. */
import { SOURCE_DNA_MOTIF_ENUMS, type SourceDnaMotif } from './source-dna';
import { MOTIF_SVG_ELEMENTS, sanitizeMotifSvg } from './source-svg-sanitize';

type File = { path: string; content: string; encoding?: 'utf8' | 'base64' };
export type SourceRuntimeMotif = Pick<SourceDnaMotif, 'for' | 'target' | 'behavior' | 'trigger' | 'placement'> & { file: string; svg: string };

const MAX_MOTIFS = 3;
const SLUG_LIMIT = 24;
const MOTIF_FILE = /^motifs\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/;
export const isSourceMotifFile = (path: string) => MOTIF_FILE.test(path);
/** The part each behaviour animates when the drawing labels it (the kit falls back on the whole drawing). */
const PART: Partial<Record<SourceDnaMotif['behavior'], string>> = { glow: 'light', steam: 'steam' };

export function motifSlug(target: string, index: number, taken: Set<string>): string {
  let base = String(target ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (base.length > SLUG_LIMIT) { base = base.slice(0, SLUG_LIMIT); if (base.includes('-')) base = base.slice(0, base.lastIndexOf('-')); }
  base ||= `motif-${index + 1}`;
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

/** `motifs/<slug>.svg` per DNA motif, in DNA order (at most 3). */
export function sourceMotifPaths(motifs: readonly SourceDnaMotif[] = []): string[] {
  const taken = new Set<string>();
  return motifs.slice(0, MAX_MOTIFS).map((motif, index) => `motifs/${motifSlug(motif.target, index, taken)}.svg`);
}

export function sourceMotifPrompt(motifs: readonly SourceDnaMotif[] = []): string {
  if (!motifs.length) return '';
  const paths = sourceMotifPaths(motifs);
  const list = motifs.slice(0, MAX_MOTIFS).map((motif, index) => {
    const part = PART[motif.behavior];
    return `${paths[index]}: ${motif.meaning} (for ${motif.for} "${motif.target}", ${motif.behavior}${part ? `; label the part that moves data-part="${part}"` : ''}; placement ${motif.placement}${motif.placement === 'hero' ? `: place it yourself in the opening as <img src="${paths[index]}" alt="" aria-hidden="true">` : ', placed by the platform'})`;
  });
  return `DNA MOTIFS: these are the only illustrations this store may add. Return each as its own file in files, at exactly this path: ${list.join('; ')}. Each file is one small hand-drawn line drawing: a single <svg> root with xmlns and a viewBox (0 0 64 64), stroke="currentColor" line art with fill="none" (a translucent currentColor fill or a local gradient is fine), under 2 KB, using only ${MOTIF_SVG_ELEMENTS.join(', ')}. No script, style, text, image, use, links, event handlers, filters or external references, and no animation in the file: the platform animates the labelled part with the store's motion. Never an inline <svg> copy in a page, never in place of or over a product photo, price or purchase button.`;
}

/** Takes every motifs/* path out of the authored files. Declared motif files come back sanitised (ids prefixed with
 * pym-<slug>-); anything else is dropped. Every change is a no-cost repair note. */
export function extractSourceMotifs<F extends File>(files: F[], motifs: readonly SourceDnaMotif[] = []): { files: F[]; motifs: File[]; repairs: string[] } {
  if (!files.some(file => file.path.startsWith('motifs/'))) return { files, motifs: [], repairs: [] };
  const declared = new Set(sourceMotifPaths(motifs));
  const repairs: string[] = [];
  const kept: File[] = [];
  for (const file of files.filter(file => file.path.startsWith('motifs/'))) {
    if (!declared.has(file.path) || file.encoding === 'base64' || typeof file.content !== 'string') { repairs.push(`${file.path}: not a DNA motif, dropped`); continue; }
    const cleaned = sanitizeFile(file.path, file.content);
    if (!cleaned.svg) { repairs.push(`${file.path}: dropped (${cleaned.dropped})`); continue; }
    if (cleaned.removed.length) repairs.push(`${file.path}: removed ${cleaned.removed.join(', ')}`);
    kept.push({ path: file.path, content: cleaned.svg });
  }
  return { files: files.filter(file => !file.path.startsWith('motifs/')), motifs: kept, repairs };
}

/** Every id (and every url(#id) reference) carries the platform prefix pym-<slug>-: no page, kit or checkout id starts
 * with pym-, so a drawing cannot shadow one (#preview-back), and two motifs never share one. */
const sanitizeFile = (path: string, content: string) => sanitizeMotifSvg(content, { idPrefix: `pym-${path.slice(7, -4)}-` });
const known = (key: keyof typeof SOURCE_DNA_MOTIF_ENUMS, value: unknown) => (SOURCE_DNA_MOTIF_ENUMS[key] as readonly string[]).includes(value as string);

/** One runtime entry, or undefined when an enum is unknown or the drawing does not survive the sanitiser. */
function runtimeMotif(motif: Partial<SourceRuntimeMotif> & Record<string, unknown>, file: string, content: string | undefined): SourceRuntimeMotif | undefined {
  if (!isSourceMotifFile(file) || typeof content !== 'string' || !(['for', 'behavior', 'trigger', 'placement'] as const).every(key => known(key, motif[key]))) return;
  if (motif.placement === 'hero' || typeof motif.target !== 'string' || !motif.target.trim()) return;
  const svg = sanitizeFile(file, content).svg;
  if (!svg) return;
  // purchase happens only on the confirmation, which always plays on purchase.
  const trigger = motif.placement === 'confirmation' ? 'purchase' : motif.trigger === 'purchase' ? 'appear' : motif.trigger!;
  return { file, for: motif.for!, target: motif.target.trim().slice(0, 40), behavior: motif.behavior!, trigger, placement: motif.placement!, svg };
}

/** config.js `motifs`: the kit-slot motifs whose drawing exists, in DNA order. */
export function sourceMotifConfig(motifs: readonly SourceDnaMotif[] = [], files: File[] = []): SourceRuntimeMotif[] {
  const paths = sourceMotifPaths(motifs);
  return motifs.slice(0, MAX_MOTIFS).flatMap((motif, index) => {
    const entry = runtimeMotif(motif as unknown as Partial<SourceRuntimeMotif> & Record<string, unknown>, paths[index], files.find(file => file.path === paths[index])?.content);
    return entry ? [entry] : [];
  });
}

/** A stored `config.motifs` value made safe again: known entries only, markup re-sanitised, at most 3. */
export function sanitizeRuntimeMotifs(value: unknown): SourceRuntimeMotif[] {
  return (Array.isArray(value) ? value : []).slice(0, MAX_MOTIFS)
    .flatMap((motif: any) => { const entry = motif && typeof motif === 'object' ? runtimeMotif(motif, motif.file, motif.svg) : undefined; return entry ? [entry] : []; });
}

const CONFIG_PATTERN = /^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/;
/** Every save (the merchant's own included) re-sanitises motif files and config.js motifs. Nothing to change → the same
 * array, byte for byte. An unreadable config.js is left to the save's own checks. */
export function withSanitizedMotifs<F extends File>(files: F[]): { files: F[]; repairs: string[] } {
  const repairs: string[] = [];
  let changed = false;
  const next = files.flatMap(file => {
    if (file.path.startsWith('motifs/') && file.path.endsWith('.svg')) {
      const cleaned = isSourceMotifFile(file.path) && file.encoding !== 'base64' ? sanitizeFile(file.path, file.content) : { svg: undefined, removed: [], dropped: 'not a motif path' };
      if (!cleaned.svg) { changed = true; repairs.push(`${file.path}: dropped (${cleaned.dropped})`); return []; }
      if (cleaned.svg === file.content) return [file];
      changed = true; repairs.push(`${file.path}: removed ${cleaned.removed.join(', ') || 'formatting'}`);
      return [{ ...file, content: cleaned.svg }];
    }
    if (file.path !== 'config.js') return [file];
    let config: any;
    try { config = JSON.parse(file.content.match(CONFIG_PATTERN)?.[1] ?? ''); } catch { return [file]; }
    if (!config || typeof config !== 'object' || !('motifs' in config)) return [file];
    const motifs = sanitizeRuntimeMotifs(config.motifs);
    if (JSON.stringify(motifs) === JSON.stringify(config.motifs)) return [file];
    changed = true; repairs.push('config.js: motifs re-sanitised');
    return [{ ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, motifs })};\n` }];
  });
  return { files: changed ? next : files, repairs };
}
