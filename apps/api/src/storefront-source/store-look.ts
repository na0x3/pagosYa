/** One look per store (spec 2026-10-14), layer A: what a store's own home page does, kept as a small clamped record that
 * the kit maps onto its product page, catalog, cards and cart (commerce.js, data-look-*). Pure: the browser reading
 * comes from store-look-measure.ts. Colours are deliberately absent: they stay the store's --store-* tokens. */
export const LOOK_TREATMENTS = ['natural', 'mono', 'duotone', 'sepia', 'grain', 'polaroid', 'tight'] as const;
export const LOOK_EDGES = ['none', 'hairline', 'outline', 'offset', 'soft'] as const;
export const LOOK_ASPECTS = ['square', 'portrait', 'landscape', 'free'] as const;
export const LOOK_SURFACES = ['flat', 'tinted', 'banded'] as const;
export type LookTreatment = (typeof LOOK_TREATMENTS)[number];
export type LookEdge = (typeof LOOK_EDGES)[number];
export type LookAspect = (typeof LOOK_ASPECTS)[number];
export type LookSurface = (typeof LOOK_SURFACES)[number];
export type LookRadius = number | 'pill';
export type PhotoRadius = LookRadius | 'arch';
export type LookHeading = { family?: string; weight?: number; case?: 'none' | 'upper'; tracking?: number; italic?: boolean };
export type LookLabel = { case: 'upper'; tracking?: number; weight?: number };
export type StoreLook = {
  version: 1;
  type?: { heading?: LookHeading; label?: LookLabel };
  shape?: { photo?: PhotoRadius; card?: LookRadius; button?: LookRadius };
  edge?: LookEdge;
  photo?: { treatment?: LookTreatment; aspect?: LookAspect; tilt?: number };
  surface?: LookSurface;
};

/** What readLookInPage measured in the browser (store-look-measure.ts). Lengths in CSS px. */
export type LookShadow = { x: number; y: number; blur: number; spread: number; inset: boolean };
export type LookBox = { width: number; height: number; radii: [number, number, number, number]; borderWidth: number; shadows: LookShadow[] };
export type LookPhoto = LookBox & { grayscale: number; sepia: number; blend: string; overlay: boolean; padding: number; lightBacking: boolean; rotate: number };
export type LookReading = {
  heading: { families: string[]; weight: number; transform: string; literalUpper: boolean; letterSpacing: number; fontSize: number; italic: boolean } | null;
  loadedFamilies: string[];
  labels: Array<{ letterSpacing: number; fontSize: number; weight: number }>;
  photos: LookPhoto[];
  cards: LookBox[];
  buttons: LookBox[];
  sections: Array<{ luminance: number; background: string }>;
  pageLuminance: number;
};

/** The round-2 draw's photo treatments (design-engine/frame-draw.ts, saved as `photos` in frame-draw.json). */
export const DRAW_TREATMENTS: Record<string, LookTreatment> = {
  natural: 'natural', 'black-white': 'mono', duotone: 'duotone', 'film-grain': 'grain', 'framed-polaroid': 'polaroid', 'tight-crops': 'tight', 'one-per-screen': 'natural',
};

