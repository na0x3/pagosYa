/* Spec 2026-10-30 home writer variety: six page directions picked per store (never one of the last three stores'), and the
 * animated look for most bold brands. The writer keeps its freedom; it only starts from a different brief. */

export type HomeDirectionId = 'editorial' | 'producto' | 'lookbook' | 'bandas' | 'manifiesto' | 'historia';
export type HomeDirectionChoice = { direction: HomeDirectionId; animated: boolean };

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

export const HOME_MOTION_BRIEF = `MOVIMIENTO (esta tienda tiene una portada animada; usa al menos tres de estas piezas, importadas de '@pagosya/ui'):
- <Hero ... scrollGrow /> o envuelve la foto de portada en <ScrollScale from={0.82}> — la foto crece al bajar.
- <ParallaxStack images={[{ src, alt }, ...]} /> — dos fotos en capas que se mueven a distinto ritmo (nunca 3 fotos o más).
- <ScrollScale from={0.82}>…</ScrollScale> — un bloque que se agranda al entrar.
- <ProductShowcase image={...} title="..." body="..." action={...} /> — un producto que crece al bajar.
- <Statement>frase</Statement> — una frase que se rellena palabra a palabra al bajar.
- <Marquee items={['...', '...']} /> — una franja de palabras que se desplaza.
- <EntranceGroup stagger={80}>…</EntranceGroup> — los elementos entran uno tras otro.
Quien pidió menos movimiento en su teléfono no lo ve: el kit ya lo respeta.`;

const IDS = Object.keys(HOME_DIRECTIONS) as HomeDirectionId[];
const MOTION_PARTS = ['ScrollScale', 'ParallaxStack', 'Statement', 'Marquee', 'EntranceGroup', 'ProductShowcase', 'scrollGrow'] as const;

/** FNV-1a of the seed and a salt, as a number in [0, 1): the same store always draws the same. */
function draw(seed: string, salt: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${salt}:${seed}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash / 0x100000000;
}

/** Never a direction of the last three stores (newest first); with all six taken, the one used longest ago. */
export function pickHomeDirection(input: { seed: string; recent: HomeDirectionId[]; fashion: boolean; mood?: 'bold' | 'calm' }): HomeDirectionChoice {
  const blocked = new Set(input.recent.slice(0, 3));
  const open = IDS.filter(id => !blocked.has(id));
  const pool = open.length ? open.flatMap(id => input.fashion && (id === 'lookbook' || id === 'editorial') ? [id, id] : [id]) : [input.recent[input.recent.length - 1]];
  const direction = pool[Math.floor(draw(input.seed, 'direction') * pool.length)];
  return { direction, animated: draw(input.seed, 'animated') < (input.mood === 'bold' ? 0.75 : 0.2) };
}

/** The saved home-direction.json, or null for anything that is not exactly that shape. */
export function parseHomeDirection(content: string | undefined): HomeDirectionChoice | null {
  try {
    const value = JSON.parse(content ?? '');
    return value && typeof value === 'object' && !Array.isArray(value) && IDS.includes(value.direction) && typeof value.animated === 'boolean' ? { direction: value.direction, animated: value.animated } : null;
  } catch { return null; }
}

/** The kit's motion parts a home uses, each once; comments do not count. */
export function motionPartsUsed(home: string): string[] {
  const code = home.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  return MOTION_PARTS.filter(part => part === 'scrollGrow' ? /\bscrollGrow\b/.test(code) : new RegExp(`<${part}[\\s/>]`).test(code));
}
