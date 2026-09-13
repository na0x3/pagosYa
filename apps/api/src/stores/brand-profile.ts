import { BadRequestException } from '@nestjs/common';

export const BRAND_FIELDS = ['positioning', 'audience', 'personality', 'voice', 'headlineExamples', 'avoid', 'logoUsage', 'typography', 'composition', 'photography', 'motion', 'background', 'foreground', 'accent', 'accentForeground', 'surface', 'headingFontUrl', 'bodyFontUrl'] as const;
export type BrandField = typeof BRAND_FIELDS[number];
export type BrandFact = { field: BrandField; value: string; evidence: string; source: string };
export type BrandProfile = { confirmed: BrandFact[]; suggested: BrandFact[] };
export const EMPTY_BRAND: BrandProfile = { confirmed: [], suggested: [] };
const colors = new Set(['background', 'foreground', 'accent', 'accentForeground', 'surface']);
export const BRAND_FONT_FIELDS = new Set(['headingFontUrl', 'bodyFontUrl']);

export function brandFacts(raw: unknown): BrandFact[] {
  if (!Array.isArray(raw) || raw.length > BRAND_FIELDS.length) throw new BadRequestException('La marca contiene demasiados campos.');
  const seen = new Set<string>();
  return raw.map(fact => {
    if (!fact || !BRAND_FIELDS.includes(fact.field) || seen.has(fact.field)
      || typeof fact.value !== 'string' || !fact.value.trim() || fact.value.length > 1200
      || typeof fact.evidence !== 'string' || fact.evidence.length > 1200
      || typeof fact.source !== 'string' || fact.source.length > 500) throw new BadRequestException('Revisa los datos y las fuentes de la marca.');
    if (colors.has(fact.field) && !/^#[a-f\d]{6}$/i.test(fact.value)) throw new BadRequestException('Usa colores en formato #RRGGBB.');
    if (BRAND_FONT_FIELDS.has(fact.field) && !/^\/v1\/uploads\/[a-f\d-]{36}\.woff2$/.test(fact.value)) throw new BadRequestException('Usa una fuente WOFF2 subida al comercio.');
    seen.add(fact.field);
    return { field: fact.field, value: fact.value.trim(), evidence: fact.evidence, source: fact.source };
  });
}

export function brandContext(data: BrandProfile): string {
  // Only confirmed rules govern generation. Imports are proposals until reviewed.
  // A different form/display order must not invalidate an otherwise identical prefix.
  const values = new Map(data.confirmed.map(f => [f.field, f.value]));
  return JSON.stringify(Object.fromEntries(BRAND_FIELDS.filter(field => values.has(field)).map(field => [field, values.get(field)])));
}

export function brandStyles(data: BrandProfile, fonts: Record<string, string> = {}): string {
  const declarations = data.confirmed.filter(f => colors.has(f.field)).map(f => `  --brand-${f.field.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}: ${f.value};`);
  const faces: string[] = [];
  for (const [field, path] of Object.entries(fonts)) {
    if (!BRAND_FONT_FIELDS.has(field) || !/^assets\/font-[a-f\d]{12}\.woff2$/.test(path)) continue;
    const role = field === 'headingFontUrl' ? 'heading' : 'body';
    faces.push(`@font-face { font-family: 'Brand ${role}'; src: url('${path}') format('woff2'); font-display: swap; }`);
    declarations.push(`  --brand-${role}-font: 'Brand ${role}', sans-serif;`);
  }
  return declarations.length ? `/* Confirmed merchant identity. Shared across every page. */\n${faces.join('\n')}\n:root {\n${declarations.join('\n')}\n}\n` : '';
}

export const BRAND_SCHEMA = { type: 'object', additionalProperties: false, required: ['facts'], properties: {
  facts: { type: 'array', maxItems: BRAND_FIELDS.length, items: { type: 'object', additionalProperties: false,
    required: ['field', 'value', 'evidence', 'source'], properties: {
      field: { type: 'string', enum: BRAND_FIELDS.filter(field => !BRAND_FONT_FIELDS.has(field)) }, value: { type: 'string' }, evidence: { type: 'string' }, source: { type: 'string' },
    } } },
} };

export function linkBrandStylesheet(html: string, path: string): string {
  const href = path.startsWith('pages/') ? '../brand.css' : 'brand.css';
  if (/href\s*=\s*["'](?:\.\.\/)?brand\.css["']/i.test(html)) return html;
  const link = `<link rel="stylesheet" href="${href}">`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, '$&\n' + link);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, '$&\n<head>' + link + '</head>');
  if (/<!doctype[^>]*>/i.test(html)) return html.replace(/<!doctype[^>]*>/i, '$&\n<head>' + link + '</head>');
  return link + '\n' + html;
}
