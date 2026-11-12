/* Spec 2026-10-30 home writer variety: six page directions picked per store (never one of the last three stores'), and the
 * animated look for most bold brands. The writer keeps its freedom; it only starts from a different brief. */

export type HomeDirectionId = 'editorial' | 'producto' | 'lookbook' | 'bandas' | 'manifiesto' | 'historia';
export type HomeDirectionChoice = { direction: HomeDirectionId; animated: boolean; footer?: HomeFooterId; playful?: boolean; plan?: DesignPlan };

/** Store chassis (spec 2026-11-12): the design plan a chassis store's writer follows for the parts every store used to share —
 *  picked per store, each choice never one of the last three stores', like Amboras's committed design plan. */
export const DESIGN_PLAN_OPTIONS = {
  navbar: ['bar', 'centered', 'drawer', 'split'],
  card: ['frame', 'bare', 'tinted', 'overlay'],
  pdp: ['gallery', 'stacked', 'editorial', 'centered'],
  cart: ['drawer', 'panel', 'sheet'],
} as const;
export type DesignPlan = { [K in keyof typeof DESIGN_PLAN_OPTIONS]: (typeof DESIGN_PLAN_OPTIONS)[K][number] };
export const DESIGN_PLAN_TEXT: { [K in keyof DesignPlan]: Record<DesignPlan[K], string> } = {
  navbar: {
    bar: 'ENCABEZADO: logo a la izquierda, los enlaces en una fila al centro o a la derecha, íconos al final.',
    centered: 'ENCABEZADO: el logo centrado y grande; debajo (o a los lados) una fila corta de enlaces; íconos a la derecha.',
    drawer: 'ENCABEZADO: solo logo, un botón de menú e íconos — TODOS los enlaces van en el cajón, también en computadora.',
    split: 'ENCABEZADO: enlaces a la izquierda, el logo en el centro, íconos a la derecha.',
  },
  card: {
    frame: 'TARJETA: la foto dentro de un marco (borde fino o fondo suave con margen), nombre y precio debajo, botón de agregar visible.',
    bare: 'TARJETA: la foto de borde a borde sin caja, el nombre y el precio en una línea debajo, el botón aparece como texto o ícono.',
    tinted: 'TARJETA: un panel con el color suave de la marca detrás de la foto recortada; nombre grande; botón como píldora.',
    overlay: 'TARJETA: nombre y precio sobre la parte baja de la foto (con degradado para que se lean), botón de agregar en una esquina.',
  },
  pdp: {
    gallery: 'FICHA DE PRODUCTO: galería grande a la izquierda (miniaturas al lado o debajo) y la compra a la derecha, fija al bajar.',
    stacked: 'FICHA DE PRODUCTO: las fotos apiladas a todo el ancho de una columna y la compra en una columna angosta fija al lado.',
    editorial: 'FICHA DE PRODUCTO: una foto grande arriba a todo el ancho, debajo el título enorme y la compra; las secciones como revista.',
    centered: 'FICHA DE PRODUCTO: la foto centrada sobre un fondo de color, el título y la compra centrados debajo.',
  },
  cart: {
    drawer: 'CARRITO: cajón que entra desde la derecha, angosto, con las líneas y el total abajo fijo.',
    panel: 'CARRITO: cajón ancho desde la derecha con dos zonas: tus productos y, al lado o abajo, las sugerencias.',
    sheet: 'CARRITO: en celular sube desde abajo como hoja; en computadora es un cajón a la derecha.',
  },
};
const PLAN_KEYS = Object.keys(DESIGN_PLAN_OPTIONS) as Array<keyof DesignPlan>;

