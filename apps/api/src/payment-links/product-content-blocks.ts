import { BadRequestException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';
import { MAX_UPLOADED_FILE_URL_LENGTH, UPLOADED_FILE_URL_PATTERN } from '../uploads/uploaded-file-url.constants';

export const MAX_CONTENT_BLOCKS = 6;
export type MediaBlock = { id: string; type: 'media'; imageUrl: string; alt: string; caption?: string };
export type CompareBlock = { id: string; type: 'compare'; title: string; beforeUrl: string; afterUrl: string; beforeLabel: string; afterLabel: string; alt: string };
export type ContentBlock = MediaBlock | CompareBlock;
const idPart = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

function parseBlock(value: unknown, ids: Set<string>): ContentBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Revisa el bloque del producto.');
  const row = value as Record<string, unknown>;
  const text = (field: string, max: number, optional = false): string => {
    if (optional && row[field] == null) return '';
    const value = typeof row[field] === 'string' ? row[field].trim() : null;
    if (value === null || (!optional && !value) || value.length > max || !SAFE_TEXT_PATTERN.test(value)) throw new BadRequestException(`Revisa el texto ${field} del bloque (hasta ${max} caracteres).`);
    return value;
  };
  const url = (field: string) => {
    const value = text(field, MAX_UPLOADED_FILE_URL_LENGTH);
    if (!UPLOADED_FILE_URL_PATTERN.test(value)) throw new BadRequestException('Usa una foto subida al producto para cada bloque.');
    return value;
  };
  let id = typeof row.id === 'string' && /^blk_[a-z0-9]{12}$/.test(row.id) ? row.id : `blk_${idPart()}`;
  while (ids.has(id)) id = `blk_${idPart()}`;
  const alt = text('alt', 160);
  let block: ContentBlock;
  if (row.type === 'media') {
    const caption = text('caption', 140, true);
    block = { id, type: 'media', imageUrl: url('imageUrl'), alt, ...(caption ? { caption } : {}) };
  } else if (row.type === 'compare') {
    block = { id, type: 'compare', title: text('title', 60), beforeUrl: url('beforeUrl'), afterUrl: url('afterUrl'), beforeLabel: text('beforeLabel', 24), afterLabel: text('afterLabel', 24), alt };
  } else throw new BadRequestException('Elige un bloque de foto con texto o antes / después.');
  ids.add(id);
  return block;
}

export function normalizeContentBlocks(rows: unknown, _existing?: ContentBlock[]): ContentBlock[] {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new BadRequestException('Revisa los bloques del producto.');
  if (rows.length > MAX_CONTENT_BLOCKS) throw new BadRequestException('Usa hasta 6 bloques por producto.');
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
