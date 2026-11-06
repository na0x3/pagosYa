/* YAPI creates anything, part 2 (spec docs/superpowers/specs/2026-11-05-yapi-creates-anything-part-2-design.md): next to the store
 * ops, the template quick edit answers «catalogo» — products made, archived, restored, stocked, filed and given options; categories
 * made, renamed, removed and ordered; discount codes made and switched. This pure module reads those operations, checks them against
 * the store as the digest showed it and turns them into one change the caller writes, plus the words of the reply. */
import type { ProductVariant } from '../payment-links/product-variants';
import type { SourceVariantOperation } from './source-product-options';
import { bs, oneLine, priceCents, safe, short, type StoreEditPhoto, type StoreEditState } from './source-store-edit';

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

/** An existing category id, or `new:<n>` for the n-th category this change creates. */
export type CategoryRef = string;
export type CatalogNewProduct = { name: string; description: string; amount: number; currency: string; imageUrls: string[]; stock: number | null; variants: ProductVariant[]; categoryRef: CategoryRef | null };
export type CatalogProductUpdate = { id: string; status?: 'ACTIVE' | 'ARCHIVED'; stock?: number | null; categoryRef?: CategoryRef | null; variantOps?: SourceVariantOperation[] };
export type CatalogChange = {
  categories: { create: Array<{ ref: string; name: string }>; rename: Array<{ id: string; name: string }>; remove: Array<{ id: string; name: string }>; order?: string[] };
  products: { create: CatalogNewProduct[]; update: CatalogProductUpdate[] };
  codes: { create: Array<{ code: string; type: 'PERCENT' | 'FIXED'; value: number }>; flags: Array<{ id: string; isActive?: boolean; showInEmails?: boolean; showInAssistant?: boolean }> };
  /** Section links to follow after the write: `category:<name>` renamed or removed; removed ids also leave the menu. */
  links: { rename: Array<{ from: string; to: string }>; remove: Array<{ id: string; name: string }> };
};
export const emptyCatalogChange = (): CatalogChange => ({ categories: { create: [], rename: [], remove: [] }, products: { create: [], update: [] },
  codes: { create: [], flags: [] }, links: { rename: [], remove: [] } });
export const catalogChangeEmpty = (change: CatalogChange) => !change.categories.create.length && !change.categories.rename.length && !change.categories.remove.length
  && !change.categories.order && !change.products.create.length && !change.products.update.length && !change.codes.create.length && !change.codes.flags.length;

const discountText = (code: { type: 'PERCENT' | 'FIXED'; value: number }) => code.type === 'PERCENT' ? `${code.value} %` : bs(code.value);

/** The catalog operations applied to the store as the digest showed it. Every refusal says why; `answering` (the merchant answers a
 *  question YAPI asked, so the first request comes again) skips what that request already made without a word. */
