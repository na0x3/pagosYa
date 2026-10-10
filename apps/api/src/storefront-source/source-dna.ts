/** Design DNA (sub-project 2): the form, behaviour and placement choices that make one store unlike the next.
 * Colours are deliberately absent: the store's --store-* / --brand-* tokens stay their single source.
 * Nothing here imports source-design.ts, which imports this module (no evaluation-time cycle). */
import { SOURCE_FONT_IDS, SOURCE_FONT_SEED_IDS } from './source-font-catalog';
import { sanitizeProductThemeCss } from './product-theme-css';
import { productCardDirection, productCommerceDirection } from './source-product-card-presets';
export const SOURCE_PRODUCT_PAGE_STYLES = ['editorial', 'dense', 'image-led', 'story-led'] as const;
export type SourceProductPageStyle = typeof SOURCE_PRODUCT_PAGE_STYLES[number];
/** The self-hosted fonts in the kit, from the one catalogue (source-font-catalog.ts). */
export const SOURCE_DNA_FONTS = SOURCE_FONT_IDS;

export const SOURCE_DNA_ENUMS = {
  type: { display: SOURCE_DNA_FONTS, text: SOURCE_DNA_FONTS, case: ['none', 'upper', 'small-caps'], tracking: ['tight', 'normal', 'wide'] },
  shape: { radius: ['none', 'soft', 'round', 'pill'], border: ['none', 'hairline', 'bold'], frame: ['bleed', 'inset', 'rounded', 'arch', 'polaroid', 'blob', 'stamp', 'tape'] },
  buttons: {
    form: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'],
    hover: ['lift', 'fill', 'underline-grow', 'tilt', 'shine', 'invert'], press: ['squash', 'sink', 'pop', 'none'],
  },
  motion: { personality: ['calm', 'snappy', 'playful', 'cinematic'] },
  layout: { grammar: ['editorial', 'grid', 'collage', 'index', 'poster', 'magazine', 'brutalist'], density: ['airy', 'balanced', 'dense'] },
  surfaces: {
    cart: ['drawer', 'sheet', 'page', 'overlay'], added: ['toast', 'ribbon', 'bubble', 'inline', 'stamp'], product: SOURCE_PRODUCT_PAGE_STYLES,
    review: ['split', 'stacked', 'ticket', 'notebook'], card: ['still', 'second-photo', 'swatch-swap', 'zoom', 'quick-look', 'tilt'],
  },
  // The product page's own identity. The first value of each list is today's behaviour (FIXED_DEFAULTS below).
  productCard: {
    swatch: ['pill', 'circle', 'square', 'label', 'photo'], gallery: ['rail', 'strip', 'stack', 'mosaic'],
    blocks: ['plain', 'card', 'outline', 'tape', 'ticket'], divider: ['none', 'hairline', 'dashed', 'bold'], enter: ['none', 'fade-up', 'slide', 'pop'],
    // Which side the gallery takes on desktop; 'left' is today's page. story-led ignores it (single column).
    media: ['left', 'right'],
  },
} as const;
export const PRODUCT_CSS_MAX = 3000;
/** Inside a design concept the CSS is capped lower: three concepts share the planner's output budget. */
export const PRODUCT_CSS_CONCEPT_MAX = 1200;
export const SOURCE_DNA_MOTIF_ENUMS = {
  for: ['store', 'category', 'product'], behavior: ['glow', 'draw', 'sway', 'steam', 'grow', 'bounce', 'spin', 'float'],
  trigger: ['appear', 'scroll', 'hover', 'add-to-cart', 'purchase'], placement: ['hero', 'card', 'product', 'cart', 'confirmation'],
} as const;
// Worst case (3 motifs + signature) × 3 concepts must fit the planner's 5,600-token output reserve.
const MOTIF_LIMITS = { target: 40, meaning: 80 } as const;
const MAX_MOTIFS = 3;
const MAX_SIGNATURE = 100;

