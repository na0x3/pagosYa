/** Owner 2026-10-27 (Oh Belly edit test: four small layout asks went to the design agent, $9, and two of them asked for what the
 *  store already had): the layout asks a merchant makes in plain words, read as the template's own switches. Only ids the store's
 *  template offers (its skeleton's dice, or Esencial's catalogue) are used; anything else is left to the usual edit. */

const fold = (text: string) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const BAND = /\b(?:cinta|marquesina|banda|franja|tira|letrero|texto)s?\b[^.!?\n]{0,30}\b(?:que se mueve|que se mueven|movil|animad[ao]|corre|pasa)\b|\bmarquesina\b|\bcinta\b/;
const REMOVE = /\b(?:quita|quitale|saca|elimina|borra|oculta|no quiero|sin (?:la |esa )?(?:cinta|marquesina|banda|franja))\b/;
const ADD = /\b(?:pon|ponle|agrega|anade|quiero|muestra)\b/;
const PRODUCTS = /\b(?:productos|menu|catalogo|carta|tarjetas|articulos)\b/;
const COVER = /\b(?:portada|inicio|entrada|hero|banner principal|cabecera de la pagina)\b/;
const CLOSING = /\b(?:cierre|final de la pagina|al final|ultima seccion)\b/;

/** Each part's choice from the words, in the order the template may have it. */
const WANTS: Array<[part: string, area: RegExp, ask: RegExp, ids: string[]]> = [
  ['grid', PRODUCTS, /\b(?:fila|desliz\w*|carrusel|horizontal|de lado)\b/, ['strip']],
  ['grid', PRODUCTS, /\b(?:lista|renglones|como una carta|como un menu)\b/, ['list']],
  ['grid', PRODUCTS, /\b(?:tarjetas grandes|cuadricula|mosaico|grilla|cuadros|tarjetas con foto)\b/, ['grid3', 'grid4']],
  ['hero', COVER, /\b(?:foto (?:grande )?de fondo|imagen de fondo|foto (?:a )?pantalla completa|foto completa|foto gigante|toda la foto)\b/, ['poster', 'full']],
  ['hero', COVER, /\b(?:al lado|dividida|mitad y mitad|foto a la (?:derecha|izquierda))\b/, ['split-left', 'split-right']],
  ['hero', COVER, /\b(?:titulo (?:grande|centrado|enorme)|titulo arriba)\b/, ['stack', 'type']],
  ['closing', CLOSING, /\b(?:foto|imagen)\b/, ['photo']],
  ['closing', CLOSING, /\b(?:color|colores|banda de color)\b/, ['accent']],
];

/** The switches the merchant's words ask for, from what the template offers; {} when the words name none. */
export function layoutChangeFor(request: string, offered: Record<string, readonly string[]>): Record<string, string> {
  // Words the merchant dictates («…por: Burbujas sin azúcar», «"…"») are content, never an instruction (live check 2026-10-27:
  // «sin azúcar» in the band's new words took the band away).
  const text = fold(request).replace(/\bpor\s*:[\s\S]*$/, ' ').replace(/[«"“][^»"”]*[»"”]/g, ' ');
  const change: Record<string, string> = {};
  if (BAND.test(text) && (offered.announce ?? ['plain', 'ticker']).length) {
    if (REMOVE.test(text)) change.announce = 'plain';
    else if (ADD.test(text) && !/\b(?:palabras|texto|dice|diga)\b/.test(text)) change.announce = 'ticker';
  }
  for (const [part, area, ask, ids] of WANTS) {
    if (change[part] || !area.test(text) || !ask.test(text)) continue;
    const id = ids.find(candidate => (offered[part] ?? []).includes(candidate));
    if (id) change[part] = id;
  }
  return change;
}

/** What the reply says it switched, in the merchant's words. */
export function layoutChangeNote(change: Record<string, string>): string {
  const said: Record<string, Record<string, string>> = {
    announce: { plain: 'quité la cinta que se mueve', ticker: 'puse la cinta que se mueve' },
    grid: { strip: 'los productos van en una fila que se desliza', list: 'los productos van en lista', grid3: 'los productos van en tarjetas grandes', grid4: 'los productos van en cuadrícula' },
    hero: { poster: 'la portada lleva la foto grande de fondo', full: 'la portada lleva la foto a pantalla completa', 'split-left': 'la portada va con la foto al lado', 'split-right': 'la portada va con la foto al lado', stack: 'la portada lleva el título grande arriba', type: 'la portada lleva el título grande' },
    closing: { photo: 'el cierre lleva una foto', accent: 'el cierre va en color' },
  };
  return Object.entries(change).map(([part, id]) => said[part]?.[id]).filter(Boolean).join('; ');
}
