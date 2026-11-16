import { readConfigData, type V2Context } from './v2-context';

export type V2HeroIdea = { id: 'laps' | 'lift' | 'hearthen' | 'zahra' | 'zippa' | 'buyfirst' | 'halflife' | 'specsheet' | 'libre'; name: string; needs: 'cutout' | 'person' | 'atmosphere' | 'action' | 'any'; brief: string; frames: string[] };

/** The 8 hero ideas the owner kept (2026-11-15, from amboras.com; Atelier's clothing rail cut — it needs matching front/back/side
 *  cut-outs). A brief is a starting point: the writer designs it in the store's own style; motion always has a still final state.
 *  Frames are in examples/v2-proto/references/_heroes. New ideas: append here and drop frames there. */
export const V2_HERO_IDEAS: readonly V2HeroIdea[] = [
  { id: 'laps', name: 'Producto que cruza una palabra gigante', needs: 'cutout', frames: ['laps-1.jpg', 'laps-3.jpg'],
    brief: 'Escena a todo el ancho (foto de la tienda o el color de la marca) con UNA palabra gigante de la marca detrás; el recorte del producto la cruza, con parte de las letras por delante (una copia de la palabra recortada encima). Abajo a la izquierda el nombre del producto grande; abajo a la derecha el precio real y un botón «Comprar». Puntos o rayas para pasar al siguiente producto si hay más de uno con recorte. Movimiento: el producto flota despacio (4–5 s, sube 10–14 px y gira 2–3°).' },
  { id: 'lift', name: 'Producto entre dos palabras', needs: 'cutout', frames: ['lift-1.jpg', 'lift-3.jpg'],
    brief: 'Fondo del color oscuro o fuerte de la marca; el recorte del producto flota entre dos palabras gigantes, una arriba y otra abajo; pedacitos de sus ingredientes reales (formas simples en sus colores) flotan alrededor; abajo al centro 2–3 datos reales en pastillas; «01 / 03» a la izquierda si hay varios sabores; a la derecha un botón «Agregar · precio». Movimiento: el producto sube y baja; los ingredientes derivan lento.' },
  { id: 'hearthen', name: 'Foto cálida y sello que gira', needs: 'atmosphere', frames: ['hearthen-1.jpg', 'hearthen-3.jpg'],
    brief: 'Foto de ambiente oscura y cálida a todo el ancho (nunca recortar sus letras); a la izquierda un titular fino en serif de dos líneas, una línea corta y un botón con borde. Junto al producto un sello redondo de texto (lo que la marca promete, real) que gira despacio (18 s por vuelta). Luz suave que respira detrás del producto.' },
  { id: 'zahra', name: 'Persona delante de letras gigantes', needs: 'person', frames: ['zahra-1.jpg', 'zahra-3.jpg'],
    brief: 'Foto de una persona usando el producto (también la prenda puesta), delante del nombre de la marca en letras gigantes (la persona tapa parte de las letras); 3 etiquetas pequeñas apuntan a beneficios REALES; arriba a la izquierda las reseñas reales si las hay; a la derecha una promesa corta, un botón y una mini tarjeta del producto con precio y «+». Movimiento: las etiquetas aparecen una tras otra.' },
  { id: 'zippa', name: 'Foto de acción y cinta de beneficios', needs: 'action', frames: ['zippa-1.jpg', 'zippa-2.jpg'],
    brief: 'Foto de acción a todo el ancho (servir, salpicar, usar); titular centrado y fuerte con de dónde viene; una línea con los datos reales; un botón. Abajo una cinta que corre con los beneficios reales separados por iconos pequeños. Movimiento: la cinta corre siempre; la foto hace un acercamiento muy lento.' },
  { id: 'buyfirst', name: 'Compra primero', needs: 'any', frames: ['examples/harvest-and-root.webp', 'examples/howl-honey.webp'],
    brief: 'La primera pantalla ya vende el producto estrella: a la izquierda titular claro, estrellas y reseñas solo si son reales, precio, opciones reales (una vez / suscripción solo si la tienda tiene suscripción) y «Agregar»; a la derecha una foto grande del producto en manos o en uso que llega al borde. Movimiento: la foto se acerca muy lento.' },
  { id: 'halflife', name: 'Mitad en uso', needs: 'any', frames: ['examples/haus-auston.webp', 'examples/field-and-north.webp'],
    brief: 'Mitad tranquila: el nombre del producto grande en serif fina, precio, una línea, tres datos reales con iconos pequeños, cantidad y «Agregar»; la otra mitad, a toda la altura, la foto del producto en uso (muñeca, cuerpo, mesa). Nunca recortar letras de la foto. Para ropa: la prenda puesta.' },
  { id: 'specsheet', name: 'Ficha técnica', needs: 'cutout', frames: ['examples/tideform.webp', 'examples/mill-motion.webp'],
    brief: 'Fondo claro; el recorte del producto grande a la izquierda; a la derecha un nombre técnico, una fila con 4–5 datos reales (medidas, peso, capacidad…), muestras de color reales y «Agregar · precio». Para equipos, herramientas, electrodomésticos. Movimiento: el producto flota apenas.' },
];

