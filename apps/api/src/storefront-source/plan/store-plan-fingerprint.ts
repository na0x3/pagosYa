import { createHash } from 'node:crypto';

/** Spec 2026-10-22 §Uniqueness: what makes two stores look alike. Read from a plan or from a saved store-data. */
export type Fingerprint = { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accentHue: number | null };
const MIN_DISTANCE = 0.35;
const SECTION_WEIGHT = 3;
// Parts the eye does not use to tell two stores apart.
// The brand mood (home writer variety, 2026-10-30) is not a look the eye compares either.
const IGNORED = new Set(['density', 'corners', 'button', 'pdpOrder', 'texture', 'mood']);

function hue(hex: string): number | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map(v => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.floor(((h * 60 + 360) % 360) / 30);
}

export function fingerprintOf(input: { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accent?: string }): Fingerprint {
  const variants = Object.fromEntries(Object.entries(input.variants).filter(([part]) => part !== 'sections' && !IGNORED.has(part)));
  return { variants, sections: [...input.sections], palette: input.palette, fonts: input.fonts, accentHue: input.accent ? hue(input.accent) : null };
}

// The feature list is rolled at assembly, not by the plan: the sequence is the home's business sections (final review 2026-10-22).
const sequence = (fp: Fingerprint) => fp.sections.join('|');

function differences(a: Fingerprint, b: Fingerprint): { field: string; weight: number; same: boolean }[] {
  const parts = [...new Set([...Object.keys(a.variants), ...Object.keys(b.variants)])].filter(part => part !== 'feature');
  return [
    ...parts.map(part => ({ field: part, weight: 1, same: a.variants[part] === b.variants[part] })),
    { field: 'sections', weight: SECTION_WEIGHT, same: sequence(a) === sequence(b) },
    { field: 'palette', weight: 1, same: a.palette === b.palette },
    { field: 'fonts', weight: 1, same: a.fonts === b.fonts },
    { field: 'accent', weight: 1, same: a.accentHue !== null && a.accentHue === b.accentHue },
  ];
}

export function planDistance(a: Fingerprint, b: Fingerprint): number {
  const rows = differences(a, b);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return total ? rows.filter(row => !row.same).reduce((sum, row) => sum + row.weight, 0) / total : 1;
}

export function clashesWith(a: Fingerprint, others: Fingerprint[]): { other: Fingerprint; fields: string[] } | null {
  let worst: { other: Fingerprint; fields: string[]; distance: number } | null = null;
  for (const other of others) {
    const distance = planDistance(a, other);
    if ((distance < MIN_DISTANCE || sequence(a) === sequence(other)) && (!worst || distance < worst.distance))
      worst = { other, fields: differences(a, other).filter(row => row.same).map(row => row.field), distance };
  }
  return worst ? { other: worst.other, fields: worst.fields } : null;
}

const WORDS: Record<string, string> = { sections: 'mismo orden de secciones', hero: 'misma portada', header: 'mismo encabezado', grid: 'misma grilla de productos',
  card: 'mismas tarjetas', story: 'misma sección de historia', closing: 'mismo cierre', footer: 'mismo pie', fonts: 'misma tipografía', palette: 'misma paleta',
  accent: 'mismo color de acento', menu: 'mismo menú', values: 'misma sección de valores', photos: 'mismo tratamiento de fotos' };
export function clashWords(fields: string[]): string {
  const named = fields.map(field => WORDS[field] ?? `misma pieza «${field}»`).slice(0, 4);
  return `${named.length > 1 ? `${named.slice(0, -1).join(', ')} y ${named.at(-1)}` : named[0]} que otra tienda`;
}

/** Deterministic swaps of the clashing parts for another variant, until no store is too close. */
export function makeUnique(fp: Fingerprint, others: Fingerprint[], catalogue: Record<string, readonly string[]>, sectionCatalogue: readonly string[], seed: string, locked: readonly string[] = []) {
  let current: Fingerprint = structuredClone(fp);
  for (let round = 0; round < 12; round++) {
    const clash = clashesWith(current, others);
    if (!clash) return { fingerprint: current, exhausted: false };
    const roll = (salt: string) => createHash('sha256').update(`${seed}:${round}:${salt}`).digest().readUInt32BE(0);
    if (clash.fields.includes('sections')) {
      const unused = sectionCatalogue.filter(id => !current.sections.includes(id));
      const free = current.sections.map((id, i) => locked.includes(id) ? -1 : i).filter(i => i >= 0);
      if (unused.length) {
        const next = unused[roll('pick') % unused.length];
        const replaced = free.length ? free[roll('section') % free.length] : -1;
        current = { ...current, sections: replaced >= 0 ? current.sections.map((id, i) => i === replaced ? next : id) : [...current.sections, next].slice(-4) };
      }
    }
    for (const field of clash.fields.filter(field => catalogue[field])) {
      const options = catalogue[field].filter(id => id !== clash.other.variants[field] && id !== 'fashion');
      if (options.length) current = { ...current, variants: { ...current.variants, [field]: options[roll(field) % options.length] } };
    }
  }
  return { fingerprint: current, exhausted: Boolean(clashesWith(current, others)) };
}
