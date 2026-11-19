import * as ts from 'typescript';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { uiRuntime } from '../source-creative';
import { repairNextAuthoredMarkup } from '../source-next';
import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { V2_FILES, type V2Context, type V2File, type V2Header } from './v2-context';
import type { BrandBrief } from '../brand/brand-brief-types';
import { fontFamily } from '../brand/brand-identity';
import { menuStyleBrief, menuStyleProblem, V2_MENU_MODELS, v2MenuSchema, type V2Menu } from './v2-menus';
import { markWordPhotos } from './v2-words';
import { heroIdea, heroMarker, MIX_NOTE, STRONG_HERO, readHeroMarker, V2_HERO_IDEAS } from './v2-heroes';
import { readV2LibraryFile, V2_HERO_TYPES, V2_KIT_TEXT, V2_LIBRARY_FILE, v2LibraryCatalogText, v2LibrarySchema, type V2LibraryEntry } from './v2-library';
export { mergeV2LibraryEntries } from './v2-library';

/** V2 prototype prompts (docs/superpowers/specs/2026-11-14-v2-prototype-design.md §2–3). Two calls: a direction committed before
 *  any code (the reference images teach the level of craft, never the layout to copy), then the four files written from it. */

export type V2Direction = {
  menu?: V2Menu; header?: V2Header;
  idea: string; craft: string; display: string; text: string; scale: 'quiet' | 'regular' | 'loud';
  palette: { paper: string; ink: string; muted: string; accent: string; line: string; jobs: string };
  grid: string; hero: { idea?: string; composition: string; photo: string }; sections: Array<{ role: string; composition: string; photo: string; why: string }>;
  signature: string; photos: string; phone: string; avoid: string[];
  /** The cart drawer's look (owner 2026-11-14 «depends on the store»). */
  cart: { look: 'band' | 'photo' | 'paper'; photo: string };
  /** Owner 2026-11-14 («more artsy, like a real website… now it feels like plain html and css»): what makes it a crafted site. */
  art?: { layouts: string[]; type: string; graphics: string; motion: string; interaction: string };
};

const fonts = () => SOURCE_FONT_CATALOG.map(font => `${font.id} (${font.family}; ${font.role}; ${font.personality.join(', ')})`).join('\n');
const hex = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

export function v2DirectionSchema(context: V2Context): object {
  const ids = SOURCE_FONT_CATALOG.map(font => font.id);
  const photo = { type: 'string', enum: ['', ...context.photos.map(entry => entry.path)] };
  return { type: 'object', additionalProperties: false, required: ['idea', 'craft', 'display', 'text', 'scale', 'palette', 'grid', 'hero', 'sections', 'signature', 'photos', 'phone', 'avoid', 'cart', 'art', 'menu', 'header'],
    properties: {
      idea: { type: 'string' }, craft: { type: 'string' }, display: { type: 'string', enum: ids }, text: { type: 'string', enum: ids }, scale: { type: 'string', enum: ['quiet', 'regular', 'loud'] },
      palette: { type: 'object', additionalProperties: false, required: ['paper', 'ink', 'muted', 'accent', 'line', 'jobs'], properties: { paper: hex, ink: hex, muted: hex, accent: hex, line: hex, jobs: { type: 'string' } } },
      grid: { type: 'string' }, hero: { type: 'object', additionalProperties: false, required: ['idea', 'composition', 'photo'], properties: { idea: { type: 'string', enum: context.heroesAllowed ?? V2_HERO_IDEAS.map(h => h.id) }, composition: { type: 'string' }, photo } },
      sections: { type: 'array', minItems: context.free ? FREE_MIN - 1 : 4, maxItems: context.free ? FREE_MAX - 1 : 9, items: { type: 'object', additionalProperties: false, required: ['role', 'composition', 'photo', 'why'],
        properties: { role: { type: 'string' }, composition: { type: 'string' }, photo, why: { type: 'string' } } } },
      signature: { type: 'string' }, photos: { type: 'string' }, phone: { type: 'string' }, avoid: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string' } },
      menu: v2MenuSchema(context.menusAllowed ?? V2_MENU_MODELS.map(m => m.id)),
      header: { type: 'object', additionalProperties: false, required: ['over', 'tone', 'links', 'announce'], properties: { over: { type: 'boolean' }, tone: { type: 'string', enum: ['light', 'dark'] }, links: { type: 'string', enum: ['plain', 'pills'] }, announce: { type: 'array', maxItems: 3, items: { type: 'string' } } } },
      cart: { type: 'object', additionalProperties: false, required: ['look', 'photo'], properties: { look: { type: 'string', enum: ['band', 'photo', 'paper'] }, photo } },
      art: { type: 'object', additionalProperties: false, required: ['layouts', 'type', 'graphics', 'motion', 'interaction'], properties: {
        layouts: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } }, type: { type: 'string' }, graphics: { type: 'string' }, motion: { type: 'string' }, interaction: { type: 'string' } } },
    } };
}

/** «Mejorar mi marca» (spec 2026-11-18): the brief as hard facts — its palette and fonts ARE the store's tokens. */
export function briefFacts(brief: BrandBrief): string {
  const { palette, fonts } = brief.identity;
  return `MARCA (el comerciante ya la vio en el chat; respétala exacta):
- Identidad: ${brief.identity.oneLiner}
- Colores (úsalos tal cual en globals.css): texto ${palette.ink} · principal ${palette.primary} · acento ${palette.accent} · secundario ${palette.secondary} · fondo ${palette.base}
- Letras: títulos ${fontFamily(fonts.display)} · secundaria ${fontFamily(fonts.secondary)} · texto ${fontFamily(fonts.body)}
- Voz de los textos: ${brief.identity.voice}
- Lo que convierte en su nicho (${brief.research.niche}): ${brief.research.patterns.join(' · ')}
- Marcas que su público conoce (referencia de nivel; no las copies ni las nombres): ${brief.research.references.map(r => r.name).join(', ')}
- Las fotos marcadas «campaña» son su sesión de fotos: úsalas primero (hero → portada, poster → una banda, lifestyle → historia).`;
}

const facts = (context: V2Context) => `${context.brief ? `${briefFacts(context.brief)}\n` : ''}TIENDA: ${context.storeName}${context.tagline ? ` — ${context.tagline}` : ''}
LO QUE PIDIÓ EL COMERCIANTE (sus palabras): ${context.request || '(nada más)'}
${context.about ? `SOBRE LA TIENDA: ${context.about}\n` : ''}CATEGORÍAS: ${context.categories.join(', ') || '(ninguna)'}
PRODUCTOS (id · nombre · categoría · descripción):
${context.products.map(product => `- ${product.id} · ${product.name} · ${product.category} · ${product.about}`).join('\n')}
MODO DE PAGO: ${context.checkoutMode || '(no dicho)'}${context.whatsapp ? ' · tiene WhatsApp' : ''} · PACKS ACTIVOS: ${context.packs}${context.packs ? '' : ' (no hagas una sección de packs)'}
LUGARES: ${context.places.length ? context.places.map(place => `\n- ${place}`).join('') : '(ninguno: la tienda es solo en línea)'}
FOTOS DE LA TIENDA (ruta · tamaño · forma), en el mismo orden que las imágenes adjuntas:
${context.photos.map(photo => `- ${photo.path} · ${photo.width}×${photo.height} · ${photo.shape}${photo.product ? ` · es la foto del producto «${photo.product}» (sale en su tarjeta y también puede ir en una sección de la portada)` : ''}${photo.words ? ' · tiene letras: muéstrala ENTERA, nunca recortada' : ''}${photo.campaign ? ` · campaña: ${photo.campaign}` : ''}`).join('\n') || '(ninguna)'}${context.cutouts?.length ? `
RECORTES (fotos sin fondo; ruta · id del producto o «—» si es una foto de la tienda · nombre · tamaño):
${context.cutouts.map(cut => `- ${cut.path} · ${cut.product || '—'} · ${cut.name}${cut.what ? ` · muestra: ${cut.what}` : ''} · ${cut.width}×${cut.height}`).join('\n')}` : ''}`;

/** What modern online stores share (owner 2026-11-14 «teach it modern designs»): distilled from the lessons of the 66 studied stores'
 *  recipe cards (examples/v2-proto/references/cards), the rules almost every one of them follows. */
const factsAll = (context: V2Context) => `${facts(context)}${context.concept ? `\n\nCONCEPTO ELEGIDO PARA ESTA TIENDA (constrúyelo de verdad: es lo que la hace única):\n${context.concept}` : ''}`;

/** Owner 2026-11-17 («what is taking us back on very creative and innovative layouts like other platforms have»): the creative
 *  setting swaps the average-store rules and the craft bans for an invitation to invent; readability, buying and the phone stay. */
export const V2_CREATIVE_RULES = `TIENDA CREATIVA (owner 2026-11-17: «layouts muy creativos e innovadores»): nada de la tienda promedio. Inventa la composición de ESTA
marca: retículas rotas, capas que se superponen, tipografía usada como imagen, formas, máscaras y clip-path con las fotos, recortes que salen
de su caja, secciones que cambian al bajar (sticky, escenas por scroll), un ritmo propio. Entre 5 y 14 secciones: menos y más fuertes antes
que muchas iguales. Lo único fijo: que todo se lea, que se pueda comprar (productos y su botón a la vista) y que en el teléfono nada se salga.
Las tarjetas de producto (las de la plataforma y las tuyas) van DERECHAS: nada de rotate ni inclinarlas (owner 2026-11-17).
Los productos se muestran SIEMPRE en las tarjetas de la plataforma (<div data-pagosya-catalog … />); lo creativo va alrededor de ellas.`;
const CREATIVE_CRAFT = `OFICIO CREATIVO: puedes usar formas, máscaras, clip-path, mix-blend-mode, capas, texto enorme de fondo y movimiento ligado al scroll,
siempre con prefers-reduced-motion y sin tapar texto que se lee. Las fotos siguen de tamaño medio (nunca enormes).
`;
/** Owner 2026-11-17 («B», after NOA rg-n17: the creative header was still one of NavShell's four structures): the creative setting
 *  writes its own header bar; NavShell keeps the frame, the menu panel and the platform's pieces the bar places. */
const CREATIVE_HEADER = `   Header: lo DISEÑAS tú, nada de las cuatro estructuras de siempre. Usa <NavShell structure="free" brand={…} links={[{ label, href }]}
   menu={…} className="…"> TU BARRA </NavShell> de '@pagosya/ui': los hijos son tu barra entera (tu marcado, tus clases, tu composición:
   logo gigante, enlaces partidos a los lados, una fila de categorías con fotos, el logo vertical, una barra en dos pisos…) y dentro colocas
   donde quieras estas piezas de '@pagosya/ui': <NavLogo /> (el logo o nombre con enlace al inicio; sus hijos lo reemplazan),
   <NavLinks /> (los enlaces; en el teléfono se esconden y viven en el menú), <NavMenuButton /> (abre tu menú, en todas las pantallas)
   y <NavActions /> (buscar, cuenta y carrito) o solo <NavCart />. Siempre van NavLogo, NavMenuButton y el carrito; no escribas
   botones de carrito, búsqueda o cuenta propios. NavShell pone la barra fija y el panel del menú: a .ui-nav y al header no les des
   height, position ni top (se descartan); dentro de tu barra todo es tuyo. En el teléfono tu barra cabe en una fila (menú, logo,
   carrito) sin salirse. ENLACES A UNA CATEGORÍA: productos.html?f_categoria=<Nombre exacto>; todos los productos: productos.html.`;
