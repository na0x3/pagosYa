/** Identity libraries T2a: motif packs drawn once for pagosYa in packages/storefront-kit/kit/motif-packs/<id>/. A pack is
 * pack.json plus at most 8 SVG files of at most 6 KB. Every file must come out of the motif sanitiser byte for byte (the
 * kit inlines it as drawn), paint only in currentColor (the kit colours each placement from the store's palette) and carry
 * no ids. The storefront sandbox cannot fetch, so a chosen pack travels in config.js as `motifPack` (id + sanitised
 * markup per placement), like `motifs`. T4 chooses the pack; nothing here does. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_DNA_MOTIF_ENUMS, type SourceDnaMotif } from './source-dna';
import { MOTIF_SVG_MAX_BYTES, sanitizeMotifSvg } from './source-svg-sanitize';

export const MOTIF_PACK_PLACEMENTS = ['button', 'pattern', 'divider', 'sticker', 'empty', 'product', 'card', 'cart'] as const;
export type MotifPackPlacement = typeof MOTIF_PACK_PLACEMENTS[number];
type Behavior = SourceDnaMotif['behavior'];
export type SourceMotifPackManifest = { id: string; version: 1; name: string; topics: { es: string[]; en: string[] }; motifs: Array<{ placement: MotifPackPlacement; file: string; behavior: Behavior }> };
export type SourceRuntimeMotifPack = { id: string; motifs: Array<{ placement: MotifPackPlacement; behavior: Behavior; svg: string }> };

export const MOTIF_PACK_MAX_FILES = 8;
const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/;
const WORD = /^[a-zà-ÿ0-9]+(?: [a-zà-ÿ0-9]+)*$/;
/** Behaviours that animate a labelled part: the file must label it. */
const PART: Partial<Record<Behavior, string>> = { glow: 'light', steam: 'steam' };
const COLOUR_ATTRIBUTES = /\s(fill|stroke|color|stop-color)="([^"]*)"/g;
const packsRoot = () => kitPath('motif-packs');
const visible = (name: string) => !name.startsWith('.');
const isBehavior = (value: unknown): value is Behavior => (SOURCE_DNA_MOTIF_ENUMS.behavior as readonly string[]).includes(value as string);
const isPlacement = (value: unknown): value is MotifPackPlacement => (MOTIF_PACK_PLACEMENTS as readonly string[]).includes(value as string);

