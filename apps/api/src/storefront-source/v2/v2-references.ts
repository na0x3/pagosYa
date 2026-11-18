import type { V2Context } from './v2-context';

/** V2 prototype visual library (owner 2026-11-14: «give it visual inspirations, make it learn from real ecommerce stores», then «do
 *  it» on the study library): real premium online stores, each tagged with the kinds of business it teaches and the catalogue shapes
 *  it shows. Every store is studied once, offline: scripts/brand-bench/v2-references.cjs photographs its home, catalogue, product page
 *  and cart (desktop and phone) and measures each page into examples/v2-proto/references/<host>/, then the study route writes its
 *  recipe card (cards/<host>.json) — the page structure, header, product card, buy box, type, colour roles and the one signature
 *  move, in words a writer can follow. A build reads the cards of the closest stores and a few of their pictures (no network).
 *  Checked 2026-11-14: cos.com, aesop.com and thefarmersdog.com refuse automated visits, olipop.com did not answer, ourplace.com is
 *  a parked domain — Our Place is fromourplace.com; fishwife.com is a restaurant — the tinned-fish brand is eatfishwife.com. */
/** `weight`: how much one matching kind counts — the customer a store serves (pets, brides) outweighs generic words like «comida»
 *  (live 2026-11-14: «comida fresca para perros» picked two food stores over the pet stores). `shapes`: the catalogue it shows —
 *  few (a handful of products), many (a real catalogue), variants (colours/sizes), subscription, made (to order / personalised). */
export type V2Shape = 'few' | 'many' | 'variants' | 'subscription' | 'made';
export type V2Reference = { host: string; name: string; kinds: string[]; shapes: V2Shape[]; mood: string; teaches: string; weight?: number };