type Enums = typeof SOURCE_DNA_ENUMS;
type MotifEnums = typeof SOURCE_DNA_MOTIF_ENUMS;
export type SourceDnaMotif = { -readonly [K in keyof MotifEnums]: MotifEnums[K][number] } & { target: string; meaning: string };
export type SourceDesignDna = { version: 1 } & { -readonly [G in keyof Enums]: { -readonly [K in keyof Enums[G]]: Enums[G][K] extends readonly string[] ? Enums[G][K][number] : never } }
  & { motifs: SourceDnaMotif[]; signature: string; productCss: string };

// Runtime names are what commerce.js writes as data-dna-<name>; two read better renamed.
const RUNTIME_NAMES: Record<string, string> = { 'buttons.form': 'button', 'motion.personality': 'motion' };
/** Identity libraries (T2b) appended these values. The seeded default never picks them: withSeededDna seeds every stored
 * store without a DNA on each public view, so a new value in the draw would silently restyle stores published long ago. */
const NOT_SEEDED: Record<string, readonly string[]> = { 'buttons.form': ['sticker', 'ticket', 'bubbly', 'brutal'], 'shape.frame': ['blob', 'stamp', 'tape'] };
/** Fields whose seeded default is one fixed value (today's look) for every store, so no store is ever restyled by a
 * seed. The planner may still choose any value of the field (PLANNER_BY_FIELD). */
const FIXED_DEFAULTS: Record<string, string> = Object.fromEntries(Object.entries(SOURCE_DNA_ENUMS.productCard).map(([key, values]) => [`productCard.${key}`, values[0]]));
const FIELDS = Object.entries(SOURCE_DNA_ENUMS).flatMap(([group, keys]) => Object.entries(keys).map(([key, values]) => {
  const all = values as readonly string[], id = `${group}.${key}`;
  const planned = all.filter(value => !(NOT_SEEDED[id] ?? []).includes(value));
  // Fonts: the seed keeps to the original thirty so stores seeded before the themed faces keep their type; the planner sees every font.
  const seeded = FIXED_DEFAULTS[id] ? [FIXED_DEFAULTS[id]] : group === 'type' && (key === 'display' || key === 'text') ? planned.filter(value => (SOURCE_FONT_SEED_IDS as readonly string[]).includes(value)) : planned;
  return { group, key, name: RUNTIME_NAMES[id] ?? key, values: all, seeded, planner: FIXED_DEFAULTS[id] ? all : planned };
}));
export const SOURCE_DNA_RUNTIME_ENUMS: Record<string, readonly string[]> = Object.fromEntries(FIELDS.map(field => [field.name, field.values]));
export type SourceRuntimeDna = { version: 1 } & Record<string, string | 1>;
/** The seeded (T4-gated) values per field, keyed "group.key": what defaultDna draws from, what the planner's schema
 * offers, and what avoidTakenFingerprint's nudge lands on. A DNA that already carries a not-yet-seeded value (an
 * existing store) still validates and renders — normalizeDna and the runtime check against the full SOURCE_DNA_ENUMS
 * below, never this map. */
const SEEDED_BY_FIELD: Record<string, readonly string[]> = Object.fromEntries(FIELDS.map(field => [`${field.group}.${field.key}`, field.seeded]));
const PLANNER_BY_FIELD: Record<string, readonly string[]> = Object.fromEntries(FIELDS.map(field => [`${field.group}.${field.key}`, field.planner]));

const enumSchema = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
/** Strict structured-output fragment: every property required, no extra keys. Spec §2.6 ("Nothing is chosen in T2
 * itself"): the new button forms and frames (NOT_SEEDED above) stay out of what the planner can choose until T4. */
