/* Template quick edits (spec docs/superpowers/specs/2026-11-01-template-quick-edits.md §5): what a shopper would see change between
 * two saved versions of a store, so YAPI never says «Listo» over a change nothing draws (goodProtein #12: a headline written to a
 * field the template home never reads, a section component nothing mounts, a palette the theme ignores). Pure and conservative:
 * when it cannot tell, it counts the change as visible. */
import { readMasterState } from './source-templates';
import { MASTER_THEME_END, MASTER_THEME_START } from './source-master';
import { readConfigFile } from './store-look';

type File = { path: string; content: string; encoding?: 'utf8' | 'base64' };
export type VisibleChange = 'home' | 'chrome' | 'pages' | 'productPage' | 'variants' | 'settings' | 'colours' | 'styles' | 'components';
/** What the information pages and the footer read from config.js `data` (spec 2026-11-03 E2): set on purpose, never by a refresh alone. */
const PAGE_FIELDS = ['aboutText', 'tagline', 'contactPhone', 'contactEmail', 'policies', 'faq', 'links'] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const text = (files: readonly File[], path: string) => files.find(file => file.path === path)?.content ?? '';
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isComponent = (file: File) => file.encoding !== 'base64' && /^(components|pages)\/.+\.tsx$/.test(file.path) && file.path !== 'components/store-data.tsx';

/** Top-level declarations by name, each with its text up to the next one. */
function declarations(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const heads = [...source.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)];
  heads.forEach((head, at) => out.set(head[1], source.slice(head.index, heads[at + 1]?.index ?? source.length)));
  return out;
}
// A section map (`'faq-split': FaqSplit, …`): which section type draws with which component.
const mapPairs = (source: string) => new Map([...source.matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*([A-Z][\w$]*)\b/g)].map(match => [match[1], match[2]]));
const isMap = (source: string) => mapPairs(source).size >= 2;

function themeVars(css: string): { vars: Record<string, string>; rest: string } {
  const start = css.indexOf(MASTER_THEME_START);
  const end = css.indexOf(MASTER_THEME_END);
  if (start < 0 || end < start) return { vars: {}, rest: css };
  const block = css.slice(start, end);
  return { vars: Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map(match => [match[1], match[2].trim()])), rest: css.slice(0, start) + css.slice(end + MASTER_THEME_END.length) };
}
function rules(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    out.set(selector, `${out.get(selector) ?? ''}${match[2].trim()}`);
  }
  return out;
}

export function visibleChanges(before: readonly File[], after: readonly File[]): VisibleChange[] {
  const out = new Set<VisibleChange>();
  const was = readMasterState(before);
  const now = readMasterState(after);
  // Store data: a template home draws its layout only; a classic home draws the copy, sections, features and photos.
  if (!same(was.layout, now.layout)) out.add('home');
  if (!now.layout.length && (!same(was.copy, now.copy) || !same(was.sections, now.sections) || !same(was.features, now.features))) out.add('home');
  // Spec 2026-11-03 E1: every Shell draws the announcement and the footer line, template home or not.
  const chrome = (copy: unknown) => { const words = (copy ?? {}) as { announcement?: unknown; tagline?: unknown }; return [words.announcement ?? '', words.tagline ?? '']; };
  if (!same(chrome(was.copy), chrome(now.copy))) out.add('chrome');
  // The store's photos show on any home (a column footer draws the hero photo, a video cover the hero video).
  if (!same(was.photos, now.photos)) out.add('home');
  if (!same(was.productLayout, now.productLayout)) out.add('productPage');
  if (!same(was.variants, now.variants)) out.add('variants');
  // Settings the storefront reads from config.js; `data` is the catalogue every save refreshes.
  const { data: wasData, ...wasConfig } = readConfigFile(before);
  const { data: nowData, ...nowConfig } = readConfigFile(after);
  if (!same(wasConfig, nowConfig)) out.add('settings');
  // Spec 2026-11-03 E2: a policy or the about text YAPI wrote reaches the store's data, not its files; the catalogue stays out.
  const pageData = (data: unknown) => PAGE_FIELDS.map(field => ((data ?? {}) as Record<string, unknown>)[field] ?? null);
  if (!same(pageData(wasData), pageData(nowData))) out.add('pages');

  const types = new Set([...now.layout, ...now.productLayout].map(block => String((block as { type?: unknown })?.type ?? '')));
  // Components: a changed declaration is drawn; a new one only when something drawn uses it (or a section on the page, by its type).
  const oldDecls = new Map<string, string>();
  for (const file of before.filter(isComponent)) for (const [name, body] of declarations(file.content)) oldDecls.set(`${file.path}#${name}`, body);
  const allDecls = after.filter(isComponent).flatMap(file => [...declarations(file.content)].map(([name, body]) => ({ key: `${file.path}#${name}`, name, body })));
  const newDecls = new Map(allDecls.filter(decl => !oldDecls.has(decl.key)).map(decl => [decl.key, decl]));
  let components = false;
  for (const decl of allDecls) {
    const old = oldDecls.get(decl.key);
    if (old === undefined || old === decl.body) continue;
    // A section map changed: only a section on the page drawing with another component shows.
    if (isMap(decl.body) || isMap(old)) { const [was, is] = [mapPairs(old), mapPairs(decl.body)]; if ([...types].some(type => was.get(type) !== is.get(type))) components = true; }
    else components = true;
  }
  const kept = new Set(allDecls.map(decl => decl.key));
  if ([...oldDecls.keys()].some(key => !kept.has(key) && after.some(file => file.path === key.split('#')[0]))) components = true;
  const drawn = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const [key, { name }] of newDecls) {
      if (drawn.has(key)) continue;
      const used = allDecls.some(decl => decl.key !== key && new RegExp(`\\b${escape(name)}\\b`).test(decl.body) && (isMap(decl.body)
        ? [...mapPairs(decl.body)].some(([type, component]) => component === name && types.has(type))
        : !newDecls.has(decl.key) || drawn.has(decl.key)));
      if (used) { drawn.add(key); grew = true; }
    }
  }
  if (drawn.size) components = true;
  if (components) out.add('components');

  // Styles: a colour or font variable shows when the page paints with it; a new rule only when something drawn uses its classes.
  const [wasCss, nowCss] = [themeVars(text(before, 'styles/globals.css')), themeVars(text(after, 'styles/globals.css'))];
  const unseen = [...newDecls].filter(([key]) => !drawn.has(key)).map(([, decl]) => decl.body);
  const drawnSource = after.filter(isComponent).map(file => unseen.reduce((source, body) => source.replace(body, ''), file.content)).join('\n');
  const painted = `${nowCss.rest}\n${drawnSource}`;
  const changedVars = Object.keys({ ...wasCss.vars, ...nowCss.vars }).filter(name => wasCss.vars[name] !== nowCss.vars[name]);
  if (changedVars.some(name => painted.includes(`var(${name}`))) out.add('colours');
  const [wasRules, nowRules] = [rules(wasCss.rest), rules(nowCss.rest)];
  const restyled = [...nowRules].some(([selector, body]) => {
    if (wasRules.has(selector)) return wasRules.get(selector) !== body;
    const classes = [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]);
    return !classes.length || classes.some(name => new RegExp(`\\b${escape(name)}\\b`).test(drawnSource));
  }) || [...wasRules.keys()].some(selector => !nowRules.has(selector));
  if (restyled) out.add('styles');
  return (['home', 'chrome', 'pages', 'productPage', 'variants', 'settings', 'colours', 'styles', 'components'] as const).filter(change => out.has(change));
}
