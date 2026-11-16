/* Spec 2026-10-30 home writer variety: six page directions picked per store (never one of the last three stores'), and the
 * animated look for most bold brands. The writer keeps its freedom; it only starts from a different brief. */

export type HomeDirectionId = 'editorial' | 'producto' | 'lookbook' | 'bandas' | 'manifiesto' | 'historia';
export type HomeDirectionChoice = { direction: HomeDirectionId; animated: boolean; footer?: HomeFooterId; playful?: boolean; plan?: DesignPlan; brief?: DesignBrief };

/** The design brief a studio writer commits before any code (Amboras's .amboras/design-brief.md, read 2026-11-12): one idea, a
 *  palette with jobs, type with rules, one graphic device, one signature moment, the structure and which photo goes where. */
/*  Owner 2026-11-12 («more details, for example footprints since it's a dog store»): the brief also names the store's details. */
export const DESIGN_BRIEF_FIELDS = ['idea', 'palette', 'type', 'device', 'details', 'moment', 'structure', 'images'] as const;
export type DesignBrief = Record<(typeof DESIGN_BRIEF_FIELDS)[number], string>;
export const DESIGN_BRIEF_LABELS: DesignBrief = { idea: 'Idea', palette: 'Paleta', type: 'Tipografía', device: 'Recurso gráfico', details: 'Detalles', moment: 'Momento firma', structure: 'Estructura', images: 'Imágenes' };
/** What a brief still needs before the code starts; empty when it is complete. */
export function briefProblems(brief: Partial<DesignBrief>): string[] {
  const text = (key: keyof DesignBrief) => String(brief[key] ?? '').trim();
  const missing: string[] = [];
  if (text('idea').length < 20 || text('idea').length > 260) missing.push('idea: una sola frase (20 a 260 letras) que diga qué evoca la tienda');
  if ((text('palette').match(/#[0-9a-f]{6}\b/gi) ?? []).length < 3) missing.push('paleta: al menos 3 colores con su hex y su trabajo (fondo, texto, botones…)');
  for (const key of ['type', 'device', 'moment'] as const) if (text(key).length < 12) missing.push(`${DESIGN_BRIEF_LABELS[key].toLowerCase()}: dilo en una frase concreta`);
  if (!/(encabezado|header)/i.test(text('structure')) || !/(pie|footer)/i.test(text('structure')) || text('structure').split(/→|->|,|;/).length < 4)
    missing.push('estructura: encabezado → cada sección en orden → pie, cada una con su forma');
  if (text('images').length < 20) missing.push('imágenes: qué foto va en qué sección');
  return missing;
}
const briefOf = (value: unknown): DesignBrief | undefined => {
  const brief = value as Record<string, unknown> | null;
  // A brief saved before 2026-11-12 has no details: it still reads, with them empty.
  return brief && typeof brief === 'object' && DESIGN_BRIEF_FIELDS.every(key => key === 'details' || typeof brief[key] === 'string')
    ? Object.fromEntries(DESIGN_BRIEF_FIELDS.map(key => [key, String(brief[key] ?? '').slice(0, 2000)])) as DesignBrief : undefined;
};
/** How the writer writes its brief (studio), after Amboras's NOA brief. */
export const BRIEF_GUIDE = `BRIEF DE DISEÑO (write_brief, ANTES de set_tokens y de cualquier código; todo lo demás se construye desde él):
- idea: una frase que diga qué evoca la tienda (ej. «un atelier de alta costura a la luz de las velas; vestidos marfil y calas que salen del negro, todo lo demás contenido»).
- palette: 4 a 6 colores con hex y su trabajo (fondo, texto y botones, banda, texto suave, líneas) y qué NO se usa (ej. «sin acentos de color; el verde solo vive en las fotos»).
- type: las dos fuentes del catálogo y sus reglas (peso, tracking, mayúsculas sí o no, cursiva sí o no).
- device: UN recurso gráfico que se repite, sacado del mundo de lo que vende la tienda (líneas finas que enmarcan, fotos que se funden con el fondo…).
- details: déjalo vacío — el dueño no quiere dibujos ni adornos (2026-11-12); los detalles salen de la tipografía, el color, las fotos y el movimiento del kit.
- moment: UN momento firma al bajar (un parallax en la portada, un titular que crece, una tira que se mueve…), con la parte del kit que lo hace.
- structure: encabezado (según el PLAN DE DISEÑO) → cada sección en orden con su forma → pie.
- images: qué foto de la tienda va en cada sección (por su archivo o su clave), y por qué.
Elige desde las fotos y las palabras del comercio; nunca un brief genérico.`;

/** Store chassis (spec 2026-11-12): the design plan a chassis store's writer follows for the parts every store used to share —
 *  picked per store, each choice never one of the last three stores', like Amboras's committed design plan. */
export const DESIGN_PLAN_OPTIONS = {
  navbar: ['bar', 'centered', 'drawer', 'split'],
  card: ['frame', 'bare', 'tinted', 'overlay'],
  pdp: ['gallery', 'stacked', 'editorial', 'centered'],
  cart: ['drawer', 'panel', 'sheet'],
  // Owner 2026-11-12 («sections are just too basic»), after Amboras's «assigned hero mechanism» and per-store «quirk»: the
  // first screen's moving part and one signature extra are assigned per store, never one of the last three stores'.
  hero: ['parallax-stack', 'product-showcase', 'floating-media', 'scroll-scale', 'bounce-headline', 'carousel', 'kinetic-headline', 'image-text'],
  // Owner 2026-11-12 («i think drawing should be off»): no drawn motifs extra. Owner 2026-11-13 rich kit: six more.
  extra: ['marquee', 'story-cards', 'statement', 'bento', 'sticky-scene', 'horizontal-scroll', 'hover-rail', 'velocity', 'tabs'],
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
    // Owner 2026-11-12: the buy box is on the first screen in every product page (a photo alone filled Oh Belly's).
    editorial: 'FICHA DE PRODUCTO: la foto grande a la izquierda (60%) y a la derecha un título enorme con la compra, todo en la primera pantalla; debajo las secciones como revista.',
    centered: 'FICHA DE PRODUCTO: sobre un fondo del color de la marca, la foto mediana y la compra lado a lado, centradas en la primera pantalla.',
  },
  cart: {
    drawer: 'CARRITO: cajón que entra desde la derecha, angosto, con las líneas y el total abajo fijo.',
    panel: 'CARRITO: cajón ancho desde la derecha con dos zonas: tus productos y, al lado o abajo, las sugerencias.',
    sheet: 'CARRITO: en celular sube desde abajo como hoja; en computadora es un cajón a la derecha.',
  },
  hero: {
    'parallax-stack': "PORTADA (momento asignado): el titular a un lado y al otro <ParallaxStack images={[foto1, foto2, foto3]} /> — tres fotos de la tienda en capas que se mueven a distinta velocidad al bajar.",
    'product-showcase': 'PORTADA (momento asignado): <ProductShowcase image={foto del producto} title={…} body={…} action={…} /> — el producto crece en pantalla al bajar, con el titular y la compra.',
    'floating-media': 'PORTADA (momento asignado): <FloatingMedia images={[2 a 4 fotos]} title={…} lead={…} actions={…} /> — una composición de fotos superpuestas y giradas junto al titular.',
    'scroll-scale': 'PORTADA (momento asignado): el titular grande y debajo la foto principal dentro de <ScrollScale from={0.82}>…</ScrollScale> — la foto se agranda al bajar hasta llenar su columna (mediana, nunca a todo el ancho).',
    'bounce-headline': 'PORTADA (momento asignado): el titular con <BounceText>…</BounceText> (las letras entran saltando) y la foto del producto dentro de <Float>…</Float> que flota suave a su lado.',
    carousel: 'PORTADA (momento asignado): <Carousel slides={[3 o 4 { image, title, text, href, cta }]} aspect="16/9" /> — diapositivas de la tienda que avanzan solas, cada una con su titular y su enlace (el h1 va en la primera).',
    'kinetic-headline': 'PORTADA (momento asignado): <KineticHeadline as="h1" text="…" effect="rise" /> grande (sus palabras entran una tras otra) junto a una foto mediana en <MediaFrame shape="arch|rounded|tilt" />.',
    'image-text': 'PORTADA (momento asignado): el nombre de la tienda enorme con <ImageText as="h1" text="…" image={foto} /> (las letras rellenas con una foto), y debajo una frase corta y el botón.',
  },
  extra: {
    marquee: 'EXTRA DE LA TIENDA: una banda con <Marquee items={[4 a 6 palabras cortas de la marca]} /> entre dos secciones, del color de la marca.',
    'story-cards': 'EXTRA DE LA TIENDA: una sección con <StoryChapters chapters={[{ title, body, image }, …]} /> — 3 o 4 tarjetas con foto que se apilan al bajar (cómo se hace, por qué, cómo se usa).',
    statement: 'EXTRA DE LA TIENDA: una frase grande de la marca con <Statement>…</Statement> (se rellena palabra a palabra al bajar) junto a una foto.',
    bento: 'EXTRA DE LA TIENDA: un mosaico <BentoGrid> con 4 o 5 <BentoCard> de tamaños distintos (una big con foto, otras wide o normal) para categorías, beneficios o momentos.',
    'sticky-scene': 'EXTRA DE LA TIENDA: <StickyScene steps={[3 o 4 { title, text, image }]} /> — la foto queda fija a un lado y cambia con cada paso (cómo se hace, por qué, cómo se usa).',
    'horizontal-scroll': 'EXTRA DE LA TIENDA: <HorizontalScroll> con 5 o 6 fotos en <MediaFrame> o tarjetas — al bajar, la fila corre de lado.',
    'hover-rail': 'EXTRA DE LA TIENDA: <SnapRail> con 4 a 6 <HoverReveal image title caption href /> — una fila deslizable de fotos cuyo panel sube al pasar el mouse.',
    velocity: 'EXTRA DE LA TIENDA: una banda <VelocityRow> con 4 a 6 palabras de la marca grandes, que acelera con el scroll (en lugar de otro Marquee).',
    tabs: 'EXTRA DE LA TIENDA: <Tabs tabs={[3 o 4 { label, content }]} /> — productos o ideas por momento, uso o talla, cada pestaña con foto y texto.',
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
- <Float>…</Float>, <Wiggle>…</Wiggle>, <BounceText>titular corto</BounceText> — se mueven sin esperar al scroll (flotar, tambaleo al pasar el mouse, letras que saltan).
Nunca <Sticker> ni insignias redondas con palabras (círculos punteados, «Sin azúcar», «Patas felices»): al dueño no le gustan (2026-11-12). Lo que flota es un producto o un detalle de la marca dibujado en SVG.
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
  juguete: 'PIE: alegre — bordes redondeados o una ola arriba, un detalle de la marca dibujado en SVG que flota (<Float>) y los enlaces como botones redondos.',
};

/** Owner 2026-10-30: fun brands move while the page rests, not only on scroll. */
export const HOME_PLAYFUL_BRIEF = `JUGUETÓN (esta tienda es divertida — dulces, bebidas con burbujas, juguetes, juegos o niños: su portada se mueve sola, sin esperar al scroll). Usa al menos dos de estas piezas de '@pagosya/ui', además de una pieza de scroll — con menos, check no te deja terminar:
- <Float>…</Float> — flota suave arriba y abajo sin parar: una foto de producto recortada, una lata, un dulce (delay={0…1200} para que no floten al mismo tiempo).
- <Wiggle>…</Wiggle> — se tambalea al pasar el mouse: botones, fotos de producto, tarjetas.
- <BounceText>Burbujas felices</BounceText> — las letras del titular entran saltando una tras otra (solo en el h1 o un h2 corto).
Al menos un <Float> va DENTRO de la portada, visible sin bajar (check lo exige): un producto o un detalle de la marca (huellas, burbujas) dibujado en SVG. Nunca <Sticker> ni insignias redondas con palabras: al dueño no le gustan. Portada con producto o foto, nunca solo texto sobre un color. Colores vivos pero un solo acento fuerte; movimiento alegre, nunca mareante.`;

const IDS = Object.keys(HOME_DIRECTIONS) as HomeDirectionId[];
const FOOTER_IDS = Object.keys(HOME_FOOTERS) as HomeFooterId[];
/** Owner 2026-10-30 (BOXY «too shouty»): the loud directions are for bold brands only. */
const BOLD_ONLY = new Set<HomeDirectionId>(['manifiesto', 'bandas']);
const MOTION_PARTS = ['ScrollScale', 'ParallaxStack', 'Statement', 'Marquee', 'EntranceGroup', 'ProductShowcase', 'scrollGrow', 'Float', 'Wiggle', 'BounceText'] as const;
/** Owner 2026-10-30 («oh belly and gummies stores, soda stores, games … are plain still»): motion seen without scrolling.
 *  Owner 2026-11-12: no Sticker (round badges with words) any more. */
export const AMBIENT_PARTS = ['Float', 'Wiggle', 'BounceText'] as const;

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
    const brief = briefOf(value.brief);
    return { direction: value.direction, animated: value.animated, ...(FOOTER_IDS.includes(value.footer) ? { footer: value.footer } : {}), ...(value.playful === true ? { playful: true } : {}),
      ...(plan ? { plan } : {}), ...(brief ? { brief } : {}) };
  } catch { return null; }
}

/** Comments out; a `//` inside a web address (https://…) is not a comment (open item 2026-10-30). */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:\w])\/\/[^\n]*/g, '');
const partsUsed = (code: string, parts: readonly string[]) => parts.filter(part => part === 'scrollGrow' ? /\bscrollGrow\b/.test(code) : new RegExp(`<${part}[\\s/>]`).test(code));

/** The kit's motion parts a home uses, each once; comments do not count. */
export function motionPartsUsed(home: string): string[] {
  return partsUsed(withoutComments(home), MOTION_PARTS);
}

/** The kit's always-moving parts (Float, Wiggle, BounceText) a home or footer uses, each once. */
export function ambientPartsUsed(code: string): string[] {
  return partsUsed(withoutComments(code), AMBIENT_PARTS);
}
