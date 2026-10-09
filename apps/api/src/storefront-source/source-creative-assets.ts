import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { kitPath } from '@pagosya/storefront-kit';
import { listMotifPacks, type MotifPackPlacement } from './source-motif-packs';

export type CreativeTone = 'colour' | 'store';
export type CreativeAsset = { id: string; path: string; thumbnail: string; family: string; subject: string; tone: CreativeTone; description: string; keywords: { es: string[]; en: string[] }; tags: string[]; license: string; source: string; bytes: number; sha256: string };
const root = kitPath('creative-assets');
const MOTIF_PATH = /^assets\/creative\/motif-([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*\.svg)$/;
const PLACEMENT_ES: Record<MotifPackPlacement, string> = { button: 'motivo de botón', pattern: 'patrón', divider: 'separador', sticker: 'sticker', empty: 'ilustración de estado vacío', product: 'motivo de producto', card: 'motivo de tarjeta', cart: 'motivo del carrito' };

/** Every motif-pack drawing as store-colour art, once per file (a pack may reuse one drawing for several placements);
 * the file stays in its pack folder (see sourcePath). */
function motifPackAssets(): CreativeAsset[] {
  return listMotifPacks().flatMap(pack => [...new Set(pack.motifs.map(motif => motif.file))].map(file => {
    const bytes = readFileSync(join(kitPath('motif-packs'), pack.id, file));
    const path = `assets/creative/motif-${pack.id}/${file}`;
    const name = file.replace(/\.svg$/, '');
    const uses = pack.motifs.filter(motif => motif.file === file).map(motif => PLACEMENT_ES[motif.placement]).join(', ');
    return { id: `motif-${pack.id}/${name}`, path, thumbnail: path, family: `motif-${pack.id}`, subject: `${pack.id}-${name}`, tone: 'store' as const, description: `${pack.name}: ${uses}`, keywords: { es: pack.topics.es, en: pack.topics.en }, tags: pack.topics.en, license: 'pagosYa', source: `motif-packs/${pack.id}/${file}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
}
let catalog: CreativeAsset[] | undefined;
/** The Fluent catalogue plus every motif-pack drawing, read once per process. */
export function creativeAssetCatalog(): CreativeAsset[] {
  return catalog ??= [...JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')).assets, ...motifPackAssets()];
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (text: string) => normalize(text).match(/[a-z0-9]+/g) || [];
/** Filler words would match every Spanish CLDR phrase ("cucurucho de helado"). */
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'con', 'para', 'en', 'por', 'a', 'al', 'the', 'of', 'and', 'with', 'for', 'in']);
/** Words that name a style, not a subject: they choose among a subject's styles but never match a subject by themselves
 * ("dibujo de dinosaurio" must not return every drawing in the library). */
const STYLE_WORDS: Record<string, string[]> = { 'fluent-flat': ['plana', 'plano', 'flat'], 'fluent-color': ['degradado', 'degradados', 'gradient'], 'fluent-mono': ['linea', 'line', 'contorno', 'outline', 'mono'], 'fluent-3d': ['3d', 'dimensional', 'tridimensional'] };
const GENERIC = new Set(['dibujo', 'dibujos', 'ilustracion', 'ilustraciones', 'icono', 'iconos', 'imagen', 'imagenes', 'figura', 'figuras', 'color', 'colores', 'tienda', 'arte', 'sticker', 'stickers', 'drawing', 'drawings', 'illustration', 'illustrations', 'icon', 'icons', 'image', 'art', 'colour', 'store', ...Object.values(STYLE_WORDS).flat()]);
/** "helados", "fresas", "flores" and "flowers" meet their singular keywords. */
const variants = (word: string) => [word, ...(word.length > 3 && word.endsWith('s') ? [word.slice(0, -1)] : []), ...(word.length > 4 && word.endsWith('es') ? [word.slice(0, -2)] : [])];
const synonyms: Record<string, string> = { cafe: 'coffee', cafeteria: 'coffee', pan: 'bread', panaderia: 'bakery', pasteleria: 'pastry', frutilla: 'strawberry', palta: 'avocado', mascotas: 'pet', parrilla: 'grill', fiesta: 'party', heladeria: 'helado' };
const FAMILY_ORDER = ['fluent-flat', 'fluent-color', 'fluent-mono', 'fluent-3d'];
const familyRank = (family: string) => { const index = FAMILY_ORDER.indexOf(family); return index < 0 ? FAMILY_ORDER.length : index; };
const vocabularies = new WeakMap<CreativeAsset, Set<string>>();
const vocabulary = (asset: CreativeAsset) => {
  let found = vocabularies.get(asset);
  if (!found) vocabularies.set(asset, found = new Set(words(`${asset.subject.replace(/-/g, ' ')} ${asset.keywords.es.join(' ')} ${asset.keywords.en.join(' ')}`)));
  return found;
};

/** Retrieve by subject or style, Spanish or English, without choosing a visual identity for the model. */
export function searchCreativeAssets(query: string, limit = 12, tone: CreativeTone | null = null): CreativeAsset[] {
  const queryWords = words(query).filter(word => !STOP.has(word));
  const styles = new Set(queryWords.filter(word => GENERIC.has(word)));
  const terms = [...new Set(queryWords.filter(word => !GENERIC.has(word)).flatMap(word => [word, synonyms[word]].filter(Boolean) as string[]))];
  if (!terms.length) return [];
  return creativeAssetCatalog().filter(asset => !tone || asset.tone === tone).map(asset => {
    const known = vocabulary(asset);
    // The subject's own name ("helado", "cucurucho de helado") outranks a passing keyword ("granizado… helado").
    const name = new Set(words(`${asset.subject.replace(/-/g, ' ')} ${asset.keywords.es[0] ?? ''} ${asset.keywords.en[0] ?? ''}`));
    const score = terms.reduce((sum, term) => sum + (variants(term).some(v => known.has(v)) ? 1 : 0) + (variants(term).some(v => name.has(v)) ? 1 : 0), 0);
    const style = (STYLE_WORDS[asset.family] ?? []).some(word => styles.has(word)) ? 1 : 0;
    return { asset, score: score && score + style };
  }).filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.subject.localeCompare(b.asset.subject) || familyRank(a.asset.family) - familyRank(b.asset.family) || a.asset.family.localeCompare(b.asset.family))
    .slice(0, Math.max(0, limit)).map(result => result.asset);
}

function sourcePath(path: string): string {
  const motif = path.match(MOTIF_PATH);
  return motif ? join(kitPath('motif-packs'), motif[1], motif[2]) : join(root, path.slice('assets/creative/'.length));
}
export function creativeAssetFile(asset: CreativeAsset): SourceProjectFileDto {
  const bytes = readFileSync(sourcePath(asset.path));
  return { path: asset.path, content: bytes.toString(asset.path.endsWith('.svg') ? 'utf8' : 'base64'), encoding: asset.path.endsWith('.svg') ? 'utf8' : 'base64' };
}

let digests: Map<string, string> | undefined;
/** True when a snapshot file is library art exactly as the kit ships it; only such SVGs may reach a published site. */
export function isKitCreativeFile(file: SourceProjectFileDto): boolean {
  digests ??= new Map(creativeAssetCatalog().map(asset => [asset.path, asset.sha256]));
  const expected = digests.get(file.path);
  if (!expected || file.encoding === 'base64' || typeof file.content !== 'string') return false;
  return createHash('sha256').update(Buffer.from(file.content, 'utf8')).digest('hex') === expected;
}

export function withCreativeAssets(files: SourceProjectFileDto[]): SourceProjectFileDto[] {
  const source = files.filter(file => /\.(html|css|tsx|jsx|js)$/.test(file.path) && !file.path.startsWith('_compiled/')).map(file => file.content).join('\n');
  const result = [...files];
  // One pass over the source instead of a search per catalogue entry (about 1,800 of them).
  const named = new Set([...source.matchAll(/assets\/creative\/[a-z0-9-]+\/[a-z0-9-]+\.(?:svg|png)/g)].map(match => match[0]));
  const present = new Set(result.map(file => file.path));
  const selected = creativeAssetCatalog().filter(asset => named.has(asset.path) || present.has(asset.path));
  for (const asset of selected) if (!result.some(file => file.path === asset.path)) result.push(creativeAssetFile(asset));
  if (!selected.length) return result;
  const licensePath = 'assets/creative/LICENSE-fluent.txt';
  if (selected.some(asset => asset.family.startsWith('fluent-')) && !result.some(file => file.path === licensePath)) result.push({ path: licensePath, content: readFileSync(join(root, 'LICENSE-fluent.txt'), 'utf8') });
  const manifest = 'assets/creative/catalog.json';
  return [...result.filter(file => file.path !== manifest), { path: manifest, content: JSON.stringify({ version: 1, assets: selected }, null, 2) + '\n' }];
}