export const SOURCE_DNA_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['version', ...Object.keys(SOURCE_DNA_ENUMS), 'motifs', 'signature', 'productCss'],
  properties: {
    version: { type: 'integer', enum: [1] },
    ...Object.fromEntries(Object.entries(SOURCE_DNA_ENUMS).map(([group, keys]) => [group, {
      type: 'object', additionalProperties: false, required: Object.keys(keys),
      properties: Object.fromEntries(Object.entries(keys).map(([key, values]) => [key, enumSchema(PLANNER_BY_FIELD[`${group}.${key}`] ?? values)])),
    }])) as { [G in keyof Enums]: { type: 'object'; additionalProperties: false; required: string[]; properties: { [K in keyof Enums[G]]: { type: 'string'; enum: string[] } } } },
    motifs: { type: 'array', maxItems: MAX_MOTIFS, items: {
      type: 'object', additionalProperties: false, required: ['for', 'target', 'meaning', 'behavior', 'trigger', 'placement'],
      properties: {
        for: enumSchema(SOURCE_DNA_MOTIF_ENUMS.for), target: { type: 'string', minLength: 1, maxLength: MOTIF_LIMITS.target }, meaning: { type: 'string', minLength: 1, maxLength: MOTIF_LIMITS.meaning },
        behavior: enumSchema(SOURCE_DNA_MOTIF_ENUMS.behavior), trigger: enumSchema(SOURCE_DNA_MOTIF_ENUMS.trigger), placement: enumSchema(SOURCE_DNA_MOTIF_ENUMS.placement),
      },
    } },
    signature: { type: 'string', maxLength: MAX_SIGNATURE },
    // Guarded CSS for the product page's cosmetic parts; sanitized in product-theme-css.ts. Empty when the concept has none.
    productCss: { type: 'string', maxLength: PRODUCT_CSS_CONCEPT_MAX },
  },
};

export const SOURCE_DNA_DIRECTION = `For each concept also commit to dna, the store's design DNA: form, behaviour and placement, never colours (colours stay in the CSS tokens). Choose values that express this concept, not safe defaults. type.display and type.text name the self-hosted fonts; buttons.form, hover and press set how every button looks and reacts; surfaces choose the cart (drawer, sheet, page or overlay), the added-to-cart moment, the product page (it overrides layout.productPage, so keep both equal), the checkout review and how catalog cards respond. motifs: up to ${MAX_MOTIFS} small illustrated elements tied to the store, a category or a product (target names it), each with its meaning, behavior, trigger and placement; use none when nothing in the brief earns one. signature: the store's one memorable moment in at most ${MAX_SIGNATURE} characters. Make the three concepts differ in buying composition and product information hierarchy. Select cart, checkout review and catalog interactions for the real buying task; do not randomize commerce controls to manufacture variety. The context's avoidRecent lists fingerprints other stores used recently, written buttons.form|surfaces.cart|surfaces.added|type.display+type.text: use these as diversity context, never as a reason to change approved typography or useful purchasing behavior.\n${productCardDirection()}\n${productCommerceDirection()}`;

/** FNV-1a into mulberry32: tiny, deterministic, and good enough to spread stores across the enums. */
function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable for a seed (the store id), different across stores: existing stores diverge without regeneration. */
export function defaultDna(seed: string): SourceDesignDna {
  const random = seededRandom(seed);
  const dna: any = { version: 1 };
  for (const { group, key, seeded } of FIELDS) (dna[group] ??= {})[key] = seeded[Math.floor(random() * seeded.length)];
  return { ...dna, motifs: [], signature: '', productCss: '' };
}

const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const shown = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

/** Repairs rather than rejects: each invalid enum takes the seeded default for that field and is reported,
 * so a bad DNA never costs a paid repair. */