const FAMILY = /^[\p{L}\p{N} '-]{1,60}$/u;
const round = (value: number, step = 1) => Math.round(value / step) * step;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
/** The value at least 60% of the readings share; undefined when the page disagrees with itself or says too little. */
function majority<T>(values: T[], min = 2): T | undefined {
  if (values.length < min) return undefined;
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return count / values.length >= 0.6 ? value : undefined;
}
function radiusOf(box: LookBox, allowArch: boolean): PhotoRadius {
  const [tl, tr, br, bl] = box.radii;
  const half = Math.min(box.width, box.height) / 2;
  if (allowArch && Math.min(tl, tr) >= box.width * 0.4 && Math.max(br, bl) <= 16) return 'arch';
  if (half > 0 && Math.min(tl, tr, br, bl) >= half - 1) return 'pill';
  return clamp(round(median([tl, tr, br, bl])), 0, 48);
}
function shapeOf(boxes: LookBox[], allowArch: boolean, min: number): PhotoRadius | undefined {
  if (boxes.length < min) return undefined;
  const shapes = boxes.map(box => radiusOf(box, allowArch));
  const kind = majority(shapes.map(shape => typeof shape === 'number' ? 'n' : shape), min);
  if (kind === 'pill' || kind === 'arch') return kind;
  if (kind !== 'n') return undefined;
  const numbers = shapes.filter((shape): shape is number => typeof shape === 'number');
  const mid = median(numbers);
  return numbers.filter(n => Math.abs(n - mid) <= 4).length / numbers.length >= 0.6 ? round(mid) : undefined;
}
function edgeOf(box: LookBox): LookEdge {
  const outer = box.shadows.filter(shadow => !shadow.inset);
  if (outer.some(s => s.blur === 0 && Math.max(Math.abs(s.x), Math.abs(s.y)) >= 2)) return 'offset';
  if (outer.some(s => s.blur > 0)) return 'soft';
  if (box.borderWidth >= 2 || outer.some(s => s.blur === 0 && s.spread >= 2)) return 'outline';
  if (box.borderWidth >= 0.5 || outer.some(s => s.blur === 0 && s.spread >= 0.5)) return 'hairline';
  return 'none';
}
function treatmentOf(photo: LookPhoto): LookTreatment {
  if (photo.grayscale >= 0.8 && photo.blend !== 'normal') return 'duotone';
  if (photo.grayscale >= 0.8) return 'mono';
  if (photo.sepia >= 0.5) return 'sepia';
  if (photo.overlay) return 'grain';
  if (photo.padding >= 6 && photo.lightBacking) return 'polaroid';
  return 'natural';
}
function aspectOf(photos: LookPhoto[]): LookAspect | undefined {
  if (photos.length < 2) return undefined;
  const ratios = photos.map(photo => photo.width / photo.height);
  if (Math.max(...ratios) / Math.min(...ratios) > 1.6) return 'free';
  const mid = median(ratios);
  return mid < 0.9 ? 'portrait' : mid > 1.15 ? 'landscape' : 'square';
}
function surfaceOf(reading: LookReading): LookSurface | undefined {
  if (reading.sections.length < 2) return undefined;
  const light = reading.pageLuminance > 0.5;
  if (reading.sections.some(band => light ? band.luminance < 0.2 : band.luminance > 0.8)) return 'banded';
  return new Set(reading.sections.map(band => band.background)).size >= 2 ? 'tinted' : 'flat';
}
const compact = <T extends object>(value: T): T | undefined => Object.values(value).some(v => v !== undefined) ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T : undefined;

export function lookFromReading(reading: LookReading, declared: { treatment?: string } = {}): StoreLook | undefined {
  const h = reading.heading;
  const family = h?.families.find(name => FAMILY.test(name) && reading.loadedFamilies.some(loaded => loaded.toLowerCase() === name.toLowerCase()));
  const heading = h ? compact<LookHeading>({ family, weight: clamp(round(h.weight, 100), 300, 900), case: h.transform === 'uppercase' || h.literalUpper ? 'upper' : 'none', tracking: h.fontSize ? clamp(round(h.letterSpacing / h.fontSize, 0.01), -0.05, 0.3) : undefined, italic: h.italic }) : undefined;
  const label: LookLabel | undefined = reading.labels.length >= 3 ? { case: 'upper', tracking: clamp(round(median(reading.labels.map(l => l.fontSize ? l.letterSpacing / l.fontSize : 0)), 0.01), 0, 0.3), weight: clamp(round(median(reading.labels.map(l => l.weight)), 100), 300, 900) } : undefined;
  const shape = compact({ photo: shapeOf(reading.photos, true, 3), card: shapeOf(reading.cards, false, 3) as LookRadius | undefined, button: shapeOf(reading.buttons, false, 2) as LookRadius | undefined });
  const edge = majority((reading.cards.length >= 2 ? reading.cards : reading.photos).map(edgeOf));
  const drawn = declared.treatment ? DRAW_TREATMENTS[declared.treatment] : undefined;
  const tilts = reading.photos.map(photo => Math.abs(photo.rotate)).filter(angle => angle >= 0.5);
  const photo = compact({ treatment: drawn ?? (reading.photos.length >= 2 ? majority(reading.photos.map(treatmentOf)) : undefined), aspect: aspectOf(reading.photos), tilt: tilts.length >= 2 ? clamp(round(median(tilts), 0.5), 0, 4) : undefined });
  const look: StoreLook = { version: 1 };
  const type = compact({ heading, label });
  if (type) look.type = type;
  if (shape) look.shape = shape;
  if (edge) look.edge = edge;
  if (photo) look.photo = photo;
  const surface = surfaceOf(reading);
  if (surface) look.surface = surface;
  return Object.keys(look).length > 1 ? look : undefined;
}

const inRange = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined => (list as readonly unknown[]).includes(value) ? value as T : undefined;
/** A fractional reading rounded to 3 decimals (float noise like 0.30000000000000004 gone), kept only when in range. */
const fine = (value: unknown, low: number, high: number): number | undefined => {
  if (typeof value !== 'number') return undefined;
  const rounded = Math.round(value * 1000) / 1000;
  return inRange(rounded, low, high) ? rounded : undefined;
};
const radius = (value: unknown, arch: boolean): PhotoRadius | undefined => value === 'pill' || (arch && value === 'arch') ? value as PhotoRadius : inRange(value, 0, 48) ? Math.round(value) : undefined;
/** A stored look, validated again (idempotent). Unknown keys and out-of-range values are dropped, never coerced. */
export function sanitizeLook(raw: unknown): StoreLook | undefined {
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return undefined;
  const input = raw as Record<string, any>;
  const h = input.type?.heading, l = input.type?.label;
  const heading = h && typeof h === 'object' ? compact<LookHeading>({
    family: typeof h.family === 'string' && FAMILY.test(h.family) ? h.family : undefined,
    weight: inRange(h.weight, 300, 900) ? h.weight : undefined,
    case: oneOf(['none', 'upper'] as const, h.case),
    tracking: fine(h.tracking, -0.05, 0.3),
    italic: typeof h.italic === 'boolean' ? h.italic : undefined,
  }) : undefined;
  const label = l && typeof l === 'object' && l.case === 'upper' ? { case: 'upper' as const, ...(fine(l.tracking, 0, 0.3) !== undefined ? { tracking: fine(l.tracking, 0, 0.3) } : {}), ...(inRange(l.weight, 300, 900) ? { weight: l.weight } : {}) } : undefined;
  const shape = input.shape && typeof input.shape === 'object' ? compact({ photo: radius(input.shape.photo, true), card: radius(input.shape.card, false) as LookRadius | undefined, button: radius(input.shape.button, false) as LookRadius | undefined }) : undefined;
  const photo = input.photo && typeof input.photo === 'object' ? compact({ treatment: oneOf(LOOK_TREATMENTS, input.photo.treatment), aspect: oneOf(LOOK_ASPECTS, input.photo.aspect), tilt: fine(input.photo.tilt, 0, 4) }) : undefined;
  const look: StoreLook = { version: 1 };
  const type = compact({ heading, label });
  if (type) look.type = type;
  if (shape) look.shape = shape;
  const edge = oneOf(LOOK_EDGES, input.edge);
  if (edge) look.edge = edge;
  if (photo) look.photo = photo;
  const surface = oneOf(LOOK_SURFACES, input.surface);
  if (surface) look.surface = surface;
  return Object.keys(look).length > 1 ? look : undefined;
}

const CONFIG = /^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/;
/** The parsed config.js of a file list; {} when missing or unreadable. */
export function readConfigFile(files: ReadonlyArray<{ path: string; content: string }>): Record<string, any> {
  const match = files.find(file => file.path === 'config.js')?.content.match(CONFIG);
  try { return match ? JSON.parse(match[1]) : {}; } catch { return {}; }
}
/** The file list with config.js rewritten by `patch`; every other file is returned as the same object. */
export function patchConfigFile<T extends { path: string; content: string }>(files: T[], patch: (config: Record<string, any>) => Record<string, any>): T[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    const match = file.content.match(CONFIG);
    if (!match) return file;
    try { return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(patch(JSON.parse(match[1])))};\n` }; } catch { return file; }
  });
}

/** JSON with object keys sorted at every level, so two equal looks compare equal whatever order their keys were written in. */
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  : JSON.stringify(value) ?? 'null';
/** Do two stored looks say the same thing? Both are sanitized first (unknown keys, noise and bad values gone). */
export function sameLook(a: unknown, b: unknown): boolean { return canonical(sanitizeLook(a) ?? null) === canonical(sanitizeLook(b) ?? null); }
/** Spec 2026-10-14 success criterion 2 over a set of stores: two stores with the same headline type, photo shape, edge and
 * treatment are duplicates (later store first). A store without a look has nothing to compare and is reported apart. */
export function lookUniqueness(looks: ReadonlyArray<{ slug: string; look?: unknown }>): { unique: boolean; duplicates: Array<[string, string]>; lookless: string[] } {
  const seen = new Map<string, string>();
  const duplicates: Array<[string, string]> = [], lookless: string[] = [];
  for (const { slug, look: raw } of looks) {
    const look = sanitizeLook(raw);
    if (!look) { lookless.push(slug); continue; }
    const key = canonical([look.type?.heading?.family, look.type?.heading?.weight, look.type?.heading?.case, look.shape?.photo, look.edge, look.photo?.treatment]);
    const first = seen.get(key);
    if (first) duplicates.push([slug, first]); else seen.set(key, slug);
  }
  return { unique: duplicates.length === 0, duplicates, lookless };
}