export const HOME_DIRECTIONS: Record<HomeDirectionId, string> = {
  editorial: `DIRECCIÓN: EDITORIAL.
Portada: un titular serif gigante (96 px o más en escritorio) junto a una foto enmarcada, con mucho aire.
Ritmo: etiquetas pequeñas numeradas («01 / 04»); foto y texto se turnan sección a sección; preguntas cerca del final.
Tipo: serif grande para títulos, texto corto y elegante. Evita bloques de texto largos y tarjetas apiladas.`,
  producto: `DIRECCIÓN: PRODUCTO PRIMERO.
Portada: un solo producto héroe con su foto grande, su nombre y su precio, y el botón de agregar (data-pagosya-catalog data-products="<nombre exacto>").
Ritmo: la grilla de productos va justo después de la portada; la historia y la marca vienen después.
Tipo: directo y comercial, frases cortas. Evita una portada solo de texto o sin producto.`,
  lookbook: `DIRECCIÓN: LOOKBOOK.
Portada: una foto a todo el ancho con el titular sobre ella (texto legible, sombra suave si hace falta).
Ritmo: guiado por las fotos; pocas palabras; fotos grandes alternadas con frases breves y los productos.
Tipo: títulos grandes sobre las fotos. Evita grupos de 3 fotos o más y repetir una foto.`,
  bandas: `DIRECCIÓN: BANDAS DE COLOR.
Portada: un titular enorme sobre una banda del color de la marca.
Ritmo: secciones en bandas teñidas con los colores de la marca (un solo acento, nunca un arcoíris), cada una con foto o productos.
Tipo: tipografía grande y segura. Evita bandas negras de solo texto y más de dos colores fuertes.`,
  manifiesto: `DIRECCIÓN: MANIFIESTO.
Portada: una sola frase enorme que dice lo que la marca cree, guiada por la tipografía, con una foto a su lado.
Ritmo: una franja que se desplaza con los valores; pocas fotos, cada una junto a palabras; productos a mitad de página.
Tipo: frases contundentes y cortas. Evita secciones de solo texto sobre el fondo liso.`,
  historia: `DIRECCIÓN: HISTORIA.
Portada: una foto del oficio o de quien hace los productos, con una promesa corta.
Ritmo: un recorrido largo de cómo se hace — pasos con foto, el origen, la nota de quien lo hace — y los productos entre medio.
Tipo: cálido y cercano, en primera persona del plural. Evita inventar datos o fechas que la tienda no dio.`,
};

export const HOME_MOTION_BRIEF = `MOVIMIENTO (esta tienda tiene una portada animada: usa al menos tres de estas piezas, importadas de '@pagosya/ui' — con menos de dos, check no te deja terminar; Reveal y Parallax no cuentan):
- <ScrollScale from={0.82}>…</ScrollScale> — la foto de portada o un bloque que se agranda al bajar.
- <Statement>frase</Statement> — una frase que se rellena palabra a palabra al bajar.
- <Marquee items={['...', '...']} /> — una franja de palabras que se desplaza sola.
- <EntranceGroup stagger={80}>…</EntranceGroup> — los elementos entran uno tras otro.
- <Float>…</Float>, <Sticker>2–3 palabras</Sticker>, <Wiggle>…</Wiggle>, <BounceText>titular corto</BounceText> — se mueven sin esperar al scroll (flotar, calcomanía que gira, tambaleo al pasar el mouse, letras que saltan).
No uses Hero, ParallaxStack ni ProductShowcase: en esta plantilla salen sin estilo.
Las palabras van como texto JSX dentro de las piezas (<Statement>Hecho a mano.</Statement>, <h2>…</h2> dentro de <ScrollScale>), nunca dentro de props ni arreglos: así el comercio las edita con doble clic. <Marquee> solo con palabras cortas de la marca.
Quien pidió menos movimiento en su teléfono no lo ve: el kit ya lo respeta.`;

export type HomeFooterId = 'gigante' | 'foto' | 'color' | 'carta' | 'minimal' | 'juguete';
/** Owner 2026-10-30 («the footer always is the same»): YAPI writes each store's footer, starting from one of these ideas. */
export const HOME_FOOTERS: Record<HomeFooterId, string> = {
  gigante: 'PIE: el nombre de la tienda enorme a todo el ancho, abajo del todo; encima, los enlaces en una fila y el correo.',
  foto: 'PIE: una banda con una foto de la marca de fondo (una que la portada no usó, o la de la historia) y una tarjeta clara encima con los enlaces y el correo.',
  color: 'PIE: todo el pie en el color de la marca, con una frase de despedida grande y los enlaces en columnas.',
  carta: 'PIE: una nota corta y cálida de quien hace los productos (sin inventar nombres), firmada con el nombre de la tienda, y los enlaces al lado.',
  minimal: 'PIE: muy tranquilo — logo, enlaces y correo en una o dos líneas con mucho aire, letra pequeña.',
  juguete: 'PIE: alegre — bordes redondeados o una ola arriba, una calcomanía que gira (<Sticker>) y los enlaces como botones redondos.',
};