/** A pack drawing is accepted only as the sanitiser writes it, in currentColor, without ids. */
export function drawingProblems(name: string, content: string): string[] {
  const problems: string[] = [];
  if (Buffer.byteLength(content) > MOTIF_SVG_MAX_BYTES) problems.push(`${name}: over 6 KB`);
  const cleaned = sanitizeMotifSvg(content);
  if (!cleaned.svg) problems.push(`${name}: rejected by the motif sanitiser (${cleaned.dropped})`);
  else if (cleaned.svg !== content) problems.push(`${name}: the sanitiser changes it${cleaned.removed.length ? ` (removes ${cleaned.removed.join(', ')})` : ''}; write it exactly as the sanitiser does`);
  if (/\sid="/.test(content)) problems.push(`${name}: ids are not allowed in a pack drawing`);
  for (const [, attribute, value] of content.matchAll(COLOUR_ATTRIBUTES)) if (!['none', 'currentColor'].includes(value)) problems.push(`${name}: ${attribute}="${value}" (only currentColor or none)`);
  return problems;
}

/** Every problem with one pack folder, in plain words; no problems means the manifest is returned. */
export function validateMotifPackDir(dir: string, folder: string): { manifest?: SourceMotifPackManifest; problems: string[] } {
  let raw: any;
  try { raw = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')); } catch { return { problems: [`${folder}: pack.json is missing or not JSON`] }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: [`${folder}: pack.json is not an object`] };
  const problems: string[] = [];
  if (raw.id !== folder || !PACK_ID.test(String(raw.id)) || String(raw.id).length > 32) problems.push(`${folder}: id must equal the folder name, lower-case words joined by -`);
  if (raw.version !== 1) problems.push(`${folder}: version must be 1`);
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 40) problems.push(`${folder}: name must be 1–40 characters`);
  for (const lang of ['es', 'en'] as const) {
    const words = raw.topics?.[lang];
    if (!Array.isArray(words) || words.length < 3 || words.length > 16 || !words.every((word: unknown) => typeof word === 'string' && WORD.test(word))) problems.push(`${folder}: topics.${lang} must list 3–16 lower-case words`);
  }
  const motifs: any[] = Array.isArray(raw.motifs) ? raw.motifs : [];
  if (!motifs.length) problems.push(`${folder}: motifs must list at least one placement`);
  const placements = new Set<string>();
  for (const motif of motifs) {
    if (!isPlacement(motif?.placement)) { problems.push(`${folder}: unknown placement ${JSON.stringify(motif?.placement)}`); continue; }
    if (placements.has(motif.placement)) problems.push(`${folder}: placement ${motif.placement} is declared twice`);
    placements.add(motif.placement);
    if (!isBehavior(motif.behavior)) problems.push(`${folder}: ${motif.placement} has unknown behavior ${JSON.stringify(motif.behavior)}`);
    if (typeof motif.file !== 'string' || !FILE.test(motif.file)) problems.push(`${folder}: ${motif.placement} names an invalid file`);
  }
  const files = [...new Set(motifs.map(motif => motif?.file).filter((file): file is string => typeof file === 'string' && FILE.test(file)))];
  if (files.length > MOTIF_PACK_MAX_FILES) problems.push(`${folder}: ${files.length} files, at most ${MOTIF_PACK_MAX_FILES}`);
  for (const extra of readdirSync(dir).filter(visible).filter(name => name !== 'pack.json' && !files.includes(name))) problems.push(`${folder}: ${extra} is not declared in pack.json`);
  for (const file of files) {
    const path = join(dir, file);
    if (!existsSync(path)) { problems.push(`${folder}: ${file} is missing`); continue; }
    const content = readFileSync(path, 'utf8');
    problems.push(...drawingProblems(`${folder}/${file}`, content));
    for (const motif of motifs.filter(entry => entry?.file === file)) {
      const part = PART[motif.behavior as Behavior];
      if (part && !content.includes(`data-part="${part}"`)) problems.push(`${folder}: ${motif.placement} uses ${motif.behavior} but ${file} labels no data-part="${part}"`);
    }
  }
  if (problems.length) return { problems };
  return { problems, manifest: { id: raw.id, version: 1, name: raw.name.trim(), topics: { es: raw.topics.es, en: raw.topics.en }, motifs: motifs.map(motif => ({ placement: motif.placement, file: motif.file, behavior: motif.behavior })) } };
}

/** Every valid pack on disk, by id. An invalid folder is skipped here; the library spec names its problems. */
export function listMotifPacks(root = packsRoot()): SourceMotifPackManifest[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(visible).filter(name => statSync(join(root, name)).isDirectory()).sort()
    .flatMap(folder => { const { manifest } = validateMotifPackDir(join(root, folder), folder); return manifest ? [manifest] : []; });
}

/** config.js `motifPack` for one pack id, or undefined when the id is unknown or the pack is invalid. */
export function loadMotifPack(id: string, root = packsRoot()): SourceRuntimeMotifPack | undefined {
  if (typeof id !== 'string' || !PACK_ID.test(id) || !existsSync(join(root, id))) return undefined;
  const { manifest } = validateMotifPackDir(join(root, id), id);
  if (!manifest) return undefined;
  return { id, motifs: manifest.motifs.map(motif => ({ placement: motif.placement, behavior: motif.behavior, svg: readFileSync(join(root, id, motif.file), 'utf8') })) };
}

/** A stored `config.motifPack` made safe again: known placements once each, known behaviours, markup re-sanitised, at
 * most 8 entries. Nothing usable → undefined, and the save drops the key. */
export function sanitizeRuntimeMotifPack(value: unknown): SourceRuntimeMotifPack | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { id, motifs } = value as { id?: unknown; motifs?: unknown };
  if (typeof id !== 'string' || !PACK_ID.test(id) || id.length > 32 || !Array.isArray(motifs)) return undefined;
  const seen = new Set<string>();
  const kept = motifs.flatMap((motif: any) => {
    if (seen.size >= MOTIF_PACK_PLACEMENTS.length || !motif || typeof motif !== 'object' || !isPlacement(motif.placement) || seen.has(motif.placement) || !isBehavior(motif.behavior) || typeof motif.svg !== 'string') return [];
    const svg = sanitizeMotifSvg(motif.svg, { idPrefix: `pym-pack-${motif.placement}-` }).svg;
    if (!svg) return [];
    seen.add(motif.placement);
    return [{ placement: motif.placement as MotifPackPlacement, behavior: motif.behavior as Behavior, svg }];
  });
  return kept.length ? { id, motifs: kept } : undefined;
}

/** config.js `motifPack` at save: YAPI's choice this run wins (a pack id, or null to remove it); untouched (undefined),
 * or a pack that no longer loads, keeps the pack the store had, re-sanitised. */
export function chosenMotifPack(choice: string | null | undefined, previous: unknown): SourceRuntimeMotifPack | undefined {
  if (choice === null) return undefined;
  return (typeof choice === 'string' ? loadMotifPack(choice) : undefined) ?? sanitizeRuntimeMotifPack(previous);
}

/** The draft's config.js with the pack set or removed, so previews, screenshots and verify show it. */
export function snapshotWithMotifPack<S extends { files: Array<{ path: string; content: string }> }>(snapshot: S, pack: SourceRuntimeMotifPack | undefined): S {
  return { ...snapshot, files: snapshot.files.map(file => {
    if (file.path !== 'config.js') return file;
    const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (!match) return file;
    try {
      const { motifPack: _previous, ...config } = JSON.parse(match[1]);
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(pack ? { ...config, motifPack: pack } : config)};` };
    } catch { return file; }
  }) };
}
