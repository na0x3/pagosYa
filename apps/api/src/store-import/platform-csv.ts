/** Product CSV exports from Wix, WooCommerce and Tiendanube → the neutral store shape (owner 2026-10-25: «accept websites from wix
 *  and etc»). The most complete import for those platforms: their sites publish no catalog API, but every one exports a CSV. */
import { MAX_PRODUCTS, ShopifyReadError } from './shopify-reader';
import type { ShopifyCollection, ShopifyProduct, ShopifyStoreData, ShopifyVariant } from './shopify-types';

/** RFC 4180 with a chosen delimiter: Tiendanube exports with semicolons. */
export function parseDelimited(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim()));
}

/** «1.250,50», «1250,00», «Bs 12.50» → «1250.50», «1250.00», «12.50»; anything else → ''. */
export function decimalPrice(raw: string): string {
  let value = raw.replace(/[^\d.,]/g, '');
  if (!value) return '';
  const comma = value.lastIndexOf(','), dot = value.lastIndexOf('.');
  if (comma > -1 && dot > -1) value = comma > dot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  else if (comma > -1) value = /,\d{3}$/.test(value) && value.indexOf(',') === comma && value.length > 4 ? value.replace(',', '') : value.replace(',', '.');
  return /^\d{1,13}(?:\.\d{1,4})?$/.test(value) ? value : '';
}

const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const collect = (collections: Map<string, ShopifyCollection>, title: string, handle: string) => {
  const key = slug(title); if (!key) return;
  const collection = collections.get(key) ?? { handle: key, title: title.trim(), description: '', productHandles: [] };
  if (!collection.productHandles.includes(handle)) collection.productHandles.push(handle);
  collections.set(key, collection);
};
const variant = (id: string, options: string[], price: string, extra: Partial<ShopifyVariant> = {}): ShopifyVariant =>
  ({ id, options, sku: null, price, compareAtPrice: null, available: true, grams: 0, ...extra });

type Table = { header: string[]; rows: string[][]; get: (row: string[], label: string) => string; has: (label: string) => boolean };
function table(csv: string): Table | null {
  const clean = csv.replace(/^﻿/, '');
  const first = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const [header, ...rows] = parseDelimited(clean, delimiter);
  if (!header) return null;
  const trimmed = header.map(cell => cell.trim());
  const col = (label: string) => trimmed.findIndex(cell => cell.toLowerCase() === label.toLowerCase());
  return { header: trimmed, rows, has: label => col(label) >= 0, get: (row, label) => { const index = col(label); return index < 0 ? '' : (row[index] ?? '').trim(); } };
}

