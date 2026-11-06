/* YAPI creates anything, part 2 (spec docs/superpowers/specs/2026-11-05-yapi-creates-anything-part-2-design.md): next to the store
 * ops, the template quick edit answers «catalogo» — products made, archived, restored, stocked, filed and given options; categories
 * made, renamed, removed and ordered; discount codes made and switched. This pure module reads those operations, checks them against
 * the store as the digest showed it and turns them into one change the caller writes, plus the words of the reply. */
import { priceCents } from './source-store-edit';

export const CATALOG_KINDS = ['product-add', 'product-archive', 'product-restore', 'product-stock', 'product-category', 'option-add', 'option-remove',
  'option-price', 'option-stock', 'category-add', 'category-rename', 'category-remove', 'category-move', 'code-add', 'code-off', 'code-on', 'code-show'] as const;
export type CatalogKind = typeof CATALOG_KINDS[number];
export type CatalogOp = { kind: CatalogKind; at: number; name: string; price: string; stock: string; text: string; category: string; photo: string; option: string; value: string };
export const CATALOG_LIMITS = { products: 6, categories: 5, codes: 3, categoryName: 60, optionName: 60, shown: 40 } as const;
const FIELDS = ['name', 'price', 'stock', 'text', 'category', 'photo', 'option', 'value'] as const;
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function catalogOpSchema() {
  return { type: 'object', additionalProperties: false, required: ['kind', 'at', ...FIELDS], properties: {
    kind: { type: 'string', enum: [...CATALOG_KINDS] }, at: { type: 'integer' }, ...Object.fromEntries(FIELDS.map(field => [field, { type: 'string' }])) } };
}

/** The model's catalog operations, checked: known kinds only, every field a string. */
export function readCatalogOps(raw: unknown): CatalogOp[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((op): op is Record<string, unknown> => Boolean(op) && typeof op === 'object' && (CATALOG_KINDS as readonly string[]).includes(String((op as { kind?: unknown }).kind)))
    .map(op => ({ kind: op.kind as CatalogKind, at: Number.isInteger(op.at) ? op.at as number : -1,
      ...Object.fromEntries(FIELDS.map(field => [field, String(op[field] ?? '')])) }) as CatalogOp);
}

/** «5» → 5, «sin límite» → null, «agotado» → 0, "" → undefined (not given); NaN when it is not a stock. */
export function stockValue(text: string): number | null | undefined {
  const value = fold(text);
  if (!value) return undefined;
  if (/^(sin limite|ilimitad[oa]s?|unlimited|infinito)$/.test(value)) return null;
  if (/^(agotad[oa]s?|sold out)$/.test(value)) return 0;
  const match = /^(\d{1,7})(?: ?(?:unidades|unidad|u\.?))?$/.exec(value);
  return match && Number(match[1]) <= 1_000_000 ? Number(match[1]) : Number.NaN;
}

/** «20 %», «20%» → percent; «Bs 30» → cents; null when it is neither, or a percent outside 1–99. */
export function discountValue(text: string): { type: 'PERCENT' | 'FIXED'; value: number } | null {
  const value = text.trim();
  const percent = /^(\d{1,3})\s*(?:%|por ?ciento)$/i.exec(value);
  if (percent) { const n = Number(percent[1]); return n >= 1 && n <= 99 ? { type: 'PERCENT', value: n } : null; }
  if (!/\b(?:bs|bob)\b/i.test(value)) return null;
  const cents = priceCents(value);
  return cents ? { type: 'FIXED', value: cents } : null;
}

export const CATALOG_EDIT_PROMPT = `
Catálogo: «tienda» trae también «productos» (con stock, categoria y opciones), «archivados», «categorias» y «codigos» (de descuento).
Los cambios del catálogo van en «catalogo», operaciones { kind, at, name, price, stock, text, category, photo, option, value } (los
que no se usan: at -1, el resto ""):
- product-add: un producto nuevo. name y price (el precio que dijo el comercio, «120»). text = su descripción en 1 o 2 frases con la
  voz de la tienda y SOLO con lo que dijo el comercio (nada de ingredientes, tallas, materiales ni promesas que no dijo). category =
  su categoría (una de «categorias» o una nueva). photo = una foto de «fotos» con de "mensaje" (si no mandó foto, ""). stock = las
  unidades si las dijo («5», «sin límite»). Si tiene opciones («chica Bs 80, grande Bs 120», «tallas S, M y L»), value = una por
  línea «nombre | precio | stock» (precio "" = el del producto; stock "" = sin límite) y price puede ir "". Como mucho 6 por pedido.
  Nunca inventes un precio: si falta, no lo agregues y pregunta con «ask» («¿A cuánto vendes la Torta de chocolate?»).
- product-archive (quitar, borrar, eliminar o sacar un producto: queda archivado) y product-restore (volver a poner uno de
  «archivados»): at = su número en esa lista.
- product-stock: at, stock («5», «sin límite», «agotado»). Un producto con opciones lleva option-stock por opción.
- product-category: at, category = el nombre de la categoría ("" = sin categoría).
- option-add (at, option = el nombre, price, stock), option-remove (at, option), option-price (at, option, price), option-stock
  (at, option, stock): las opciones de un producto de «productos», por su nombre.
- category-add (name), category-rename (at, name = el nombre nuevo), category-remove (at; sus productos quedan sin categoría),
  category-move (at, value = el lugar nuevo, 0 = la primera).
- code-add: name = el código en mayúsculas (VERANO20; si el comercio no lo nombró, uno corto con sus palabras), value = el
  descuento: «20 %» o «Bs 30». Nunca inventes el descuento: si falta, pregunta con «ask». Como mucho 3 por pedido.
- code-off (quitar, borrar, apagar o desactivar un código) y code-on (volver a activarlo): at = su número en «codigos».
- code-show: at, option = correos o asistente, value = si o no (que el código salga en los correos o que el asistente lo ofrezca).
Los números son los que ves. Una categoría se nombra por su nombre, también si se crea en el mismo pedido. El nombre, el precio de
un producto sin opciones, la descripción o la foto de un producto que ya existe se cambian con «store» (part product), no aquí.
Los productos, categorías y códigos nunca van en «rest».`;
