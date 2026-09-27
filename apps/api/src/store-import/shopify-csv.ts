import { MAX_PRODUCTS, ShopifyReadError } from './shopify-reader';
import type { ShopifyProduct, ShopifyStoreData } from './shopify-types';

/** RFC 4180: quoted cells, doubled quotes, newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim()));
}

/** Shopify's product export (Productos → Exportar): one row per variant or extra image, grouped by Handle. It carries exact stock. */
export function readShopifyCsv(csv: string, name: string, host: string): ShopifyStoreData {
  const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ''));
  const col = (label: string) => header?.indexOf(label) ?? -1;
  if (!header || col('Handle') < 0 || col('Title') < 0 || col('Variant Price') < 0) throw new ShopifyReadError('not_shopify', 'Ese archivo no es una exportación de productos de Shopify.');
  const get = (row: string[], label: string) => { const index = col(label); return index < 0 ? '' : (row[index] ?? '').trim(); };
  const products = new Map<string, ShopifyProduct & { draft: boolean }>();
  for (const row of rows) {
    const handle = get(row, 'Handle'); if (!handle) continue;
    let product = products.get(handle);
    if (!product) {
      product = { handle, title: get(row, 'Title'), bodyHtml: row[col('Body (HTML)')] ?? '', productType: get(row, 'Type'),
        tags: get(row, 'Tags').split(',').map(tag => tag.trim()).filter(Boolean),
        optionNames: [1, 2, 3].map(n => get(row, `Option${n} Name`)).filter(Boolean), variants: [], images: [],
        draft: ['draft', 'archived'].includes(get(row, 'Status').toLowerCase()) };
      products.set(handle, product);
    }
    const image = get(row, 'Image Src');
    if (image && !product.images.includes(image)) product.images.push(image);
    const price = get(row, 'Variant Price');
    if (price) {
      const quantity = get(row, 'Variant Inventory Qty');
      const inventoryQuantity = quantity === '' ? undefined : Math.max(0, Math.trunc(Number(quantity)) || 0);
      const variantImage = get(row, 'Variant Image');
      product.variants.push({ id: `${handle}#${product.variants.length + 1}`, options: [1, 2, 3].map(n => get(row, `Option${n} Value`)).filter(Boolean),
        sku: get(row, 'Variant SKU') || null, price, compareAtPrice: get(row, 'Variant Compare At Price') || null,
        available: inventoryQuantity === undefined ? true : inventoryQuantity > 0, grams: Number(get(row, 'Variant Grams')) || 0,
        ...(inventoryQuantity === undefined ? {} : { inventoryQuantity }), ...(variantImage ? { imageSrc: variantImage } : {}) });
    }
  }
  const active = [...products.values()].filter(product => !product.draft).map(({ draft: _draft, ...product }) => product);
  return { host, origin: `https://${host}/`, name, currency: 'BOB', products: active.slice(0, MAX_PRODUCTS), collections: [], articles: [],
    truncated: active.length > MAX_PRODUCTS, stockKnown: true, warnings: ['El CSV de Shopify no dice la moneda: revisa que tus precios estén en bolivianos.'] };
}
