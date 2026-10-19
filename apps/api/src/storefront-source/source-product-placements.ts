/** Showcase commerce §3 (spec 2026-10-19): blocks that place products — data-products, data-pagosya-spotlight, data-category,
 *  data-collection — must name the store's real products, categories and collections. YAPI finds ids with find_products. */
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export type PlacementCatalog = { items: Array<{ id: string; name: string; categoryId?: string | null; amount?: number; currency?: string }>; categories?: Array<{ id: string; name?: string }>; collections?: Array<{ slug: string }> };
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const attr = (source: string, name: string) => [...source.matchAll(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'g'))].map(match => match[1].trim());

export function productPlacementFindings(files: Array<Pick<SourceProjectFileDto, 'path' | 'content'>>, data: PlacementCatalog): string[] {
  const ids = new Set(data.items.map(item => item.id));
  const categories = new Set((data.categories ?? []).map(c => c.id)), collections = new Set((data.collections ?? []).map(c => c.slug));
  const findings: string[] = [];
  for (const file of files) {
    if (!/\.(html|tsx|jsx)$/.test(file.path)) continue;
    const named = [...attr(file.content, 'data-products').flatMap(list => list.split(',').map(id => id.trim()).filter(Boolean)), ...attr(file.content, 'data-pagosya-spotlight').filter(Boolean)];
    const unknown = [...new Set(named.filter(id => !ids.has(id)))];
    if (unknown.length) findings.push(`${file.path}: estos productos no existen en la tienda: ${unknown.join(', ')}. Usa find_products para obtener el id real.`);
    const badCategory = [...new Set(attr(file.content, 'data-category').filter(id => id && !categories.has(id)))];
    if (badCategory.length) findings.push(`${file.path}: categoría desconocida: ${badCategory.join(', ')}.`);
    const badCollection = [...new Set(attr(file.content, 'data-collection').filter(slug => slug && !collections.has(slug)))];
    if (badCollection.length) findings.push(`${file.path}: colección desconocida: ${badCollection.join(', ')}.`);
  }
  return findings;
}

export function findProducts(data: PlacementCatalog, query: string) {
  const words = fold(query).split(/\s+/).filter(word => word.length > 1);
  const category = (id?: string | null) => (data.categories ?? []).find(c => c.id === id)?.name ?? null;
  return data.items
    .map(item => ({ item, score: words.filter(word => fold(`${item.name} ${category(item.categoryId) ?? ''}`).includes(word)).length }))
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 10)
    .map(({ item }) => ({ id: item.id, name: item.name, category: category(item.categoryId), price: typeof item.amount === 'number' ? `${item.currency ?? 'BOB'} ${(item.amount / 100).toFixed(2)}` : '' }));
}

/** The store data a saved config.js carries; empty when it cannot be read. */
export function configCatalog(configSource: string | undefined): PlacementCatalog {
  try {
    const match = configSource?.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    const data = match ? JSON.parse(match[1])?.data : null;
    return { items: Array.isArray(data?.items) ? data.items : [], categories: data?.categories, collections: data?.collections };
  } catch { return { items: [] }; }
}
