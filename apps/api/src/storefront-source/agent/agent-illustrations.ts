import sharp from 'sharp';
import { creativeAssetFile, searchCreativeAssets, type CreativeAsset, type CreativeTone } from '../source-creative-assets';

const CELL = 160, PAD = 20, COLUMNS = 4, LIMIT = 12;
/** The matches on one light sheet, numbered like the JSON list, so the model chooses by sight. Store-colour art
 * (currentColor) renders in a neutral ink. */
export async function illustrationSheet(assets: CreativeAsset[]): Promise<string> {
  const width = COLUMNS * CELL, height = Math.ceil(assets.length / COLUMNS) * CELL;
  const tiles = await Promise.all(assets.map(async (asset, index) => {
    const file = creativeAssetFile(asset);
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
    const art = await sharp(bytes, { density: 288 }).resize(CELL - 2 * PAD, CELL - 2 * PAD, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return { input: art, left: (index % COLUMNS) * CELL + PAD, top: Math.floor(index / COLUMNS) * CELL + PAD };
  }));
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${assets.map((_, index) => `<text x="${(index % COLUMNS) * CELL + 8}" y="${Math.floor(index / COLUMNS) * CELL + 18}" font-family="sans-serif" font-size="15" font-weight="700" fill="#6b6459">${index + 1}</text>`).join('')}</svg>`);
  const sheet = await sharp({ create: { width, height, channels: 3, background: '#f6f3ec' } }).composite([...tiles, { input: labels, left: 0, top: 0 }]).jpeg({ quality: 80 }).toBuffer();
  return 'data:image/jpeg;base64,' + sheet.toString('base64');
}

/** The tile each subject shows: flat for colour, single-colour line art for the store tone. */
const SHOWN: Record<CreativeTone | 'any', string[]> = { colour: ['fluent-flat', 'fluent-color', 'fluent-3d'], store: ['fluent-mono'], any: ['fluent-flat', 'fluent-color', 'fluent-3d'] };

/** A motif pack is one look; more than two of its drawings would crowd out other subjects. */
const PACK_TILES = 2;
/** One tile per subject, best match first, with the subject's other styles as exact paths; twelve rows of the raw
 * search would otherwise be three subjects in four styles. */
function subjectsFor(query: string, tone: CreativeTone | null) {
  const rows = searchCreativeAssets(query, Number.MAX_SAFE_INTEGER, tone);
  const perPack = new Map<string, number>();
  const order = [...new Set(rows.map(asset => asset.subject))].filter(subject => {
    const family = rows.find(asset => asset.subject === subject)!.family;
    if (!family.startsWith('motif-')) return true;
    perPack.set(family, (perPack.get(family) ?? 0) + 1);
    return perPack.get(family)! <= PACK_TILES;
  }).slice(0, LIMIT);
  return order.map(subject => {
    const styles = rows.filter(asset => asset.subject === subject);
    const shown = SHOWN[tone ?? 'any'].map(family => styles.find(asset => asset.family === family)).find(Boolean) ?? styles[0];
    return { shown, variants: styles.filter(asset => asset !== shown).map(asset => asset.path) };
  });
}

export async function searchIllustrations(query: string, tone: CreativeTone | null): Promise<{ output: string; image?: string }> {
  const subjects = subjectsFor(query, tone);
  if (!subjects.length) return { output: `No hay ilustraciones para «${query}». Prueba otra palabra en español o inglés, o el tema general. Si nada sirve, dibuja la figura a mano siguiendo la guía de ILLUSTRATIONS.` };
  const matches = subjects.map(({ shown, variants }, index) => ({ n: index + 1, path: shown.path, subject: shown.subject, family: shown.family, tone: shown.tone, description: shown.description, ...(variants.length ? { variants } : {}) }));
  const use = 'Colour art: <img src="/PATH" alt="" aria-hidden="true">. Store-colour art (fluent-mono, motif-*): <Illustration src="/PATH" tone="accent" size={96} /> imported from @pagosya/ui (tone: ink, accent, onAccent, paper, surface or a store CSS variable such as var(--butter)). variants lists the same subject in other styles. Copy paths exactly. One family per page.';
  return { output: JSON.stringify({ matches, use }), image: await illustrationSheet(subjects.map(subject => subject.shown)) };
}