const CREATIVE_HEADER_PIECES = 'NavShell, NavLogo, NavLinks, NavMenuButton, NavActions, NavCart, CommerceSlots';
/** A creative header is a free bar holding the logo, the menu button and the cart (the kit adds any that is missing, but late). */
export function creativeHeaderProblems(shell: string): string[] {
  if (!/<NavShell\b[^]*?\bstructure=(["'{]\s*["']?)free\b/.test(shell)) return ['Tienda creativa: el Header es tuyo. Usa <NavShell structure="free" …>TU BARRA</NavShell> con <NavLogo />, <NavMenuButton /> y <NavActions /> o <NavCart /> donde los quieras.'];
  const missing = [['<NavLogo', 'NavLogo'], ['<NavMenuButton', 'NavMenuButton'], ['<NavCart|<NavActions', 'NavActions o NavCart']]
    .filter(([pattern]) => !new RegExp(pattern).test(shell)).map(([, name]) => name);
  const own = /data-cart-open|data-cart-count|data-pagosya-account|data-nav-toggle/.test(shell);
  return [
    ...(missing.length ? [`Tu barra (NavShell structure="free") necesita ${missing.join(', ')}: colócalos donde quieras dentro de ella.`] : []),
    ...(own ? ['No escribas el carrito, la cuenta ni el botón del menú a mano (data-cart-open, data-pagosya-account, data-nav-toggle): usa <NavActions />, <NavCart /> y <NavMenuButton />.'] : []),
  ];
}
/** The same text with the average-store rules, the craft bans and the fixed header structures swapped for the creative ones. */
export function creativeText(text: string): string {
  return text.split(V2_MODERN_RULES).join(V2_CREATIVE_RULES).replace(/MOVIMIENTO \(owner 2026-11-14: tiendas con vida[\s\S]*?(?=NUNCA \(fallas)/, CREATIVE_CRAFT)
    .replace(/ {3}Header: usa <NavShell[\s\S]*?nunca una barra genérica\./, CREATIVE_HEADER)
    .replace(/(IMPORTS permitidos: 'react', '@pagosya\/ui' \()NavShell, CommerceSlots/, `$1${CREATIVE_HEADER_PIECES}`);
}
export const V2_CONCEPT_PROMPT = `Eres director creativo de tiendas online. Propón 3 conceptos de tienda DISTINTOS y atrevidos para esta marca — lo que ninguna otra
tienda tendría —, que SUS fotos (míralas) puedan sostener. Cada uno: nombre corto, la idea en una frase, cómo se arma la portada (qué rompe de
la tienda típica), un momento firma (lo que el cliente recuerda) y el movimiento. Después elige el más audaz que sus fotos y productos puedan
sostener (pick = su índice, 0 a 2) y di por qué en una frase. En español.`;
export function v2ConceptSchema(): object {
  const concept = { type: 'object', additionalProperties: false, required: ['name', 'idea', 'layout', 'signature', 'motion'], properties: { name: { type: 'string' }, idea: { type: 'string' }, layout: { type: 'string' }, signature: { type: 'string' }, motion: { type: 'string' } } };
  return { type: 'object', additionalProperties: false, required: ['concepts', 'pick', 'why'], properties: { concepts: { type: 'array', items: concept }, pick: { type: 'integer' }, why: { type: 'string' } } };
}

export const V2_MODERN_RULES = `TIENDA MODERNA (lo que comparten las 66 tiendas reales estudiadas; síguelo siempre):
1. Dos familias de letra, cada una con su trabajo: una de carácter para la promesa, los títulos y el relato; una neutra para menú,
   precios, botones y datos. La jerarquía sale del tamaño, el espaciado, las mayúsculas y el aire, no de sumar estilos.
2. Dos registros de foto con trabajos distintos: escenas de cerca, de tamaño medio, para el deseo; producto aislado, fondo y escala
   constantes, misma proporción, para decidir. Nunca los mezcles en la misma retícula.
3. Un solo color de acción, reservado para comprar; los demás colores con un trabajo fijo (etiquetas, ofertas, bandas). Si el
   producto ya es muy colorido, la interfaz queda neutra y el producto pone el color.
4. Ritmo por capítulos: cada sección responde una pregunta distinta (qué es, qué comprar, por qué es mejor, quién lo hace, cómo
   llega). Alterna deseo y decisión, ancho completo y contenido, 4 · 2 · 1 columnas, y cambia el fondo entre capítulos en lugar de
   poner divisores. Nunca dos retículas iguales seguidas.
5. Portada: una sola promesa clara y dos caminos de compra; el texto sobre la zona tranquila de la foto o en su propia banda.
6. Pruebas grandes y concretas: cifras, prensa, garantía, envío y devoluciones como una banda de la página, no letra pequeña.
7. Etiquetas como sistema: mismo lugar, tamaño y color en cada tarjeta (nuevo, más vendido, ahorro); cambia el texto, no la forma.
8. Una sola geometría: el mismo radio de esquina en fotos, tarjetas, botones y cajas; mucho aire; texto corto y verdadero.
9. En el teléfono se diseña de nuevo, no se encoge: recortes verticales, orden propio, filas que se deslizan con la siguiente
   tarjeta asomando, texto de 15–16 px como mínimo y el botón principal a todo el ancho.`;

/** Free mode (owner 2026-11-14 «continue on the freer path, like v0, Lovable or Amboras»): how long a home is. */
export const FREE_MIN = 9;
export const FREE_MAX = 14;
/** Fewer chapters for a store with little to show (fewer than 6 photos): 7, not 9. Owner 2026-11-16 («the site should contain
 *  pictures that are also on product cards»): a product's photo counts too — it may go in a section as well as on its card. */
export const freeMin = (context: Pick<V2Context, 'photos' | 'creative'>) => context.creative ? 5 : context.photos.length < 6 ? 7 : FREE_MIN;

const FREE_SIZES = `Los tamaños son tuyos: el KIT (es-section, es-eyebrow, es-h2, es-lead,
   es-btn, es-grid, es-split, es-media) es la base que puedes usar, y tus clases propias deciden su escala —un titular de marca enorme,
   un número gigante, un texto pequeño en mayúsculas— con clamp() para que en el teléfono no se salga. No redefinas las clases es-/lb-
   (se descartan): crea las tuyas.`;

const FREE_CARDS = `, y además puedes darles carácter con sus propios tokens en :root: --kit-card-ratio (proporción
   de la foto: 4/5, 1/1, 3/4, 2/3), --kit-card-radius, --kit-card-bg y --kit-card-pad (una tarjeta con fondo), --kit-card-font (familia
   del nombre: la letra de TUS TÍTULOS, la display de la tienda, nunca la de texto; owner 2026-11-16 «i dont like the letters like that
   from a product card»), --kit-card-name (tamaño del nombre, 15–22px) y --kit-card-case (none o uppercase)`;

const FREE_MOTION = `MOVIMIENTO EN MODO LIBRE (owner 2026-11-14 «más vida, como una web de verdad»): además de lo de abajo, cada foto y tarjeta
reacciona al cursor, las secciones de «art» pueden usar <Reveal> con retrasos escalonados, <ScrollScale> en una foto, <Parallax> suave en
dos, y una fila deslizable; en la primera pantalla sigue habiendo como mucho una cosa en movimiento. Lo de abajo («como mucho») cuenta
para franjas y titulares animados.
`;

/** Owner 2026-11-15 («fuller homogeneous stores like this product page», brightland.co/products/the-holiday-feast-set): in free mode
 *  the product page is a whole page of the brand — a rich buy area, then the brand's chapters in the home's design system. */
export const FREE_PRODUCT_RULES = `LA PÁGINA DE PRODUCTO ES UNA PÁGINA COMPLETA DE LA MARCA (owner 2026-11-15: «tiendas más llenas y homogéneas, como la página
de producto de Brightland»; las capturas adjuntas son la vara: su oficio, nunca sus colores, textos ni fotos).
Todo va DENTRO de <ProductPageTemplate>, envuelto en UN solo <div> (el sistema copia ese único elemento para cada producto y llena
los huecos); después <main id="contenido" data-pagosya-product-page />.
1. ZONA DE COMPRA (primera pantalla): a un lado gallery (fotos en mosaico, medianas); al otro category o breadcrumb, title, rating,
   pricing, description, highlights (lo que incluye, sus puntos clave), buy, payments, delivery y la garantía real de la tienda si la
   tiene; debajo pairs («completa tu…», productos para sumar) e info (detalles en acordeón). En el teléfono, fotos arriba y compra debajo.
   La columna de gallery va alineada arriba (align-self: start), sin altura mínima y sin fondo propio: la galería mide lo que miden sus
   fotos, y una columna estirada a la altura de la compra deja un recuadro vacío (Oh Belly r19: 240 px amarillos bajo las miniaturas).
2. DESPUÉS, DE 5 A 8 CAPÍTULOS DE LA MARCA con el MISMO sistema de diseño que la portada (mismas letras, colores, bandas, botones y
   radios), cada uno en su <section>:
   · usos o momentos: 3 fotos reales de la tienda con su texto corto;
   · una banda en el color fuerte de la marca, con una frase o datos reales de origen o proceso y una foto;
   · una franja de confianza (envío, pago seguro, hecho en…: solo datos reales), puede moverse;
   · opiniones: <section data-pagosya-reviews-section> con su título y <div data-pagosya-reviews /> (se oculta sola si no hay);
   · relacionados: tu título («También te puede gustar…») y <KitSlot kind="product" name="related" />;
   · la historia o el lugar, con foto;
   · preguntas generales con <details> (envíos, pagos, cuidado), sin inventar datos.
3. Es una plantilla que se copia: nada de useState, useEffect ni handlers; lo interactivo, con <details>, :hover y CSS.
4. Los textos de los capítulos valen para cualquier producto de la tienda: no nombres un producto fuera de los huecos.
5. Fotos medianas, colores de la paleta (no todo blanco) y las mismas reglas de construcción que la portada.`;

/** Owner 2026-11-14 («lets try creating an animated store»): when motion is the store's signature. Everything still lands on a visible
 *  resting state (a page captured without scrolling must read whole) and stops for visitors who ask for less motion. */
export const ANIMATED_RULES = `TIENDA ANIMADA (el comerciante la pidió así): el movimiento es la firma de la marca, como en los sitios premiados.
- En la dirección, «art.motion» nombra de 5 a 7 momentos de movimiento y dónde va cada uno.
- La primera pantalla puede tener DOS cosas en movimiento: un titular que entra palabra por palabra (<KineticHeadline>) y una foto o
  producto que flota o se acerca apenas (<ScrollScale> o <Parallax>).
- Movimiento ligado al scroll con CSS (animation-timeline: view() o scroll(), dentro de @supports): fotos que se acercan, capas que se
  desplazan a velocidades distintas, una barra que se llena, palabras que cruzan la pantalla.
- UNA sección «pegada»: un contenedor alto con un bloque position: sticky (el producto o una foto) mientras sus textos pasan al lado.
- Dos franjas de palabras que se mueven (<Marquee> o la sección de biblioteca strip-velocity), en direcciones opuestas.
- Tarjetas y fotos que se inclinan o se levantan un poco al pasar el cursor (transform con perspective, 300–500 ms).
- Números que cuentan al aparecer (useEffect + IntersectionObserver) solo con cifras reales de la tienda.
- NUNCA una animación que empieza en opacity: 0 ni que esconde texto: se mueve desde su lugar (transform), y todo se ve completo quieto.
- La referencia de movimiento (capturas adjuntas: una tienda Shopify animada de café) enseña el oficio: fondos teñidos suaves, nunca
  blanco; bordes ondulados entre bandas (la sección de biblioteca wave-divider); detalles chicos de la marca que flotan alrededor del
  producto (recortes de sus fotos, con un vaivén lento); filas de productos deslizables con flechas; una tarjeta de texto que se monta
  sobre el borde de una foto; un bloque de oferta o combo con datos reales; una banda oscura de cierre con el producto flotando.
  Toma ese oficio, nunca sus colores, textos ni fotos.
- @media (prefers-reduced-motion: reduce) lo detiene todo.`;

const FREE_PAGES_TASK = `SIN HUECOS (owner 2026-11-16: «sections that leave a lot of empty space»): ninguna sección deja zonas grandes vacías — cada columna lleva contenido (foto, texto, productos), las dos mitades de una sección tienen alturas parecidas y nada queda chico y perdido en una banda alta o ancha.
EN ESTA LLAMADA devuelves SOLO components/home.tsx y components/product.tsx. Shell.tsx y globals.css ya existen (abajo): impórtalos y
usa sus tokens y clases. En «css» devuelves las reglas NUEVAS que tus páginas necesitan (se añaden al final de globals.css), con el mismo
prefijo de clases. Aquí es donde la tienda gana su carácter: escribe todo el CSS que tus secciones necesiten.

LA PORTADA ES TUYA (owner 2026-11-14: «más libre, como v0, Lovable o Amboras»). Compones de ${FREE_MIN} a ${FREE_MAX} secciones siguiendo la
dirección de arte: cada una un capítulo distinto de esta marca (qué es, qué comprar, por qué es mejor, quién lo hace, cómo llega, el
lugar, las preguntas…), cada una con su propia composición —retícula, escala, fondo, tratamiento de foto, movimiento— que solo esta marca
tendría. Nada de plantilla: si dos tiendas de rubros distintos pudieran usar tu sección tal cual, rehazla con más carácter.
NADA SE REPITE (owner 2026-11-15, Oh Belly: los mismos tres datos seis veces, la misma foto tres veces, los productos vendidos en tres
secciones): cada dato (5 g de fibra, sin azúcar, 350 ml…) se dice UNA vez en la portada —ni en una cinta, ni en una lista, ni en unas
tarjetas más—; los productos se venden en UNA fila y ninguna otra sección vuelve a ofrecer los mismos productos; cada foto y cada
recorte van una sola vez entre las secciones (la foto de un producto sí puede ir en una sección además de su tarjeta). Con pocas fotos y pocos datos, haz MENOS
secciones (desde 7) antes que repetir. La portada termina ANTES del pie: el pie de Shell ya trae las columnas de enlaces, el logotipo
grande y el código de descuento, así que tu última sección nunca repite columnas de enlaces, el nombre gigante de la marca ni ese código.
- La primera pantalla es tuya: un <section> con el ÚNICO <h1> de la página, la promesa de la marca, una foto real y uno o dos botones
  (productos.html y la categoría principal: productos.html?f_categoria=<Nombre>). También puedes usar la sección de biblioteca «hero»
  (${V2_HERO_TYPES.join(', ')}) si de verdad es la mejor; entonces no escribas otro <h1>.
- LA BIBLIOTECA es una caja de herramientas, no una cuota: úsala solo donde una de sus secciones es justo lo que este capítulo necesita
  (por ejemplo preguntas, visítanos, una franja que se mueve, un borde ondulado). En «library» das cada una con su «slot» y su «block»;
  en home.tsx la pones con <LibrarySlot name="s1" /> (import { LibrarySlot } from './v2-library'). Sin biblioteca, «library» va vacío.
- Ninguna sección es solo texto sobre fondo liso ni solo una foto: el texto lleva una foto real o productos al lado; la foto, su título.
- Productos: <div data-pagosya-catalog … /> (la plataforma dibuja las tarjetas); diseña la sección que los rodea.
- Nunca dos secciones seguidas con la misma composición, ni la misma idea dos veces.

CÓMO SE CONSTRUYE (owner 2026-11-14: «secciones vacías, cortadas, que se rompen»; la vara es una tienda terminada, como Gramiyaa):
1. LA PRIMERA PANTALLA (1280×900): o una foto real a todo el ancho con el titular y los botones encima, en su zona tranquila; o el
   titular grande (40 px o más) en una columna y UNA foto entera en la otra (35% a 55% del ancho, sin recortarle la parte de
   arriba). El <h1> y uno o dos botones se ven enteros sin bajar. Nada más compite ahí: ni tarjetas de producto, ni una palabra gigante
   partida alrededor de la foto, ni una segunda foto chica encima.
2. CADA SECCIÓN LLENA SU ANCHO: sus columnas suman el ancho del contenedor y ninguna queda vacía. Un producto destacado va al lado de su
   foto o de su texto, nunca solo en medio de una banda. Tres o cuatro tarjetas ocupan la fila entera, nunca medio ancho. Si una columna
   queda corta, la foto crece o el contenido se centra; un hueco vacío del tamaño de una foto es un error.
3. EL TEXTO CABE: cada titular cabe en su columna con su palabra más larga entera (font-size con clamp() pensando en esa palabra); nunca
   overflow:hidden en una caja con texto; ninguna palabra decorativa gigante detrás o encima de otro texto ni tapada por una foto: si la
   usas, va en su propia fila, entera.
4. LAS FOTOS VAN EN LA RETÍCULA de su sección, al lado o arriba del texto que acompañan; nunca una foto suelta colgando debajo.
5. UNA BANDA OSCURA O DE COLOR siempre lleva una foto real o productos, no solo palabras.
6. FOTOS DE TAMAÑO MEDIO (owner 2026-11-14 «muestra fotos enormes y no quiero eso»): en escritorio una foto mide como mucho unos
   640 × 760 px o 720 × 680 px (la página la mide: más de 500 000 px² es demasiado grande); una banda de foto a todo el ancho mide 480 px de alto como mucho. El carácter sale de la letra, el
   color y la composición, no de una foto gigante. Varias fotos medianas con detalles valen más que una enorme.
7. Las piezas de @pagosya/ui reciben solo sus props (Marquee: items, speed y className).
8. COLOR, NO PAPEL BLANCO (owner 2026-11-14 «a veces se ve demasiado blanca»): al menos un tercio de las secciones va sobre un color de
   la paleta — un tinte de la marca, su color fuerte, una banda oscura —, nunca más de 4 secciones claras seguidas, y el papel claro
   nunca es blanco puro.
9. UN SITIO HECHO A MANO, NO HTML PLANO (owner 2026-11-14: «más artística, como una web de verdad»): sigue «art» de la dirección.
   Composición editorial en 3 o 4 secciones (columnas desiguales, capas: una foto sobre el borde de un bloque de color, un texto que
   entra sobre el borde de una foto con fondo para leerse, números y citas grandes); momentos de letra (itálica o la otra familia
   dentro del titular, tamaños mezclados); gráficos de la marca sacados de sus fotos (un recorte de detalle con object-fit y
   object-position sobre el dibujo del envase o una textura, su nombre en letras como gráfico); y vida: cada foto y tarjeta reacciona
   al cursor (transición de 300–500 ms en transform, sombra o filtro), los botones tienen su estado al pasar y al tocar, al menos una
   parte interactiva de verdad (pestañas con useState que cambian lo que se ve, una fila deslizable con scroll-snap, preguntas con
   <details> que se abren suaves) y el movimiento de «art». Todo con prefers-reduced-motion y sin romper las reglas de arriba.

${V2_MODERN_RULES}`;

export function v2DirectionPrompt(free = false): string {
  return `Eres director de arte de un estudio que diseña tiendas en línea premium (piensa en Aesop, Mirror Water, Le Labo, Glossier). Antes de
escribir código decides la dirección de UNA tienda. Recibes sus datos reales, sus fotos y capturas de tiendas reales de referencia
(escritorio, más abajo y teléfono), elegidas por parecerse a su tipo de negocio, cada una con lo que enseña.

Las referencias muestran el NIVEL de oficio que buscamos: cómo arman la retícula, la escala tipográfica, el aire, cómo muestran el
producto, cómo se ve en el teléfono. Aprende eso. Cuando además recibes sus fichas de estudio, la primera tienda es la referencia
principal: sigue su ESTRUCTURA (orden y tipo de secciones, forma de la cabecera, tarjeta de producto, caja de compra, recomposición en
el teléfono) adaptada a esta marca y a sus fotos; de las demás toma un solo toque. NUNCA copies sus colores, sus textos, sus logos ni
sus fotos: esta tienda es otra marca, con sus propias fotos.

Decide:
- idea: la idea de la marca en una frase, de la que sale todo lo demás.
- craft: qué tomas de cada referencia (la estructura de la principal, el toque de la otra) y qué cambias para esta marca.
- display / text: fuentes del catálogo (ids). Una de carácter para titulares, otra legible para el texto.
- palette: colores con trabajo (papel, tinta, apagado, acento, línea) y para qué sirve cada uno; el acento se usa poco.
- grid: la retícula y el ritmo (columnas, márgenes, asimetría, cuánto aire).
- hero: la composición exacta de la primera pantalla y su foto.
- sections: la secuencia de la portada (${free ? `${FREE_MIN - 1} a ${FREE_MAX - 1}, después de la primera pantalla: una portada larga, con capítulos` : '4 a 9'}), cada una con su composición, su foto (o vacío) y por qué va ahí. Composiciones
  propias de ESTA marca: nada de «tres tarjetas con icono», «héroe centrado con dos botones», «banda de testimonios genérica».
- signature: UN gesto que solo esta tienda tiene.
- art (owner 2026-11-14: «más artística, como una web de verdad; hoy parece HTML y CSS plano»): lo que la hace un sitio hecho a mano.
  · layouts: 3 o 4 composiciones editoriales concretas y en qué sección va cada una (columnas desiguales, una foto que se monta sobre el
    borde de un bloque de color, un texto que entra sobre el borde de una foto, números enormes, una sección que rompe la retícula a
    propósito, una fila que se desliza con la siguiente tarjeta asomando).
  · type: los momentos de letra (una palabra en itálica o en la otra familia dentro del titular, una cita enorme, tamaños mezclados,
    una palabra que cruza la sección en su propia fila).
  · graphics: los gráficos de la marca, sacados de su propio material: recortes de detalle de sus fotos (el dibujo del envase, una
    textura, el sello), su nombre en letras como gráfico, íconos del sistema; nunca formas dibujadas con CSS.
  · motion: dónde se mueve y cómo (entrada al bajar, fotos que se acercan apenas, una franja de palabras, la foto que se desplaza
    suave), con calma.
  · interaction: lo que responde al usuario (pestañas o filtros que cambian lo que se ve, un carrusel o fila deslizable, preguntas que
    se abren suaves, fotos y tarjetas que reaccionan al pasar el cursor, botones con su estado).
- photos: cómo se tratan las fotos (recorte, tamaño, nunca más grandes que su tamaño real, nunca estiradas).
- phone: cómo se recompone en un teléfono de 390 px (no basta con apilar).
- avoid: lo que esta tienda nunca hará.
- cart: cómo se ve el carrito por dentro, según la marca: «band» (una banda de su color con su nombre arriba: marcas con color y
  energía), «photo» (una de sus fotos arriba, con photo = esa foto: marcas con fotos de ambiente fuertes) o «paper» (papel teñido con
  líneas punteadas como un recibo: marcas calmas, de oficio o editoriales). Sus colores y letras salen de la paleta.

${V2_MODERN_RULES}

Fuentes disponibles (id (familia; uso; carácter)):
${fonts()}`;
}

export function v2DirectionInput(context: V2Context): string {
  // Owner 2026-11-15: the art direction knows a showcase piece is possible, so its chapters can make room for one.
  // Owner 2026-11-15 («changing menu per store»): the direction picks one of the kit's menu models this merchant has not used yet.
  const menus = V2_MENU_MODELS.filter(m => (context.menusAllowed ?? V2_MENU_MODELS.map(x => x.id)).includes(m.id));
  // Heroes plan 2026-11-15: the hero starts from one idea this merchant has not used (or the open brief for about a third of stores).
  const ideas = (context.heroesAllowed ?? V2_HERO_IDEAS.map(h => h.id)).map(id => heroIdea(id)).filter(Boolean);
  const hero = `\n\nPORTADA: elige UNA idea de esta lista, la que la tienda puede mostrar con sus fotos de verdad (nunca otra): ${ideas.map(idea => `${idea!.id} — ${idea!.name}`).join(' · ')}.`;
  // Headers plan 2026-11-16 (Zippa, Halcy): the header floats over the hero or sits above it, plain or pill links, and its real messages.
  const header = `\n\nCABECERA: over=true solo si la portada empieza con una foto o un color a todo el ancho (laps, lift, hearthen, zippa, libre); entonces tone=light sobre foto oscura, dark sobre clara. links=pills para marcas juguetonas (cada enlace una pastilla). announce: 0–3 mensajes REALES cortos (envío, retiro, oferta real), nunca inventados.${context.headersUsed?.length ? ` Tus otras tiendas ya usan ${context.headersUsed.join(', ')} (over:links): usa otra combinación.` : ''}`;
  const menu = `\n\nMENÚ: elige UNO de estos modelos, el que mejor venda en ESTA tienda (nunca otro): ${menus.map(m => `${m.id}: ${m.fits}`).join(' · ')}.
Grupos con nombres cortos y claros (máx. 28 letras), como mucho 7 arriba; enlaces con to: all, new, category:<id>, collection:<slug>, page:about|contact|shipping|faq, section:<id>; fotos solo de las rutas de la tienda, cada una una vez. Tu CSS puede vestir .pym-panel[data-model=…] y sus partes .pym-*.`;
  return `${factsAll(context)}${(context.cutouts?.length ?? 0) >= 2 ? '\n\nVITRINAS: con los recortes la portada puede tener UNA vitrina de la plataforma justo después de la primera pantalla: ProductStage (un producto por pantalla, cada uno con su color de fondo y un titular de cartel partido alrededor del producto, como LIFT) o, para ropa, HangingRail (prendas en un riel, como ATELIER). Si la usas, nómbrala en los capítulos y da los colores de fondo de cada pantalla.' : ''}` + hero + header + menu;
}

/** The writer works in two calls so each answer fits the ChatGPT bridge's 10-minute request (live 2026-11-14: all four files in one
 *  call timed out): the design system (Shell + globals.css), then the pages (home + product, plus the CSS they add). */
// 'product' (owner 2026-11-14, faster stores): the product page in its own call, beside the two halves of the home (YAPI_V2_SPLIT).
export type V2Part = 'system' | 'pages' | 'product';
export const V2_PART_FILES: Record<V2Part, V2File['path'][]> = { system: ['components/Shell.tsx', 'styles/globals.css'], pages: ['components/home.tsx', 'components/product.tsx'], product: ['components/product.tsx'] };

export function v2WriterSchema(part: V2Part, photoCount = 0): object {
  const paths = V2_PART_FILES[part];
  // The pages also name the library sections the home places (spec 2026-11-14 v2-library-sections), each by its slot.
  const library = part === 'pages' ? { library: v2LibrarySchema(photoCount) } : {};
  return { type: 'object', additionalProperties: false, required: ['files', 'css', 'notes', ...Object.keys(library)], properties: {
    files: { type: 'array', minItems: paths.length, maxItems: paths.length, items: { type: 'object', additionalProperties: false, required: ['path', 'content'],
      properties: { path: { type: 'string', enum: paths }, content: { type: 'string' } } } },
    css: { type: 'string' }, notes: { type: 'string' }, ...library } };
}

/** One part's answer: its files (each once) and, for the pages, the CSS appended to globals.css. */
export function readV2Part(raw: unknown, part: V2Part): { files: V2File[]; css: string; library: V2LibraryEntry[] } | null {
  const answer = raw as { files?: Array<{ path?: unknown; content?: unknown }>; css?: unknown; library?: unknown } | null;
  if (!Array.isArray(answer?.files)) return null;
  const files: V2File[] = [];
  for (const path of V2_PART_FILES[part]) {
    const file = answer!.files!.find(entry => entry?.path === path && typeof entry.content === 'string' && entry.content.trim());
    if (!file) return null;
    files.push({ path, content: String(file.content) });
  }
  const library = Array.isArray(answer?.library) ? (answer!.library as unknown[]).filter((entry): entry is V2LibraryEntry => Boolean(entry) && typeof (entry as V2LibraryEntry).block === 'object') : [];
  return { files, css: typeof answer?.css === 'string' ? answer.css : '', library };
}

/** The four files from the two parts: the pages' CSS goes after the design system's sheet. */
export function joinV2Parts(system: { files: V2File[] }, pages: { files: V2File[]; css: string }): V2File[] {
  const sheet = system.files.find(file => file.path === 'styles/globals.css')!;
  const css = pages.css.trim() ? `${sheet.content.trimEnd()}\n\n/* Páginas */\n${pages.css.trim()}\n` : sheet.content;
  return [system.files.find(file => file.path === 'components/Shell.tsx')!, ...pages.files, { path: 'styles/globals.css', content: css }];
}


/** Owner 2026-11-16 («i think we added to many restrictions, what i want to do is drop restrictions for now»): loose mode keeps only
 *  what makes the store work — its four files and their wiring, the commerce mounts, no prices by hand, safe code, the store's own
 *  photos and ids. No taste rules, no library, no hero ideas, no menu brief, no page checks, no look. */

/** Owner 2026-11-16 («the menu i would also to be created by the model»): in the Nov 14 and loose rule sets the design writes its menu. */
export const OWN_MENU = `TU MENÚ: lo creas tú. Pasa a NavShell menu={<div className="…">…</div>} con el menú de ESTA tienda: sus grupos (categorías reales,
páginas como Nosotros o Contacto), los enlaces, fotos de la tienda (assets/…) y palabras de la marca, con la forma que la marca pida
(panel lateral, pantalla completa, mega menú con fotos, lista enorme, tarjetas…). NavShell lo abre y lo cierra (su botón aparece en todas
las pantallas, Escape, foco) y pone su botón de cerrar; tú das TODO el estilo con panelClassName="…" y tus clases (el panel se dibuja al nivel de la página, fuera de la cabecera: no lo
estiles a través de las clases de la cabecera). El panel sale
por la izquierda a toda la altura y mide hasta 1100 px de ancho (dale tu propio width si lo quieres más angosto o a pantalla completa); en el
teléfono ocupa todo el ancho: tus columnas pasan a una sola. Enlaces: categoría
productos.html?f_categoria=<Nombre>, todo productos.html, páginas nosotros.html, contacto.html, envios.html, faq.html.`;

export const V2_LOOSE_PROMPT = `Escribes el código de una tienda online con React + TypeScript (TSX) y CSS. El diseño es TODO tuyo: sin plantilla,
sin reglas de estilo. Hazla espectacular. Cuatro archivos (cada llamada te dice cuáles devuelves, completos):

1. components/Shell.tsx — export default function Shell({ children }: { children: ReactNode }), export function Header() y export
   function Footer(). Shell dibuja Header, {children}, Footer y <CommerceSlots /> (de '@pagosya/ui') una vez. El Header usa
   <NavShell brand={…} links={[{ label, href }]} structure="bar|centered|split|drawer" actions="icons" className="…" … /> de
   '@pagosya/ui' (trae buscar, cuenta, carrito y el menú del teléfono); lo estilas como quieras. Categoría: productos.html?f_categoria=<Nombre>.
2. components/home.tsx — export default function Home(): <Shell><main id="contenido">…</main></Shell>.
3. components/product.tsx — <Shell>, dentro <ProductPageTemplate> con tu composición de <KitSlot kind="product" name="…" /> (obligatorios:
   gallery, title, pricing, buy; opcionales: breadcrumb, category, rating, description, highlights, delivery, info, reviews, related,
   payments, pairs) y después <main id="contenido" data-pagosya-product-page />. Una columna fija (sticky) va solo junto a la galería:
   lo de abajo (pasos, opiniones, relacionados) va fuera de esa retícula, o se monta sobre ella al bajar.
4. styles/globals.css — todo tu CSS (también puedes estilar las tarjetas de producto .menu-item y sus partes, la retícula de
   data-pagosya-catalog y las piezas .product-detail__*). Define --kit-paper, --kit-ink, --kit-accent, --kit-on-accent, --kit-muted,
   --kit-line, --kit-radius, --kit-display y --kit-text en :root. Fuentes: @font-face con src: url(assets/<id>.ttf) de las que te dan.
   Tailwind también está disponible.

COMERCIO (lo llena el sistema; tú solo pones dónde va, vacío y auto-cerrado):
- Productos: <div data-pagosya-catalog data-products="id,id" /> o <div data-pagosya-catalog data-category="Nombre" /> (al menos uno en la portada).
- Destacado: <div data-pagosya-spotlight="id" />. Agregar: <button type="button" data-add="id" data-quantity="1">Agregar</button>.
  Enlace a producto: product.html?id=<id>. Formulario de contacto: <div data-pagosya-contact /> (una vez). Pagos: <div data-pagosya-payways />.
- NUNCA escribas precios, descuentos ni existencias: el sistema los muestra. Usa solo los ids, nombres, datos y fotos (assets/…) que te dan.
- Nada de fetch, eval, dangerouslySetInnerHTML, <script>, iframes ni imports remotos. Imports: 'react', '@pagosya/ui' (NavShell,
  CommerceSlots, ProductPageTemplate, KitSlot, Reveal, Parallax, Marquee, WordRotate, KineticHeadline, ScrollScale, Carousel,
  ProductStage, HangingRail) y './Shell'.
Texto en español, corto y verdadero (nada inventado). En el teléfono (390 px) nada se sale del ancho.
SIN HUECOS (owner 2026-11-16: «sections that leave a lot of empty space»): ninguna sección deja zonas grandes vacías — cada columna lleva contenido (foto, texto, productos), las dos mitades de una sección tienen alturas parecidas y nada queda chico y perdido en una banda alta o ancha.`;

const LOOSE_TASK: Record<V2Part, string> = {
  system: 'EN ESTA LLAMADA devuelves SOLO components/Shell.tsx y styles/globals.css (en «css» va vacío): el sistema de diseño completo de la tienda.',
  pages: 'EN ESTA LLAMADA devuelves SOLO components/home.tsx y components/product.tsx (Shell y globals.css ya existen, abajo). En «css» van las reglas nuevas que tus páginas necesiten. La portada es tuya: tantas secciones como la tienda pida.',
  product: 'EN ESTA LLAMADA devuelves SOLO components/product.tsx. En «css» van las reglas nuevas que necesite.',
};
/** The contract lines loose mode keeps: a store that does not run or sell. */
const LOOSE_KEEPS = /Shell\.tsx debe exportar|CommerceSlots|NavShell|al menos un data-pagosya-catalog|necesita <ProductPageTemplate>|hueco obligatorio|no es un producto de la tienda|separa los ids|No escribas precios|no existe en la tienda|packs activos/;

function looseWriterInput(context: V2Context, part: V2Part, feedback: string[], previous?: V2File[], system?: V2File[]): string {
  const mine = previous?.filter(file => V2_PART_FILES[part].includes(file.path));
  return `${LOOSE_TASK[part]}${part === 'system' ? `\n${OWN_MENU}\n\nFUENTES que puedes usar (id · familia · rol · carácter; @font-face con src: url(assets/<id>.ttf)):\n${fonts()}` : ''}
${factsAll(context)}
${system?.length ? `\nSISTEMA DE DISEÑO YA ESCRITO:\n${system.map(file => `--- ${file.path}\n${file.content}`).join('\n')}\n` : ''}${feedback.length ? `\nLA VERSIÓN ANTERIOR TIENE ESTOS PROBLEMAS (solo lo que impide que la tienda funcione); corrígelos y devuelve tus archivos completos:\n${feedback.map(line => `- ${line}`).join('\n')}\n` : ''}${mine?.length ? `\nTUS ARCHIVOS ANTERIORES:\n${mine.map(file => `--- ${file.path}\n${file.content}`).join('\n')}\n` : ''}`;
}

export function v2WriterPrompt(free = false, loose = false): string {
  if (loose) return V2_LOOSE_PROMPT;
  return `Escribes el código de la tienda con React + TypeScript (TSX) y CSS, siguiendo al pie de la letra la dirección de arte que recibes.
No hay plantilla: el diseño entero es tuyo. La tienda tiene estos cuatro archivos (cada llamada te dice cuáles devuelves, completos):

1. components/Shell.tsx — export default function Shell({ children }: { children: ReactNode }), y además export function Header()
   y export function Footer(). Las páginas de la plataforma (cuenta, pago, políticas, catálogo) usan Shell, Header y Footer tal cual.
   Shell dibuja Header, {children}, Footer y <CommerceSlots /> (de '@pagosya/ui') una sola vez.
   Header: usa <NavShell brand={…} links={[{ label, href }]} structure="bar|centered|split|drawer" actions="icons"
   className="…" barClassName="…" brandClassName="…" linksClassName="…" actionsClassName="…" /> de '@pagosya/ui'. NavShell ya trae
   sus tres íconos —buscar, perfil y el carrito con su contador— y el menú del teléfono; esos íconos son siempre los de la
   plataforma (no les escribas CSS). Tú eliges la estructura, la marca (el nombre en tu tipografía o un logotipo de texto con
   carácter), los enlaces y el estilo de .ui-nav y .ui-nav__links con tus clases. ENLACES A UNA CATEGORÍA: siempre
   productos.html?f_categoria=<Nombre exacto de la categoría> (nunca productos.html#algo ni ?category=); todos los productos:
   productos.html. NavShell pone su propia altura, la barra fija y el menú del teléfono: a .ui-nav y al header no les des height,
   position ni top (se descartan); tú das colores, letra, bordes, la estructura y la franja de anuncio. El header es parte del diseño: con la misma intención que el resto, nunca una barra genérica. Una franja de
   anuncio encima solo con datos reales (nunca códigos o promociones inventados).
2. components/home.tsx — export default function Home(): <Shell><main id="contenido">…</main></Shell>. Exactamente un <h1>.
3. components/product.tsx — export default function Product(): <Shell>, dentro <ProductPageTemplate> con TU composición de la
   página de producto usando <KitSlot kind="product" name="…" className="…" /> (de '@pagosya/ui'), y después
   <main id="contenido" data-pagosya-product-page />. Huecos obligatorios: gallery, title, pricing, buy. Opcionales: breadcrumb,
   category, rating, description, highlights, delivery, info, reviews, related, payments, pairs. Los huecos van vacíos: el
   sistema los llena con los datos reales (fotos, precio, variantes, botón de compra).
4. styles/globals.css — tus tokens (:root, incluidos --kit-paper, --kit-ink, --kit-muted, --kit-accent, --kit-on-accent,
   --kit-line y --kit-radius con tus colores, y --kit-display / --kit-text con tus familias de letra: las piezas del sistema y las
   secciones de biblioteca los usan), @font-face de tus fuentes con src: url(assets/<id>.ttf) format('truetype'),
   el estilo de la cabecera y del pie, y los colores de fondo de tus secciones. ${free ? FREE_SIZES : `Los tamaños de títulos, textos, botones, secciones y
   espacios los pone el KIT DE DISEÑO (es-section, es-eyebrow, es-h2, es-lead, es-btn, es-grid, es-split, es-media): no los
   redefinas.`} Usa un prefijo propio en tus clases (por ejemplo .v2-). Nada de !important, nada de
   @import. También das estilo a las piezas que dibuja el sistema: .spotlight, .product-detail__* y [data-product-slot], para que
   se vean de tu marca. Las TARJETAS DE PRODUCTO (.menu-item, .menu-add y sus partes), la retícula de data-pagosya-catalog, los
   botones de talla/color (.product-detail__values) y la foto principal (.product-detail__stage, .product-detail__photo) son de la
   plataforma: no les escribas CSS (se descarta); toman tus colores de --kit-paper, --kit-ink, --kit-accent, --kit-on-accent,
   --kit-muted, --kit-line y --kit-radius${free ? FREE_CARDS : ''}. Tú diseñas lo que las rodea: la sección, su título, fondo y aire, qué productos y en qué
   orden; en la página de producto, dónde va cada hueco.

COMERCIO (lo maneja el sistema; tú solo pones dónde va):
- Productos de la tienda: <div data-pagosya-catalog data-products="id,id" /> (los que elijas, en tu orden, separados por COMAS) o
  <div data-pagosya-catalog data-category="Nombre de categoría" />. Debe haber al menos uno en la portada.
- TODO elemento con data-pagosya-catalog, data-pagosya-cart, data-pagosya-status, data-pagosya-product-page o
  data-pagosya-contact va VACÍO y auto-cerrado (<div data-pagosya-catalog … />): ningún título, texto ni hijo adentro. Los títulos van
  en otro elemento, antes.
- data-pagosya-contact es el formulario de contacto completo (nombre, correo, WhatsApp, mensaje): UNA sola vez por página, en una
  sección con su título y espacio para un formulario alto. No es un botón de WhatsApp ni un campo de correo para novedades (no hay
  formulario de novedades). Un botón que abre el formulario: <a href="contacto.html" data-pagosya-contact-open>Escríbenos</a>.
- Un producto destacado dentro de tu propia composición: <div data-pagosya-spotlight="id" data-side="right" className="…" /> (vacío).
- Botón de agregar al carrito: <button type="button" data-add="id" data-quantity="1">Agregar</button>.
- Enlace a un producto: product.html?id=<id>. Todos los productos: productos.html.
- Secciones de venta con datos reales (usa las que sirvan a esta tienda, diseñadas por ti): «Visítanos» con los LUGARES reales
  (dirección y descripción tal cual); cómo pagar con <div data-pagosya-payways /> (solo si el modo de pago es «payment»); opiniones
  con <section data-pagosya-reviews-section> con tu título y un <div data-pagosya-reviews /> vacío adentro (la sección se oculta sola
  si no hay opiniones); packs con <div data-pagosya-bundles />. data-pagosya-payways, data-pagosya-reviews y data-pagosya-bundles van
  vacíos: el sistema los llena. El botón flotante de WhatsApp lo pone el sistema cuando la tienda lo tiene: no hagas otro.
- NUNCA escribas precios, descuentos, existencias ni plazos de entrega: el sistema los muestra. Usa solo los ids y nombres que te dan.
- Nada de fetch, eval, dangerouslySetInnerHTML, <script>, iframes, imports remotos ni formularios de pago o contraseña.

IMPORTS permitidos: 'react', '@pagosya/ui' (NavShell, CommerceSlots, ProductPageTemplate, KitSlot, las piezas de movimiento: Reveal,
Parallax, Marquee, WordRotate, KineticHeadline, ScrollScale, Carousel, y las vitrinas ProductStage y HangingRail) y tus archivos
('./Shell', './v2-library').
${free ? FREE_MOTION : ''}MOVIMIENTO (owner 2026-11-14: tiendas con vida, sin ruido): las secciones ya aparecen solas al bajar (lo pone la plataforma). Tú puedes
sumar, como mucho: UNA franja que se mueve (la sección de biblioteca strip-velocity o <Marquee items={[…]} /> con 3 a 6 palabras
reales de la marca), UN titular animado (<KineticHeadline> o <WordRotate>) y <Parallax> suave en una foto. En la primera
pantalla, como mucho una cosa en movimiento. Nada que parpadee ni gire sin parar.
BORDES Y FORMAS: nunca dibujes formas con CSS (ondas, festones, burbujas, manchas con border-radius, máscaras o clip-path). Un borde
ondulado o festoneado entre dos bandas o antes del pie es la sección de biblioteca wave-divider (looks: ondas, ripple, ripple-flip,
sway, sway-flip; band = el color de la banda a la que entra). Si no, bordes rectos.
NUNCA (fallas vistas en pruebas reales): una columna fija (sticky) en la página de producto que comparte retícula con las secciones de abajo (se monta sobre ellas al bajar); líneas decorativas que atraviesan secciones o la página entera; palabras escritas en
vertical letra por letra; textos que se montan sobre otros; fotos más grandes que su tamaño real; tarjetas de producto apretadas en
columnas angostas; elementos con ancho fijo que en el teléfono se salen de la pantalla.
FOTOS: solo las rutas que te dan (assets/…), con alt descriptivo, object-fit sin estirar, nunca más anchas que su tamaño real.
Tailwind está disponible (clases completas y literales) además de tu CSS.

CALIDAD: esto debe verse como una tienda premium hecha a mano, no como una plantilla. Retícula precisa, mucho aire, jerarquía clara,
fotos de tamaño medio (nunca enormes: owner 2026-11-12 y 2026-11-14), texto corto y verdadero en español (sin inventar premios, cifras ni promesas). Lo que falta simplemente no se
menciona: el cliente nunca lee sobre tu trabajo (recortes, fotos o activos aprobados o pendientes, rotulado final, «sin inventar»,
«lo que la tienda no confirmó», lugares reservados). En el teléfono
(390 px) se recompone con intención y nada se sale del ancho. Movimiento, si hay, sutil y con prefers-reduced-motion.`;
}

const PART_TASK: Record<V2Part, string> = {
  product: `EN ESTA LLAMADA devuelves SOLO components/product.tsx: la página de producto de la tienda, con su composición de huecos. Shell.tsx y
globals.css ya existen (abajo): impórtalos y usa sus tokens y clases. En «css» devuelves solo las reglas NUEVAS que la página necesite, con el
mismo prefijo de clases. La portada la escriben otros al mismo tiempo: no la toques.`,
  system: `EN ESTA LLAMADA devuelves SOLO components/Shell.tsx y styles/globals.css (en «css» va vacío): el sistema de diseño de la tienda —
tokens, @font-face, tipografía, retícula, Header, Footer, estilos de las piezas del sistema y las clases de composición que usarán las
páginas (escribe esas clases pensando en la portada y la página de producto que pide la dirección).`,
  pages: `EN ESTA LLAMADA devuelves SOLO components/home.tsx y components/product.tsx. Shell.tsx y globals.css ya existen (abajo): impórtalos y
usa sus tokens y clases. En «css» devuelves solo las reglas NUEVAS que tus páginas necesiten (se añaden al final de globals.css), con el
mismo prefijo de clases y sin repetir lo que ya existe.

LA PORTADA SE ARMA CON LA BIBLIOTECA (owner 2026-11-14: las tiendas hechas con secciones probadas se ven terminadas; las escritas a
mano, «casi»). Tú das el sistema de diseño (colores, letras, cabecera, pie: ya escritos arriba) y eliges, ordenas y llenas secciones
de la biblioteca: portada, categorías, frase de marca, destacado, historia, beneficios, información de compra, preguntas, cierre…
Entre 5 y 9 secciones de biblioteca, más UNA sección tuya con la fila de productos (data-pagosya-catalog) y, como mucho, UNA sección
propia más para un momento que la biblioteca de verdad no tiene. En total no más de 10 secciones. Nunca dos secciones seguidas del
mismo tipo ni la misma idea repetida (una sola sección de sabores, de colecciones, etc.).
${V2_KIT_TEXT}

${V2_MODERN_RULES}

SECCIONES DE LA BIBLIOTECA:
- En «library» das cada una con su «slot» (un nombre corto: hero, s1, s2…) y su «block» (type, textos, fotos por número de la lista
  de FOTOS, items, products…), con los datos reales de la tienda (abajo). En components/home.tsx la pones con
  <LibrarySlot name="s1" /> (import { LibrarySlot } from './v2-library') en el lugar que le toca, entre tus propias secciones.
- LA PORTADA es SIEMPRE la sección de biblioteca de slot «hero», la PRIMERA dentro de <main>, de type ${V2_HERO_TYPES.join(', ')}:
  foto a todo el ancho con el texto encima (cover-full) o titular grande + foto grande a un lado (hero-split, cover-split). Con
  title, text (una línea), cta + link (productos.html) y cta2 + link2 (la categoría principal: productos.html?f_categoria=<Nombre>) —
  botones de 1 a 3 palabras («Ver todo», «Kits de viaje»), para que quepan lado a lado —, e
  items = hasta 3 datos reales cortos (envío, hecho a mano en…, retiro en tienda…; nunca inventados). Su <h1> lo pone la biblioteca:
  en home.tsx no escribas otro <h1>.
- Ninguna sección (tuya o de biblioteca) es solo una foto: toda foto grande va con su título y su texto.
- Productos: siguen con <div data-pagosya-catalog … /> (la plataforma dibuja las tarjetas); no uses products-grid de la biblioteca.`,
};

export function v2WriterInput(context: V2Context, direction: V2Direction, part: V2Part, feedback: string[] = [], previous?: V2File[], system?: V2File[], library?: { facts: string }): string {
  if (context.loose) return looseWriterInput(context, part, feedback, previous, system);
  const mine = previous?.filter(file => V2_PART_FILES[part].includes(file.path));
  const notes = part === 'pages' && !context.basic ? heroNotes(direction) : { heroBrief: '', headerNote: '' };
  return notes.heroBrief + notes.headerNote + `${part === 'pages' && context.free ? `${FREE_PAGES_TASK}${context.basic ? '' : `\n\n${FREE_PRODUCT_RULES}`}` : PART_TASK[part]}${part === 'product' && context.free && !context.basic ? `\n\n${FREE_PRODUCT_RULES}` : ''}${context.animated && part !== 'product' ? `\n\n${ANIMATED_RULES}` : ''}${part === 'pages' && showcaseRules(context, 'both') ? `\n\n${showcaseRules(context, 'both')}` : ''}
${context.ownCards ? `\nEL COMERCIANTE PIDIÓ TARJETAS DE PRODUCTO PROPIAS: esta vez SÍ diseñas .menu-item y sus partes (.menu-item__image, .menu-item__copy h3,
.menu-item__price, .menu-add) y la retícula de data-pagosya-catalog. El nombre siempre horizontal y legible, la foto sin estirar,
el botón de agregar con su tamaño (nunca una barra entera para un «+»), y en el teléfono dos columnas.\n` : ''}
${factsAll(context)}${part === 'system' && context.menu?.model ? menuStyleBrief(context.menu.model) : ''}${part === 'system' && context.basic ? `\n\n${OWN_MENU}` : ''}
${part === 'pages' && library ? `\nBIBLIOTECA DE SECCIONES (id · rol · lo que necesita · para qué sirve):\n${v2LibraryCatalogText()}\n\nDATOS REALES PARA LA BIBLIOTECA (productos por id o nombre, categorías, códigos, servicios, lugar, opiniones, redes):\n${library.facts}\n` : ''}
DIRECCIÓN DE ARTE (síguela):
${part === 'product' ? JSON.stringify(direction) : JSON.stringify(direction, null, 2)}
${system?.length ? `\nSISTEMA DE DISEÑO YA ESCRITO:\n${part === 'product' ? compactSystem(system) : system.map(file => `--- ${file.path}\n${file.content}`).join('\n')}\n` : ''}${feedback.length ? `\nLA VERSIÓN ANTERIOR NO COMPILÓ O NO PASÓ LAS REVISIONES. Corrige lo que te toque y devuelve tus archivos completos:\n${feedback.map(line => `- ${line}`).join('\n')}\n` : ''}${mine?.length ? `\nTU VERSIÓN ANTERIOR:\n${mine.map(file => `--- ${file.path}\n${file.content}`).join('\n')}` : ''}`;
}

/** Owner 2026-11-15 («lets go for it», after Amboras's showcase examples — LIFT's flavour stage, ATELIER's rail): with product
 *  cut-outs a store can place one showcase piece. Which one is told per call: the stage goes to the first half of a split home, the
 *  rail to the second, both to a whole-page writer. */
export function showcaseRules(context: Pick<V2Context, 'cutouts' | 'showcasesUsed'>, which: 'stage' | 'rail' | 'both'): string {
  if ((context.cutouts?.length ?? 0) < 2) return '';
  // Owner 2026-11-16: a showcase the merchant's last three stores placed is not offered again (it stays, it just rotates).
  const used = new Set(context.showcasesUsed ?? []);
  which = which === 'both' ? (used.has('stage') && used.has('rail') ? 'none' as never : used.has('stage') ? 'rail' : used.has('rail') ? 'stage' : 'both') : which;
  if ((which as string) === 'none' || used.has(which)) return '';
  const stage = `- <ProductStage label="Sabores" slides={[{ product: 'id', top: 'PALABRA', bottom: 'PALABRA', image: { src: 'assets/…webp', alt: '…' },
  bg: '#hex', ink: '#hex', decor: [{ src: 'assets/…webp', alt: '' }], facts: ['…', '…'] }, …]} />: una pantalla entera por producto o
  sabor (2 a 6). image y decor SOLO con RECORTES de la lista (nunca una foto con fondo); product: el id que se compra en esa pantalla
  (el mismo id puede repetirse si son sabores de un mismo producto). Cada recorte va como image en UNA sola pantalla, y esa pantalla dice lo
  que el recorte muestra (si la etiqueta dice «Lemon · Ginger», el titular es ese sabor): con menos recortes que sabores, menos pantallas
  (mínimo 2) o ninguna vitrina. Nunca una pantalla sin producto real ni de relleno («Sabor 05», «por anunciar»). Cada pantalla con SU color de fondo, fuerte y distinto de las otras (de la paleta o del
  color del producto), y ink con buen contraste; un titular de cartel en dos líneas cortas (máximo 10 letras cada una) que dice el
  sabor o la promesa, partido arriba y abajo del producto; facts: 2 o 3 datos reales y cortos de la descripción (nunca inventados);
  decor: 0 a 4 recortes pequeños de OTROS productos que flotan alrededor. El sistema pone el contador, la barra de avance, el botón
  «Agregar · precio» y el movimiento. Va justo después de la primera pantalla. Mira LIFT en las capturas.`;
  const rail = `- <HangingRail kicker="Colección" tone="dark" items={[{ product: 'id', image: { src: 'assets/…webp', alt: '…' } }, …]} />: para ropa,
  bolsos y accesorios: 3 a 6 piezas colgadas de un riel; al pasar el mouse una pasa al frente y su panel muestra nombre, precio, tallas
  reales y el botón. tone "dark" (fondo oscuro, como ATELIER en las capturas) o "light". Si los recortes son personas que llevan la
  ropa (no prendas solas), pon mount="stand": quedan de pie en fila sobre un piso en vez de colgadas.`;
  const pick = which === 'stage' ? 'Si los productos son comida, bebida, cosmética u objetos (no ropa), usa ProductStage UNA vez; si es ropa, no la uses.'
    : which === 'rail' ? 'Si la tienda vende ropa o accesorios, usa HangingRail UNA vez; si no, no la uses.'
    : 'Comida, bebida, cosmética u objetos → ProductStage; ropa y accesorios → HangingRail. Una sola vitrina por portada.';
  return `VITRINAS (owner 2026-11-15, como las tiendas de ejemplo de Amboras de las capturas): esta tienda tiene RECORTES de sus productos
(fotos sin fondo, lista abajo y adjuntas: usa solo los que se ven limpios y enteros). Con ellos la plataforma arma una vitrina que se siente hecha a mano; tú eliges colores, palabras y
piezas. Va directa dentro de <main> (ella misma es una sección), sin envolverla. ${pick}
${which !== 'rail' ? stage : ''}${which === 'both' ? '\n' : ''}${which !== 'stage' ? rail : ''}`;
}

/** Targeted repair (live 2026-11-14: a whole rewrite per failed build cost ~14 min and changed the design each time): the four
 *  current files and the exact problems in, only the files that change out — merged over the previous version. */
export function v2FixPrompt(free = false, loose = false): string {
  if (loose) return `Eres quien escribió esta tienda. Corrige SOLO los problemas de la lista (lo que impide que funcione), sin cambiar el diseño, y devuelve ÚNICAMENTE los archivos que modificas, completos.\n\n${V2_LOOSE_PROMPT}`;
  return `Eres quien escribió esta tienda. Su última versión no compiló o no pasó las revisiones. Corrige SOLO lo que dicen los problemas,
sin cambiar el diseño, y devuelve ÚNICAMENTE los archivos que modificas, cada uno completo.${free ? `
ARREGLA, NO QUITES: rehace la parte que falla (otra foto, otro fondo, otro orden, el texto en su lugar); quitar una sección es el último
recurso, y la portada nunca queda con menos secciones que antes.` : ''} Las reglas siguen siendo estas:

${v2WriterPrompt(free)}`;
}

export function v2FixSchema(photoCount = 0): object {
  // The fix may also send library sections (spec 2026-11-14): another type for a refused slot, or new slots; [] when none change.
  return { type: 'object', additionalProperties: false, required: ['files', 'notes', 'library'], properties: {
    files: { type: 'array', minItems: 0, maxItems: V2_FILES.length, items: { type: 'object', additionalProperties: false, required: ['path', 'content'],
      properties: { path: { type: 'string', enum: [...V2_FILES] }, content: { type: 'string' } } } },
    notes: { type: 'string' }, library: v2LibrarySchema(photoCount) } };
}

export function v2FixInput(files: readonly V2File[], problems: readonly string[], library?: { entries: readonly V2LibraryEntry[]; facts: string }): string {
  const own = files.filter(file => file.path !== V2_LIBRARY_FILE);
  const sections = library ? `\n\nSECCIONES DE BIBLIOTECA ACTUALES (slot → type): ${library.entries.map(entry => `${entry.slot} → ${String(entry.block?.type ?? '')}`).join(' · ') || '(ninguna)'}
Si una no pasó la revisión de datos, devuelve en «library» OTRA sección de la biblioteca para ese mismo slot (o quita su <LibrarySlot />);
puedes añadir slots nuevos. Deja «library» vacío si no cambias ninguna.\n\nBIBLIOTECA (id · rol · lo que necesita · para qué sirve):\n${v2LibraryCatalogText()}\n\nDATOS REALES PARA LA BIBLIOTECA:\n${library.facts}` : '';
  return `PROBLEMAS (corrige exactamente esto):\n${problems.map(line => `- ${line}`).join('\n')}${sections}\n\nARCHIVOS ACTUALES:\n${own.map(file => `--- ${file.path}\n${file.content}`).join('\n')}`;
}

/** The previous four files with the fix's files in place; null when the fix brought nothing usable. */
export function mergeV2Fix(previous: readonly V2File[], raw: unknown, libraryChanged = false): V2File[] | null {
  const changed = (raw as { files?: Array<{ path?: unknown; content?: unknown }> } | null)?.files;
  if (!Array.isArray(changed)) return null;
  const valid = changed.filter((entry): entry is V2File => (V2_FILES as readonly unknown[]).includes(entry?.path) && typeof entry.content === 'string' && Boolean(entry.content.trim()));
  if (!valid.length && !libraryChanged) return null;
  return previous.map(file => valid.find(entry => entry.path === file.path) ?? file);
}

// Spotlight is not one of them: the kit adds its card next to the design's own content inside it.
const MOUNT = /^data-pagosya-(catalog|cart|status|product-page|checkout-page|contact|bundles|payways|reviews)$/;

/** A template rule's line as V2 feedback: the template hint that suggests filling a section of words with a product row (which led
 *  the writer to repeat the same row, live 2026-11-14) becomes «a store photo beside it, or remove it». */
export function v2Hint(line: string): string {
  return line.replace(/\s*o muestra los productos \(data-pagosya-catalog[^)]*\)/, '')
    .replace(/Ponle una foto real o productos al lado/, 'Ponle una foto real de la tienda al lado')
    .replace(/(Sección de solo texto[^.]*\.)(.*)$/, '$1 Ponle al lado una foto de la tienda que aún no uses, o quítala; nunca agregues otra fila de productos.');
}

/** Deterministic repairs before any check (v0's «autofixers»; live 2026-11-14 the same two mistakes cost whole attempts): a filled
 *  commerce slot is emptied and an image with no alt becomes decoration (the platform's repairNextAuthoredMarkup), and ids in
 *  data-products joined with «|» are joined with commas (the publish check splits on commas only). */
/** Live 2026-11-15 (Oh Belly r19, DooBoo r7: both runs lost their last fix to «la foto … aparece 2 veces»): a photo or cut-out used a
 *  second time on the home, outside the stage and the rail, is swapped for one the home does not use yet — a cut-out for a cut-out, a
 *  store photo for a photo, the store's own photos before copies of product photos. With none left it stays and the contract asks. */
const CUTOUT_FILE = /^assets\/image-[0-9a-f]{12}\.webp$/;
/** Each kit component's prop names, read from the kit's own source (`@pagosya/ui`); null when its props cannot be read plainly. */
let kitPropNames: Map<string, Set<string> | null> | undefined;
export function kitProps(): Map<string, Set<string> | null> {
  if (kitPropNames) return kitPropNames;
  const source = ts.createSourceFile('ui.tsx', uiRuntime(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const aliases = new Map<string, ts.TypeNode>();
  const functions = new Map<string, ts.FunctionDeclaration>();
  for (const node of source.statements) {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node.type);
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) functions.set(node.name.text, node);
  }
  const propsOf = (name: string, seen: Set<string>): Set<string> | null => {
    const fn = functions.get(name);
    if (!fn || seen.has(name)) return null;
    seen.add(name);
    const param = fn.parameters[0];
    return param ? (param.type ? read(param.type, seen) : null) : new Set();
  };
  const read = (type: ts.TypeNode, seen: Set<string>): Set<string> | null => {
    if (ts.isTypeLiteralNode(type)) return new Set(type.members.flatMap(member => member.name ? [member.name.getText(source).replace(/^['"]|['"]$/g, '')] : []));
    if (ts.isParenthesizedTypeNode(type)) return read(type.type, seen);
    if (ts.isIntersectionTypeNode(type)) {
      const parts = type.types.map(part => read(part, seen));
      return parts.every(Boolean) ? new Set(parts.flatMap(part => [...part!])) : null;
    }
    // Parameters<typeof Catalog>[0]
    if (ts.isIndexedAccessTypeNode(type) && ts.isTypeReferenceNode(type.objectType) && type.objectType.typeName.getText(source) === 'Parameters') {
      const query = type.objectType.typeArguments?.[0];
      return query && ts.isTypeQueryNode(query) ? propsOf(query.exprName.getText(source), seen) : null;
    }
    if (ts.isTypeReferenceNode(type)) {
      const name = type.typeName.getText(source);
      if (name === 'Omit' && type.typeArguments?.length === 2) {
        const base = read(type.typeArguments[0], seen);
        const drop = type.typeArguments[1];
        const dropped = (ts.isUnionTypeNode(drop) ? drop.types : [drop]).map(part => ts.isLiteralTypeNode(part) && ts.isStringLiteral(part.literal) ? part.literal.text : null);
        return base && dropped.every(Boolean) ? new Set([...base].filter(prop => !dropped.includes(prop))) : null;
      }
      const alias = aliases.get(name);
      return alias ? read(alias, seen) : null;
    }
    return null;
  };
  kitPropNames = new Map([...functions.keys()].map(name => [name, propsOf(name, new Set())]));
  return kitPropNames;
}

/** Live 2026-11-15 (Oh Belly and DooBoo builds lost whole rounds to «speed is not assignable» on <Parallax>, then Oh Belly rev 22's
 *  last round to «style» on <ScrollScale>): a prop a kit component does not take is dropped, so the page compiles with the
 *  component's own default. Props with a dash (data-*, aria-*) are not checked by TypeScript and stay; so does key. A component the
 *  file defines itself under a kit name is left alone. */
function kitPropsOnly(content: string, repairs: string[], path: string): string {
  if (!/<[A-Z]/.test(content)) return content;
  const known = kitProps();
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const local = new Map<string, string>();
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@pagosya/ui') {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) for (const item of named.elements) local.set(item.name.text, (item.propertyName ?? item.name).text);
    }
  }
  const own = new Set([...content.matchAll(/\b(?:function|const|let|class)\s+([A-Z]\w*)/g)].map(match => match[1]));
  const cuts: Array<{ from: number; to: number }> = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
      const tag = node.tagName.text;
      const kit = local.get(tag) ?? (own.has(tag) ? undefined : tag);
      const props = kit ? known.get(kit) : undefined;
      if (props) for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(source);
        if (name === 'key' || name.includes('-') || props.has(name)) continue;
        cuts.push({ from: attribute.getFullStart(), to: attribute.getEnd() });
        repairs.push(`${path}: ${tag} sin ${name}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return cuts.sort((a, b) => b.from - a.from).reduce((out, cut) => out.slice(0, cut.from) + out.slice(cut.to), content);
}
/** Live 2026-11-15 (Oh Belly build: two rounds refused for a packs section in a store with no packs): the section that holds the
 *  packs mount goes, or the mount alone when it sits outside a section. */
function noPacks(content: string, repairs: string[], path: string): string {
  for (let guard = 0; guard < 4; guard++) {
    const at = content.search(/<[a-z]+\b[^>]*data-pagosya-bundles/);
    if (at < 0) break;
    let start = content.lastIndexOf('<section', at), end = -1;
    while (start >= 0) {
      let depth = 0; const tags = /<section\b|<\/section>/g; tags.lastIndex = start;
      for (let tag = tags.exec(content); tag; tag = tags.exec(content)) { depth += tag[0] === '</section>' ? -1 : 1; if (depth === 0) { end = tag.index + tag[0].length; break; } }
      if (end > at) break;
      end = -1; start = content.lastIndexOf('<section', start - 1);
    }
    if (start >= 0 && end > at) content = content.slice(0, start) + content.slice(end);
    else content = content.replace(/<[a-z]+\b[^>]*data-pagosya-bundles[^>]*\/>/, '');
    repairs.push(`${path}: sin sección de packs (la tienda no tiene packs)`);
  }
  return content;
}
function oncePhotos(home: string, context: Partial<Pick<V2Context, 'photos' | 'cutouts'>>, repairs: string[], library = ''): string {
  const showcase = [...home.matchAll(/<(?:ProductStage|HangingRail)\b[\s\S]*?\/>/g)].map(match => [match.index ?? 0, (match.index ?? 0) + match[0].length]);
  // Live 2026-11-16 (DooBoo r13, Meat House r9, Bake Lab r3, NOA r2): a fix round put a photo the library sections already show
  // into the home's own sections; the library's photos count as used first.
  const shown = new Set([...library.matchAll(/assets\/[\w.-]+\.(?:jpe?g|png|webp)/g)].map(match => match[0]));
  const used = new Set([...shown, ...[...home.matchAll(/assets\/[\w.-]+\.(?:jpe?g|png|webp)/g)].map(match => match[0])]);
  const cuts = new Set((context.cutouts ?? []).map(cut => cut.path));
  const spare = {
    cut: [...cuts].filter(path => !used.has(path)),
    // Never an old cut-out kept among the store's files (live 2026-11-15, Oh Belly r20: a photo swapped for a can cut-out).
    photo: [...(context.photos ?? [])].sort((a, b) => Number(Boolean(a.product)) - Number(Boolean(b.product))).map(photo => photo.path).filter(path => !used.has(path) && !cuts.has(path) && !CUTOUT_FILE.test(path)),
  };
  const seen = new Set<string>(shown);
  return home.replace(/(["'(])(assets\/[\w.-]+\.(?:jpe?g|png|webp))(?=["')])/g, (whole: string, quote: string, path: string, at: number) => {
    if (showcase.some(([from, to]) => at >= from && at < to)) return whole;
    if (!seen.has(path)) { seen.add(path); return whole; }
    const next = (cuts.has(path) ? spare.cut : spare.photo).shift();
    if (!next) return whole;
    repairs.push(`components/home.tsx: ${path} repetida → ${next}`);
    return `${quote}${next}`;
  });
}

export function v2Repairs(files: readonly V2File[], header?: Pick<V2Context, 'goods' | 'ownIcons'> & Partial<Pick<V2Context, 'photos' | 'cutouts' | 'packs' | 'heroIdea' | 'header'>>): { files: V2File[]; repairs: string[] } {
  const repairs: string[] = [];
  // Owner 2026-11-14 («the icons are the same up top… unless asked to change»): the header's actions are always the platform's
  // three icons — search, profile, the cart drawn as what the store sells — unless the merchant asked for other icons.
  if (header && !header.ownIcons) files = files.map(file => {
    if (!file.path.endsWith('.tsx') || !/<NavShell\b/.test(file.content)) return file;
    let content = file.content.replace(/(<NavShell\b[^]*?)\bactions=(["'])(labels|pill)\2/g, (_, before: string) => { repairs.push(`${file.path}: NavShell con íconos`); return `${before}actions="icons"`; });
    // [^]*? (not [^>]*): a brand={<span>…</span>} or a free bar puts a «>» before cart= (it would be written twice).
    if (header.goods && !/<NavShell\b[^]*?\bcart=/.test(content)) { content = content.replace(/<NavShell\b/g, `<NavShell cart="${header.goods}"`); repairs.push(`${file.path}: carrito «${header.goods}»`); }
    return content === file.content ? file : { ...file, content };
  });
  // Live 2026-11-14 (NOA and Meat House attempt 1 refused: «Falta el hueco obligatorio gallery/title/pricing/buy»): a product page
  // with none of the four slots gets them in a plain two-column composition inside its template, so the round is not lost.
  files = files.map(file => {
    if (file.path !== 'components/product.tsx' || !file.content.includes('</ProductPageTemplate>') || ['gallery', 'title', 'pricing', 'buy'].some(slot => new RegExp(`["'\`]${slot}["'\`]`).test(file.content))) return file;
    repairs.push('components/product.tsx: huecos gallery/title/pricing/buy');
    const slots = `<div className="v2-pp-fallback" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', gap: 'clamp(24px, 4vw, 56px)', alignItems: 'start' }}><div><KitSlot kind="product" name="gallery" /></div><div><KitSlot kind="product" name="title" /><KitSlot kind="product" name="pricing" /><KitSlot kind="product" name="buy" /></div></div>`;
    let content = file.content.replace('</ProductPageTemplate>', `${slots}</ProductPageTemplate>`);
    if (!/\bKitSlot\b[^;]*from\s*['"]@pagosya\/ui['"]/.test(content)) content = content.replace(/import\s*\{([^}]*)\}\s*from\s*(['"])@pagosya\/ui\2/, (_, names: string, quote: string) => `import { ${names.trim()}, KitSlot } from ${quote}@pagosya/ui${quote}`);
    return { ...file, content };
  });
  // Live 2026-11-14 (Meat House V2): the platform's own card class on a featured mount (className="… spotlight") styled the mount as a
  // second card around the real one; the mount keeps only the design's classes.
  files = files.map(file => !file.path.endsWith('.tsx') ? file : { ...file, content: file.content.replace(/<([a-z]+)\b([^>]*\bdata-pagosya-spotlight=[^>]*)>/g, (tag, name: string, attrs: string) => {
    const fixed = attrs.replace(/className=(["'])([^"']*)\1/, (_, quote: string, list: string) => `className=${quote}${list.split(/\s+/).filter(token => token && !/^(spotlight|spotlight__\w+|menu-item|menu-add)$/.test(token)).join(' ')}${quote}`);
    if (fixed === attrs) return tag;
    repairs.push(`${file.path}: sin la clase de la plataforma en data-pagosya-spotlight`);
    return `<${name}${fixed}>`;
  }) });
  const commas = files.map(file => !file.path.endsWith('.tsx') ? file : { ...file, content: file.content.replace(/data-products=(["'])([^"']*)\1/g, (match, quote: string, list: string) => {
    if (!list.includes('|')) return match;
    repairs.push(`${file.path}: data-products con comas`);
    return `data-products=${quote}${list.split(/[|,]/).map(id => id.trim()).filter(Boolean).join(',')}${quote}`;
  }) });
  // Live 2026-11-14 (Pawby V2 rev 4: a product page with only the header and footer): the product mount written inside
  // <ProductPageTemplate> is never rendered — it goes right after the template, where the prompt asks for it.
  const mounted = commas.map(file => {
    if (file.path !== 'components/product.tsx') return file;
    const close = file.content.indexOf('</ProductPageTemplate>');
    const mount = file.content.match(/[ \t]*<main\b[^>]*\bdata-pagosya-product-page\b[^>]*\/>\n?/);
    if (close < 0 || !mount || mount.index! > close) return file;
    repairs.push('components/product.tsx: data-pagosya-product-page fuera de ProductPageTemplate');
    const without = file.content.slice(0, mount.index) + file.content.slice(mount.index! + mount[0].length);
    const at = without.indexOf('</ProductPageTemplate>') + '</ProductPageTemplate>'.length;
    return { ...file, content: `${without.slice(0, at)}\n${mount[0].trim()}${without.slice(at)}` };
  });
  const fixed = mounted.map(file => {
    if (!file.path.endsWith('.tsx')) return file;
    let content = oneProductRoot(file.content, repairs, file.path);
    content = oneContactForm(content, repairs, file.path);
    content = kineticText(content, repairs, file.path);
    if (file.path === 'components/home.tsx' && header?.photos) content = oncePhotos(content, header, repairs, files.find(other => other.path === 'components/v2-library.tsx')?.content);
    // Photos with words are marked so the page rule «cropped-words» can measure them (2026-11-15).
    if (header?.photos) content = markWordPhotos(content, new Set(header.photos.filter(photo => photo.words).map(photo => photo.path)));
    // The header look the direction chose (headers plan Task 13), written onto NavShell and the announcement bar.
    if (file.path === 'components/Shell.tsx' && header?.header) content = withHeaderLook(content, header.header);
    // The home carries its hero idea (heroes plan 2026-11-15), so the merchant's next store starts from another one.
    if (file.path === 'components/home.tsx' && header?.heroIdea && readHeroMarker(content) !== header.heroIdea) content = `${heroMarker(header.heroIdea)}\n${content.replace(/^\/\/ @pagosya-hero [a-z]+\s*\n/m, '')}`;
    content = kitPropsOnly(content, repairs, file.path);
    if (header && header.packs === 0) content = noPacks(content, repairs, file.path);
    return content === file.content ? file : { ...file, content };
  });
  const authored = repairNextAuthoredMarkup(fixed as SourceProjectFileDto[]);
  return { files: authored.files as V2File[], repairs: [...repairs, ...authored.repairs] };
}

/** Live 2026-11-15 (DooBoo animated r3: the 8 brand chapters never showed): the runtime clones the template's ONE root element and
 *  drops a template with several (productPageTemplateInvalid → the plain platform page); several roots go into one <div>. */
function oneProductRoot(content: string, repairs: string[], path: string): string {
  if (!content.includes('</ProductPageTemplate>')) return content;
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let edit: { open: number; close: number } | null = null;
  const visit = (node: ts.Node) => {
    if (edit) return;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'ProductPageTemplate') {
      const roots = node.children.filter(child => !(ts.isJsxText(child) && !child.text.trim()) && !(ts.isJsxExpression(child) && !child.expression));
      if (roots.length > 1) edit = { open: node.openingElement.getEnd(), close: node.closingElement.getStart(source) };
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!edit) return content;
  const { open, close } = edit as { open: number; close: number };
  repairs.push(`${path}: ProductPageTemplate con un solo elemento raíz`);
  return `${content.slice(0, open)}<div className="v2-product-page">${content.slice(open, close)}</div>${content.slice(close)}`;
}

/** Live 2026-11-15 (DooBoo r3): data-pagosya-contact written three times (a WhatsApp link, a newsletter field, the form) — the
 *  runtime fills the first with the whole form and pins the empty others in the corner over the WhatsApp button. The last one keeps
 *  the form; the others become links that open it. */
function oneContactForm(content: string, repairs: string[], path: string): string {
  const mount = /<([a-z]+)\b([^<>]*?)\bdata-pagosya-contact\b(?![-=])([^<>]*?)\/>/g;
  const all = [...content.matchAll(mount)];
  // The design's own text-link class (DooBoo «doo-text-link»), so the link reads as the page's other links (owner 2026-11-15:
  // «Escríbenos» showed as plain text).
  const linkClass = mostUsed([...content.matchAll(/<a\b[^>]*\bclassName="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/)).filter(name => /(^|-)link$/.test(name)));
  const withLink = (className?: string) => [...new Set([...(className ?? '').split(/\s+/), ...(linkClass ? [linkClass] : [])].filter(Boolean))].join(' ');
  let out = content;
  if (all.length > 1) {
    repairs.push(`${path}: data-pagosya-contact una sola vez (${all.length - 1} como enlace)`);
    out = ''; let at = 0;
    for (const match of all.slice(0, -1)) {
      const className = withLink(`${match[2]} ${match[3]}`.match(/\bclassName=(["'])([^"']*)\1/)?.[2]);
      out += content.slice(at, match.index) + `<a${className ? ` className="${className}"` : ''} href="contacto.html" data-pagosya-contact-open>Escríbenos</a>`;
      at = match.index! + match[0].length;
    }
    out += content.slice(at);
  }
  // A link this repair wrote before the design's link class was taken into account gets it now.
  return linkClass ? out.replace(/<a className="([^"]*)" href="contacto\.html" data-pagosya-contact-open>Escríbenos<\/a>/g, (whole, className: string) => {
    if (className.split(/\s+/).includes(linkClass)) return whole;
    repairs.push(`${path}: enlace «Escríbenos» con ${linkClass}`);
    return `<a className="${withLink(className)}" href="contacto.html" data-pagosya-contact-open>Escríbenos</a>`;
  }) : out;
}

const mostUsed = (names: readonly string[]): string | undefined => {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** Live 2026-11-15 (DooBoo r3 attempt 1 did not compile, a whole round lost): <KineticHeadline> written with its words as children;
 *  the words go to its `text` prop when they are plain text (inline tags dropped). */
function kineticText(content: string, repairs: string[], path: string): string {
  return content.replace(/<KineticHeadline\b([^>]*?)>([\s\S]*?)<\/KineticHeadline>/g, (whole, attrs: string, children: string) => {
    if (/\btext=/.test(attrs)) return whole;
    const text = children.replace(/\{\s*(['"])\s*\1\s*\}/g, ' ').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!text || /[{}]/.test(text)) return whole;
    repairs.push(`${path}: KineticHeadline con text`);
    return `<KineticHeadline${attrs.replace(/\s+$/, '')} text={${JSON.stringify(text)}} />`;
  });
}
/** Commerce mounts the runtime fills must be empty in the source (source-next refuses them, without saying which): each one that
 *  has children, by file, line and attribute, so the writer can fix exactly that. */
export function filledMounts(file: Pick<V2File, 'path' | 'content'>): string[] {
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      const mount = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && MOUNT.test(attribute.name.getText(source)));
      if (mount && node.children.some(child => !ts.isJsxText(child) || child.text.trim())) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        out.push(`${file.path}:${line}: <${node.openingElement.tagName.getText(source)} ${mount.getText(source).split('=')[0]}> tiene contenido adentro. Déjalo vacío y auto-cerrado (<${node.openingElement.tagName.getText(source)} ${mount.getText(source).split('=')[0]} … />) y pon títulos o textos FUERA, antes o después.`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Contract checks the platform's validator does not make for a V2 design (they come back to the writer as feedback). */
/** Live 2026-11-15 (Oh Belly r22: «Solo Lemon · Ginger cuenta hoy con recorte aprobado», «activo final pendiente», «Sin nombre, fruta
 *  ni color inventados»): the writer's own honesty rules written as the shopper's copy. Words only the work uses, in strings and
 *  JSX text of the written files. */
const BACKSTAGE = /\b(recortes?\s+aprobad|activos?\s+(?:final(?:es)?|aprobad|visual)|(?:rotulado|arte)\s+(?:final|aprobad|provisional)|nombre\s+previsto|sin\s+(?:inventar|fabricar)\b|(?:nada|ni\s+\w+)\s+inventad|(?:no|ni)\s+(?:ha|haya|han|hayan)\s+confirmad|posici[oó]n\s+reservada|(?:sabor|nombre|formulaci[oó]n|foto|imagen)\s+aprobad)[^'"`<>{}\n]{0,40}/gi;
export function backstageCopy(files: readonly Pick<V2File, 'path' | 'content'>[]): string[] {
  const out: string[] = [];
  for (const file of files) if (file.path.endsWith('.tsx') && file.path !== V2_LIBRARY_FILE) {
    const code = file.content.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$|\{\/\*[\s\S]*?\*\/\}/gm, '');
    for (const match of code.matchAll(BACKSTAGE)) out.push(match[0].trim());
  }
  return [...new Set(out)];
}

export function v2ContractProblems(files: readonly V2File[], context: V2Context): string[] {
  const get = (path: V2File['path']) => files.find(file => file.path === path)?.content ?? '';
  const shell = get('components/Shell.tsx'), home = get('components/home.tsx'), product = get('components/product.tsx'), css = get('styles/globals.css');
  // The generated library file carries the store's own data (prices in perks, codes…): the writer's checks read only its files.
  const all = files.filter(file => file.path !== V2_LIBRARY_FILE).map(file => file.content).join('\n');
  const problems: string[] = [];
  // Library sections (spec 2026-11-14): the hero is the library's, first in <main>; every slot the home places must exist.
  const library = readV2LibraryFile(files.find(file => file.path === V2_LIBRARY_FILE)?.content ?? '');
  const placed = [...home.matchAll(/<LibrarySlot\s+name=["']([^"']+)["']/g)].map(match => match[1]);
  const hero = placed.includes('hero') && library.slots.includes('hero');
  // Free mode: the first screen may be the writer's own section (its one <h1> is checked below).
  if (!placed.includes('hero') && !context.free) problems.push(`La portada empieza con la sección de biblioteca «hero» (${V2_HERO_TYPES.join(', ')}): <LibrarySlot name="hero" /> lo primero dentro de <main>.`);
  else { const at = home.indexOf('<LibrarySlot name="hero"'), own = home.search(/<section\b/); if (own >= 0 && at >= 0 && own < at) problems.push('<LibrarySlot name="hero" /> va PRIMERO dentro de <main>, antes de tus secciones.'); }
  for (const name of new Set(placed)) if (!library.slots.includes(name)) problems.push(library.dropped[name]
    ? `La sección de biblioteca «${name}» no pasó: ${library.dropped[name]}. Quita <LibrarySlot name="${name}" /> o diseña esa sección tú.`
    : `<LibrarySlot name="${name}" /> no tiene su sección en «library»: quítalo.`);
  // Library-first (owner 2026-11-14 «this noa is much better», the composer's NOA): the home is mostly tested sections — at least 4
  // library sections, at most 3 of the writer's own (the product row and one signature), 10 in all.
  const own = (home.match(/<section\b/g) ?? []).length, slots = new Set(placed).size;
  if (context.free) {
    // Free mode (owner 2026-11-14 «too short»): a long home of the writer's own chapters; the library is a toolbox, not a quota.
    // Owner 2026-11-15 (Oh Belly rev 18 repeated itself to reach nine): with little material, seven chapters are enough.
    const least = freeMin(context);
    if (own + slots < least) problems.push(`La portada tiene ${own + slots} secciones: una tienda completa lleva de ${least} a ${FREE_MAX} capítulos. Añade secciones con lo que la marca de verdad tiene (no repitas ideas).`);
    if (own + slots > FREE_MAX) problems.push(`La portada tiene ${own + slots} secciones: deja como mucho ${FREE_MAX}.`);
  } else if (slots < 4) problems.push(`La portada usa ${slots} secciones de biblioteca: arma la mayor parte con la biblioteca (entre 5 y 9), como una tienda terminada.`);
  if (!context.free && own > 3) problems.push(`La portada tiene ${own} secciones propias (<section>): deja como mucho la fila de productos y UNA sección propia; lo demás, con la biblioteca.`);
  if (!context.free && own + slots > 10) problems.push(`La portada tiene ${own + slots} secciones: deja como mucho 10.`);
  // The design kit: the writer's own sections are kit sections, so they share the library's sizes and spacing.
  // Owner 2026-11-15 (Brightland bar): in free mode the product page carries the brand's chapters after its buy area.
  if (context.free && product && (product.match(/<section\b/g) ?? []).length < 4) problems.push(`La página de producto se queda corta (${(product.match(/<section\b/g) ?? []).length} secciones): después de la zona de compra van de 5 a 8 capítulos de la marca dentro de <ProductPageTemplate> (usos con fotos, banda de marca, confianza, opiniones, relacionados, historia, preguntas).`);
  if (context.free && /<ProductPageTemplate\b[\s\S]*\b(useState|useEffect|onClick=)[\s\S]*<\/ProductPageTemplate>/.test(product)) problems.push('La página de producto es una plantilla que se copia: quita useState, useEffect y onClick de dentro de <ProductPageTemplate>; lo interactivo, con <details> y CSS.');
  const offKit = context.free ? [] : [...home.matchAll(/<section\b[^>]*>/g)].map(match => match[0]).filter(tag => !/\bes-section\b/.test(tag));
  if (offKit.length) problems.push(`${offKit.length} sección(es) propia(s) sin el kit: cada <section> tuya lleva className="es-section …" y se arma con las piezas del kit (es-eyebrow, es-h2, es-lead, es-btn, es-grid, es-split, es-media).`);
  if (!/export\s+default\s+function\s+Shell\b/.test(shell) || !/export\s+function\s+Header\b/.test(shell) || !/export\s+function\s+Footer\b/.test(shell)) problems.push('Shell.tsx debe exportar default Shell, y Header y Footer con nombre.');
  if (!/<CommerceSlots\s*\/>/.test(shell)) problems.push('Shell debe dibujar <CommerceSlots /> una vez.');
  if (!/<NavShell\b/.test(shell)) problems.push('El Header debe usar <NavShell … /> de @pagosya/ui (trae el carrito, la cuenta, la búsqueda y el menú del teléfono).');
  else if (context.creative) problems.push(...creativeHeaderProblems(shell));
  const h1s = (home.match(/<h1[\s>]/g) ?? []).length + (hero ? 1 : 0);
  if (h1s !== 1) problems.push(hero ? 'La portada de biblioteca ya pone el <h1>: en home.tsx usa <h2> para tus títulos.' : 'La portada necesita exactamente un <h1>.');
  if (!/data-pagosya-catalog/.test(home)) problems.push('La portada necesita al menos un data-pagosya-catalog.');
  if (!/<ProductPageTemplate\b/.test(product) || !/data-pagosya-product-page/.test(product)) problems.push('product.tsx necesita <ProductPageTemplate> y <main data-pagosya-product-page />.');
  // A slot named in a list the page maps over («['gallery', 'title'].map(…)») counts too (live 2026-11-14, Pawby and Remolino).
  for (const slot of ['gallery', 'title', 'pricing', 'buy']) if (!new RegExp(`["'\`]${slot}["'\`]`).test(product)) problems.push(`Falta el hueco obligatorio «${slot}» en la página de producto (<KitSlot kind="product" name="${slot}" />).`);
  if (/!important/.test(css)) problems.push('No uses !important en globals.css.');
  // Owner 2026-11-17 (creative Meat House r4: «i prefer more standard product cards»): products show in the platform's cards; a home
  // that lists several products in its own cards with their own add buttons goes back. One featured product keeps its button.
  // Live 2026-11-17 (The Bake Lab, 8 attempts lost at $6.7): counting product ids anywhere refused platform cards listed as
  // data-products={ids.join(',')}, ids in constants and product links; the rule counts add buttons — two or more products named
  // in data-add, or a data-add inside a .map (one button per item of a list).
  const buttons = new Set([...home.matchAll(/data-add=(["'])([^"']+)\1/g)].map(match => match[2]));
  const mapped = [...home.matchAll(/data-add=\{/g)].some(match => { const before = home.slice(Math.max(0, match.index! - 800), match.index); const at = before.lastIndexOf('.map('); return at >= 0 && !/\)\s*\)?\s*\}/.test(before.slice(at)); });
  // Live 2026-11-17 (NOA rg-n17 vyerqe9q, $3.3 lost): two featured spots, each with its own «Agregar», are not a grid of own cards;
  // three buttons or a mapped one are.
  if (!context.ownCards && (buttons.size >= 3 || mapped)) {
    problems.push('Armaste tus propias tarjetas de producto (varios productos con su propio botón de agregar): muestra los productos con <div data-pagosya-catalog data-products="id,id" /> — las tarjetas de la plataforma —; tu diseño va alrededor (título, fondo, composición). Un solo producto destacado puede tener su botón.');
  }
  // Owner 2026-11-16 («personalize the css of each menu with the thematic of each store»): the menu is dressed, not left as the kit drew it.
  const menuStyle = menuStyleProblem(css, context.menu?.model);
  if (menuStyle) problems.push(menuStyle);
  const backstage = backstageCopy(files);
  if (backstage.length) problems.push(`El cliente lee sobre tu trabajo, no sobre la tienda: ${backstage.slice(0, 6).map(text => `«${text}»`).join(', ')}. Reescribe esas frases para el cliente (o quítalas): lo que falta no se menciona; nunca recortes, activos, aprobado/pendiente, rotulado final ni «sin inventar».`);
  if (!context.packs && /data-pagosya-bundles/.test(all)) problems.push('La tienda no tiene packs activos: quita la sección de packs (data-pagosya-bundles).');
  const ids = new Set(context.products.map(entry => entry.id));
  for (const [, ref] of all.matchAll(/data-(?:add|pagosya-spotlight)=["']([^"']+)["']/g)) if (!ids.has(ref)) problems.push(`El id «${ref}» no es un producto de la tienda.`);
  // Live 2026-11-14 (Oh Belly attempt 3): the publish check splits data-products on commas only.
  for (const [, list] of all.matchAll(/data-products=["']([^"']*)["']/g)) {
    if (list.includes('|')) problems.push(`data-products="${list.slice(0, 80)}": separa los ids con comas, no con «|».`);
    for (const ref of list.split(/[,|]/).map(id => id.trim()).filter(Boolean)) if (!ids.has(ref)) problems.push(`El id «${ref}» de data-products no es un producto de la tienda.`);
  }
  // Live 2026-11-14 (BOXY V2: the same four-product rail four times on the home): one row per product set, at most two rows besides
  // the full catalogue (owner 2026-11-11: «one row of the catalogue besides the grid»).
  // One product («p1», {OILS.sizzle}, {scene.product}) is a spotlight, not a row (live 2026-11-18: Graza's nine one-product scenes).
  const spotlight = (tag: string) => /data-products=(?:["'][^,"']+["']|\{\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)+\s*\})/.test(tag);
  const rows = [...home.matchAll(/<[^>]*\bdata-pagosya-catalog\b[^>]*>/g)].filter(match => !spotlight(match[0]))
    .map(match => match[0].match(/data-(?:products|category|collection)=(\{[^}]*\}|"[^"]*"|'[^']*')/)?.[1] ?? 'todo');
  const repeated = [...new Set(rows.filter((row, index) => rows.indexOf(row) !== index))];
  if (repeated.length) problems.push(`La portada repite la misma fila de productos (${repeated.join(', ')}): cada grupo de productos va una sola vez.`);
  if (rows.length > 3) problems.push(`La portada tiene ${rows.length} filas de productos: deja como máximo 3 (una con todo o una selección, y hasta dos de categorías o destacados distintos).`);
  // Live 2026-11-14 (NOA, three attempts): the platform refuses a commerce mount with children but does not say where.
  for (const file of files.filter(entry => entry.path.endsWith('.tsx'))) problems.push(...filledMounts(file));
  if (/Bs\.?\s?\d|\$\s?\d|\d+[.,]\d{2}\s?(?:Bs|USD)/.test(all)) problems.push('No escribas precios: el sistema los muestra.');
  const photos = new Set([...context.photos, ...(context.cutouts ?? [])].map(photo => photo.path));
  // Owner 2026-11-15 (Oh Belly rev 17: four stage screens showed photos with their backgrounds): the showcase pieces float cut-outs only.
  const cutouts = new Set((context.cutouts ?? []).map(cut => cut.path));
  for (const [piece] of all.matchAll(/<(?:ProductStage|HangingRail)\b[\s\S]*?\/>/g))
    for (const [, path] of piece.matchAll(/src:\s*["'](assets\/[\w.-]+)["']/g)) if (!cutouts.has(path)) problems.push(`${piece.startsWith('<ProductStage') ? 'ProductStage' : 'HangingRail'} usa ${path}, que no es un recorte: en las vitrinas van solo RECORTES (assets/…webp de la lista), nunca fotos con fondo.`);
  // Live 2026-11-15 (Oh Belly rev 18): one can cut-out on all five flavour screens, its label saying another flavour.
  for (const [piece] of all.matchAll(/<ProductStage\b[\s\S]*?\/>/g)) {
    const images = [...piece.matchAll(/image:\s*\{\s*src:\s*["'](assets\/[\w.-]+)["']/g)].map(match => match[1]);
    const twice = [...new Set(images.filter((path, i) => images.indexOf(path) !== i))];
    if (twice.length) problems.push(`ProductStage pone ${twice.join(', ')} en más de una pantalla: cada recorte va en una sola pantalla, que dice lo que ese recorte muestra; con menos recortes, menos pantallas (mínimo 2) o ninguna vitrina.`);
  }
  // The home ends before the footer (owner 2026-11-15, Oh Belly rev 18: the closing section was a copy of the Shell footer — the can
  // over the giant wordmark, the Comprar/Ayuda columns, BELLY10 — and the real footer followed with the same). A home section with its
  // own <footer>, or four of the footer's link and heading words, is a second footer.
  const footerWords = new Set([...(shell.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '').matchAll(/>\s*([^<>{}]{3,24}?)\s*</g)].map(match => match[1].trim().toLowerCase()).filter(word => /[a-záéíóúñ]/i.test(word)));
  const catalogWords = new Set([...context.categories, ...context.products.map(product => product.name)].map(word => word.trim().toLowerCase()));
  for (const chunk of home.split(/(?=<section\b)/).slice(1)) {
    const echoed = new Set([...chunk.matchAll(/>\s*([^<>{}]{3,24}?)\s*</g)].map(match => match[1].trim().toLowerCase()).filter(word => footerWords.has(word)));
    // The store's own category and product names may repeat (a category section names what the footer lists — rhode, live 2026-11-16).
    const ownWords = [...echoed].filter(word => !catalogWords.has(word));
    if (/<footer\b/.test(chunk) || echoed.size >= 4 && ownWords.length >= 2) { problems.push(`La sección «${chunk.match(/className="([^"]+)"/)?.[1] ?? 'final'}» repite el pie de página (${[...echoed].slice(0, 5).join(', ') || '<footer>'}): el pie ya está en Shell. Termina la portada con una sección propia, sin columnas de enlaces, sin el nombre gigante de la marca y sin el código del pie.`); break; }
  }
  // Each photo and cut-out once on the home, outside the stage and the rail (live 2026-11-15, Oh Belly rev 18: the lemons photo three
  // times, a can cut-out in three sections). The browser check compares addresses, so it never saw a cut-out repeated in a hidden slide.
  const outside = home.replace(/<(?:ProductStage|HangingRail)\b[\s\S]*?\/>/g, '');
  const uses = new Map<string, number>();
  for (const [, path] of outside.matchAll(/["'(](assets\/[\w.-]+\.(?:jpe?g|png|webp))["')]/g)) uses.set(path, (uses.get(path) ?? 0) + 1);
  // Blocking only while the store has a photo the home does not use (the repair swaps to it first); with none left, the round is kept
  // and the screenshot review asks for the repeat (live 2026-11-15: Oh Belly r20 and DooBoo r8 lost their last fixes to it).
  const spare = context.photos.some(photo => !uses.has(photo.path) && !CUTOUT_FILE.test(photo.path) && !home.includes(photo.path));
  if (spare) for (const [path, count] of uses) if (count > 1) problems.push(`La foto ${path} aparece ${count} veces en la portada: cada foto y cada recorte van una sola vez.`);
  if (problems.some(line => / que no es un recorte:/.test(line))) problems.push(`Recortes que sí puedes usar en las vitrinas: ${(context.cutouts ?? []).map(cut => `${cut.path} (${cut.product ? `${cut.product} · ` : ''}${cut.name})`).join(', ') || '(ninguno: quita la vitrina)'}.`);
  for (const [, path] of all.matchAll(/["'(](assets\/[\w.-]+\.(?:jpe?g|png|webp))["')]/g)) if (!photos.has(path)) problems.push(`La foto ${path} no existe en la tienda.`);
  // The Nov 14 rule set had no product-page minimum (it came 2026-11-15).
  if (context.basic) return [...new Set(problems)].filter(line => !/La página de producto se queda corta/.test(line));
  return context.loose ? [...new Set(problems)].filter(line => LOOSE_KEEPS.test(line)) : [...new Set(problems)];
}

/** Owner 2026-11-14 («faster, cheaper, more reliable», step 2, behind YAPI_V2_SPLIT): the home written in two halves at the same time —
 *  the first screen and the first chapters, then the rest — each a short answer that fits the bridge's 10 minutes, both from the same
 *  direction and design system, each told what the other half holds so no idea repeats. Their sections, helpers and imports are put
 *  together into one components/home.tsx. */
/** Owner 2026-11-15 (cost): what a section writer needs from the design system — the sheet without comments or spacing; the Shell's
 *  code (header and footer) only matters to the call that writes it. */
export function compactSystem(system: readonly V2File[]): string {
  const css = system.find(file => file.path === 'styles/globals.css')?.content ?? '';
  return `--- styles/globals.css (compacta)\n${css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').trim()}`;
}

export type V2Half = 'a' | 'b';
export type V2HalfAnswer = { sections: string; helpers: string; ui: string[]; react: string[]; css: string; library: V2LibraryEntry[] };

/** Which chapters of the direction each half writes: the first screen goes with the first half. */
export function halfChapters(direction: Pick<V2Direction, 'sections'>, half: V2Half): { mine: string[]; other: string[] } {
  const all = direction.sections.map((section, at) => `${at + 1}. ${section.role} — ${section.composition}`);
  const cut = Math.floor(all.length / 2);
  const first = ['0. Primera pantalla (la de «hero» en la dirección)', ...all.slice(0, cut)], second = all.slice(cut);
  return half === 'a' ? { mine: first, other: second } : { mine: second, other: first };
}

export function v2HalfSchema(photoCount = 0): object {
  const names = { type: 'array', maxItems: 12, items: { type: 'string' } };
  return { type: 'object', additionalProperties: false, required: ['sections', 'helpers', 'ui', 'react', 'css', 'library', 'notes'], properties: {
    sections: { type: 'string' }, helpers: { type: 'string' }, ui: names, react: names, css: { type: 'string' }, library: v2LibrarySchema(photoCount), notes: { type: 'string' } } };
}

export function v2HalfInput(context: V2Context, direction: V2Direction, half: V2Half, system: readonly V2File[], library: { facts: string }): string {
  const { heroBrief, headerNote } = half === 'a' && !context.basic ? heroNotes(direction) : { heroBrief: '', headerNote: '' };
  const { mine, other } = halfChapters(direction, half);
  const prefix = half === 'a' ? 'A' : 'B';
  const task = `EN ESTA LLAMADA escribes SOLO UNA MITAD de la portada: estos capítulos de la dirección, en este orden:
${mine.map(line => `  ${line}`).join('\n')}
La otra mitad la escribe otra persona AL MISMO TIEMPO, con el mismo sistema de diseño (abajo); no repitas sus capítulos ni sus ideas:
${other.map(line => `  ${line}`).join('\n')}
Devuelves:
- «sections»: el JSX de tus secciones, una detrás de otra, tal como van dentro de <main> (sin <main>, sin import, sin export, sin función).
- «helpers»: el código de nivel superior que tus secciones necesiten (constantes, componentes chicos), cada nombre con el prefijo ${prefix}
  (por ejemplo ${prefix}Cuts, ${prefix}Tabs); vacío si no hace falta. Nada de export.
- «ui»: las piezas de @pagosya/ui que usas (Reveal, Parallax, Marquee, WordRotate, KineticHeadline, ScrollScale, Carousel, ProductStage,
  HangingRail); «react»: los
  hooks de react que usas (useState, useEffect…).
- «css»: las reglas nuevas de tus secciones, con el prefijo de clases de la tienda (se añaden al final de globals.css).
- «library»: tus secciones de biblioteca, con slots ${half === 'a' ? '«hero», «a1», «a2»…' : '«b1», «b2»…'}; en tus secciones las pones con
  <LibrarySlot name="…" />. Vacío si no usas ninguna.
${half === 'a' ? 'El ÚNICO <h1> de la página está en tu primera pantalla.' : 'Tú no escribes ningún <h1>: el de la página está en la otra mitad.'}
La página de producto la escribe otra llamada: no la toques.`;
  // The free home's rules, from «LA PORTADA ES TUYA» on (its first paragraph names the files of a whole-page answer).
  const rules = FREE_PAGES_TASK.slice(FREE_PAGES_TASK.indexOf('LA PORTADA ES TUYA'));
  return heroBrief + headerNote + `${task}

${rules}
${context.animated ? `\n${ANIMATED_RULES}\n` : ''}${showcaseRules(context, half === 'a' ? 'stage' : 'rail') ? `\n${showcaseRules(context, half === 'a' ? 'stage' : 'rail')}\n` : ''}
${factsAll(context)}

BIBLIOTECA DE SECCIONES (id · rol · lo que necesita · para qué sirve):
${v2LibraryCatalogText()}

DATOS REALES PARA LA BIBLIOTECA (productos por id o nombre, categorías, códigos, servicios, lugar, opiniones, redes):
${library.facts}

DIRECCIÓN DE ARTE (síguela):
${JSON.stringify(direction)}

SISTEMA DE DISEÑO YA ESCRITO (el encabezado y el pie ya están hechos; usa estas clases y tokens):
${compactSystem(system)}
`;
}

export function readV2Half(raw: unknown): V2HalfAnswer | null {
  const answer = raw as Record<string, unknown> | null;
  const sections = typeof answer?.sections === 'string' ? answer.sections.trim() : '';
  if (!/^</.test(sections)) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value : []).map(String).filter(name => /^[A-Za-z]\w*$/.test(name));
  const library = Array.isArray(answer?.library) ? (answer!.library as unknown[]).filter((entry): entry is V2LibraryEntry => Boolean(entry) && typeof (entry as V2LibraryEntry).block === 'object') : [];
  return { sections, helpers: typeof answer?.helpers === 'string' ? answer.helpers.replace(/^\s*export\s+/gm, '').trim() : '', ui: list(answer?.ui), react: list(answer?.react), css: typeof answer?.css === 'string' ? answer.css : '', library };
}

const KIT_UI = new Set(['Reveal', 'Parallax', 'Marquee', 'WordRotate', 'KineticHeadline', 'ScrollScale', 'Carousel', 'ProductStage', 'HangingRail']);
const REACT_HOOKS = new Set(['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useId', 'Fragment']);

/** The two halves as one components/home.tsx: the imports both need, both halves' helpers, then their sections in order inside <main>. */
export function composeV2Home(a: V2HalfAnswer, b: V2HalfAnswer): string {
  const ui = [...new Set([...a.ui, ...b.ui])].filter(name => KIT_UI.has(name));
  const react = [...new Set([...a.react, ...b.react])].filter(name => REACT_HOOKS.has(name));
  const usesLibrary = /<LibrarySlot\b/.test(`${a.sections}${b.sections}${a.helpers}${b.helpers}`);
  return [
    "import Shell from './Shell';",
    ...(usesLibrary ? ["import { LibrarySlot } from './v2-library';"] : []),
    ...(ui.length ? [`import { ${ui.join(', ')} } from '@pagosya/ui';`] : []),
    ...(react.length ? [`import { ${react.join(', ')} } from 'react';`] : []),
    '',
    ...[a.helpers, b.helpers].filter(Boolean),
    '',
    'export default function Home() {',
    '  return (',
    '    <Shell>',
    '      <main id="contenido">',
    a.sections,
    b.sections,
    '      </main>',
    '    </Shell>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/** Headers plan Task 13: the direction's header look on the design's own NavShell — over/tone/linkStyle replaced, never doubled —
 *  and its real messages on the announcement bar. */
export function withHeaderLook(content: string, look: V2Header): string {
  const props = `${look.over ? ` over tone="${look.tone}"` : ''} linkStyle="${look.links}"`;
  let out = content.replace(/<NavShell\b([^>]*?)(\/?>)/, (_, attrs: string, end: string) =>
    `<NavShell${props}${attrs.replace(/\s(?:over(?:=\{(?:true|false)\})?|tone="[a-z]+"|linkStyle="[a-z]+")(?=[\s/>])/g, '')}${end}`);
  const messages = look.announce.map(line => line.trim()).filter(Boolean).slice(0, 3);
  if (messages.length) out = out.replace(/<AnnouncementBar\b[^>]*?(?:\/>|>[\s\S]*?<\/AnnouncementBar>)/, `<AnnouncementBar messages={${JSON.stringify(messages)}} />`);
  return out;
}

/** The hero's brief and the floating-header note, for whichever call writes the hero (the first half, or the whole page when the
 *  home is written in one call — minor M3). */
function heroNotes(direction: V2Direction): { heroBrief: string; headerNote: string } {
  // Heroes plan 2026-11-15: the call that writes the hero gets its idea's brief (its reference frames come with the call).
  const idea = heroIdea((direction as { hero?: { idea?: string } }).hero?.idea);
  const heroBrief = idea ? `IDEA DE PORTADA «${idea.name}»: ${idea.brief}${idea.id === 'libre' ? '' : ` ${MIX_NOTE}`} ${STRONG_HERO} Diséñala con el estilo de esta tienda (su letra, sus colores, su voz); de las referencias aprende la composición, nunca sus colores ni textos.\n\n` : '';
  // Headers plan Task 13: a floating header sits over the hero, so the hero keeps its words clear of it.
  const floats = (direction as { header?: { over?: boolean } }).header?.over;
  const headerNote = floats ? 'LA CABECERA FLOTA encima de tu portada (transparente): la portada empieza arriba del todo, a todo el ancho, con foto o color hasta el borde superior, y su contenido (titular, textos, botones) empieza debajo de la cabecera: paddingTop: «calc(var(--ui-nav-h, 88px) + 24px)» en el contenedor del texto, también en el celular.\n\n' : '';
  return { heroBrief, headerNote };
}
