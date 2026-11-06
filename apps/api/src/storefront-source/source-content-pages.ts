import { STOREFRONT_PAGES } from '@pagosya/shared-types';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import type { ExtraPage } from './source-extra-pages';

/** The information pages every store applied from a template gets (spec 2026-09-30-store-content-pages-design). Each is
 * a thin file: the template's Shell around a kit InfoPage whose content the storefront runtime fills from the live store. */
const PAGES = STOREFRONT_PAGES.filter(page => page.kind).map(page => ({ group: page.key.split('/')[0], file: page.key.split('/')[1], component: page.key.split('/')[1].replace(/(^|-)([a-z])/g, (_, dash, c) => c.toUpperCase()), kind: page.kind }));

export const CONTENT_PAGE_FILES: SourceProjectFileDto[] = PAGES.map(({ group, file, component, kind }) => ({
  path: `components/${group}/${file}.tsx`,
  content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { InfoPage } from '@pagosya/ui';\nexport default function ${component}() { return <Shell><InfoPage kind="${kind}" /></Shell>; }\n`,
}));

/** Spec 2026-11-05 (owner: «cambia nosotros a algo más bonito»): a menu page that carries the template's sections (store-data
 *  `pageLayouts`) draws them with the template's own LibraryHome, above the platform's live page (the about text, the form, the
 *  questions, shipping) — review 2026-11-05: the merchant's own about text stays on the page and stays editable. InfoPage brings the
 *  page's <main id="contenido">, so the sections are a div. With no sections it is today's page. */
export function sectionedPageFile(kind: 'about' | 'contact' | 'faq' | 'shipping'): SourceProjectFileDto {
  const page = PAGES.find(entry => entry.kind === kind && entry.group === 'pages')!;
  return {
    path: `components/${page.group}/${page.file}.tsx`,
    content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { InfoPage } from '@pagosya/ui';\nimport { LibraryHome, type LibraryBlock } from '../library';\nimport { pageLayouts } from '../store-data';\n`
      + `export default function ${page.component}() {\n  const layout = (pageLayouts.${kind} ?? []) as LibraryBlock[];\n`
      // Owner 2026-11-06 (Vórtice «Envíos»: «i just did not like he left the original block there»): YAPI's sections are the whole
      // page, like a page YAPI made; the platform's plain page (its title and data) shows only on a page without sections.
      + `  if (layout.length) return <Shell><main id="contenido" data-lb-home data-lb-page="${kind}" style={{ overflowX: 'clip' }}><LibraryHome layout={layout} /></main></Shell>;\n`
      + `  return <Shell><InfoPage kind="${kind}" /></Shell>;\n}\n`,
  };
}

/** Review 2026-11-05: a menu page YAPI may draw sections on — the platform's own page or one already drawn this way; never a page
 *  the store's own design wrote. A store without the section library has none. */
/** Owner 2026-11-06 (Lullu): the platform's plain page, only wrapped in plain <div>s (the code generator does that), is still the
 *  platform's page; any words or parts of its own make it the store's. */
function onlyWrapsPlainPage(content: string, kind: string): boolean {
  const body = /export default function \w+\(\) \{\s*return (<Shell>[\s\S]*<\/Shell>);?\s*\}\s*$/.exec(content)?.[1];
  if (!body || !/^\/\/ @pagosya-page\nimport Shell from '\.\.\/Shell';\nimport \{ InfoPage \} from '@pagosya\/ui';\nexport default/.test(content)) return false;
  return body.replace(/<div(?:\s+className="[\w\s-]*")?>|<\/div>/g, '').replace(/\s+/g, '') === `<Shell><InfoPagekind="${kind}"/></Shell>`;
}

export function sectionablePage(files: ReadonlyArray<{ path: string; content: string }>, kind: 'about' | 'contact' | 'faq' | 'shipping'): boolean {
  if (!files.some(file => file.path === 'components/library.tsx')) return false;
  const sectioned = sectionedPageFile(kind);
  const current = files.find(file => file.path === sectioned.path)?.content;
  // A page drawn from pageLayouts (any version of this file) is YAPI's own, like the platform's.
  return current === undefined || current === sectioned.content || current === CONTENT_PAGE_FILES.find(file => file.path === sectioned.path)?.content
    || (current.startsWith('// @pagosya-page\n') && current.includes(`pageLayouts.${kind}`)) || onlyWrapsPlainPage(current, kind);
}

/** The menu pages that now have sections, rewritten to draw them; only the pages `sectionablePage` allows. */
export function withSectionedPages<T extends { path: string; content: string }>(files: T[], kinds: ReadonlyArray<'about' | 'contact' | 'faq' | 'shipping'>): T[] {
  const allowed = kinds.filter(kind => sectionablePage(files, kind));
  if (!allowed.length) return files;
  const pages = new Map(allowed.map(kind => { const page = sectionedPageFile(kind); return [page.path, page.content] as const; }));
  return files.map(file => pages.has(file.path) ? { ...file, content: pages.get(file.path)! } : file);
}

type MenuKind = 'about' | 'contact' | 'faq' | 'shipping';
const MENU_KINDS: readonly MenuKind[] = ['about', 'contact', 'faq', 'shipping'];

/** Owner 2026-11-06: a refill brings every menu page YAPI drew (any earlier version of the sectioned file) to the current one;
 *  the platform's plain pages and pages the store's own design wrote stay as they are. */
export function withCurrentSectionedPages<T extends { path: string; content: string }>(files: T[]): T[] {
  if (!files.some(file => file.path === 'components/library.tsx')) return files;
  const current = new Map(MENU_KINDS.map(kind => { const page = sectionedPageFile(kind); return [page.path, { kind, content: page.content }] as const; }));
  let changed = false;
  const out = files.map(file => {
    const page = current.get(file.path);
    if (!page || file.content === page.content || !file.content.startsWith('// @pagosya-page\n') || !file.content.includes(`pageLayouts.${page.kind}`)) return file;
    changed = true;
    return { ...file, content: page.content };
  });
  return changed ? out : files;
}
const BUNDLED_IN = /\.?\/?(assets\/image-[a-f0-9]{12}\.(?:png|jpe?g|webp))/gi;

/** Minor 2026-11-05 («prueba otra plantilla» lost a built «Nosotros»): the menu pages a template switch keeps — those with sections on
 *  a page YAPI draws (library sections, so they redraw in the new template's look) — and the bundled photos they show, from the old
 *  version's files. Null when there is none. */
export function keptMenuPages<T extends { path: string; content: string }>(files: readonly T[], pageLayouts: Record<string, unknown> | undefined, extraPages: readonly ExtraPage[] = []):
  { pageLayouts: Record<string, unknown[]>; kinds: MenuKind[]; photos: T[]; extraPages?: ExtraPage[] } | null {
  const kinds = MENU_KINDS.filter(kind => Array.isArray(pageLayouts?.[kind]) && (pageLayouts![kind] as unknown[]).length && sectionablePage(files, kind));
  // The pages YAPI made go along too, with their links (spec 2026-11-05 creates anything).
  if (!kinds.length && !extraPages.length) return null;
  const kept = Object.fromEntries(kinds.map(kind => [kind, pageLayouts![kind] as unknown[]]));
  const used = new Set([...JSON.stringify([kept, extraPages]).matchAll(BUNDLED_IN)].map(match => match[1]));
  return { pageLayouts: kept, kinds, photos: files.filter(file => used.has(file.path)), ...(extraPages.length ? { extraPages: [...extraPages] } : {}) };
}

/** The customer-access and account pages (spec 2026-09-30-store-account-page-files-design). Each is a gate: the template's Shell
 * around a kit AccountGatePage whose button opens the real form on the trusted checkout origin. No input is ever drawn here. */
const ACCOUNT_PAGES = STOREFRONT_PAGES.filter(page => page.owner === 'account').map(page => ({ group: page.key.split('/')[0], file: page.key.split('/')[1], component: page.key.split('/')[1].replace(/(^|-)([a-z])/g, (_, dash, c) => c.toUpperCase()), view: page.key.split('/')[1] }));

export const ACCOUNT_PAGE_FILES: SourceProjectFileDto[] = ACCOUNT_PAGES.map(({ group, file, component, view }) => ({
  path: `components/${group}/${file}.tsx`,
  content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { AccountGatePage } from '@pagosya/ui';\nexport default function ${component}() { return <Shell><AccountGatePage view="${view}" /></Shell>; }\n`,
}));

/** Every standard page a store gets: the information and catalog pages, then the account gates. */
export const STANDARD_PAGE_FILES: SourceProjectFileDto[] = [...CONTENT_PAGE_FILES, ...ACCOUNT_PAGE_FILES];

/** The pages to add to a template's source: none when it has no Shell to host them, and never one the template ships itself. */
export function contentPagesFor(source: ReadonlyArray<{ path: string }>): SourceProjectFileDto[] {
  if (!source.some(file => file.path === 'components/Shell.tsx')) return [];
  return STANDARD_PAGE_FILES.filter(page => !source.some(file => file.path === page.path));
}

const NAV_SLOT = '<nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />';

/** The Shell with the footer nav slot inserted just before the footer's closing tag, or null when it already has one or
 * its footer cannot be found safely (no Footer component, or more than one closing tag after it). */
function withNavSlot(content: string): string | null {
  if (content.includes('data-pagosya-pages')) return null;
  const start = content.indexOf('export function Footer');
  if (start < 0) return null;
  const close = content.indexOf('</footer>', start);
  if (close < 0 || content.indexOf('</footer>', close + 1) >= 0) return null;
  const lineStart = content.lastIndexOf('\n', close) + 1;
  const before = content.slice(lineStart, close);
  return before.trim() === '' ? `${content.slice(0, lineStart)}${before}  ${NAV_SLOT}\n${content.slice(lineStart)}` : `${content.slice(0, close)}${NAV_SLOT}${content.slice(close)}`;
}

/** Adds the information, catalog and account pages, and the footer nav slot that links them, to the source of a store that already
 * exists (spec 2026-09-30-store-page-architecture-design, sub-project 6). Idempotent; a store with no Shell is left alone. */
export function withStandardPages(files: SourceProjectFileDto[]): { files: SourceProjectFileDto[]; added: string[]; slotAdded: boolean } {
  const shell = files.find(file => file.path === 'components/Shell.tsx');
  if (!shell) return { files, added: [], slotAdded: false };
  const pages = contentPagesFor(files);
  const patched = withNavSlot(shell.content);
  return { files: [...files.map(file => (file === shell && patched ? { ...file, content: patched } : file)), ...pages], added: pages.map(page => page.path), slotAdded: patched !== null };
}
