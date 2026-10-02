import type { SourceProjectSnapshot } from './source-project';
/** Bind review evidence to an actual catalog product, never an empty PDP. */
export function sourceVisualState(snapshot: SourceProjectSnapshot, page: string, requestedProductId?: string, allowEmptyCatalog = false): { productId?: string; query: string } {
  const entry = snapshot.files.find(file => file.path === page);
  const raw = snapshot.files.find(file => file.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1];
  let config: any = {};
  try { config = raw ? JSON.parse(raw) : {}; } catch {}
  const productPage = page === config.productPage || /data-pagosya-product-page/.test(entry?.content || '');
  if (!productPage) return { query: '' };
  const items: Array<{ id: string }> = Array.isArray(config.data?.items) ? config.data.items : [];
  const productId = requestedProductId || items[0]?.id;
  // Agent layout checks may inspect the honest empty state; never substitute a fictional product.
  if (allowEmptyCatalog && !requestedProductId && !items.length) return { query: '' };
  if (!productId || !items.some(item => item.id === productId)) throw new Error('Selecciona un producto real del catálogo para revisar esta página.');
  return { productId, query: '?id=' + encodeURIComponent(productId) };
}