/** Owner 2026-10-30: fun brands move while the page rests, not only on scroll. */
export const HOME_PLAYFUL_BRIEF = `JUGUETÓN (esta tienda es divertida — dulces, bebidas con burbujas, juguetes, juegos o niños: su portada se mueve sola, sin esperar al scroll). Usa al menos dos de estas piezas de '@pagosya/ui', además de una pieza de scroll — con menos, check no te deja terminar:
- <Float>…</Float> — flota suave arriba y abajo sin parar: una foto de producto recortada, una lata, un dulce (delay={0…1200} para que no floten al mismo tiempo).
- <Sticker>Nuevo sabor</Sticker> — una calcomanía redonda del color de la marca que gira lento, sobre una foto o junto al titular (2 a 3 palabras).
- <Wiggle>…</Wiggle> — se tambalea al pasar el mouse: botones, fotos de producto, tarjetas.
- <BounceText>Burbujas felices</BounceText> — las letras del titular entran saltando una tras otra (solo en el h1 o un h2 corto).
Al menos un <Float> o <Sticker> va DENTRO de la portada, visible sin bajar (check lo exige). Portada con producto o foto, nunca solo texto sobre un color. Colores vivos pero un solo acento fuerte; movimiento alegre, nunca mareante.`;

const IDS = Object.keys(HOME_DIRECTIONS) as HomeDirectionId[];
const FOOTER_IDS = Object.keys(HOME_FOOTERS) as HomeFooterId[];
/** Owner 2026-10-30 (BOXY «too shouty»): the loud directions are for bold brands only. */
const BOLD_ONLY = new Set<HomeDirectionId>(['manifiesto', 'bandas']);
const MOTION_PARTS = ['ScrollScale', 'ParallaxStack', 'Statement', 'Marquee', 'EntranceGroup', 'ProductShowcase', 'scrollGrow', 'Float', 'Sticker', 'Wiggle', 'BounceText'] as const;
/** Owner 2026-10-30 («oh belly and gummies stores, soda stores, games … are plain still»): motion seen without scrolling. */
export const AMBIENT_PARTS = ['Float', 'Sticker', 'Wiggle', 'BounceText'] as const;

/** FNV-1a of the seed and a salt, as a number in [0, 1): the same store always draws the same. */
function draw(seed: string, salt: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${salt}:${seed}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash / 0x100000000;
}

/** Never one of the last three stores' (newest first); with all taken, the one used longest ago. */
function pickFresh<T extends string>(seed: string, salt: string, ids: readonly T[], recent: readonly T[], weight: (id: T) => number = () => 1): T {
  const blocked = new Set(recent.slice(0, 3));
  const open = ids.filter(id => !blocked.has(id));
  if (!open.length) return [...recent].reverse().find(id => ids.includes(id)) ?? ids[0];
  const pool = open.flatMap(id => Array.from({ length: weight(id) }, () => id));
  return pool[Math.floor(draw(seed, salt) * pool.length)];
}

/** Sweets, fizzy drinks, ice cream, toys, games, kids and parties: fun businesses whose home moves on its own. Two mentions
 *  at least, so one «no apto para niños» in a policy does not make a store playful. */