export const V2_REFERENCES: V2Reference[] = [
  // Drinks
  { host: 'drinkpoppi.com', name: 'poppi', kinds: ['soda', 'bebida', 'bebidas', 'refresco', 'prebiotic', 'prebiotica', 'gaseosa', 'lata', 'latas'], shapes: ['few', 'subscription'], mood: 'playful', teaches: 'una bebida alegre con orden: color pleno, latas como protagonistas, sabores como recorrido' },
  { host: 'drinkrecess.com', name: 'Recess', kinds: ['bebida', 'bebidas', 'soda', 'lata', 'calma', 'bienestar'], shapes: ['few', 'subscription'], mood: 'calm', teaches: 'una bebida con calma: pasteles, tipografía editorial, mucho aire' },
  { host: 'liquiddeath.com', name: 'Liquid Death', kinds: ['bebida', 'bebidas', 'agua', 'lata', 'latas', 'cerveza'], shapes: ['few', 'variants'], mood: 'bold', teaches: 'una marca con humor y actitud: negro, tipografía pesada, el producto como icono' },
  { host: 'athleticbrewing.com', name: 'Athletic Brewing', kinds: ['cerveza', 'cervezas', 'bebida', 'bebidas', 'sin alcohol', 'deporte'], shapes: ['many', 'subscription'], mood: 'warm', teaches: 'cerveza: estilos como colección, vida al aire libre, compra por pack' },
  // Food, bakery, sweets, coffee
  { host: 'graza.co', name: 'Graza', kinds: ['comida', 'alimento', 'aceite', 'cocina', 'gourmet', 'despensa'], shapes: ['few'], mood: 'playful', teaches: 'comida: color audaz, humor, producto icónico' },
  { host: 'eatfishwife.com', name: 'Fishwife', kinds: ['comida', 'alimento', 'conserva', 'conservas', 'gourmet', 'snack', 'snacks'], shapes: ['many'], mood: 'playful', teaches: 'comida: ilustración, color, recetas' },
  { host: 'omsom.com', name: 'Omsom', kinds: ['comida', 'salsa', 'salsas', 'snack', 'snacks', 'alimento', 'fresca'], shapes: ['many'], mood: 'bold', teaches: 'comida: color fuerte, tipografía grande, sabor' },
  { host: 'brightland.co', name: 'Brightland', kinds: ['aceite', 'comida', 'gourmet', 'despensa', 'miel', 'vinagre', 'regalo'], shapes: ['few'], mood: 'calm', teaches: 'despensa de autor: botellas como objetos, luz cálida, colores suaves' },
  { host: 'flybyjing.com', name: 'Fly By Jing', kinds: ['salsa', 'salsas', 'picante', 'comida', 'chile', 'fideos', 'snack'], shapes: ['many'], mood: 'bold', teaches: 'comida con picante: rojo intenso, fotos de platos, recetas y packs' },
  { host: 'magicspoon.com', name: 'Magic Spoon', kinds: ['cereal', 'cereales', 'desayuno', 'snack', 'snacks', 'proteina'], shapes: ['few', 'subscription'], mood: 'playful', teaches: 'un snack divertido: color por sabor, cajas armables, suscripción clara' },
  { host: 'sietefoods.com', name: 'Siete', kinds: ['tortilla', 'tortillas', 'snack', 'snacks', 'comida', 'mexicana', 'latina', 'chips', 'salsa'], shapes: ['many'], mood: 'warm', teaches: 'comida latina en familia: calidez, productos por línea, recetas' },
  { host: 'milkbarstore.com', name: 'Milk Bar', kinds: ['postre', 'postres', 'pastel', 'pasteles', 'torta', 'tortas', 'galleta', 'galletas', 'reposteria', 'panaderia', 'dulce'], shapes: ['many', 'made'], mood: 'playful', teaches: 'repostería: pasteles como celebración, color, regalos y envíos' },
  { host: 'levainbakery.com', name: 'Levain Bakery', kinds: ['galleta', 'galletas', 'panaderia', 'pan', 'horno', 'reposteria', 'bakery'], shapes: ['few'], mood: 'warm', teaches: 'panadería: el producto en grande, textura, historia del local' },
  { host: 'sugarfina.com', name: 'Sugarfina', kinds: ['dulce', 'dulces', 'golosinas', 'caramelo', 'caramelos', 'chocolate', 'regalo', 'regalos'], shapes: ['many', 'made'], mood: 'playful', teaches: 'dulces para regalar: cajas armables, color por producto, regalos' },
  { host: 'onyxcoffeelab.com', name: 'Onyx Coffee Lab', kinds: ['cafe', 'grano', 'tostado', 'cafeteria', 'barista'], shapes: ['many', 'subscription', 'variants'], mood: 'technical', teaches: 'café de especialidad: ficha técnica de cada origen, retícula sobria' },
  { host: 'bluebottlecoffee.com', name: 'Blue Bottle', kinds: ['cafe', 'cafeteria', 'grano', 'tostado', 'barista', 'te'], shapes: ['many', 'subscription'], mood: 'calm', teaches: 'café: blanco limpio, fotografía serena, suscripción simple' },
  // Beauty, fragrance, hair, wellness
  { host: 'glossier.com', name: 'Glossier', kinds: ['belleza', 'labial', 'labiales', 'labios', 'skincare', 'cosmetica', 'maquillaje', 'rubor', 'piel', 'tono', 'tonos'], shapes: ['many', 'variants'], mood: 'playful', teaches: 'belleza: producto protagonista, tonos como muestras, voz amable' },
  { host: 'mirrorwater.earth', name: 'Mirror Water', kinds: ['belleza', 'skincare', 'bano', 'aceite', 'cuidado', 'ritual'], shapes: ['few'], mood: 'calm', teaches: 'belleza premium: calma, textura, tipografía precisa, interfaz silenciosa' },
  { host: 'summerfridays.com', name: 'Summer Fridays', kinds: ['belleza', 'skincare', 'labios', 'balsamo', 'piel', 'cosmetica'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'skincare suave: pasteles, producto sobre fondos de color, sets' },
  { host: 'meritbeauty.com', name: 'Merit', kinds: ['maquillaje', 'belleza', 'cosmetica', 'tono', 'tonos', 'labial'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'maquillaje mínimo: retícula limpia, tonos en muestras, mucho blanco' },
  { host: 'topicals.com', name: 'Topicals', kinds: ['skincare', 'piel', 'belleza', 'cuidado', 'crema', 'cremas'], shapes: ['few', 'variants'], mood: 'bold', teaches: 'skincare con energía: color saturado, tipografía grande, comunidad' },
  { host: 'ceremonia.com', name: 'Ceremonia', kinds: ['cabello', 'pelo', 'belleza', 'aceite', 'latina', 'ritual', 'cuidado'], shapes: ['many'], mood: 'warm', teaches: 'cuidado del cabello latino: calidez, ingredientes, rituales' },
  { host: 'otherland.com', name: 'Otherland', kinds: ['vela', 'velas', 'aroma', 'aromas', 'hogar', 'regalo', 'regalos', 'fragancia'], shapes: ['many', 'made'], mood: 'calm', teaches: 'velas: aromas como colección, color por vela, sets de regalo' },
  { host: 'ritual.com', name: 'Ritual', kinds: ['vitamina', 'vitaminas', 'suplemento', 'suplementos', 'salud', 'bienestar'], shapes: ['few', 'subscription'], mood: 'technical', teaches: 'suplementos: ciencia clara, amarillo de marca, suscripción' },
  { host: 'seed.com', name: 'Seed', kinds: ['probiotico', 'probioticos', 'suplemento', 'suplementos', 'salud', 'bienestar'], shapes: ['few', 'subscription'], mood: 'technical', teaches: 'salud con ciencia: tipografía editorial, datos, calma' },
  // Fashion, shoes, bags, jewellery
  { host: 'toteme-studio.com', name: 'Totême', kinds: ['moda', 'ropa', 'vestido', 'prendas', 'lujo', 'noche'], shapes: ['many', 'variants'], mood: 'luxury', teaches: 'moda de lujo: fotografía grande, retícula estricta, interfaz mínima' },
  { host: 'khaite.com', name: 'Khaite', kinds: ['moda', 'vestido', 'noche', 'alta costura', 'lujo'], shapes: ['many', 'variants'], mood: 'luxury', teaches: 'lujo editorial y sobrio, la ropa en primer plano' },
  { host: 'daniellefrankelstudio.com', name: 'Danielle Frankel', kinds: ['novia', 'vestido', 'alta costura', 'atelier', 'boda'], shapes: ['made'], mood: 'luxury', teaches: 'un atelier de novia: serif, calma, fotografía de autor', weight: 3 },
  { host: 'sezane.com', name: 'Sézane', kinds: ['moda', 'ropa', 'mujer', 'vestido', 'blusa', 'prendas', 'bolso'], shapes: ['many', 'variants'], mood: 'warm', teaches: 'moda parisina cálida: editorial con vida real, colecciones por historia' },
  { host: 'shopdoen.com', name: 'Dôen', kinds: ['moda', 'ropa', 'mujer', 'vestido', 'vestidos', 'prendas', 'romantico'], shapes: ['many', 'variants'], mood: 'warm', teaches: 'moda romántica: fotografía de luz natural, serif, tonos crema' },
  { host: 'johannaortiz.com', name: 'Johanna Ortiz', kinds: ['moda', 'vestido', 'vestidos', 'latina', 'lujo', 'mujer', 'diseñadora'], shapes: ['many', 'variants'], mood: 'luxury', teaches: 'moda latina de autor: color y estampado, campaña como portada' },
  { host: 'kotn.com', name: 'Kotn', kinds: ['ropa', 'hoodie', 'hoodies', 'polera', 'poleras', 'algodon', 'basicos', 'prendas', 'buzo'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'básicos de ropa: catálogo claro, fotos limpias, tallas y colores fáciles' },
  { host: 'buckmason.com', name: 'Buck Mason', kinds: ['ropa', 'hombre', 'polera', 'poleras', 'camisa', 'jean', 'basicos'], shapes: ['many', 'variants'], mood: 'warm', teaches: 'ropa de hombre: fotografía de estilo de vida, catálogo ordenado' },
  { host: 'aimeleondore.com', name: 'Aimé Leon Dore', kinds: ['ropa', 'hoodie', 'hoodies', 'streetwear', 'urbano', 'buzo'], shapes: ['many', 'variants'], mood: 'luxury', teaches: 'ropa urbana premium: lifestyle, editorial, tipografía con carácter' },
  { host: 'kith.com', name: 'Kith', kinds: ['streetwear', 'urbano', 'zapatillas', 'tenis', 'ropa', 'drop', 'hoodie'], shapes: ['many', 'variants'], mood: 'bold', teaches: 'streetwear: lanzamientos por campaña, retícula densa, blanco y negro' },
  { host: 'aloyoga.com', name: 'Alo', kinds: ['deporte', 'yoga', 'fitness', 'leggings', 'ropa deportiva', 'gimnasio'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'ropa deportiva premium: cuerpo en movimiento, blanco, colores por talla' },
  { host: 'outdoorvoices.com', name: 'Outdoor Voices', kinds: ['deporte', 'fitness', 'ropa deportiva', 'correr', 'leggings'], shapes: ['many', 'variants'], mood: 'playful', teaches: 'deporte alegre: color en bloques, gente real, tono cercano' },
  { host: 'allbirds.com', name: 'Allbirds', kinds: ['zapatos', 'zapatillas', 'calzado', 'tenis', 'lana'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'calzado: colores como muestras, materiales explicados, compra por talla' },
  { host: 'baggu.com', name: 'BAGGU', kinds: ['bolso', 'bolsos', 'bolsa', 'bolsas', 'mochila', 'accesorios', 'estampado'], shapes: ['many', 'variants'], mood: 'playful', teaches: 'bolsos: estampados como protagonistas, producto sobre fondo plano, color' },
  { host: 'mejuri.com', name: 'Mejuri', kinds: ['joya', 'joyas', 'joyeria', 'anillo', 'anillos', 'aretes', 'collar', 'oro', 'plata'], shapes: ['many', 'variants'], mood: 'luxury', teaches: 'joyería fina accesible: piel y oro, macro, retícula limpia' },
  { host: 'catbirdnyc.com', name: 'Catbird', kinds: ['joya', 'joyas', 'joyeria', 'anillo', 'anillos', 'novia', 'compromiso', 'artesanal'], shapes: ['many', 'made'], mood: 'warm', teaches: 'joyería artesanal: tono íntimo, piezas pequeñas en grande, taller' },
  { host: 'puravidabracelets.com', name: 'Pura Vida', kinds: ['pulsera', 'pulseras', 'bisuteria', 'accesorios', 'artesanal', 'playa', 'joyas'], shapes: ['many', 'variants'], mood: 'playful', teaches: 'bisutería artesanal: color, vida de playa, packs y promociones' },
  // Kids, pets
  { host: 'lovevery.com', name: 'Lovevery', kinds: ['bebe', 'bebes', 'nino', 'ninos', 'juguete', 'juguetes', 'infantil', 'didactico'], shapes: ['few', 'subscription'], mood: 'warm', teaches: 'juguetes por etapa: familias reales, edades claras, suscripción' },
  { host: 'us.tonies.com', name: 'Tonies', kinds: ['juguete', 'juguetes', 'nino', 'ninos', 'infantil', 'personajes', 'musica', 'cuentos'], shapes: ['many'], mood: 'playful', teaches: 'juguetes con personajes: color, colecciones, edad y tema' },
  { host: 'wildone.com', name: 'Wild One', kinds: ['perro', 'perros', 'mascota', 'mascotas', 'gato', 'gatos', 'correa', 'collar'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'mascotas: color suave, producto claro, tono cálido', weight: 3 },
  { host: 'fablepets.com', name: 'Fable', kinds: ['perro', 'perros', 'mascota', 'mascotas'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'mascotas con diseño: minimal, fotografía de vida real', weight: 3 },
  { host: 'maxbone.com', name: 'Maxbone', kinds: ['perro', 'perros', 'mascota', 'mascotas', 'cama', 'comida para perros'], shapes: ['many', 'variants'], mood: 'warm', teaches: 'mascotas de estilo de vida: perros en casa, colecciones, color tierra', weight: 3 },
  // Home, kitchen, plants, flowers, cleaning
  { host: 'parachutehome.com', name: 'Parachute', kinds: ['hogar', 'cama', 'sabanas', 'toallas', 'textil', 'dormitorio', 'bano'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'textiles de hogar: luz natural, materiales, colores en muestras' },
  { host: 'schoolhouse.com', name: 'Schoolhouse', kinds: ['hogar', 'lampara', 'lamparas', 'iluminacion', 'decoracion', 'muebles'], shapes: ['many', 'variants'], mood: 'warm', teaches: 'objetos para el hogar: ambientes completos, oficio, catálogo por estancia' },
  { host: 'floydhome.com', name: 'Floyd', kinds: ['muebles', 'mueble', 'sofa', 'mesa', 'cama', 'hogar'], shapes: ['few', 'variants'], mood: 'bold', teaches: 'muebles: el objeto sobre color, configuraciones claras, entrega' },
  { host: 'eastfork.com', name: 'East Fork', kinds: ['ceramica', 'vajilla', 'platos', 'tazas', 'taza', 'artesanal', 'hogar'], shapes: ['many', 'variants'], mood: 'warm', teaches: 'cerámica artesanal: esmaltes como colores, mesa puesta, taller' },
  { host: 'fellowproducts.com', name: 'Fellow', kinds: ['cocina', 'electrodomestico', 'electrodomesticos', 'licuadora', 'licuadoras', 'cafe', 'hervidor', 'aparato'], shapes: ['few', 'variants'], mood: 'technical', teaches: 'aparatos: el producto como objeto de diseño, fondos limpios, detalle técnico claro' },
  { host: 'fromourplace.com', name: 'Our Place', kinds: ['cocina', 'olla', 'ollas', 'sarten', 'licuadora', 'licuadoras', 'electrodomestico', 'hogar'], shapes: ['few', 'variants'], mood: 'warm', teaches: 'cocina: color, vida real cálida, beneficios claros' },
  { host: 'greatjonesgoods.com', name: 'Great Jones', kinds: ['cocina', 'olla', 'ollas', 'sarten', 'horno', 'utensilios'], shapes: ['few', 'variants'], mood: 'playful', teaches: 'utensilios de cocina con color: producto sobre fondos vivos, sets' },
  { host: 'vitamix.com', name: 'Vitamix', kinds: ['licuadora', 'licuadoras', 'batido', 'batidos', 'electrodomestico'], shapes: ['few', 'variants'], mood: 'technical', teaches: 'licuadoras: función, comparación de modelos, confianza' },
  { host: 'thesill.com', name: 'The Sill', kinds: ['planta', 'plantas', 'maceta', 'macetas', 'jardin', 'verde', 'vivero'], shapes: ['many', 'variants'], mood: 'calm', teaches: 'plantas: cada planta con su maceta, cuidados claros, fondo neutro' },
  { host: 'bloomandwild.com', name: 'Bloom & Wild', kinds: ['flor', 'flores', 'ramo', 'ramos', 'floreria', 'regalo', 'regalos'], shapes: ['many', 'subscription'], mood: 'playful', teaches: 'flores a domicilio: ramos en grande, fechas y ocasiones, entrega' },
  { host: 'blueland.com', name: 'Blueland', kinds: ['limpieza', 'detergente', 'jabon', 'hogar', 'ecologico', 'recarga'], shapes: ['few', 'subscription'], mood: 'calm', teaches: 'limpieza ecológica: kits y recargas, color suave, beneficios simples' },
  // Art, stationery
  { host: 'framebridge.com', name: 'Framebridge', kinds: ['arte', 'lamina', 'laminas', 'cuadro', 'cuadros', 'marco', 'marcos', 'enmarcado', 'print'], shapes: ['many', 'made'], mood: 'calm', teaches: 'enmarcado: la obra en la pared, opciones de marco claras' },
  { host: 'tappancollective.com', name: 'Tappan', kinds: ['arte', 'lamina', 'laminas', 'print', 'obra', 'obras', 'ilustracion', 'artista'], shapes: ['many'], mood: 'calm', teaches: 'arte: galería editorial, el artista y la obra' },
  { host: 'papier.com', name: 'Papier', kinds: ['papeleria', 'cuaderno', 'cuadernos', 'agenda', 'agendas', 'tarjeta', 'tarjetas', 'invitaciones', 'personalizado'], shapes: ['many', 'made'], mood: 'calm', teaches: 'papelería personalizada: estampados, tu nombre en el producto, regalos' },
  { host: 'poketo.com', name: 'Poketo', kinds: ['papeleria', 'cuaderno', 'cuadernos', 'regalo', 'regalos', 'accesorios', 'oficina', 'diseño'], shapes: ['many'], mood: 'playful', teaches: 'papelería y objetos de diseño: color, retícula de tienda-galería' },
  // Tech, gear, outdoor
  { host: 'nothing.tech', name: 'Nothing', kinds: ['tecnologia', 'audifonos', 'telefono', 'celular', 'electronica', 'gadget', 'gadgets'], shapes: ['few', 'variants'], mood: 'technical', teaches: 'tecnología: blanco y negro, tipografía de puntos, producto en detalle' },
  { host: 'nomadgoods.com', name: 'Nomad', kinds: ['accesorios', 'funda', 'fundas', 'cargador', 'cargadores', 'celular', 'tecnologia', 'cuero'], shapes: ['many', 'variants'], mood: 'technical', teaches: 'accesorios de tecnología: producto sobre oscuro, compatibilidad clara' },
  { host: 'teenage.engineering', name: 'teenage engineering', kinds: ['musica', 'sintetizador', 'electronica', 'audio', 'tecnologia', 'gadget'], shapes: ['few'], mood: 'technical', teaches: 'objetos técnicos de culto: ficha técnica como diseño, grises, precisión' },
  { host: 'cotopaxi.com', name: 'Cotopaxi', kinds: ['mochila', 'mochilas', 'outdoor', 'aventura', 'chamarra', 'camping', 'viaje', 'latina'], shapes: ['many', 'variants'], mood: 'playful', teaches: 'aventura con color: retazos de colores, viajes, propósito' },
  { host: 'huckberry.com', name: 'Huckberry', kinds: ['hombre', 'outdoor', 'herramientas', 'regalo', 'regalos', 'aventura', 'botas', 'equipo'], shapes: ['many', 'variants'], mood: 'warm', teaches: 'equipo para hombre: historias editoriales, catálogo denso, aventura' },
];
/** The bar for craft every store is shown when nothing closer fills the slots. */
const CRAFT = ['mirrorwater.earth'];

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hash = (text: string) => { let h = 2166136261; for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return h >>> 0; };

/** The catalogue shapes a store shows, from its own data and words. */
export function storeShapes(context: Pick<V2Context, 'request' | 'about' | 'products'>): V2Shape[] {
  const words = fold(`${context.request} ${context.about}`);
  const shapes = new Set<V2Shape>([context.products.length <= 5 ? 'few' : 'many']);
  if (/suscrip|cada mes|mensual|semanal/.test(words)) shapes.add('subscription');
  if (/a pedido|por encargo|personaliz|a medida|con tu nombre/.test(words)) shapes.add('made');
  if (/talla|tallas|colores|tonos|sabores|modelos/.test(words)) shapes.add('variants');
  return [...shapes];
}

/** The closest references to this store (by its own words, categories and products, then its catalogue shape), most matching first,
 *  then the craft bar. With a `seed` (the store id) the lead is drawn among the close matches so two stores of one trade don't both
 *  lead with the same reference, and the second is from another mood when one is close — one store's structure, another's touch,
 *  never one site cloned (owner 2026-11-14 «every store looks alike»). */
export function pickReferences(context: Pick<V2Context, 'storeName' | 'tagline' | 'request' | 'about' | 'categories' | 'products'>, max = 3, seed = ''): V2Reference[] {
  const words = new Set(fold([context.request, context.tagline, context.storeName, ...context.categories, ...context.products.map(product => `${product.name} ${product.category}`)].join(' ')).split(/[^a-z0-9]+/).filter(Boolean));
  const shapes = storeShapes(context);
  const scored = V2_REFERENCES.map(ref => {
    const kinds = ref.kinds.filter(kind => fold(kind).split(' ').every(part => words.has(part))).length * (ref.weight ?? 1);
    return { ref, score: kinds ? kinds + 0.5 * ref.shapes.filter(shape => shapes.includes(shape)).length : 0 };
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.ref.host.localeCompare(b.ref.host));
  if (seed && scored.length > 1) {
    const close = scored.filter(entry => entry.score >= scored[0].score * 0.6);
    const lead = close[hash(seed) % close.length];
    scored.splice(scored.indexOf(lead), 1); scored.unshift(lead);
    const other = scored.slice(1).find(entry => entry.ref.mood !== lead.ref.mood && entry.score >= lead.score * 0.5);
    if (other) { scored.splice(scored.indexOf(other), 1); scored.splice(1, 0, other); }
  }
  const picked = scored.slice(0, max - 1).map(entry => entry.ref);
  for (const host of CRAFT) if (picked.length < max && !picked.some(ref => ref.host === host)) picked.push(V2_REFERENCES.find(ref => ref.host === host)!);
  return picked;
}

/** A reference's recipe card (written once by the study route from its pages, desktop and phone, and their measurements). */
export type V2Card = {
  host: string; name: string; at: string; mood: string; idea: string; header: string; hero: string;
  home: Array<{ role: string; composition: string }>; catalog: string; card: string; product: string; cart: string;
  type: string; colour: string; photos: string; motion: string; phone: string; signature: string; lessons: string[];
};

const CARD_TEXT = { type: 'string' };
export function v2CardSchema(): object {
  const fields = ['mood', 'idea', 'header', 'hero', 'catalog', 'card', 'product', 'cart', 'type', 'colour', 'photos', 'motion', 'phone', 'signature'];
  return { type: 'object', additionalProperties: false, required: [...fields, 'home', 'lessons'], properties: {
    ...Object.fromEntries(fields.map(field => [field, CARD_TEXT])),
    home: { type: 'array', minItems: 3, maxItems: 14, items: { type: 'object', additionalProperties: false, required: ['role', 'composition'], properties: { role: CARD_TEXT, composition: CARD_TEXT } } },
    lessons: { type: 'array', minItems: 3, maxItems: 6, items: CARD_TEXT },
  } };
}

export function v2CardPrompt(): string {
  return `Eres un director de arte que estudia tiendas en línea reales para enseñar a un diseñador junior. Recibes capturas de UNA tienda
(portada de arriba abajo, catálogo, página de producto, carrito; escritorio y teléfono) y medidas tomadas del navegador (fuentes,
colores, alturas, columnas). Escribe su ficha de estudio en español: qué hace y CÓMO lo hace, con medidas y composiciones concretas
que otro pueda reproducir con otra marca y otras fotos. Nada de adjetivos vacíos («moderno», «limpio») sin decir en qué se ve.

- mood: el tono en pocas palabras.
- idea: la idea visual de la tienda en una frase.
- header: forma exacta (logo dónde, enlaces cuántos y dónde, acciones, barra de anuncio, fijo o no, cómo es en el teléfono).
- hero: la composición de la primera pantalla (proporciones, foto, titular, botón).
- home: la portada sección por sección, en orden: rol (para qué está) y composición (columnas, foto, texto, escala, fondo).
- catalog: la página de catálogo (columnas escritorio/teléfono, filtros, orden, cabecera).
- card: la tarjeta de producto (proporción de la foto, qué texto, precio, colores, botón rápido, segunda foto al pasar).
- product: la página de producto (galería, caja de compra, qué está sobre el pliegue, variantes, acordeones, qué viene debajo).
- cart: el carrito (cajón o página, filas, totales, ventas adicionales). Si no hay captura, dilo.
- type: fuentes (carácter, tamaños, mayúsculas, espaciado) y cómo se combinan.
- colour: colores con su trabajo (fondo, tinta, acento, bandas).
- photos: tratamiento de fotos (recorte, fondos, escala, producto solo o en vida real).
- motion: movimiento visible o probable (carruseles, marquesinas, al pasar); si no se ve, dilo.
- phone: cómo se recompone en el teléfono.
- signature: UN gesto que solo esta tienda tiene.
- lessons: 3 a 6 lecciones de oficio transferibles a otra marca (no «copia su logo»).

Si una captura muestra un bloqueo, un aviso de cookies o una página vacía, ignórala y dilo en el campo que toque.`;
}

/** A card as the words a direction or writer call reads. `full` gives the whole recipe; otherwise only the touch to borrow. */
export function cardText(card: V2Card, full: boolean): string {
  if (!full) return `${card.name} (${card.host}) — ${card.mood}. Firma: ${card.signature} Tipografía: ${card.type} Lecciones: ${card.lessons.join(' · ')}`;
  return `${card.name} (${card.host}) — ${card.mood}. ${card.idea}
- Cabecera: ${card.header}
- Primera pantalla: ${card.hero}
- Portada, en orden:
${card.home.map((section, i) => `  ${i + 1}. ${section.role}: ${section.composition}`).join('\n')}
- Catálogo: ${card.catalog}
- Tarjeta de producto: ${card.card}
- Página de producto: ${card.product}
- Carrito: ${card.cart}
- Tipografía: ${card.type}
- Color: ${card.colour}
- Fotos: ${card.photos}
- Movimiento: ${card.motion}
- Teléfono: ${card.phone}
- Firma: ${card.signature}
- Lecciones: ${card.lessons.join(' · ')}`;
}
