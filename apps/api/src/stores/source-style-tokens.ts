import { BadGatewayException } from '@nestjs/common';
import postcss from 'postcss';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const SOURCE_STYLE_TOKEN_NAMES = ['background', 'foreground', 'accent', 'accent-foreground', 'surface', 'border', 'radius', 'body-font', 'heading-font'] as const;
type TokenName = typeof SOURCE_STYLE_TOKEN_NAMES[number];
export type SourceStyleTokens = Partial<Record<TokenName, { authored: string | null; resolved: string | null; source: 'confirmed' | 'authored' | 'unresolved'; path: string }>>;

/** Records base declarations, not the browser cascade. Conditional and scoped
 * rules deliberately remain unresolved; no CSS or generated JS is executed. */
function baseVariables(files: SourceProjectFileDto[], prefix: string) {
  const values = new Map<string, { value: string; path: string }>();
  for (const file of files) {
    if (file.encoding === 'base64' || !file.path.endsWith('.css')) continue;
    let sheet;
    try { sheet = postcss.parse(file.content); } catch { continue; }
    sheet.walkRules(rule => {
      if (rule.parent?.type !== 'root' || rule.selector.trim() !== ':root') return;
      rule.walkDecls(declaration => {
        if (declaration.parent !== rule || !declaration.prop.startsWith(prefix)) return;
        values.set(declaration.prop.slice(prefix.length), { value: declaration.value.trim(), path: file.path });
      });
    });
  }
  return values;
}
function literal(name: TokenName, value: string): boolean {
  if (/var\(|color-mix\(|calc\(|env\(/i.test(value)) return false;
  if (name.endsWith('font')) return /^[\w\s,'"-]+$/.test(value);
  if (name === 'radius') return /^(?:0|\d+(?:\.\d+)?(?:px|rem|em))$/.test(value);
  // Other CSS colours remain authored evidence until the browser computes them.
  return /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) || /^rgba?\([\d.,%\s/]+\)$/i.test(value);
}
export function sourceStyleTokens(files: SourceProjectFileDto[]): SourceStyleTokens {
  const authored = baseVariables(files.filter(file => file.path !== 'brand.css'), '--store-');
  const confirmed = baseVariables(files.filter(file => file.path === 'brand.css'), '--brand-');
  return Object.fromEntries(SOURCE_STYLE_TOKEN_NAMES.flatMap(name => {
    const own = authored.get(name), brand = confirmed.get(name);
    if (!own && !brand) return [];
    const reference = own?.value.match(new RegExp('^var\\(\\s*--brand-' + name + '\\s*(?:,\\s*([\\s\\S]+))?\\)$'));
    const usesBrand = Boolean(brand && (!own || reference));
    const raw = usesBrand ? brand!.value : reference ? reference[1]?.trim() || '' : own?.value || '';
    return [[name, { authored: own?.value ?? null, resolved: literal(name, raw) ? raw : null,
      source: usesBrand ? 'confirmed' : literal(name, raw) ? 'authored' : 'unresolved', path: usesBrand ? brand!.path : own?.path || brand!.path }]];
  }));
}

export const SOURCE_STYLE_TOKEN_CONTRACT = `For a new design, define this project's semantic CSS variables in a top-level :root of styles.css or styles/globals.css: ${SOURCE_STYLE_TOKEN_NAMES.map(name => '--store-' + name).join(', ')}. Choose values for this specific merchant; these are shared names, not preset values. For each value with a confirmed brand token, reference it, e.g. --store-accent:var(--brand-accent,#your-authored-fallback). Never redeclare --brand-* in authored CSS: brand.css owns the confirmed identity. Use these same --store-* values across homepage, product, cart and checkout. Define the project's own spacing and type scale once and reuse it. Local edits keep the existing variables and unrelated styling; do not migrate legacy styles during an unrelated edit. A manifest records authored base values and cannot prove computed contrast or rendered quality.`;

/** Enforce confirmed ownership only during authorized design work. Legacy local
 * edits are not forced to migrate token names or adopt a different identity. */
export function validateSourceStyleTokens(files: SourceProjectFileDto[], confirmedCss = ''): void {
  const confirmed = baseVariables([{ path: 'brand.css', content: confirmedCss }], '--brand-');
  for (const file of files) {
    if (!file.path.endsWith('.css') || file.path === 'brand.css' || file.encoding === 'base64') continue;
    let sheet;
    try { sheet = postcss.parse(file.content); } catch { continue; }
    sheet.walkDecls(declaration => {
      if (declaration.prop.startsWith('--brand-')) throw new BadGatewayException('brand.css reserva --brand-* para la identidad confirmada. Usa --store-* en los estilos del sitio.');
      const name = declaration.prop.replace(/^--store-/, '');
      if (declaration.prop.startsWith('--store-') && confirmed.has(name) && !new RegExp('^var\\(\\s*--brand-' + name + '\\s*[,)]').test(declaration.value.trim())) {
        throw new BadGatewayException(`--store-${name} debe referenciar var(--brand-${name}) para conservar la identidad confirmada.`);
      }
    });
  }
}
