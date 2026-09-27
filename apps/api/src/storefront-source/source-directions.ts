/**
 * Named visual directions YAPI offers before it builds a store from scratch (sub-project 2 of
 * docs/superpowers/specs/2026-09-26-yapi-agent-design.md): one question, three bold choices, each with a palette and
 * a font pair the stores can load. Deterministic, so offering them costs no model call and cannot fail.
 */
export type DesignDirection = {
  id: string;
  name: string;
  description: string;
  palette: { background: string; surface: string; ink: string; accent: string };
  fonts: { display: string; text: string };
  keywords: string[];
};

export const DESIGN_DIRECTIONS: DesignDirection[] = [
  { id: 'retro-americana', name: 'Retro americana', description: 'Titulares gigantes en mayúsculas, bandas mostaza y óxido, botones píldora con precio.',
    palette: { background: '#f6ecd6', surface: '#efd9a7', ink: '#2b1d14', accent: '#b5441b' }, fonts: { display: 'bebas-neue', text: 'rubik' },
    keywords: ['retro', 'vintage', 'diner', 'americano', 'hamburguesa', 'hamburgues', 'malteada', 'papas', 'cerveza', 'barber', 'soda', 'clásico', 'clasico'] },
  { id: 'editorial-minimal', name: 'Editorial minimalista', description: 'Marfil y negro, serif enorme, mucho aire y fotos grandes como en una revista.',
    palette: { background: '#f7f4ee', surface: '#ebe5da', ink: '#151412', accent: '#8a6a3b' }, fonts: { display: 'instrument-serif', text: 'manrope' },
    keywords: ['moda', 'ropa', 'diseño', 'arquitect', 'arte', 'galería', 'galeria', 'libro', 'editorial', 'minimal', 'fotograf'] },
  { id: 'neon-nocturno', name: 'Nocturno neón', description: 'Fondo oscuro, acento lima eléctrico y tipografía ancha para una marca que se nota.',
    palette: { background: '#0e0f14', surface: '#1a1c24', ink: '#f3f1ff', accent: '#c6ff3d' }, fonts: { display: 'unbounded', text: 'space-grotesk' },
    keywords: ['tecnolog', 'gamer', 'juego', 'música', 'musica', 'noche', 'bar', 'club', 'electrón', 'electron', 'celular', 'audio'] },
  { id: 'natural-organico', name: 'Natural y orgánico', description: 'Salvia y arcilla, serif suave, formas redondeadas y texturas de papel.',
    palette: { background: '#f3efe6', surface: '#dfe3d3', ink: '#23301f', accent: '#a4552f' }, fonts: { display: 'fraunces', text: 'figtree' },
    keywords: ['natural', 'orgánic', 'organic', 'planta', 'jardín', 'jardin', 'vegano', 'té', 'miel', 'cosmética', 'cosmetica', 'bienestar', 'yoga', 'huerta'] },
  { id: 'pop-color', name: 'Pop de colores', description: 'Rosa chicle y azul intenso, letras redondas y stickers: alegre y juguetona.',
    palette: { background: '#fff4f8', surface: '#ffd6e6', ink: '#1d1a3a', accent: '#3b4cff' }, fonts: { display: 'shrikhand', text: 'nunito' },
    keywords: ['niño', 'nino', 'juguete', 'dulce', 'caramelo', 'helado', 'postre', 'torta', 'cupcake', 'fiesta', 'regalo', 'mascota'] },
  { id: 'lujo-sobrio', name: 'Lujo sobrio', description: 'Negro profundo y oro, serif de alto contraste y detalles finos.',
    palette: { background: '#111111', surface: '#1d1b18', ink: '#f4efe6', accent: '#c9a24d' }, fonts: { display: 'bodoni-moda', text: 'epilogue' },
    keywords: ['joya', 'joyería', 'joyeria', 'oro', 'plata', 'lujo', 'perfume', 'reloj', 'vino', 'premium', 'exclusiv'] },
  { id: 'tecnico-preciso', name: 'Técnico y preciso', description: 'Gris claro, rojo señal y monoespaciada: fichas técnicas y rejillas limpias.',
    palette: { background: '#eeeeec', surface: '#ffffff', ink: '#111111', accent: '#c7281a' }, fonts: { display: 'space-grotesk', text: 'space-mono' },
    keywords: ['herramienta', 'repuesto', 'taller', 'reparación', 'reparacion', 'técnic', 'tecnic', 'ferreter', 'bicicleta', 'moto', 'auto'] },
  { id: 'artesanal-calido', name: 'Artesanal cálido', description: 'Terracota y crema, serif amable y fotos de oficio: hecho a mano.',
    palette: { background: '#fbf3e8', surface: '#f1dcc4', ink: '#3a2418', accent: '#b04a22' }, fonts: { display: 'young-serif', text: 'outfit' },
    keywords: ['artesan', 'hecho a mano', 'cerámica', 'ceramica', 'panader', 'pan', 'café', 'cafe', 'cuero', 'tejido', 'vela', 'madera'] },
  { id: 'deportivo-energico', name: 'Deportivo enérgico', description: 'Negro y naranja intenso, condensada en mayúsculas y cortes diagonales.',
    palette: { background: '#f4f4f0', surface: '#e6e6df', ink: '#0d0d0d', accent: '#e8500f' }, fonts: { display: 'anton', text: 'chivo' },
    keywords: ['deporte', 'gimnasio', 'fitness', 'running', 'fútbol', 'futbol', 'entrenamiento', 'suplemento', 'zapatilla', 'crossfit'] },
  { id: 'fresco-costero', name: 'Fresco costero', description: 'Azul profundo y arena, serif elegante y aire de verano.',
    palette: { background: '#f5f1e8', surface: '#d8e6ee', ink: '#10304a', accent: '#c4553f' }, fonts: { display: 'playfair-display', text: 'sora' },
    keywords: ['playa', 'mar', 'verano', 'viaje', 'turismo', 'hotel', 'surf', 'traje de baño', 'lino', 'costa'] },
];

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The three directions offered for this business: the ones whose keywords it mentions first, then catalog order. */
export function rankDirections(summary: string): DesignDirection[] {
  const text = normalize(summary);
  const score = (direction: DesignDirection) => direction.keywords.filter(keyword => text.includes(normalize(keyword))).length;
  return DESIGN_DIRECTIONS.map((direction, index) => ({ direction, index, score: score(direction) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map(entry => entry.direction);
}

/** The chosen direction as a binding part of the build instruction. */
export function directionBrief(direction: DesignDirection) {
  const { palette, fonts } = direction;
  return `Dirección visual elegida por el comercio (obligatoria): «${direction.name}» — ${direction.description} Paleta: fondo ${palette.background}, superficie ${palette.surface}, texto ${palette.ink}, acento ${palette.accent}. Tipografías: titulares assets/${fonts.display}.ttf, texto assets/${fonts.text}.ttf. Hazla audaz y completa: titulares grandes, secciones con carácter y llamadas a la acción claras.`;
}
