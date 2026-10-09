import { BadRequestException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from '../uploads/uploaded-file-url.constants';
import { PRODUCT_HIGHLIGHT_ICONS, type ProductHighlightIcon } from './product-highlights';

export const MAX_CONTENT_BLOCKS = 12;
/** The long product page's sections (spec 2026-10-09); media and compare are the original photo blocks. */
export const PAGE_BLOCK_TYPES = ['story', 'versus', 'faq', 'details', 'features'] as const;
/** Only YAPI's blocks are marked; a block without a marker is the merchant's and YAPI never rewrites it. */
type Origin = { origin?: 'yapi' };
export type MediaBlock = { id: string; type: 'media'; imageUrl: string; alt: string; caption?: string } & Origin;
export type CompareBlock = { id: string; type: 'compare'; title: string; beforeUrl: string; afterUrl: string; beforeLabel: string; afterLabel: string; alt: string } & Origin;
export type StoryBlock = { id: string; type: 'story'; title?: string; problem: string; tried: string; solution: string } & Origin;
export type VersusBlock = { id: string; type: 'versus'; title?: string; ours: string; theirs: string; rows: Array<{ label: string; ours: boolean; theirs: boolean }> } & Origin;
export type FaqBlock = { id: string; type: 'faq'; title?: string; items: Array<{ q: string; a: string }> } & Origin;
export type DetailsBlock = { id: string; type: 'details'; items: Array<{ imageUrl: string; title: string; text: string; alt: string }> } & Origin;
export type FeaturesBlock = { id: string; type: 'features'; title?: string; items: Array<{ icon: ProductHighlightIcon; label: string; detail: string }> } & Origin;
export type ContentBlock = MediaBlock | CompareBlock | StoryBlock | VersusBlock | FaqBlock | DetailsBlock | FeaturesBlock;
const idPart = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const record = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(message);
  return value as Record<string, unknown>;
};
type Reader = { text(field: string, max: number, optional?: boolean): string; url(field: string): string; flag(field: string): boolean; list(field: string, min: number, max: number): Reader[]; raw: Record<string, unknown> };
function reader(row: Record<string, unknown>): Reader {
  const text = (field: string, max: number, optional = false): string => {
    if (optional && row[field] == null) return '';
    const value = typeof row[field] === 'string' ? (row[field] as string).trim() : null;
    if (value === null || (!optional && !value) || value.length > max || !SAFE_TEXT_PATTERN.test(value)) throw new BadRequestException(`Revisa el texto ${field} del bloque (hasta ${max} caracteres).`);
    return value;
  };
  const url = (field: string) => {
    const value = text(field, MAX_UPLOADED_FILE_URL_LENGTH);
    if (!UPLOADED_FILE_URL_PATTERN.test(value)) throw new BadRequestException('Usa una foto subida al producto para cada bloque.');
    return value;
  };
  const flag = (field: string) => {
    if (typeof row[field] !== 'boolean') throw new BadRequestException(`Marca ${field} con sí o no.`);
    return row[field] as boolean;
  };
  const list = (field: string, min: number, max: number) => {
    const value = row[field];
    if (!Array.isArray(value) || value.length < min || value.length > max) throw new BadRequestException(`Revisa la lista ${field} del bloque (${min} a ${max}).`);
    return value.map(item => reader(record(item, `Revisa la lista ${field} del bloque.`)));
  };
  return { text, url, flag, list, raw: row };
}

function parseBlock(value: unknown, ids: Set<string>): ContentBlock {
  const row = record(value, 'Revisa el bloque del producto.');
  const r = reader(row);
  let id = typeof row.id === 'string' && /^blk_[a-z0-9]{12}$/.test(row.id) ? row.id : `blk_${idPart()}`;
  while (ids.has(id)) id = `blk_${idPart()}`;
  const origin: Origin = row.origin === 'yapi' ? { origin: 'yapi' } : {};
  const title = () => { const value = r.text('title', 60, true); return value ? { title: value } : {}; };
  let block: ContentBlock;
  switch (row.type) {
    case 'media': {
      const alt = r.text('alt', 160), caption = r.text('caption', 140, true);
      block = { id, type: 'media', imageUrl: r.url('imageUrl'), alt, ...(caption ? { caption } : {}), ...origin };
      break;
    }
    case 'compare': {
      const alt = r.text('alt', 160);
      block = { id, type: 'compare', title: r.text('title', 60), beforeUrl: r.url('beforeUrl'), afterUrl: r.url('afterUrl'), beforeLabel: r.text('beforeLabel', 24), afterLabel: r.text('afterLabel', 24), alt, ...origin };
      break;
    }
    case 'story':
      block = { id, type: 'story', ...title(), problem: r.text('problem', 220), tried: r.text('tried', 220), solution: r.text('solution', 260), ...origin };
      break;
    case 'versus':
      block = { id, type: 'versus', ...title(), ours: r.text('ours', 24), theirs: r.text('theirs', 24), rows: r.list('rows', 2, 8).map(item => ({ label: item.text('label', 48), ours: item.flag('ours'), theirs: item.flag('theirs') })), ...origin };
      break;
    case 'faq':
      block = { id, type: 'faq', ...title(), items: r.list('items', 2, 8).map(item => ({ q: item.text('q', 120), a: item.text('a', 400) })), ...origin };
      break;
    case 'details':
      block = { id, type: 'details', items: r.list('items', 1, 4).map(item => ({ imageUrl: item.url('imageUrl'), title: item.text('title', 40), text: item.text('text', 160), alt: item.text('alt', 160) })), ...origin };
      break;
    case 'features':
      block = { id, type: 'features', ...title(), items: r.list('items', 3, 6).map(item => {
        const icon = item.raw.icon;
        if (!PRODUCT_HIGHLIGHT_ICONS.includes(icon as ProductHighlightIcon)) throw new BadRequestException('Elige un icono de la lista para cada característica.');
        return { icon: icon as ProductHighlightIcon, label: item.text('label', 24), detail: item.text('detail', 60) };
      }), ...origin };
      break;
    default: throw new BadRequestException('Elige un tipo de bloque de la lista.');
  }
  ids.add(id);
  return block;
}

export function normalizeContentBlocks(rows: unknown, _existing?: ContentBlock[]): ContentBlock[] {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new BadRequestException('Revisa los bloques del producto.');
  if (rows.length > MAX_CONTENT_BLOCKS) throw new BadRequestException(`Usa hasta ${MAX_CONTENT_BLOCKS} bloques por producto.`);
  const ids = new Set<string>();
  return rows.map(row => parseBlock(row, ids));
}

export function readContentBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: ContentBlock[] = [], ids = new Set<string>();
  for (const row of value) {
    try { blocks.push(parseBlock(row, ids)); } catch { /* Old or invalid stored rows never break the public catalog. */ }
    if (blocks.length === MAX_CONTENT_BLOCKS) break;
  }
  return blocks;
}