/** Owner 2026-11-15 («won't this standardize too much?»): about one store in three gets an open brief instead of a listed idea. */
export const LIBRE: V2HeroIdea = { id: 'libre', name: 'Portada libre', needs: 'any', frames: V2_HERO_IDEAS.slice(0, 6).map(idea => idea.frames[0]),
  brief: 'Inventa tu propia portada para ESTA marca: ninguna de las ideas de la lista, algo que solo esta tienda tendría. Mira las referencias como inspiración de oficio (escala, movimiento, cómo se muestra el producto), nunca como receta. Mismas reglas: titular entero en la primera pantalla, fotos con letras enteras, solo datos reales, movimiento con estado final quieto.' };
/** Stable per store: the same store keeps its draw between rebuilds. */
export const drawsLibre = (storeId: string) => [...storeId].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 7) % 3 === 0;
export const MIX_NOTE = 'Empieza desde esta idea; puedes torcerla o mezclarla con otra de la lista si la marca lo pide — nunca la copies tal cual.';

/** Ideas this merchant's other stores have not used that the store can show (only a cut-out is a hard need); all fitting ideas once
 *  every one is used. «libre» never counts as used. */
export function allowedHeroIdeas(used: readonly string[], context: Pick<V2Context, 'cutouts' | 'products'>): string[] {
  const fit = V2_HERO_IDEAS.filter(idea => idea.needs !== 'cutout' || (context.cutouts ?? []).length > 0);
  const fresh = fit.filter(idea => !used.includes(idea.id));
  return (fresh.length ? fresh : fit).map(idea => idea.id);
}
export const heroIdea = (id: string | undefined): V2HeroIdea | null => (id === 'libre' ? LIBRE : V2_HERO_IDEAS.find(idea => idea.id === id) ?? null);
export const heroMarker = (id: string) => `// @pagosya-hero ${id}`;
export function readHeroMarker(home: string): string | null {
  return home.match(/^\/\/ @pagosya-hero ([a-z]+)\s*$/m)?.[1] ?? null;
}

/** Final minors M1 + M2 (2026-11-16): what a saved design shows — its hero idea, menu model and header look («over|top:pills|plain»).
 *  Used for the merchant's other stores (so they are not repeated) and for a look round (which keeps its hero idea); a broken or
 *  missing snapshot reads as nothing. */
export function readStoreLooks(files: ReadonlyArray<{ path: string; content: string }> | null | undefined): { hero: string | null; menu: string | null; header: string | null } {
  const list = Array.isArray(files) ? files : [];
  const read = (path: string) => list.find(file => file.path === path)?.content ?? '';
  let menu: string | null = null;
  try { const model = readConfigData(list as never).header?.menu?.model; menu = typeof model === 'string' ? model : null; } catch { menu = null; }
  const nav = read('components/Shell.tsx').match(/<NavShell\b[^>]*>/)?.[0] ?? '';
  const header = nav ? `${/\sover[\s/>]/.test(nav) ? 'over' : 'top'}:${/linkStyle="pills"/.test(nav) ? 'pills' : 'plain'}` : null;
  return { hero: readHeroMarker(read('components/home.tsx')), menu, header };
}

/** The first `limit` distinct stores of rows already ordered newest first (live 2026-11-16: the history read the merchant's 20 newest
 *  stores — of 518 — so DooBoo's look was not in it and Meat House repeated it). */
export function newestStores(rows: ReadonlyArray<{ storeId: string }>, limit: number): string[] {
  return [...new Set(rows.map(row => row.storeId))].slice(0, limit);
}