export function normalizeDna(raw: unknown, seed: string): { dna: SourceDesignDna; repairs: string[] } {
  const dna = defaultDna(seed) as any;
  if (!isObject(raw)) return { dna, repairs: ['dna: missing, used the seeded default'] };
  const repairs: string[] = [];
  if (raw.version !== 1) repairs.push(`dna.version: invalid ${shown(raw.version)}, used 1`);
  for (const { group, key, values } of FIELDS) {
    // A design saved before the product card existed has no such group: it renders as it always did, silently.
    if (group === 'productCard' && raw.productCard === undefined) continue;
    const value = raw[group]?.[key];
    if (values.includes(value)) dna[group][key] = value;
    else repairs.push(`dna.${group}.${key}: invalid ${shown(value)}, used the default`);
  }
  if (raw.productCss !== undefined) {
    if (typeof raw.productCss !== 'string') repairs.push('dna.productCss: not text, dropped');
    else {
      // The sanitizer is idempotent, so a stored design that already carries sanitized CSS comes back unchanged.
      const themed = sanitizeProductThemeCss(raw.productCss);
      dna.productCss = themed.css;
      for (const item of themed.dropped) repairs.push(`dna.productCss: ${item.reason}${item.declaration ? ` (${item.declaration})` : item.rule ? ` (${item.rule})` : ''}`);
    }
  }
  if (raw.motifs !== undefined && !Array.isArray(raw.motifs)) repairs.push('dna.motifs: not a list, dropped');
  const motifs = (Array.isArray(raw.motifs) ? raw.motifs : []).flatMap((motif: unknown, index: number) => {
    const valid = isObject(motif) && (Object.keys(SOURCE_DNA_MOTIF_ENUMS) as Array<keyof MotifEnums>).every(key => (SOURCE_DNA_MOTIF_ENUMS[key] as readonly string[]).includes(motif[key]))
      && (['target', 'meaning'] as const).every(key => typeof motif[key] === 'string' && motif[key].trim());
    if (!valid) { repairs.push(`dna.motifs[${index}]: invalid, dropped`); return []; }
    const text = (key: keyof typeof MOTIF_LIMITS) => { const value = motif[key].trim(); if (value.length > MOTIF_LIMITS[key]) repairs.push(`dna.motifs[${index}].${key}: cut to ${MOTIF_LIMITS[key]}`); return value.slice(0, MOTIF_LIMITS[key]); };
    return [{ for: motif.for, target: text('target'), meaning: text('meaning'), behavior: motif.behavior, trigger: motif.trigger, placement: motif.placement }];
  });
  if (motifs.length > MAX_MOTIFS) repairs.push(`dna.motifs: kept the first ${MAX_MOTIFS} of ${motifs.length}`);
  dna.motifs = motifs.slice(0, MAX_MOTIFS);
  if (typeof raw.signature !== 'string') { if (raw.signature !== undefined) repairs.push('dna.signature: not text, dropped'); }
  else {
    if (raw.signature.trim().length > MAX_SIGNATURE) repairs.push(`dna.signature: cut to ${MAX_SIGNATURE}`);
    dna.signature = raw.signature.trim().slice(0, MAX_SIGNATURE);
  }
  return { dna, repairs };
}

/** What sub-project 4 compares across stores: the choices a shopper notices first. */
export function dnaFingerprint(dna: SourceDesignDna): string {
  return `${dna.buttons.form}|${dna.surfaces.cart}|${dna.surfaces.added}|${dna.type.display}+${dna.type.text}`;
}

// The type pairing is never mutated: the concept's typography prose names its fonts.
const MUTABLE_FINGERPRINT_FIELDS = [['buttons', 'form'], ['surfaces', 'cart'], ['surfaces', 'added']] as const;
/** Offsets by distance, nearest first: +1, -1, +2, -2 … (indices wrap). */
const nearestOffsets = (size: number) => Array.from({ length: size - 1 }, (_, i) => (i % 2 ? -1 : 1) * (Math.floor(i / 2) + 1));

/** Cross-store memory, applied after planning: when the chosen DNA repeats a recent store's fingerprint, move two
 * of button form, cart and added (a seeded pair order) to the nearest values whose fingerprint is free. Deterministic
 * for a seed; no paid call. A free fingerprint returns the same object. */
