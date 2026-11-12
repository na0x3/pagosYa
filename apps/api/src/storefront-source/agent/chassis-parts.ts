/* Store chassis (spec 2026-11-12, after Amboras's chassis): the parts every store used to share — header, product card, cart, product
 * page — are written per store by the studio writer. The platform keeps their wiring (the kit's data-pagosya hooks and KitSlots); a
 * part that misses it blocks, everything about its look is the writer's. */

export type ChassisPart = 'header' | 'card' | 'cart' | 'product';
export const CHASSIS_PARTS: readonly ChassisPart[] = ['header', 'card', 'cart', 'product'];
export const CHASSIS_PATHS: Record<ChassisPart, string> = {
  header: 'components/header.tsx', card: 'components/card.tsx', cart: 'components/cart.tsx', product: 'components/product.tsx',
};
/** The parts the Shell draws (the product page is its own page file). */
const SHELL_PARTS = { footer: { component: 'StoreFooter', file: 'footer', kit: /<Footer\s*\/>/ }, header: { component: 'StoreHeader', file: 'header', kit: /<Header\s*\/>/ },
  cart: { component: 'StoreCart', file: 'cart', kit: /<CartParts\s*\/>/ }, card: { component: 'StoreCard', file: 'card', kit: /<CardTemplate card=\{libraryCard\(layout as LibraryBlock\[\]\)\} \/>/ } } as const;
export type ShellPart = keyof typeof SHELL_PARTS;

/** The kit Shell drawing the parts YAPI wrote instead of its own, from the template's Shell as it was; null when that Shell lacks
 *  one of them (an older store, another template). Each import goes above the first import, never inside a two-line one. */
export function shellWithStoreParts(base: string, parts: ReadonlySet<ShellPart>): string | null {
  let shell = base;
  const imports: string[] = [];
  for (const part of Object.keys(SHELL_PARTS) as ShellPart[]) {
    if (!parts.has(part)) continue;
    const { component, file, kit } = SHELL_PARTS[part];
    if ((shell.match(new RegExp(kit.source, 'g')) ?? []).length !== 1) return null;
    shell = shell.replace(kit, `<${component} />`);
    imports.push(`import ${component} from './${file}';`);
  }
  if (!imports.length) return base;
  const lines = shell.split('\n');
  const first = Math.max(0, lines.findIndex(line => /^import\s/.test(line)));
  lines.splice(first, 0, ...imports);
  return lines.join('\n');
}

/** The Shell parts a saved Shell draws from YAPI's own files. */
export function partsInShell(shell: string): Set<ShellPart> {
  return new Set((Object.keys(SHELL_PARTS) as ShellPart[]).filter(part => new RegExp(`^import ${SHELL_PARTS[part].component} from '\\./${SHELL_PARTS[part].file}';$`, 'm').test(shell)));
}

const has = (code: string, pattern: RegExp) => pattern.test(code);
const slot = (kind: string, name: string) => new RegExp(`<KitSlot[^>]*\\bkind=["']${kind}["'][^>]*\\bname=["']${name}["']|<KitSlot[^>]*\\bname=["']${name}["'][^>]*\\bkind=["']${kind}["']`);

