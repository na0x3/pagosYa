/** A creative direction drawn fresh for every generation, so two stores never leave with the same
 * page. The draw is pure given its `random`, which keeps tests deterministic; production uses
 * Math.random, so every click of "crear mi sitio" lands on a different corner of the space
 * (12 paletas × 6 tipografías × 3 energías × 4 escalas ≈ 864 direcciones). */

import { NEWSLETTER_FORMS, SKETCH_STYLE_OPTIONS, type NewsletterForm, type SketchStyle } from './sketch-schema';

export type SketchDirection = { name: string; lines: string[]; style: SketchStyle; newsletterForm: NewsletterForm };

type Mood = { name: string; line: string };

const PALETTE_MOODS: readonly Mood[] = [
  { name: 'terracota', line: 'Paleta terracota: paper crema cálido, accent terracota quemado, deep marrón café, pop mostaza.' },
  { name: 'noche eléctrica', line: 'Paleta noche eléctrica: paper casi negro, ink claro, accent neón (lima o cian), deep aún más oscuro que el paper, pop fucsia.' },
  { name: 'menta', line: 'Paleta menta fresca: paper blanco hueso, accent verde menta profundo, deep verde botella, pop amarillo limón.' },
  { name: 'mediterráneo', line: 'Paleta mediterránea: paper blanco cálido, accent azul ultramar, deep azul noche, pop amarillo sol.' },
  { name: 'rosa panadería', line: 'Paleta rosa panadería: paper rosa empolvado muy claro, accent rojo cereza, deep ciruela, pop crema.' },
  { name: 'uva y naranja', line: 'Paleta uva y naranja: paper lila pálido, accent naranja intenso, deep morado uva, pop lavanda.' },
  { name: 'monocromo con golpe', line: 'Paleta monocromo con un golpe: paper gris papel, ink casi negro, deep gris carbón, y UN solo color vivo (rojo o naranja quemado) repartido entre accent y pop.' },
  { name: 'oliva y miel', line: 'Paleta oliva y miel: paper beige verdoso, accent verde oliva, deep verde musgo oscuro, pop miel.' },
  { name: 'cacao', line: 'Paleta cacao intenso: paper chocolate claro, accent cobre, deep cacao casi negro, pop crema batida.' },
  { name: 'hielo y coral', line: 'Paleta hielo y coral: paper azul hielo muy claro, accent coral vivo, deep azul petróleo, pop turquesa.' },
  { name: 'pimienta rosa', line: 'Paleta pimienta rosa: paper blanco tiza, accent rosa chicle saturado, deep granate, pop verde pistacho.' },
  { name: 'arena y cielo', line: 'Paleta arena y cielo: paper arena, accent azul cielo saturado, deep azul marino, pop naranja atardecer.' },
];

const TYPE_MOODS: readonly Mood[] = [
  { name: 'cartel', line: 'Tipografía de cartel: display condensada y gritona; texto en una grotesca neutra.' },
  { name: 'editorial', line: 'Tipografía editorial: display serif con carácter; texto en una sans humanista.' },
  { name: 'amable', line: 'Tipografía amable: display redondeada; texto en una sans geométrica limpia.' },
  { name: 'brutalista', line: 'Tipografía brutalista: la misma grotesca pesada en titulares y texto.' },
  { name: 'revista', line: 'Tipografía de revista: display serif de alto contraste; texto en una grotesca pequeña y sobria.' },
  { name: 'excéntrica', line: 'Tipografía excéntrica: el display más raro del catálogo que le quede al rubro; texto muy sobrio para compensar.' },
];

const ENERGIES: readonly Mood[] = [
  { name: 'maximalista', line: 'Energía maximalista: stickers en hero/split/banner, badges cortos en el catálogo ("NUEVO", "FAVORITO"), stripLeft/stripRight con microcopy, wordmark gigante en el footer.' },
  { name: 'equilibrada', line: 'Energía equilibrada: un solo sticker, badges discretos, wordmark gigante.' },
  { name: 'minimal', line: 'Energía minimal: sin stickers, sin badges, mucho aire en el texto, wordmark plain.' },
];

const SCALES = ['s', 'm', 'l', 'xl'] as const;

export function drawSketchDirection(random: () => number = Math.random): SketchDirection {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const palette = pick(PALETTE_MOODS);
  const type = pick(TYPE_MOODS);
  const energy = pick(ENERGIES);
  const scale = pick(SCALES);
  const style = Object.fromEntries((Object.keys(SKETCH_STYLE_OPTIONS) as (keyof SketchStyle)[]).map(key => [key, pick(SKETCH_STYLE_OPTIONS[key])])) as SketchStyle;
  return {
    style,
    newsletterForm: pick(NEWSLETTER_FORMS),
    name: `${palette.name} · ${type.name} · ${energy.name}`,
    lines: [
      palette.line,
      type.line,
      energy.line,
      `Escala general: ${scale}.`,
      'PROHIBIDO el boceto genérico: nada de crema + naranja + verde botella por costumbre, ni el mismo orden de siempre. Esta tienda debe verse distinta de cualquier otra. Si el pedido del comercio choca con esta dirección, manda el pedido.',
    ],
  };
}
