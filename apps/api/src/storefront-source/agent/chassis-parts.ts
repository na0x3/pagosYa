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
    // Owner 2026-11-12 («one of them did not even have a menu»): the header is built on the kit's NavShell, like Amboras's; the
    // kit owns the menu, the phone panel, search, account and the cart with its count. Hand-written hooks hid Oh Belly's links.
    need(has(code, /export default function StoreHeader\b/), 'export default function StoreHeader()');
    need(has(code, /<NavShell[\s>]/) && has(code, /import\s*\{[^}]*\bNavShell\b[^}]*\}\s*from\s*['"]@pagosya\/ui['"]/), "el encabezado armado con <NavShell …> (import { NavShell } from '@pagosya/ui')");
    need(has(code, /href:\s*['"]productos\.html/), "un enlace a productos.html en links (links={[{ label: 'Tienda', href: 'productos.html' }, …]})");
    if (/data-cart-open|data-cart-count|data-pagosya-account|data-pagosya-store-menu|data-store-menu-replaces/.test(code)) missing.push('nada de ganchos escritos a mano (data-cart-open, data-cart-count, data-pagosya-account, data-pagosya-store-menu): NavShell ya los trae');
  } else if (part === 'card') {
    need(has(code, /export default function StoreCard\b/), 'export default function StoreCard()');
    need(has(code, /<template[^>]*data-pagosya-product-template/), 'el <template data-pagosya-product-template> que el kit copia para cada producto');
    need(has(code, /data-product-link/), 'el enlace a la ficha (data-product-link href="product.html")');
    for (const field of ['image', 'name', 'price']) need(has(code, new RegExp(`data-product-field=["']${field}["']`)), `data-product-field="${field}"`);
    // Owner 2026-11-12 (Howl & Honey, Oh Belly chassis builds): the writer hid the card photo to draw a text-only card, and wrote the
    // name twice (the kit fills one; the other said «Producto»). The photo shows and the name is written once.
    const image = /<img\b[^>]*data-product-field=["']image["'][^>]*>/.exec(code)?.[0] ?? '';
    if (/\bhidden\b|display\s*:\s*['"]?none|opacity-0|\bsr-only\b|\b(?:w|h)-0\b/.test(image)) missing.push('la foto del producto a la vista: no ocultes <img data-product-field="image"> (ni hidden, ni display:none, ni opacity-0)');
    if ((code.match(/data-product-field=["']name["']/g) ?? []).length > 1) missing.push('un solo data-product-field="name" (el kit llena uno; el otro diría «Producto»)');
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

/** The kit part each plan's first-screen moment and extra names (home-directions DESIGN_PLAN_OPTIONS hero / extra). */
export const CHASSIS_HERO_PARTS: Record<string, string> = { 'parallax-stack': 'ParallaxStack', 'product-showcase': 'ProductShowcase', 'floating-media': 'FloatingMedia', 'scroll-scale': 'ScrollScale', 'bounce-headline': 'BounceText', carousel: 'Carousel', 'kinetic-headline': 'KineticHeadline', 'image-text': 'ImageText' };
export const CHASSIS_EXTRA_PARTS: Record<string, string> = { marquee: 'Marquee', 'story-cards': 'StoryChapters', statement: 'Statement', bento: 'BentoGrid', 'sticky-scene': 'StickyScene', 'horizontal-scroll': 'HorizontalScroll', 'hover-rail': 'HoverReveal', velocity: 'VelocityRow', tabs: 'Tabs' };

/** Owner 2026-11-12 («sections are just too basic»): the kit's richer parts, each with how to use it and its budget, after
 *  Amboras's kit rulebook («loud is welcome; broken is not»). A chassis home used only Parallax and Reveal without it. */
export const CHASSIS_KIT_BRIEF = `KIT DE SECCIONES (import { … } from '@pagosya/ui'; úsalas, son la forma de que la tienda no se vea básica):
- Fotos: un Img es { src: photos.clave, alt: 'qué se ve' } (photos de './store-data'); cada foto una sola vez en la página.
- <ParallaxStack images={[Img, Img, Img]} /> — tres fotos en capas que se mueven a distinta velocidad al bajar.
- <ProductShowcase image={Img} title={…} body={…} action={<a href="productos.html">…</a>} /> — un producto que crece al bajar.
- <FloatingMedia images={[2 a 4 Img]} title={…} lead={…} actions={…} /> — fotos superpuestas y giradas junto al titular.
- <ScrollScale from={0.82}>…</ScrollScale> — lo de adentro se agranda al bajar. <Parallax>…</Parallax> — una foto que se desplaza.
- <StoryChapters chapters={[{ title: '…', body: '…', image: Img }]} /> — 3 o 4 tarjetas que se apilan al bajar.
- <Statement>Una frase de la marca.</Statement> — se rellena palabra a palabra al bajar. <Marquee items={['…', '…']} /> — banda de palabras que corre.
- <BounceText>Titular corto</BounceText> — letras que entran saltando. <Float>…</Float> — flota suave. <Wiggle>…</Wiggle> — se mueve al pasar el mouse.
- <Reveal>…</Reveal> — entra al aparecer; SOLO debajo de la primera pantalla, nunca en la portada.
KIT RICO (2026-11-13, también de '@pagosya/ui'):
- Titulares: <KineticHeadline as="h1" text="…" effect="rise|blur|fade" by="word|char" /> (palabras que entran una tras otra; con as="h1" ES el h1 de la portada) · <WordRotate words={['…','…','…']} /> (una palabra del titular que cambia) · <MorphingText texts={['…','…']} /> (palabras que se funden; una por página) · <AuroraText>palabra</AuroraText> (una palabra con degradado de la marca; una por página) · <ShinyText>Nuevo</ShinyText> (etiqueta con brillo) · <ImageText as="h2" text="NOMBRE" image={Img} /> (palabra enorme rellena con una foto) · <VideoText text="NOMBRE" src={video} /> o image={Img} (palabra recortada del video).
- Botones: <ShimmerLink href="productos.html">…</ShimmerLink> (el llamado principal, con luz que recorre el borde; uno por pantalla) · <HoverButton href="…">…</HoverButton> (se llena del color de la marca con una flecha).
- Fotos y productos: <Carousel slides={[{ image: Img, title, text, href, cta }]} aspect="16/9" /> (diapositivas con flechas y puntos, avanzan solas) · <SnapRail>{tarjetas}</SnapRail> (fila deslizable con flechas) · <HoverReveal image={Img} title="…" caption="…" href="…" /> (foto cuyo panel sube al pasar el mouse; ideal dentro de SnapRail) · <MediaFrame image={Img} shape="rounded|arch|pill|circle|cut|tilt" aspect="4/5" /> (foto con forma) · <RevealImage image={Img} /> (foto que se descubre como cortina) · <BentoGrid><BentoCard title="…" text="…" image={Img} href="…" size="normal|wide|tall|big" /></BentoGrid> (mosaico de tarjetas de tamaños distintos).
- Recorridos: <StickyScene steps={[{ title, text, image: Img }]} /> (2 a 5 pasos: la foto queda fija a un lado y cambia con cada paso) · <HorizontalScroll>{fotos o tarjetas}</HorizontalScroll> (al bajar, la fila corre de lado) · <Tabs tabs={[{ label, content }]} /> (contenido por momento, uso o talla).
- Bandas y detalles: <MarqueeRow>{palabras o fotos}</MarqueeRow> (fila que corre; pausa al pasar el mouse) · <VelocityRow>{palabras}</VelocityRow> (banda que acelera con el scroll) · <SpotlightCard>…</SpotlightCard> (tarjeta que se ilumina donde está el mouse) · <BlurFade>…</BlurFade> (entra desde un desenfoque; debajo de la primera pantalla) · <NumberTicker value={n} suffix=" …" /> (cuenta hasta n; SOLO números reales de store-data, nunca inventados) · <ScrollProgress /> (barra fina de lectura; una por página).
Límites: la portada lleva su MOMENTO ASIGNADO (PLAN DE DISEÑO) y es lo primero que se ve; como mucho 2 cosas que se mueven solas en la primera pantalla; una sola banda que corre (Marquee, MarqueeRow o VelocityRow) y un solo ParallaxStack por página; usa al menos 4 partes distintas del kit en la portada; cada sección con una forma distinta (no repitas «foto a un lado, texto al otro» más de dos veces). El texto nunca va detrás de un adorno.`;

/** Each part's note, like Amboras's skeleton comments: what is wiring, what is shopper convention, what was the sameness. */
export const CHASSIS_BRIEF = `CHASIS (cada tienda diseña sus propias piezas; nada se copia de la plantilla):
Escribes con write_part, además de la portada y el pie: header (components/header.tsx), card (components/card.tsx), cart (components/cart.tsx) y product (components/product.tsx). La plataforma conecta cada pieza a la tienda. Sigue el PLAN DE DISEÑO de esta tienda.
Las piezas de la plantilla (abajo) son solo el cableado: copia sus ganchos data-pagosya-*, data-product-*, data-cart-* y sus <KitSlot>, nunca su forma, sus clases ni su orden — una pieza que todas las tiendas copian es justo lo que hace que todas se vean iguales. Estilos con style={{…}}, clases es- que existan y var(--es-…).
- header: export default function StoreHeader() devuelve <NavShell …> (import { NavShell } from '@pagosya/ui'). NavShell ya trae el esqueleto, el menú del celular, búsqueda, cuenta, el carrito con su número y el menú que arme el comercio; tú decides:
  structure="bar|centered|split|drawer" (la del PLAN DE DISEÑO), actions="icons|labels|pill", brand={…} (el logo o el nombre con su tipografía), links={[{ label: 'Tienda', href: 'productos.html' }, { label: '…', href: 'index.html#…' }, { label: 'Nosotros', href: 'nosotros.html' }]} (3 a 5, textos cortos), labels={{ bag: 'Bolsa' }} si quieres otras palabras, y el aspecto con className, barClassName, brandClassName, linksClassName, actionsClassName, badgeClassName, panelClassName y toggleClassName (Tailwind y var(--es-…)).
  Ejemplo: <NavShell structure="split" actions="labels" brand={<span className="font-[family-name:var(--es-heading)] text-2xl">{store.name}</span>} links={[…]} className="bg-[var(--es-paper)] border-b border-[color:var(--es-ink)]/15" linksClassName="text-sm tracking-wide" />. No escribas tú botones de carrito, cuenta ni menú, ni ganchos data-*: NavShell los pone.
- card: export default function StoreCard() devuelve <template data-pagosya-product-template>…</template>. Convención: la foto manda, el precio cerca del botón; en computadora 3 o 4 tarjetas por fila (nunca una tarjeta a todo el ancho), en celular 2. Lo que se repetía: la misma tarjeta blanca con borde, el mismo «+» redondo.
- cart: export default function StoreCart() devuelve <><CartTemplate>…</CartTemplate><CartLineTemplate>…</CartLineTemplate><AddedTemplate>…</AddedTemplate><ReviewTemplate>…</ReviewTemplate></> (de '@pagosya/ui'). Convención: el carrito entra desde la derecha y se cierra; total y botón de pagar siempre visibles. Lo que se repetía: el mismo panel, las mismas filas con borde, el botón en mayúsculas.
- product: components/product.tsx completo (export default function Product, dentro de <Shell>, <ProductPageTemplate> con sus <KitSlot kind="product">, las secciones <LibraryHome layout={productLayout} /> y al final <main id="contenido" className="es-page" data-pagosya-product-page />). Convención: fotos y compra en la primera pantalla — en computadora la foto (mediana, nunca a todo el ancho) y la compra lado a lado, con título, precio y botón visibles sin bajar (check lo mide). Lo que se repetía: la misma galería a la izquierda con la misma caja de compra.`;
