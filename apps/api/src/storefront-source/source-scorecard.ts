/** Uniqueness and quality scorecard (sub-project 8): pure scoring over samples the browser collector gathers.
 * Free by design: no model calls, so it can run before and after every change on the same stores. */
export const SURFACE_NAMES = ['button', 'cart', 'added', 'product', 'review', 'card', 'type', 'page'] as const;
export type SurfaceName = typeof SURFACE_NAMES[number];
export type SurfaceSample = Record<string, string | number>;
export type QualityFacts = {
  shopping: 'passed' | 'failed' | 'unsupported'; shoppingError?: string;
  overflow: { desktop: boolean | null; mobile: boolean | null };
  fontsLoaded: boolean | null; missingImages: number | null; buyContrast: number | null;
};
export type StoreSample = { id: string; name: string; surfaces: Partial<Record<SurfaceName, SurfaceSample>>; quality: QualityFacts; errors: string[] };
export type Pair = { a: string; b: string; distance: number };
export type SurfaceScore = {
  measured: number; closest: Pair | null; mean: number | null; pairs: Pair[];
  fromDefault: Record<string, number>; tooCloseToStore: string[]; tooCloseToDefault: string[]; missing: string[];
};
export type Scorecard = {
  thresholds: { minPairDistance: number; minDefaultDistance: number; minBuyContrast: number };
  surfaces: Record<SurfaceName, SurfaceScore>;
  stores: Array<{ id: string; name: string; shopping: QualityFacts['shopping']; failures: string[]; tooCloseToStore: SurfaceName[]; tooCloseToDefault: SurfaceName[] }>;
  qualityFailures: number;
  kitDna: KitDnaScore;
};
export type KitDnaScore = { fields: readonly string[]; measured: number; closest: Pair | null; mean: number | null; pairs: Pair[]; shared: Record<string, Array<[string, string]>>; missing: string[] };

/** A store closer than this to another store, on one surface, reads as the same design there. */
export const MIN_PAIR_DISTANCE = 0.25;
/** A store closer than this to the kit default, on one surface, still looks like the template there. */
export const MIN_DEFAULT_DISTANCE = 0.25;
/** WCAG AA for normal text. */
export const MIN_BUY_CONTRAST = 4.5;

/** CIE L* (0..100) of a relative luminance: lightness as people see it. */
export function lightness(y: number): number {
  return y <= 216 / 24389 ? y * 24389 / 27 : 116 * Math.cbrt(y) - 16;
}

/** How a numeric fact is compared (sub-project 5 review): a difference under `step` is not visible and counts as the
 * same; above it, `full` sets an absolute perceptual range (the difference that reads as fully different), otherwise
 * the difference is relative to the larger value. Keys are matched without the phone prefix (m.). */
type Scale = { step: number; full?: number; lightness?: true };
const FACT_SCALES: Array<[RegExp, Scale]> = [
  [/tracking$/i, { step: 0.03, full: 0.15 }], // em
  [/^pad$/, { step: 4, full: 24 }], // px
  [/^bgDelta$/, { step: 3, full: 30 }], // ΔL*, 0..100
  [/bglum$/i, { step: 3, full: 40, lightness: true }], // relative luminance, compared as L*
  [/radius$/i, { step: 2 }], // px, capped at half the short side by the collector
  [/border$/i, { step: 0.5 }], // px
  [/^height$/, { step: 4 }], // px
  [/^(width|summaryShare|padRatio|aspect)$/, { step: 0.03 }], // shares and ratios
  [/^ratio$/, { step: 0.1 }], // type scale
];
const scaleOf = (key: string) => FACT_SCALES.find(([pattern]) => pattern.test(key.replace(/^m\./, '')))?.[1];