export function applyCatalogOps(state: StoreEditState, ops: readonly CatalogOp[], photos: readonly StoreEditPhoto[] = [], options: { answering?: boolean } = {}):
  { change: CatalogChange; done: string[]; refused: string[]; notes: string[] } {
  const change = emptyCatalogChange();
  const done: string[] = [], refused: string[] = [], notes: string[] = [];
  const categories = state.categories ?? [];
  const codes = state.codes ?? [];
  const removed = new Set<string>();
  // Names to refs: the store's own categories, then the ones this request makes.
  const named = new Map<string, CategoryRef>(categories.map(category => [fold(category.name), category.id]));
  const categoryName = (ref: CategoryRef) => categories.find(category => category.id === ref)?.name ?? change.categories.create.find(category => category.ref === ref)?.name ?? '';
  /** A category by name: the store's, one made earlier in this request, or made now (counted against the limit); null when refused. */
  const categoryFor = (raw: string): CategoryRef | null => {
    const name = oneLine(raw, CATALOG_LIMITS.categoryName);
    if (!name || !safe(name)) { refused.push(`No usé la categoría «${short(raw, 40)}»: escribe su nombre con letras y números.`); return null; }
    const known = named.get(fold(name));
    if (known) {
      if (removed.has(known)) { refused.push(`La categoría «${name}» se quita en este mismo pedido.`); return null; }
      return known;
    }
    if (change.categories.create.length >= CATALOG_LIMITS.categories) { refused.push(`No creé la categoría «${name}»: como mucho ${CATALOG_LIMITS.categories} categorías nuevas por pedido.`); return null; }
    const ref = `new:${change.categories.create.length}`;
    change.categories.create.push({ ref, name });
    named.set(fold(name), ref);
    done.push(`creé la categoría «${name}»`);
    return ref;
  };
  let order: string[] | undefined;
  const codesSeen = new Set(codes.map(code => code.code));

  for (const op of ops) {
    switch (op.kind) {
      case 'category-add': { categoryFor(op.name); break; }
      case 'category-rename': {
        const category = categories[op.at];
        if (!category) break;
        const name = oneLine(op.name, CATALOG_LIMITS.categoryName);
        if (!name || !safe(name) || name === category.name) break;
        const other = named.get(fold(name));
        if (other && other !== category.id) { refused.push(`Ya tienes una categoría «${name}».`); break; }
        named.delete(fold(category.name)); named.set(fold(name), category.id);
        change.categories.rename.push({ id: category.id, name });
        change.links.rename.push({ from: category.name, to: name });
        done.push(`la categoría «${category.name}» ahora se llama «${name}»`);
        break;
      }
      case 'category-remove': {
        const category = categories[op.at];
        if (!category || removed.has(category.id)) break;
        removed.add(category.id);
        change.categories.remove.push({ id: category.id, name: category.name });
        change.links.remove.push({ id: category.id, name: category.name });
        done.push(`quité la categoría «${category.name}»${category.count ? ` (sus ${category.count} productos quedan sin categoría)` : ''}`);
        break;
      }
      case 'category-move': {
        const category = categories[op.at];
        const to = Number.parseInt(op.value, 10);
        if (!category || !Number.isInteger(to)) break;
        order ??= categories.map(item => item.id);
        const from = order.indexOf(category.id);
        const place = Math.max(0, Math.min(order.length - 1, to));
        if (from === place) break;
        order.splice(from, 1); order.splice(place, 0, category.id);
        done.push(`«${category.name}» va ${place === 0 ? 'primera' : `en el lugar ${place + 1}`} en las categorías`);
        break;
      }
      case 'code-add': {
        const discount = discountValue(op.value);
        const typed = op.name.trim().toUpperCase().replace(/\s+/g, '');
        if (!discount) { refused.push(`No creé el código${typed ? ` ${short(typed, 32)}` : ''}: dime el descuento, por ejemplo «20 %» o «Bs 30».`); break; }
        let code = typed;
        if (!code) {
          const base = `DESCUENTO${discount.type === 'PERCENT' ? discount.value : Math.round(discount.value / 100)}`;
          code = base;
          for (let n = 2; codesSeen.has(code) && n < 10; n++) code = `${base}-${n}`;
        }
        if (!CODE_PATTERN.test(code)) { refused.push(`No creé el código «${short(op.name.trim(), 32)}»: usa de 3 a 32 letras, números, guion o guion bajo.`); break; }
        const existing = codes.find(item => item.code === code);
        const same = existing && existing.type === discount.type && existing.value === discount.value;
        if (existing) {
          if (same && !existing.active) { change.codes.flags.push({ id: existing.id, isActive: true }); done.push(`volví a activar el código ${code} (${discountText(discount)} de descuento)`); }
          else if (!(same && options.answering)) refused.push(`El código ${code} ya existe${existing.active ? '' : ' (apagado)'} con ${discountText(existing)} de descuento: elige otro nombre.`);
          break;
        }
        if (codesSeen.has(code)) break;
        if (change.codes.create.length >= CATALOG_LIMITS.codes) { refused.push(`No creé el código ${code}: como mucho ${CATALOG_LIMITS.codes} códigos nuevos por pedido.`); break; }
        codesSeen.add(code);
        change.codes.create.push({ code, ...discount });
        done.push(`el código ${code} da ${discountText(discount)} de descuento y ya funciona en el pago`);
        break;
      }
      case 'code-off': case 'code-on': {
        const code = codes[op.at];
        const on = op.kind === 'code-on';
        if (!code || code.active === on) break;
        change.codes.flags.push({ id: code.id, isActive: on });
        done.push(on ? `volví a activar el código ${code.code}` : `apagué el código ${code.code}: ya no da descuento`);
        break;
      }
      case 'code-show': {
        const code = codes[op.at];
        const where = fold(op.option);
        const yes = /^(si|yes|true)$/.test(fold(op.value));
        if (!code || (where !== 'correos' && where !== 'asistente')) break;
        if ((where === 'correos' ? code.emails : code.assistant) === yes) break;
        change.codes.flags.push(where === 'correos' ? { id: code.id, showInEmails: yes } : { id: code.id, showInAssistant: yes });
        done.push(where === 'correos' ? `el código ${code.code} ${yes ? 'ahora puede salir' : 'ya no sale'} en los correos` : `el asistente ${yes ? 'ahora ofrece' : 'ya no ofrece'} el código ${code.code}`);
        break;
      }
      default: break; // products and options: Task 4
    }
  }
  if (order) change.categories.order = order;
  void photos; void categoryName; void notes;
  return { change, done, refused, notes };
}