export function avoidTakenFingerprint(dna: SourceDesignDna, taken: readonly string[], seed: string): { dna: SourceDesignDna; repair?: string } {
  const takenSet = new Set(taken);
  const original = dnaFingerprint(dna);
  if (!takenSet.has(original)) return { dna };
  const random = seededRandom(seed);
  const order = MUTABLE_FINGERPRINT_FIELDS.map(field => ({ field, rank: random() })).sort((a, b) => a.rank - b.rank).map(entry => entry.field);
  // Spec §2.6: the nudge only moves a freshly planned DNA (already schema-validated, so never carrying a
  // not-yet-seeded value) to another seeded value — never onto a T2b form/frame ahead of T4.
  const valuesOf = ([group, key]: typeof order[number]) => SEEDED_BY_FIELD[`${group}.${key}`];
  const valueOf = (value: SourceDesignDna, [group, key]: typeof order[number]) => (value[group] as Record<string, string>)[key];
  for (const [first, second] of [[order[0], order[1]], [order[0], order[2]], [order[1], order[2]]]) {
    const firstValues = valuesOf(first), secondValues = valuesOf(second);
    const moves = nearestOffsets(firstValues.length).flatMap(a => nearestOffsets(secondValues.length).map(b => ({ a, b })))
      .sort((x, y) => Math.abs(x.a) + Math.abs(x.b) - (Math.abs(y.a) + Math.abs(y.b)));
    for (const { a, b } of moves) {
      const next = structuredClone(dna);
      const move = (field: typeof order[number], values: readonly string[], offset: number) => {
        (next[field[0]] as Record<string, string>)[field[1]] = values[(((values.indexOf(valueOf(dna, field)) + offset) % values.length) + values.length) % values.length];
      };
      move(first, firstValues, a);
      move(second, secondValues, b);
      if (takenSet.has(dnaFingerprint(next))) continue;
      const changes = [first, second].map(field => `${field.join('.')} ${valueOf(dna, field)}→${valueOf(next, field)}`).join(', ');
      return { dna: next, repair: `dna: fingerprint ${original} was used by a recent store; ${changes}` };
    }
  }
  return { dna };
}

/** The config.js form: enums only, flat, no motifs or signature prose. */
export function dnaRuntimeConfig(dna: SourceDesignDna): SourceRuntimeDna {
  return { version: 1, ...Object.fromEntries(FIELDS.map(({ group, key, name }) => [name, (dna as any)[group][key]])), ...(dna.productCss ? { productCss: dna.productCss } : {}) };
}

/** The store's runtime DNA, seeded when the design has none; product always equals the productPageStyle the kit reads. */
export function sourceRuntimeDna(dna: SourceDesignDna | undefined, seed: string, productPageStyle?: unknown): SourceRuntimeDna {
  const runtime = dnaRuntimeConfig(dna ?? defaultDna(seed));
  return SOURCE_PRODUCT_PAGE_STYLES.includes(productPageStyle as SourceProductPageStyle) ? { ...runtime, product: productPageStyle as SourceProductPageStyle } : runtime;
}

const CONFIG_PATTERN = /^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/;
/** A stored snapshot made runnable (published site, studio preview, design job, visual review) gets the same DNA:
 * a config.js without one is seeded by the store id. New objects only (files may be shared by caches);
 * an unreadable config is left as-is. */
export function withSeededDna<F extends { path: string; content: string }>(files: F[], storeId: string): F[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    try {
      const config = JSON.parse(file.content.match(CONFIG_PATTERN)?.[1] ?? '');
      if (!config || typeof config !== 'object' || (config.dna && typeof config.dna === 'object')) return file;
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, dna: sourceRuntimeDna(undefined, storeId, config.productPageStyle) })};` };
    } catch { return file; }
  });
}