function valueDistance(key: string, a: string | number, b: string | number) {
  if (a === b) return 0;
  if (typeof a !== 'number' || typeof b !== 'number') return 1;
  if (a === -1 || b === -1) return 1; // -1: the element is not there
  const scale = scaleOf(key);
  const delta = scale?.lightness ? Math.abs(lightness(a) - lightness(b)) : Math.abs(a - b);
  if (scale && delta < scale.step) return 0;
  if (scale?.full) return Math.min(1, delta / scale.full);
  return Math.min(1, Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
}

/** 0..1: the mean over shared keys; numbers quantized to visible steps (FACT_SCALES), everything else by equality. */
export function surfaceDistance(a: SurfaceSample, b: SurfaceSample): number {
  const keys = Object.keys(a).filter(key => key in b);
  if (!keys.length) return 1;
  return keys.reduce((sum, key) => sum + valueDistance(key, a[key], b[key]), 0) / keys.length;
}

/** The DNA-driven kit variants only: button form, cart placement, added style, review layout, card mode and frame.
 * Read from the DNA the page served (page `dna.*` facts); authored styling and typefaces do not count here. */
export const KIT_DNA_FIELDS = ['button', 'cart', 'added', 'review', 'card', 'frame'] as const;
function kitDnaScore(stores: StoreSample[]): KitDnaScore {
  const dnaOf = (store: StoreSample) => { const page = store.surfaces.page ?? {}; return KIT_DNA_FIELDS.every(field => typeof page[`dna.${field}`] === 'string') ? page : null; };
  const measured = stores.filter(store => dnaOf(store));
  const pairs: Pair[] = [];
  const shared = Object.fromEntries(KIT_DNA_FIELDS.map(field => [field, [] as Array<[string, string]>]));
  for (let i = 0; i < measured.length; i++) for (let j = i + 1; j < measured.length; j++) {
    const [a, b] = [dnaOf(measured[i])!, dnaOf(measured[j])!];
    const same = KIT_DNA_FIELDS.filter(field => a[`dna.${field}`] === b[`dna.${field}`]);
    for (const field of same) shared[field].push([measured[i].id, measured[j].id]);
    pairs.push({ a: measured[i].id, b: measured[j].id, distance: 1 - same.length / KIT_DNA_FIELDS.length });
  }
  return {
    fields: KIT_DNA_FIELDS, measured: measured.length, pairs, shared,
    closest: pairs.reduce<Pair | null>((best, pair) => !best || pair.distance < best.distance ? pair : best, null),
    mean: pairs.length ? pairs.reduce((sum, pair) => sum + pair.distance, 0) / pairs.length : null,
    missing: stores.filter(store => !dnaOf(store)).map(store => store.id),
  };
}

const present = (sample: SurfaceSample | undefined): sample is SurfaceSample => !!sample && Object.keys(sample).length > 0;

export function qualityFailures(q: QualityFacts): string[] {
  const failures: string[] = [];
  if (q.shopping === 'failed') failures.push(`shopping failed${q.shoppingError ? `: ${q.shoppingError}` : ''}`);
  if (q.overflow.desktop) failures.push('overflow at 1280');
  if (q.overflow.mobile) failures.push('overflow at 390');
  if (q.fontsLoaded === false) failures.push('fonts not loaded');
  if (q.missingImages) failures.push(`${q.missingImages} missing images`);
  if (q.buyContrast === null) { if (q.shopping !== 'unsupported') failures.push('buy button not measured'); }
  else if (q.buyContrast < MIN_BUY_CONTRAST) failures.push(`buy button contrast ${q.buyContrast.toFixed(2)} < ${MIN_BUY_CONTRAST}`);
  return failures;
}

export function scoreStores(stores: StoreSample[], kitDefault: StoreSample): Scorecard {
  const surfaces = Object.fromEntries(SURFACE_NAMES.map(surface => {
    const measured = stores.filter(store => present(store.surfaces[surface]));
    const pairs: Pair[] = [];
    for (let i = 0; i < measured.length; i++) for (let j = i + 1; j < measured.length; j++) {
      pairs.push({ a: measured[i].id, b: measured[j].id, distance: surfaceDistance(measured[i].surfaces[surface]!, measured[j].surfaces[surface]!) });
    }
    const closest = pairs.reduce<Pair | null>((best, pair) => !best || pair.distance < best.distance ? pair : best, null);
    const kit = kitDefault.surfaces[surface];
    const fromDefault: Record<string, number> = present(kit) ? Object.fromEntries(measured.map(store => [store.id, surfaceDistance(store.surfaces[surface]!, kit)])) : {};
    const close = new Set(pairs.filter(pair => pair.distance < MIN_PAIR_DISTANCE).flatMap(pair => [pair.a, pair.b]));
    const score: SurfaceScore = {
      measured: measured.length, closest, pairs,
      mean: pairs.length ? pairs.reduce((sum, pair) => sum + pair.distance, 0) / pairs.length : null,
      fromDefault,
      tooCloseToStore: measured.map(store => store.id).filter(id => close.has(id)),
      tooCloseToDefault: measured.map(store => store.id).filter(id => id in fromDefault && fromDefault[id] < MIN_DEFAULT_DISTANCE),
      missing: stores.filter(store => !present(store.surfaces[surface])).map(store => store.id),
    };
    return [surface, score];
  })) as Record<SurfaceName, SurfaceScore>;
  const rows = stores.map(store => ({
    id: store.id, name: store.name, shopping: store.quality.shopping, failures: qualityFailures(store.quality),
    tooCloseToStore: SURFACE_NAMES.filter(surface => surfaces[surface].tooCloseToStore.includes(store.id)),
    tooCloseToDefault: SURFACE_NAMES.filter(surface => surfaces[surface].tooCloseToDefault.includes(store.id)),
  }));
  return {
    thresholds: { minPairDistance: MIN_PAIR_DISTANCE, minDefaultDistance: MIN_DEFAULT_DISTANCE, minBuyContrast: MIN_BUY_CONTRAST },
    surfaces, stores: rows, qualityFailures: rows.filter(row => row.failures.length).length,
    kitDna: kitDnaScore(stores),
  };
}

/** WCAG 2 relative luminance of an sRGB colour (0..255 channels). */
export function relativeLuminance([r, g, b]: readonly number[]): number {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: readonly number[], background: readonly number[]): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const fixed = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toFixed(2);
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function scorecardMarkdown(card: Scorecard, meta: { title: string; source: string; createdAt: string }): string {
  const name = new Map(card.stores.map(store => [store.id, store.name]));
  const names = (ids: string[]) => ids.length ? ids.map(id => name.get(id) ?? id).join(', ') : '—';
  const lines = [
    `# ${meta.title}`, '',
    `Created ${meta.createdAt} from ${meta.source}. ${card.stores.length} stores. No model calls.`, '',
    `Thresholds: MIN_PAIR_DISTANCE = ${card.thresholds.minPairDistance}, MIN_DEFAULT_DISTANCE = ${card.thresholds.minDefaultDistance}, MIN_BUY_CONTRAST = ${card.thresholds.minBuyContrast}.`,
    'Distance is 0 (identical) to 1 (nothing shared), the mean over the facts measured on that surface at 1280 and 390.', '',
    '## Uniqueness by surface', '',
    '| Surface | Measured | Closest pair | Distance | Mean | Too close to another store | Too close to the kit default | Missing |',
    '|---|---|---|---|---|---|---|---|',
    ...Object.entries(card.surfaces).map(([surface, score]) => `| ${surface} | ${score.measured} | ${score.closest ? cell(`${name.get(score.closest.a) ?? score.closest.a} ↔ ${name.get(score.closest.b) ?? score.closest.b}`) : '—'} | ${fixed(score.closest?.distance)} | ${fixed(score.mean)} | ${score.tooCloseToStore.length}: ${cell(names(score.tooCloseToStore))} | ${score.tooCloseToDefault.length}: ${cell(names(score.tooCloseToDefault))} | ${cell(names(score.missing))} |`),
    '', '## Kit DNA only', '',
    `Distance over the DNA-driven kit variants only (${card.kitDna.fields.join(', ')}): the share of them two stores do not have in common. Authored styling, typefaces and measured sizes do not count.`, '',
    `Measured: ${card.kitDna.measured}. Closest pair: ${card.kitDna.closest ? `${cell(`${name.get(card.kitDna.closest.a) ?? card.kitDna.closest.a} ↔ ${name.get(card.kitDna.closest.b) ?? card.kitDna.closest.b}`)} at ${fixed(card.kitDna.closest.distance)}` : '—'}. Mean: ${fixed(card.kitDna.mean)}.${card.kitDna.missing.length ? ` No DNA: ${cell(names(card.kitDna.missing))}.` : ''}`, '',
    '| Kit variant | Pairs that share it |', '|---|---|',
    ...card.kitDna.fields.map(field => `| ${field} | ${card.kitDna.shared[field].length}: ${cell(card.kitDna.shared[field].map(([a, b]) => `${name.get(a) ?? a} ↔ ${name.get(b) ?? b}`).join('; ') || '—')} |`),
    '', '## Quality', '',
    `${card.qualityFailures} of ${card.stores.length} stores have at least one quality failure.`, '',
    '| Store | Shopping | Failures |', '|---|---|---|',
    ...card.stores.map(store => `| ${cell(store.name)} | ${store.shopping} | ${cell(store.failures.join('; ') || '—')} |`),
    '', '## Per store', '',
    '| Store | Too close to another store on | Too close to the kit default on |', '|---|---|---|',
    ...card.stores.map(store => `| ${cell(store.name)} | ${store.tooCloseToStore.join(', ') || '—'} | ${store.tooCloseToDefault.join(', ') || '—'} |`),
  ];
  return lines.join('\n') + '\n';
}