/** Wix (Tienda → Productos → Exportar): a Product row, then one Variant row per option combination. */
function readWix(t: Table): { products: ShopifyProduct[]; collections: Map<string, ShopifyCollection>; warnings: string[] } {
  const products = new Map<string, ShopifyProduct>(), collections = new Map<string, ShopifyCollection>(), basePrice = new Map<string, number>();
  const media = (value: string) => value.split(';').map(item => item.trim()).filter(Boolean).map(item => /^https?:\/\//i.test(item) ? item : `https://static.wixstatic.com/media/${item}`);
  for (const row of t.rows) {
    const handle = t.get(row, 'handleId'); if (!handle) continue;
    const kind = t.get(row, 'fieldType').toLowerCase();
    if (kind === 'product') {
      if (t.get(row, 'visible').toLowerCase() === 'false') continue;
      const price = decimalPrice(t.get(row, 'price'));
      const optionNames = [1, 2, 3, 4, 5, 6].map(n => t.get(row, `productOptionName${n}`)).filter(Boolean);
      products.set(handle, { handle, title: t.get(row, 'name'), bodyHtml: t.get(row, 'description'), productType: '', tags: [], optionNames, variants: [], images: media(t.get(row, 'productImageUrl')) });
      basePrice.set(handle, Number(price) || 0);
      if (!optionNames.length) products.get(handle)!.variants.push(variant(handle, [], price, { sku: t.get(row, 'sku') || null, available: !/^(?:0|outofstock)$/i.test(t.get(row, 'inventory')) }));
      for (const name of t.get(row, 'collection').split(';')) if (name.trim()) collect(collections, name, handle);
    } else if (kind === 'variant') {
      const product = products.get(handle); if (!product) continue;
      if (t.get(row, 'visible').toLowerCase() === 'false') continue;
      const options = product.optionNames.map((_, index) => t.get(row, `productOptionDescription${index + 1}`)).filter(Boolean);
      const surcharge = Number(decimalPrice(t.get(row, 'surcharge')) || 0);
      const price = ((basePrice.get(handle) ?? 0) + surcharge).toFixed(2);
      product.variants.push(variant(`${handle}#${product.variants.length + 1}`, options, price, { sku: t.get(row, 'sku') || null, available: !/^(?:0|outofstock)$/i.test(t.get(row, 'inventory')) }));
    }
  }
  return { products: [...products.values()].filter(product => product.variants.length && product.variants.every(v => v.price)), collections, warnings: [] };
}

/** WooCommerce (Productos → Exportar): simple and variable rows, variations pointing at their parent by id or SKU. */
function readWoo(t: Table): { products: ShopifyProduct[]; collections: Map<string, ShopifyCollection>; warnings: string[] } {
  const products = new Map<string, ShopifyProduct>(), byId = new Map<string, string>(), bySku = new Map<string, string>(), collections = new Map<string, ShopifyCollection>();
  const priceOf = (row: string[]) => decimalPrice(t.get(row, 'Sale price')) || decimalPrice(t.get(row, 'Regular price'));
  const compareOf = (row: string[]) => decimalPrice(t.get(row, 'Sale price')) && decimalPrice(t.get(row, 'Regular price')) ? decimalPrice(t.get(row, 'Regular price')) : null;
  const attributes = (row: string[]) => [1, 2, 3].map(n => ({ name: t.get(row, `Attribute ${n} name`), value: t.get(row, `Attribute ${n} value(s)`) })).filter(attribute => attribute.name);
  const available = (row: string[]) => !/^0$/.test(t.get(row, 'In stock?')) && t.get(row, 'Stock') !== '0';
  for (const row of t.rows) {
    const type = t.get(row, 'Type').toLowerCase();
    if (type.includes('variation') || t.get(row, 'Published') === '-1' || t.get(row, 'Published') === '0') continue;
    const name = t.get(row, 'Name'); if (!name) continue;
    const handle = slug(name) || t.get(row, 'ID');
    const variable = type.includes('variable');
    const product: ShopifyProduct = { handle, title: name, bodyHtml: t.get(row, 'Description') || t.get(row, 'Short description'), productType: '',
      tags: t.get(row, 'Tags').split(',').map(tag => tag.trim()).filter(Boolean), optionNames: variable ? attributes(row).map(attribute => attribute.name) : [],
      variants: variable ? [] : [variant(handle, [], priceOf(row), { sku: t.get(row, 'SKU') || null, compareAtPrice: compareOf(row), available: available(row) })],
      images: t.get(row, 'Images').split(',').map(url => url.trim()).filter(url => /^https?:\/\//i.test(url)) };
    products.set(handle, product); byId.set(t.get(row, 'ID'), handle); if (t.get(row, 'SKU')) bySku.set(t.get(row, 'SKU'), handle);
    for (const path of t.get(row, 'Categories').split(',')) { const leaf = path.split('>').pop()?.trim(); if (leaf) collect(collections, leaf, handle); }
  }
  for (const row of t.rows) {
    if (!t.get(row, 'Type').toLowerCase().includes('variation') || t.get(row, 'Published') === '-1') continue;
    const parent = t.get(row, 'Parent');
    const handle = /^id:/i.test(parent) ? byId.get(parent.slice(3)) : bySku.get(parent) ?? byId.get(parent);
    const product = handle ? products.get(handle) : undefined; if (!product) continue;
    const values = product.optionNames.map(name => attributes(row).find(attribute => attribute.name === name)?.value ?? '').filter(Boolean);
    const price = priceOf(row); if (!price || values.length !== product.optionNames.length) continue;
    const image = t.get(row, 'Images').split(',')[0]?.trim();
    product.variants.push(variant(`${product.handle}#${product.variants.length + 1}`, values, price, { sku: t.get(row, 'SKU') || null, compareAtPrice: compareOf(row), available: available(row), ...(image ? { imageSrc: image } : {}) }));
  }
  return { products: [...products.values()].filter(product => product.variants.length && product.variants.every(v => v.price)), collections, warnings: [] };
}

/** Tiendanube (Productos → Exportar): one row per variant, the first carrying the name; no photos in the file. */
function readTiendanube(t: Table): { products: ShopifyProduct[]; collections: Map<string, ShopifyCollection>; warnings: string[] } {
  const products = new Map<string, ShopifyProduct>(), collections = new Map<string, ShopifyCollection>();
  for (const row of t.rows) {
    const handle = t.get(row, 'Identificador de URL'); if (!handle) continue;
    let product = products.get(handle);
    if (!product) {
      if (/^no$/i.test(t.get(row, 'Mostrar en tienda'))) continue;
      product = { handle, title: t.get(row, 'Nombre'), bodyHtml: t.get(row, 'Descripción'), productType: '', tags: t.get(row, 'Tags').split(',').map(tag => tag.trim()).filter(Boolean),
        optionNames: [1, 2, 3].map(n => t.get(row, `Nombre de propiedad ${n}`)).filter(Boolean), variants: [], images: [] };
      products.set(handle, product);
      for (const path of t.get(row, 'Categorías').split(',')) { const leaf = path.split('>').pop()?.trim(); if (leaf) collect(collections, leaf, handle); }
    }
    const promo = decimalPrice(t.get(row, 'Precio promocional')), regular = decimalPrice(t.get(row, 'Precio'));
    const stock = t.get(row, 'Stock');
    product.variants.push(variant(`${handle}#${product.variants.length + 1}`, product.optionNames.map((_, index) => t.get(row, `Valor de propiedad ${index + 1}`)).filter(Boolean), promo || regular,
      { sku: t.get(row, 'SKU') || null, compareAtPrice: promo && regular ? regular : null, available: stock === '' || Number(stock) > 0, grams: Math.round((Number(decimalPrice(t.get(row, 'Peso (kg)'))) || 0) * 1000),
        ...(stock !== '' && Number.isFinite(Number(stock)) ? { inventoryQuantity: Math.max(0, Math.trunc(Number(stock))) } : {}) }));
  }
  return { products: [...products.values()].filter(product => product.title && product.variants.every(v => v.price)), collections,
    warnings: ['El CSV de Tiendanube no trae fotos: súbelas en cada producto o importa la tienda desde su dirección.'] };
}

/** A Wix, WooCommerce or Tiendanube product export; null when the file is none of them (the Shopify reader is tried first). */
export function readPlatformCsv(csv: string, name: string, host: string): (ShopifyStoreData & { platform: string }) | null {
  const t = table(csv);
  if (!t) return null;
  const [platform, read] = t.has('handleId') && t.has('fieldType') ? ['Wix', readWix] as const
    : t.has('Type') && t.has('Name') && (t.has('Regular price') || t.has('Sale price')) ? ['WooCommerce', readWoo] as const
    : t.has('Identificador de URL') && t.has('Precio') ? ['Tiendanube', readTiendanube] as const : [null, null] as const;
  if (!platform || !read) return null;
  const { products, collections, warnings } = read(t);
  if (!products.length) throw new ShopifyReadError('not_shopify', `No encontramos productos publicados con precio en ese CSV de ${platform}.`);
  return { platform, host, origin: `https://${host}/`, name, currency: 'BOB', products: products.slice(0, MAX_PRODUCTS), collections: [...collections.values()].slice(0, 50), articles: [],
    truncated: products.length > MAX_PRODUCTS, stockKnown: platform === 'Tiendanube',
    warnings: [`El CSV de ${platform} no dice la moneda: revisa que tus precios estén en bolivianos.`, ...warnings] };
}
