import { ACCENT, type PageSlot, type PageStructure } from './sketch-structure-draw';
import type { SketchBlock, SketchContext, SketchWidth } from './sketch-schema';

/** A plain block of the slot's own type, for a slot the model declined to fill but that the page cannot do
 * without. It must be the slot's type: a stand-in of some other type would, say, put a second hero on a page
 * the grammar allows one hero. Deliberately bare — an inserted block is a repair, not a design. */
function defaultBlock(slot: PageSlot, ctx: SketchContext): SketchBlock {
  const base = { id: slot.id, bg: 'paper' as const, size: slot.size, ...(slot.width !== 'bleed' ? { width: slot.width } : {}) };
  const go = 'Ver productos';
  switch (slot.type) {
    case 'hero': return { ...base, type: 'hero', variant: 'photo-right', headline: ctx.storeName, sub: '', cta: go, cta2: '', trust: '', badge: '', note: '', sticker: '', caption: '' };
    case 'announce': return { ...base, type: 'announce', left: '', right: '' };
    case 'split': return { ...base, type: 'split', kicker: '', headline: ctx.storeName, body: '', cta: go, cta2: '', href: 'checkout.html', pills: [], stats: [], boxes: [], sticker: '', tag: '' };
    case 'marquee': return { ...base, type: 'marquee', text: ctx.storeName, glyph: '·' };
    case 'catalog': return { ...base, type: 'catalog', kicker: '', title: 'Nuestros productos', seeAll: '', badges: [], stripLeft: '', stripRight: '', cardRatio: '4-3', cardDesc: true, cardAdd: true };
    case 'steps': return { ...base, type: 'steps', kicker: '', title: 'Así de simple', note: '', items: [] };
    case 'story': return { ...base, type: 'story', kicker: '', title: 'Nuestra historia', paragraphs: [] };
    case 'reviews': return { ...base, type: 'reviews', kicker: '', title: 'Clientes felices', ratingValue: '', ratingSource: '', handle: '', quotes: [], photos: [] };
    case 'collections': return { ...base, type: 'collections', kicker: '', title: 'Colecciones', note: '', items: [] };
    case 'faq': return { ...base, type: 'faq', kicker: '', title: 'Preguntas', items: [] };
    case 'banner': return { ...base, type: 'banner', kicker: '', headline: ctx.storeName, cta: 'Comprar', href: 'checkout.html', sticker: '' };
    case 'gallery': return { ...base, type: 'gallery', kicker: '', title: 'Galería', photos: [] };
    case 'newsletter': return { ...base, type: 'newsletter', kicker: '', variant: 'center', form: 'pill', title: 'Novedades', note: '', cta: 'Ver la tienda' };
    default: return { ...base, type: 'footer', bg: 'deep', tagline: '', wordmark: 'giant' };
  }
}

/** Where each band that can end up empty carries what it shows. A list-bearing band is a heading over nothing
 * without its list, and an announce with neither side is a strip with no text. */
const CONTENT: Partial<Record<SketchBlock['type'], readonly string[]>> = {
  steps: ['items'], faq: ['items'], collections: ['items'], gallery: ['photos'], reviews: ['quotes'], story: ['paragraphs'],
  announce: ['left', 'right'],
};
const CAN_BE_EMPTY = Object.keys(CONTENT) as SketchBlock['type'][];

/** Whether the block, as it will render, shows anything. This reads the block itself rather than asking whether
 * the model sent one: repairSketch has already discarded malformed items by the time fill runs, so a band whose
 * items were all strings comes back present but empty. A missing field counts as empty for the same reason. */
function hasContent(block: SketchBlock): boolean {
  const fields = CONTENT[block.type];
  if (!fields) return true;
  const record = block as unknown as Record<string, unknown>;
  return fields.some(field => {
    const value = record[field];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '';
  });
}

const WIDTHS: SketchWidth[] = ['bleed', 'wide', 'narrow', 'offset-left', 'offset-right'];
/** The grammar's floor on page length (see `violations`). */
const MIN_BANDS = 6;

/** The slot owns the shape and the model owns the content. Without this the drawn size rhythm and width walk
 * would be advice the model is free to ignore, which is the failure the drawn skeleton exists to remove.
 * Width follows repairSketch's convention: `bleed` is stored as the absence of the field. A slot that carries
 * no media has its single photo stripped; one that does carry media cannot conjure a photo, so it is left alone. */
function shapeToSlot(block: SketchBlock, slot: PageSlot): SketchBlock {
  const shaped = { ...block, size: slot.size } as SketchBlock & { photo?: string };
  if (slot.width !== 'bleed') shaped.width = slot.width; else delete shaped.width;
  if (!slot.media) delete shaped.photo;
  return shaped;
}

/** The slots the page cannot lose, whatever the model says. */
const UNVETOABLE: SketchBlock['type'][] = ['catalog', 'footer'];

