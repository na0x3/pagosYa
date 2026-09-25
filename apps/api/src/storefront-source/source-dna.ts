/** Design DNA (sub-project 2): the form, behaviour and placement choices that make one store unlike the next.
 * Colours are deliberately absent: the store's --store-* / --brand-* tokens stay their single source.
 * Nothing here imports source-design.ts, which imports this module (no evaluation-time cycle). */
export const SOURCE_PRODUCT_PAGE_STYLES = ['editorial', 'dense', 'image-led', 'story-led'] as const;
export type SourceProductPageStyle = typeof SOURCE_PRODUCT_PAGE_STYLES[number];
/** The self-hosted fonts in the kit; sub-project 4 widens the catalogue. */
export const SOURCE_DNA_FONTS = ['bricolage', 'fraunces', 'instrument', 'instrument-serif', 'oswald'] as const;

export const SOURCE_DNA_ENUMS = {
  type: { display: SOURCE_DNA_FONTS, text: SOURCE_DNA_FONTS, case: ['none', 'upper', 'small-caps'], tracking: ['tight', 'normal', 'wide'] },
  shape: { radius: ['none', 'soft', 'round', 'pill'], border: ['none', 'hairline', 'bold'], frame: ['bleed', 'inset', 'rounded', 'arch', 'polaroid'] },
  buttons: {
    form: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split'],
    hover: ['lift', 'fill', 'underline-grow', 'tilt', 'shine', 'invert'], press: ['squash', 'sink', 'pop', 'none'],
  },
  motion: { personality: ['calm', 'snappy', 'playful', 'cinematic'] },
  layout: { grammar: ['editorial', 'grid', 'collage', 'index', 'poster', 'magazine', 'brutalist'], density: ['airy', 'balanced', 'dense'] },
  surfaces: {
    cart: ['drawer', 'sheet', 'page', 'overlay'], added: ['toast', 'ribbon', 'bubble', 'inline', 'stamp'], product: SOURCE_PRODUCT_PAGE_STYLES,
    review: ['split', 'stacked', 'ticket', 'notebook'], card: ['still', 'second-photo', 'swatch-swap', 'zoom', 'quick-look', 'tilt'],
  },
} as const;
export const SOURCE_DNA_MOTIF_ENUMS = {
  for: ['store', 'category', 'product'], behavior: ['glow', 'draw', 'sway', 'steam', 'grow', 'bounce', 'spin', 'float'],
  trigger: ['appear', 'scroll', 'hover', 'add-to-cart', 'purchase'], placement: ['hero', 'card', 'product', 'cart', 'confirmation'],
} as const;
const MOTIF_LIMITS = { target: 60, meaning: 140 } as const;
const MAX_MOTIFS = 3;
const MAX_SIGNATURE = 160;

type Enums = typeof SOURCE_DNA_ENUMS;
type MotifEnums = typeof SOURCE_DNA_MOTIF_ENUMS;
export type SourceDnaMotif = { -readonly [K in keyof MotifEnums]: MotifEnums[K][number] } & { target: string; meaning: string };
export type SourceDesignDna = { version: 1 } & { -readonly [G in keyof Enums]: { -readonly [K in keyof Enums[G]]: Enums[G][K] extends readonly string[] ? Enums[G][K][number] : never } }
  & { motifs: SourceDnaMotif[]; signature: string };

// Runtime names are what commerce.js writes as data-dna-<name>; two read better renamed.
const RUNTIME_NAMES: Record<string, string> = { 'buttons.form': 'button', 'motion.personality': 'motion' };
const FIELDS = Object.entries(SOURCE_DNA_ENUMS).flatMap(([group, keys]) => Object.entries(keys).map(([key, values]) => (
  { group, key, name: RUNTIME_NAMES[`${group}.${key}`] ?? key, values: values as readonly string[] })));