/** What a written part misses of the wiring the kit fills: each line names the hook to put back. */
export function partProblems(part: ChassisPart, code: string): string[] {
  const missing: string[] = [];
  const need = (ok: boolean, what: string) => { if (!ok) missing.push(what); };
  if (part === 'header') {
    need(has(code, /export default function StoreHeader\b/), 'export default function StoreHeader()');
    need(has(code, /href=["']index\.html["']/), 'el logo o nombre enlazado a index.html');
    need(has(code, /href=["']productos\.html/), 'un enlace a productos.html');
    need(has(code, /href=["']buscar\.html["']/), 'la búsqueda (enlace a buscar.html)');
    need(has(code, /data-pagosya-account/), 'la cuenta (enlace con data-pagosya-account="login" a acceso-ingresar.html)');
    need(has(code, /data-cart-open/) && has(code, /data-cart-count/), 'el botón del carrito con data-cart-open y su contador data-cart-count');
  } else if (part === 'card') {
    need(has(code, /export default function StoreCard\b/), 'export default function StoreCard()');
    need(has(code, /<template[^>]*data-pagosya-product-template/), 'el <template data-pagosya-product-template> que el kit copia para cada producto');
    need(has(code, /data-product-link/), 'el enlace a la ficha (data-product-link href="product.html")');
    for (const field of ['image', 'name', 'price']) need(has(code, new RegExp(`data-product-field=["']${field}["']`)), `data-product-field="${field}"`);
    need(has(code, /data-product-add/), 'el botón de agregar (data-product-add)');
  } else if (part === 'cart') {
    need(has(code, /export default function StoreCart\b/), 'export default function StoreCart()');
    for (const tag of ['CartTemplate', 'CartLineTemplate', 'AddedTemplate', 'ReviewTemplate']) need(has(code, new RegExp(`<${tag}[\\s>]`)), `<${tag}>`);
    need(has(code, /data-cart-close/), 'el botón de cerrar (data-cart-close)');
    for (const name of ['lines', 'empty', 'total', 'action']) need(has(code, slot('cart', name)), `<KitSlot kind="cart" name="${name}">`);
    for (const name of ['photo', 'name', 'quantity', 'line-total', 'remove']) need(has(code, slot('line', name)), `<KitSlot kind="line" name="${name}">`);
    need(has(code, slot('added', 'message')) && /<AddedTemplate[\s\S]*data-cart-open/.test(code), 'en AddedTemplate: <KitSlot kind="added" name="message"> y un botón data-cart-open');
    for (const name of ['summary', 'fields']) need(has(code, slot('review', name)), `<KitSlot kind="review" name="${name}">`);
  } else {
    need(has(code, /export default function Product\b/), 'export default function Product()');
    need(has(code, /<Shell[\s>]/), 'todo dentro de <Shell>');
    need(has(code, /<ProductPageTemplate[\s>]/), '<ProductPageTemplate> alrededor de la ficha');
    for (const name of ['gallery', 'title', 'pricing', 'description', 'buy']) need(has(code, slot('product', name)), `<KitSlot kind="product" name="${name}">`);
    need(has(code, /data-pagosya-product-page/), '<main id="contenido" data-pagosya-product-page /> después de la plantilla');
    need(has(code, /\bproductLayout\b/), 'las secciones de la ficha: <LibraryHome layout={productLayout} /> (productLayout de ./store-data)');
  }
  return missing;
}

const PART_NAMES: Record<ChassisPart, string> = { header: 'Al encabezado', card: 'A la tarjeta de producto', cart: 'Al carrito', product: 'A la ficha de producto' };
/** The blocking line for a part's missing wiring; home-writer-tools keeps every line that starts this way blocking. */
export const partProblemLine = (part: ChassisPart, missing: readonly string[]) => `${PART_NAMES[part]} le falta: ${missing.join('; ')}.`;
export const PART_PROBLEM_START = /^(Al encabezado|A la tarjeta de producto|Al carrito|A la ficha de producto) le falta/;

/** Each part's note, like Amboras's skeleton comments: what is wiring, what is shopper convention, what was the sameness. */
export const CHASSIS_BRIEF = `CHASIS (cada tienda diseña sus propias piezas; nada se copia de la plantilla):
Escribes con write_part, además de la portada y el pie: header (components/header.tsx), card (components/card.tsx), cart (components/cart.tsx) y product (components/product.tsx). La plataforma conecta cada pieza a la tienda. Sigue el PLAN DE DISEÑO de esta tienda.
Las piezas de la plantilla (abajo) son solo el cableado: copia sus ganchos data-pagosya-*, data-product-*, data-cart-* y sus <KitSlot>, nunca su forma, sus clases ni su orden — una pieza que todas las tiendas copian es justo lo que hace que todas se vean iguales. Estilos con style={{…}}, clases es- que existan y var(--es-…).
- header: export default function StoreHeader(). Convención: el logo lleva al inicio; búsqueda, cuenta y carrito siempre a mano; en el celular, un botón que abre el menú. Lo que se repetía: la misma barra blanca con los mismos tres íconos y los enlaces en mayúsculas pequeñas. Enlaces: productos.html, las secciones de la portada (index.html#…) y nosotros.html; pon también <div data-pagosya-store-menu="links" /> donde quieras el menú que arme el comercio.
- card: export default function StoreCard() devuelve <template data-pagosya-product-template>…</template>. Convención: la foto manda, el precio cerca del botón. Lo que se repetía: la misma tarjeta blanca con borde, el mismo «+» redondo.
- cart: export default function StoreCart() devuelve <><CartTemplate>…</CartTemplate><CartLineTemplate>…</CartLineTemplate><AddedTemplate>…</AddedTemplate><ReviewTemplate>…</ReviewTemplate></> (de '@pagosya/ui'). Convención: el carrito entra desde la derecha y se cierra; total y botón de pagar siempre visibles. Lo que se repetía: el mismo panel, las mismas filas con borde, el botón en mayúsculas.
- product: components/product.tsx completo (export default function Product, dentro de <Shell>, <ProductPageTemplate> con sus <KitSlot kind="product">, las secciones <LibraryHome layout={productLayout} /> y al final <main id="contenido" className="es-page" data-pagosya-product-page />). Convención: fotos y compra en la primera pantalla. Lo que se repetía: la misma galería a la izquierda con la misma caja de compra.`;