/** Puts the model's blocks into the drawn skeleton. The model fills slots by id: anything it invents is
 * dropped, which is what stops it appending its habitual spine, and a slot it leaves empty is a veto. The
 * veto is capped, because a model that vetoes freely talks its way back to the short page it always wrote.
 * Total: it is called from repairSketch, which must stay total, so garbage in any argument degrades to
 * "nothing usable came back" rather than throwing. */
export function fillStructure(blocks: SketchBlock[], structure: PageStructure, ctx: SketchContext): { blocks: SketchBlock[]; notes: string[] } {
  const notes: string[] = [];
  const given = Array.isArray(blocks) ? blocks : [];
  const rawSlots: unknown = structure?.slots;
  const slots = (Array.isArray(rawSlots) ? rawSlots : []).filter((slot): slot is PageSlot => typeof slot === 'object' && slot !== null);
  // Without a usable skeleton there is nothing to enforce; leave the model's page as it came.
  if (!slots.length) { notes.push('la estructura de la página estaba vacía; se conservaron los bloques tal cual'); return { blocks: given, notes }; }

  const slotIds = new Set(slots.map(slot => slot.id));
  const bySlot = new Map<string, SketchBlock>();
  let dropped = 0;
  for (const block of given) {
    const id = typeof block === 'object' && block !== null ? block.id : undefined;
    if (typeof id !== 'string' || !slotIds.has(id)) { dropped++; continue; }
    if (bySlot.has(id)) { dropped++; continue; }
    bySlot.set(id, block);
  }
  if (dropped) notes.push(`${dropped} bloque(s) no estaban en la estructura de la página; se descartaron`);

  const vetoed = slots.filter(slot => !bySlot.has(slot.id) && !UNVETOABLE.includes(slot.type));
  const allowance = Math.floor(slots.length / 3);
  const honoured = new Set(vetoed.slice(0, allowance).map(slot => slot.id));
  if (vetoed.length > allowance) notes.push(`se dejaron demasiadas bandas vacías (${vetoed.length}); ${vetoed.length - allowance} se completaron con contenido base`);
  if (honoured.size) notes.push(`${honoured.size} banda(s) quedaron sin contenido y se quitaron`);

  // Each surviving slot either keeps the model's block or needs a bare stand-in.
  const entries: Array<{ slot: PageSlot; block: SketchBlock | null }> = [];
  for (const slot of slots) {
    if (honoured.has(slot.id)) continue;
    const block = bySlot.get(slot.id);
    // A block of the wrong type for its slot cannot be rendered as the slot's type, so it gives way.
    if (block && block.type !== slot.type) notes.push(`el bloque ${slot.id} tenía el tipo ${String(block.type).slice(0, 20)} y la banda pide ${slot.type}; se reemplazó`);
    entries.push({ slot, block: block && block.type === slot.type ? block : null });
  }

  // An empty band, whether a stand-in or the model's own block with every item repaired away, has no content, and
  // starter items would be filler, so it renders as a titled band with nothing in it: worse than no band. Drop it, unless that takes the page under the
  // grammar's floor of six, where the shell stays because a short page is the habit the veto cap exists to stop.
  let remaining = entries.length;
  const kept = entries.filter(entry => {
    if ((entry.block && hasContent(entry.block)) || !CAN_BE_EMPTY.includes(entry.slot.type) || remaining <= MIN_BANDS) return true;
    remaining--;
    notes.push(`la banda ${entry.slot.id} (${entry.slot.type}) quedó sin contenido; se quitó`);
    return false;
  });

  const out: SketchBlock[] = kept.map(({ slot, block }) => shapeToSlot(block ?? defaultBlock(slot, ctx), slot));

  // A veto can leave two accent strips touching, which the grammar forbids by construction.
  for (let i = 1; i < out.length; i++) {
    if (!ACCENT.includes(out[i].type) || !ACCENT.includes(out[i - 1].type)) continue;
    out.splice(i, 1);
    notes.push('dos bandas de acento quedaron pegadas al vaciarse una banda; se quitó una');
    i--;
  }

  // Closing the page up can also bring two same-width bands together, which the grammar forbids. Re-pick the
  // width rather than drop a band: losing content to fix a rhythm would be the wrong trade. The pick avoids
  // the next band's width too, so one repair does not create the next collision.
  const widthOf = (block: SketchBlock): SketchWidth => block.width ?? 'bleed';
  for (let i = 1; i < out.length; i++) {
    if (widthOf(out[i]) !== widthOf(out[i - 1])) continue;
    const next = i + 1 < out.length ? widthOf(out[i + 1]) : null;
    const choices = WIDTHS.filter(width => width !== widthOf(out[i - 1]));
    const pick = choices.find(width => width !== next) ?? choices[0];
    const repaired = { ...out[i] };
    if (pick !== 'bleed') repaired.width = pick; else delete repaired.width;
    out[i] = repaired;
    notes.push(`dos bandas seguidas tenían el mismo ancho tras quitar una banda; se cambió el ancho de ${repaired.id}`);
  }
  return { blocks: out, notes };
}
