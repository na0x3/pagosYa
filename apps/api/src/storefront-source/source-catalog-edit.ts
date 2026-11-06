/* YAPI creates anything, part 2 (spec docs/superpowers/specs/2026-11-05-yapi-creates-anything-part-2-design.md): next to the store
 * ops, the template quick edit answers «catalogo» — products made, archived, restored, stocked, filed and given options; categories
 * made, renamed, removed and ordered; discount codes made and switched. This pure module reads those operations, checks them against
 * the store as the digest showed it and turns them into one change the caller writes, plus the words of the reply. */
import { normalizeProductVariants, totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import { applyVariantOperations, type SourceVariantOperation } from './source-product-options';
import type { LayoutBlock } from './source-section-library';
import type { StoreMenu } from './source-store-menu';
import { STORE_CAPS, block, bs, oneLine, photoRef, priceCents, safe, short, type StoreEditPhoto, type StoreEditProduct, type StoreEditState } from './source-store-edit';

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
  línea «nombre | precio | stock» (precio "" = el del producto; stock "" = sin límite) y price puede ir "". Colores, tallas, sabores
  y otros grupos llevan su grupo delante, en todas las líneas: «Color: Rojo | 90 | 3»; con color y talla, una línea por cada
  combinación que existe: «Color: Rojo / Talla: S | 90 | 3». El grupo de los colores se llama Color y el de las tallas Talla. Como
  mucho 6 por pedido.
  Nunca inventes un precio: si falta, no lo agregues y pregunta con «ask» («¿A cuánto vendes la Torta de chocolate?»).
- product-archive (quitar, borrar, eliminar o sacar un producto: queda archivado) y product-restore (volver a poner uno de
  «archivados»): at = su número en esa lista.
- product-stock: at, stock («5», «sin límite», «agotado»). Un producto con opciones lleva option-stock por opción.
- product-category: at, category = el nombre de la categoría ("" = sin categoría).
- option-add (at, option = el nombre, price, stock), option-remove (at, option), option-price (at, option, price), option-stock
  (at, option, stock): las opciones de un producto de «productos», por su nombre. Si el producto tiene «grupos», una opción nueva
  lleva cada grupo: «Color: Verde» o «Color: Verde / Talla: M».
- category-add (name), category-rename (at, name = el nombre nuevo), category-remove (at; sus productos quedan sin categoría),
  category-move (at, value = el lugar nuevo, 0 = la primera).
- code-add: name = el código en mayúsculas (VERANO20; si el comercio no lo nombró, uno corto con sus palabras), value = el
  descuento: «20 %» o «Bs 30». Nunca inventes el descuento: si falta, pregunta con «ask». Como mucho 3 por pedido.
- code-off (quitar, borrar, apagar o desactivar un código) y code-on (volver a activarlo): at = su número en «codigos».
- code-show: at, option = correos o asistente, value = si o no (que el código salga en los correos o que el asistente lo ofrezca).
Los números son los que ves. Una categoría se nombra por su nombre, también si se crea en el mismo pedido. El nombre, el precio de
un producto sin opciones, la descripción o la foto de un producto que ya existe se cambian con «store» (part product), no aquí.
Los productos, categorías y códigos nunca van en «rest».`;

type OptionParts = { label: string; options?: Array<{ name: string; value: string }> };
/** Owner 2026-11-06: «Color: Rojo / Talla: S» → its groups, saved as Productos saves them (the product page draws a «Color» group
 *  as dots, then the size); «Chica» → a plain option. Null when it cannot be read, or mixes grouped and plain parts. */
function optionParts(raw: string): OptionParts | null {
  const parts = raw.split('/').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const pairs = parts.map(part => /^([^:]{1,40}):\s*(.{1,40})$/.exec(part));
  if (pairs.every(Boolean)) {
    const options = pairs.map(pair => ({ name: oneLine(pair![1], 40), value: oneLine(pair![2], 40) }));
    if (options.length > 6 || options.some(option => !option.name || !option.value || !safe(option.name) || !safe(option.value))) return null;
    return { label: options.map(option => option.value).join(' / '), options };
  }
  if (pairs.some(Boolean)) return null;
  const label = oneLine(raw, CATALOG_LIMITS.optionName);
  return label && safe(label) ? { label } : null;
}

/** «Chica | 15 | 5» or «Color: Rojo / Talla: S | 90 | 3» lines → a new product's options (at least two, as Productos asks), or why not. */
function optionsFrom(lines: readonly string[], price: number | null): ProductVariant[] | string {
  if (!lines.length) return [];
  const asked: Array<{ name: string; amount: number; stock: number | null; options?: OptionParts['options'] }> = [];
  for (const line of lines) {
    const [rawName = '', rawPrice = '', rawStock = ''] = line.split('|').map(part => part.trim());
    const parts = optionParts(rawName);
    if (!parts) return `la opción «${short(rawName, 30)}» no tiene nombre.`;
    const name = parts.label;
    const amount = rawPrice ? priceCents(rawPrice) : price;
    if (amount === null) return `dime el precio de la opción «${name}».`;
    const stock = stockValue(rawStock);
    if (Number.isNaN(stock)) return `«${short(rawStock, 20)}» no es un stock.`;
    asked.push({ name, amount, stock: stock ?? null, ...(parts.options ? { options: parts.options } : {}) });
  }
  // The store page draws a product's options only when all of them carry the same groups, or none does.
  if (asked.some(option => option.options) && !asked.every(option => option.options)) return 'escribe el grupo en todas las opciones («Color: Rojo») o en ninguna.';
  try { return normalizeProductVariants(asked as never); } catch (error) { return `${String((error as Error).message).replace(/\.$/, '')}.`; }
}
const currencyOf = (state: StoreEditState) => state.products.find(product => product.currency)?.currency ?? 'BOB';
const listNames = (names: readonly string[]) => names.length > 1 ? `${names.slice(0, -1).map(name => `«${name}»`).join(', ')} y «${names.at(-1)}»` : `«${names[0]}»`;

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
  // Final review 2026-11-06: a category this request removes is never used, even by an op that comes before its removal.
  const removing = new Set(ops.filter(op => op.kind === 'category-remove').map(op => categories[op.at]?.id).filter((id): id is string => Boolean(id)));
  const shown = state.products.slice(0, CATALOG_LIMITS.shown);
  const archived = state.archived ?? [];
  const productUpdate = (id: string) => { let entry = change.products.update.find(item => item.id === id); if (!entry) { entry = { id }; change.products.update.push(entry); } return entry; };
  const optionDone = new Map<string, string[]>();
  const noPhoto: string[] = [];
  // Names to refs: the store's own categories, then the ones this request makes.
  const named = new Map<string, CategoryRef>(categories.map(category => [fold(category.name), category.id]));
  const categoryName = (ref: CategoryRef) => categories.find(category => category.id === ref)?.name ?? change.categories.create.find(category => category.ref === ref)?.name ?? '';
  /** A category by name: the store's, one made earlier in this request, or made now (counted against the limit); null when refused. */
  const categoryFor = (raw: string): CategoryRef | null => {
    // A list that could not be read is never guessed: it would make a twin of a category the store has.
    if (!state.categories) { refused.push('No pude leer tus categorías: inténtalo de nuevo en un momento.'); return null; }
    const name = oneLine(raw, CATALOG_LIMITS.categoryName);
    if (!name || !safe(name)) { refused.push(`No usé la categoría «${short(raw, 40)}»: escribe su nombre con letras y números.`); return null; }
    const known = named.get(fold(name));
    if (known) {
      if (removing.has(known)) { refused.push(`La categoría «${name}» se quita en este mismo pedido.`); return null; }
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
        if (!state.codes) { refused.push('No pude leer tus códigos de descuento: inténtalo de nuevo en un momento.'); break; }
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
      case 'product-add': {
        const name = oneLine(op.name, STORE_CAPS.productName);
        if (!name || !safe(name)) break;
        if (state.products.some(item => fold(item.name) === fold(name)) || change.products.create.some(item => fold(item.name) === fold(name))) {
          if (!options.answering) refused.push(`Ya tienes «${short(name, 40)}» en la tienda.`);
          break;
        }
        if (change.products.create.length >= CATALOG_LIMITS.products) { refused.push(`No creé «${short(name, 40)}»: como mucho ${CATALOG_LIMITS.products} productos nuevos por pedido.`); break; }
        const price = op.price.trim() ? priceCents(op.price) : null;
        if (op.price.trim() && price === null) { refused.push(`No creé «${short(name, 40)}»: «${short(op.price, 20)}» no es un precio.`); break; }
        const variants = optionsFrom(op.value.split('\n').map(line => line.trim()).filter(Boolean), price);
        if (typeof variants === 'string') { refused.push(`No creé «${short(name, 40)}»: ${variants}`); break; }
        if (!variants.length && price === null) { refused.push(`No creé «${short(name, 40)}»: dime su precio.`); break; }
        const stock = stockValue(op.stock);
        if (Number.isNaN(stock)) { refused.push(`No creé «${short(name, 40)}»: «${short(op.stock, 20)}» no es un número de unidades.`); break; }
        const categoryRef = op.category.trim() ? categoryFor(op.category) : null;
        if (op.category.trim() && categoryRef === null) break;
        const description = block(op.text, STORE_CAPS.productDescription);
        // A new product's photo is only one sent with this message (never another product's or the store's).
        const sent = op.photo.trim() ? photoRef(op.photo, photos) : undefined;
        const photo = sent && photos.find(item => item.url === sent)?.from === 'mensaje' ? sent : undefined;
        const amount = variants.length ? Math.min(...variants.map(variant => variant.amount)) : price!;
        change.products.create.push({ name, description: description && safe(description) ? description : '', amount, currency: currencyOf(state),
          imageUrls: photo ? [photo] : [], stock: variants.length ? totalVariantStock(variants) : stock ?? null, variants, categoryRef });
        done.push(`creé «${name}»${categoryRef ? ` en ${categoryName(categoryRef)}` : ''}${variants.length
          ? `, con ${variants.length} opciones (${variants.map(variant => `${variant.name} ${bs(variant.amount)}`).join(', ')})` : ` a ${bs(amount)}`}`);
        if (!photo) noPhoto.push(name);
        break;
      }
      case 'product-archive': {
        const item = shown[op.at];
        if (!item) break;
        const entry = productUpdate(item.id);
        if (entry.status === 'ARCHIVED') break;
        entry.status = 'ARCHIVED';
        done.push(`archivé «${short(item.name, 40)}»: ya no aparece en la tienda y puedes volver a activarlo en Productos`);
        break;
      }
      case 'product-restore': {
        const item = archived[op.at];
        if (!item) break;
        productUpdate(item.id).status = 'ACTIVE';
        done.push(`«${short(item.name, 40)}» vuelve a estar en la tienda`);
        break;
      }
      case 'product-stock': {
        const item = shown[op.at];
        if (!item) break;
        if (item.options) { refused.push(`«${short(item.name, 40)}» tiene opciones: dime el stock de cada opción.`); break; }
        const stock = stockValue(op.stock);
        if (stock === undefined) break;
        if (Number.isNaN(stock)) { refused.push(`No cambié el stock de «${short(item.name, 40)}»: «${short(op.stock, 20)}» no es un número de unidades.`); break; }
        if (stock === item.stock) break;
        productUpdate(item.id).stock = stock;
        done.push(stock === null ? `«${short(item.name, 40)}» ya no tiene límite de stock` : stock === 0 ? `«${short(item.name, 40)}» está agotado` : `quedan ${stock} de «${short(item.name, 40)}»`);
        break;
      }
      case 'product-category': {
        const item = shown[op.at];
        if (!item) break;
        const ref = op.category.trim() ? categoryFor(op.category) : null;
        if (op.category.trim() && ref === null) break;
        if (ref === (item.categoryId ?? null)) break;
        productUpdate(item.id).categoryRef = ref;
        done.push(ref ? `«${short(item.name, 40)}» está en ${categoryName(ref)}` : `«${short(item.name, 40)}» ya no tiene categoría`);
        break;
      }
      case 'option-add': case 'option-remove': case 'option-price': case 'option-stock': {
        const item: StoreEditProduct | undefined = shown[op.at];
        if (!item) break;
        const label = short(item.name, 40);
        const parts = optionParts(op.option);
        if (!parts) break;
        const name = parts.label;
        if (item.options && !item.variants) { refused.push(`No pude leer las opciones de «${label}»: cámbialas en Productos.`); break; }
        const variants = item.variants ?? [];
        const target = variants.find(variant => fold(variant.name) === fold(name));
        const groups = variants.find(variant => variant.options?.length)?.options?.map(option => option.name);
        let next: SourceVariantOperation;
        let line: string;
        if (op.kind === 'option-add') {
          if (target) { refused.push(`«${label}» ya tiene la opción «${target.name}».`); break; }
          const amount = op.price.trim() ? priceCents(op.price) : item.amount;
          if (amount === null) { refused.push(`No agregué «${name}» a «${label}»: «${short(op.price, 20)}» no es un precio.`); break; }
          const stock = stockValue(op.stock);
          if (Number.isNaN(stock)) { refused.push(`No agregué «${name}» a «${label}»: «${short(op.stock, 20)}» no es un stock.`); break; }
          // A new option joins the product's groups («Verde» → Color: Verde); on a product whose options have none, a group is dropped
          // (a mix leaves the product unbuyable on the store page).
          let options = groups ? parts.options : undefined;
          if (groups && !options) {
            if (groups.length !== 1) { refused.push(`No agregué «${name}» a «${label}»: dime cada grupo, por ejemplo «${groups.map(group => `${group}: …`).join(' / ')}».`); break; }
            options = [{ name: groups[0], value: name }];
          }
          next = { action: 'add', changes: { name, amount, stock: stock ?? null, ...(options ? { options } : {}) } as never };
          line = `«${label}» tiene la opción «${name}» a ${bs(amount)}`;
        } else if (!target) {
          refused.push(variants.length ? `«${label}» no tiene la opción «${name}».` : `«${label}» no tiene opciones.`);
          break;
        } else if (op.kind === 'option-remove') {
          next = { action: 'delete', variantId: target.id };
          line = `quité la opción «${target.name}» de «${label}»`;
        } else if (op.kind === 'option-price') {
          const amount = priceCents(op.price);
          if (amount === null) { refused.push(`No cambié el precio de «${target.name}»: «${short(op.price, 20)}» no es un precio.`); break; }
          if (amount === target.amount) break;
          next = { action: 'update', variantId: target.id, changes: { amount } as never };
          line = `«${target.name}» de «${label}» ahora cuesta ${bs(amount)}`;
        } else {
          const stock = stockValue(op.stock);
          if (stock === undefined) break;
          if (Number.isNaN(stock)) { refused.push(`No cambié el stock de «${target.name}»: «${short(op.stock, 20)}» no es un número de unidades.`); break; }
          if (stock === (target.stock ?? null)) break;
          next = { action: 'update', variantId: target.id, changes: { stock } as never };
          line = stock === null ? `«${target.name}» de «${label}» ya no tiene límite de stock` : `quedan ${stock} de «${target.name}» en «${label}»`;
        }
        const entry = productUpdate(item.id);
        entry.variantOps = [...(entry.variantOps ?? []), next];
        optionDone.set(item.id, [...(optionDone.get(item.id) ?? []), line]);
        break;
      }
    }
  }
  if (order) change.categories.order = order;
  // A product's option changes are checked together (Productos asks for at least two options, unique names).
  for (const entry of change.products.update) {
    if (!entry.variantOps?.length) continue;
    const item = shown.find(product => product.id === entry.id)!;
    try { applyVariantOperations(item.variants ?? [], entry.variantOps); done.push(...(optionDone.get(entry.id) ?? [])); }
    catch (error) { delete entry.variantOps; refused.push(`No cambié las opciones de «${short(item.name, 40)}»: ${String((error as Error).message)}`); }
  }
  change.products.update = change.products.update.filter(entry => Object.keys(entry).length > 1);
  if (noPhoto.length) notes.push(`Mándame la foto de ${listNames(noPhoto)} cuando la tengas.`);
  return { change, done, refused, notes };
}


/** Section links to a renamed or removed category (`category:<name>`) and its tiles in the category lists follow the change: a
 *  rename keeps pointing at it, a removal points at all the products and drops its tile. The same array when nothing follows. */
export function relinkCategories(blocks: readonly LayoutBlock[], links: CatalogChange['links']): LayoutBlock[] {
  if (!links.rename.length && !links.remove.length) return blocks as LayoutBlock[];
  const renamed = new Map(links.rename.map(entry => [fold(entry.from), entry.to]));
  const gone = new Set(links.remove.map(entry => fold(entry.name)));
  const target = (link: string) => {
    if (!link.startsWith('category:')) return link;
    const name = fold(link.slice('category:'.length));
    return gone.has(name) ? 'products' : renamed.has(name) ? `category:${renamed.get(name)}` : link;
  };
  return blocks.map(block => {
    const next: LayoutBlock = { ...block };
    if (block.link !== undefined) next.link = target(block.link);
    if (block.link2 !== undefined) next.link2 = target(block.link2);
    if (block.items) {
      // Every category section (list, tiles, mosaic — live NOA 2026-11-06: the mosaic kept a removed category's tile).
      const list = block.type.startsWith('categories-');
      next.items = block.items.filter(item => !(list && gone.has(fold(item.title))))
        .map(item => ({ ...item, ...(list && renamed.has(fold(item.title)) ? { title: renamed.get(fold(item.title))! } : {}), ...(item.link !== undefined ? { link: target(item.link) } : {}) }));
    }
    return next;
  });
}

/** The store menu without its links and tiles to removed categories (`category:<id>`); a dropdown left empty goes too. */
export function withoutCategoryMenuLinks(menu: StoreMenu | undefined, ids: readonly string[]): StoreMenu | undefined {
  if (!menu?.groups?.length || !ids.length) return menu;
  const gone = new Set(ids.map(id => `category:${id}`));
  const groups = menu.groups.map(group => {
    const { footer, ...rest } = group;
    return { ...rest, links: group.links.filter(link => !gone.has(link.to)), ...(group.tiles ? { tiles: group.tiles.filter(tile => !gone.has(tile.to)) } : {}),
      ...(footer && !gone.has(footer.to) ? { footer } : {}) };
  }).filter(group => group.links.length || group.tiles?.length);
  return { ...menu, groups };
}

/** Live NOA 2026-11-06: menu words that said a renamed category's old name (a group, a link, a tile pointing at `category:<id>`)
 *  say its new one; words the merchant chose («Vestidos de novia») stay. The same object when nothing follows. */
export function withCategoryMenuRenames(menu: StoreMenu | undefined, renames: ReadonlyArray<{ id: string; from: string; to: string }>): StoreMenu | undefined {
  if (!menu?.groups?.length || !renames.length) return menu;
  const byTarget = new Map(renames.map(entry => [`category:${entry.id}`, entry]));
  const follow = (words: string | undefined, to: string) => { const entry = byTarget.get(to); return entry && words !== undefined && fold(words) === fold(entry.from) ? entry.to : words; };
  let changed = false;
  const groups = menu.groups.map(group => {
    const targets = [...group.links.map(link => link.to), ...(group.tiles ?? []).map(tile => tile.to)].filter(to => byTarget.has(to));
    const label = targets.reduce<string>((words, to) => follow(words, to) ?? words, group.label);
    const links = group.links.map(link => ({ ...link, ...(link.label !== undefined ? { label: follow(link.label, link.to) } : {}) }));
    const tiles = group.tiles?.map(tile => ({ ...tile, title: follow(tile.title, tile.to) ?? tile.title }));
    const next = { ...group, label, links, ...(tiles ? { tiles } : {}) };
    if (JSON.stringify(next) !== JSON.stringify(group)) changed = true;
    return next;
  });
  return changed ? { ...menu, groups } : menu;
}