const PLAYFUL_WORDS = /(?<!\p{L})(gomit\p{L}*|golosin\p{L}*|caramelos?|chuches?|chicles?|dulcer[ií]\p{L}*|confites?|gummy|gummies|candy|candies|sodas?|gaseosas?|refrescos?|burbujas?|helados?|paletas? heladas?|juguet\p{L}*|juegos de mesa|videojueg\p{L}*|gaming|gamers?|consolas?|niñ[oa]s|infantil\p{L}*|kids|fiestas?|piñatas?|cotill[oó]n\p{L}*|snacks?)(?!\p{L})/giu;
export function isPlayfulBusiness(text: string): boolean {
  return (text.match(PLAYFUL_WORDS)?.length ?? 0) >= 2;
}

/** A calm brand never draws a loud direction; a playful store is always animated and counts as bold. */
export function pickHomeDirection(input: { seed: string; recent: HomeDirectionId[]; fashion: boolean; mood?: 'bold' | 'calm'; playful?: boolean; recentFooters?: HomeFooterId[] }): HomeDirectionChoice {
  const bold = input.mood === 'bold' || input.playful === true;
  const ids = IDS.filter(id => bold || !BOLD_ONLY.has(id));
  const direction = pickFresh(input.seed, 'direction', ids, input.recent, id => input.fashion && (id === 'lookbook' || id === 'editorial') ? 2 : 1);
  return { direction, animated: input.playful === true || draw(input.seed, 'animated') < (bold ? 0.75 : 0.2), footer: pickHomeFooter(input.seed, input.recentFooters ?? [], input.playful === true),
    ...(input.playful ? { playful: true } : {}) };
}

/** The footer idea: the playful one only for playful stores (and twice as likely there), never one of the last three stores'. */
export function pickHomeFooter(seed: string, recent: HomeFooterId[], playful: boolean): HomeFooterId {
  return pickFresh(seed, 'footer', FOOTER_IDS.filter(id => playful || id !== 'juguete'), recent, id => playful && id === 'juguete' ? 2 : 1);
}

/** Store chassis (spec 2026-11-12): each part's style never one of the last three stores'. */
export function pickDesignPlan(seed: string, recent: readonly DesignPlan[]): DesignPlan {
  return Object.fromEntries(PLAN_KEYS.map(key => [key, pickFresh(seed, `plan-${key}`, DESIGN_PLAN_OPTIONS[key] as readonly string[], recent.map(plan => plan[key]))])) as DesignPlan;
}
const planOf = (value: unknown): DesignPlan | undefined => {
  const plan = value as Record<string, unknown> | null;
  return plan && typeof plan === 'object' && PLAN_KEYS.every(key => (DESIGN_PLAN_OPTIONS[key] as readonly unknown[]).includes(plan[key]))
    ? Object.fromEntries(PLAN_KEYS.map(key => [key, plan[key]])) as DesignPlan : undefined;
};

/** The saved home-direction.json, or null for anything that is not exactly that shape. */
export function parseHomeDirection(content: string | undefined): HomeDirectionChoice | null {
  try {
    const value = JSON.parse(content ?? '');
    if (!value || typeof value !== 'object' || Array.isArray(value) || !IDS.includes(value.direction) || typeof value.animated !== 'boolean') return null;
    // Footer and playful came later (2026-10-30): an older file without them is still read.
    const plan = planOf(value.plan);
    return { direction: value.direction, animated: value.animated, ...(FOOTER_IDS.includes(value.footer) ? { footer: value.footer } : {}), ...(value.playful === true ? { playful: true } : {}),
      ...(plan ? { plan } : {}) };
  } catch { return null; }
}

/** Comments out; a `//` inside a web address (https://…) is not a comment (open item 2026-10-30). */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:\w])\/\/[^\n]*/g, '');
const partsUsed = (code: string, parts: readonly string[]) => parts.filter(part => part === 'scrollGrow' ? /\bscrollGrow\b/.test(code) : new RegExp(`<${part}[\\s/>]`).test(code));

/** The kit's motion parts a home uses, each once; comments do not count. */
export function motionPartsUsed(home: string): string[] {
  return partsUsed(withoutComments(home), MOTION_PARTS);
}

/** The kit's always-moving parts (Float, Sticker, Wiggle, BounceText) a home or footer uses, each once. */
export function ambientPartsUsed(code: string): string[] {
  return partsUsed(withoutComments(code), AMBIENT_PARTS);
}