export const SOURCE_DNA_RUNTIME_ENUMS: Record<string, readonly string[]> = Object.fromEntries(FIELDS.map(field => [field.name, field.values]));
export type SourceRuntimeDna = { version: 1 } & Record<string, string | 1>;

const enumSchema = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
/** Strict structured-output fragment: every property required, no extra keys. */
export const SOURCE_DNA_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['version', ...Object.keys(SOURCE_DNA_ENUMS), 'motifs', 'signature'],
  properties: {
    version: { type: 'integer', enum: [1] },
    ...Object.fromEntries(Object.entries(SOURCE_DNA_ENUMS).map(([group, keys]) => [group, {
      type: 'object', additionalProperties: false, required: Object.keys(keys),
      properties: Object.fromEntries(Object.entries(keys).map(([key, values]) => [key, enumSchema(values)])),
    }])) as { [G in keyof Enums]: { type: 'object'; additionalProperties: false; required: string[]; properties: { [K in keyof Enums[G]]: { type: 'string'; enum: string[] } } } },
    motifs: { type: 'array', maxItems: MAX_MOTIFS, items: {
      type: 'object', additionalProperties: false, required: ['for', 'target', 'meaning', 'behavior', 'trigger', 'placement'],
      properties: {
        for: enumSchema(SOURCE_DNA_MOTIF_ENUMS.for), target: { type: 'string', minLength: 1, maxLength: MOTIF_LIMITS.target }, meaning: { type: 'string', minLength: 1, maxLength: MOTIF_LIMITS.meaning },
        behavior: enumSchema(SOURCE_DNA_MOTIF_ENUMS.behavior), trigger: enumSchema(SOURCE_DNA_MOTIF_ENUMS.trigger), placement: enumSchema(SOURCE_DNA_MOTIF_ENUMS.placement),
      },
    } },
    signature: { type: 'string', maxLength: MAX_SIGNATURE },
  },
};

export const SOURCE_DNA_DIRECTION = `For each concept also commit to dna, the store's design DNA: form, behaviour and placement, never colours (colours stay in the CSS tokens). Choose values that express this concept, not safe defaults. type.display and type.text name the self-hosted fonts; buttons.form, hover and press set how every button looks and reacts; surfaces choose the cart (drawer, sheet, page or overlay), the added-to-cart moment, the product page (it overrides layout.productPage, so keep both equal), the checkout review and how catalog cards respond. motifs: up to ${MAX_MOTIFS} small illustrated elements tied to the store, a category or a product (target names it), each with its meaning, behavior, trigger and placement; use none when nothing in the brief earns one. signature: the store's one memorable moment in at most ${MAX_SIGNATURE} characters. Make the three concepts differ in their DNA, above all in buttons.form, surfaces.cart, surfaces.added and the type pairing.`;

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
  for (const { group, key, values } of FIELDS) (dna[group] ??= {})[key] = values[Math.floor(random() * values.length)];
  return { ...dna, motifs: [], signature: '' };
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
    const value = raw[group]?.[key];
    if (values.includes(value)) dna[group][key] = value;
    else repairs.push(`dna.${group}.${key}: invalid ${shown(value)}, used the default`);
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

/** The config.js form: enums only, flat, no motifs or signature prose. */
export function dnaRuntimeConfig(dna: SourceDesignDna): SourceRuntimeDna {
  return { version: 1, ...Object.fromEntries(FIELDS.map(({ group, key, name }) => [name, (dna as any)[group][key]])) };
}

/** The store's runtime DNA, seeded when the design has none; product always equals the productPageStyle the kit reads. */
export function sourceRuntimeDna(dna: SourceDesignDna | undefined, seed: string, productPageStyle?: unknown): SourceRuntimeDna {
  const runtime = dnaRuntimeConfig(dna ?? defaultDna(seed));
  return SOURCE_PRODUCT_PAGE_STYLES.includes(productPageStyle as SourceProductPageStyle) ? { ...runtime, product: productPageStyle as SourceProductPageStyle } : runtime;
}
