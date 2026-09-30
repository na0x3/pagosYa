import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/** The information pages every store applied from a template gets (spec 2026-09-30-store-content-pages-design). Each is
 * a thin file: the template's Shell around a kit InfoPage whose content the storefront runtime fills from the live store. */
const PAGES: Array<{ group: 'pages' | 'catalog'; file: string; component: string; kind: string }> = [
  { group: 'pages', file: 'about', component: 'About', kind: 'about' }, { group: 'pages', file: 'contact', component: 'Contact', kind: 'contact' },
  { group: 'pages', file: 'shipping', component: 'Shipping', kind: 'shipping' }, { group: 'pages', file: 'faq', component: 'Faq', kind: 'faq' },
  { group: 'pages', file: 'refund-policy', component: 'RefundPolicy', kind: 'refund' }, { group: 'pages', file: 'privacy', component: 'Privacy', kind: 'privacy' },
  { group: 'pages', file: 'terms', component: 'Terms', kind: 'terms' }, { group: 'pages', file: 'cookies', component: 'Cookies', kind: 'cookies' },
  { group: 'pages', file: 'not-found', component: 'NotFound', kind: 'notfound' },
  { group: 'catalog', file: 'collections', component: 'Collections', kind: 'collections' }, { group: 'catalog', file: 'search', component: 'Search', kind: 'search' },
];

export const CONTENT_PAGE_FILES: SourceProjectFileDto[] = PAGES.map(({ group, file, component, kind }) => ({
  path: `components/${group}/${file}.tsx`,
  content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { InfoPage } from '@pagosya/ui';\nexport default function ${component}() { return <Shell><InfoPage kind="${kind}" /></Shell>; }\n`,
}));

/** The pages to add to a template's source: none when it has no Shell to host them, and never one the template ships itself. */
export function contentPagesFor(source: ReadonlyArray<{ path: string }>): SourceProjectFileDto[] {
  if (!source.some(file => file.path === 'components/Shell.tsx')) return [];
  return CONTENT_PAGE_FILES.filter(page => !source.some(file => file.path === page.path));
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

/** Adds the information and catalog pages, and the footer nav slot that links them, to the source of a store that already
 * exists (spec 2026-09-30-store-page-architecture-design, sub-project 6). Idempotent; a store with no Shell is left alone. */
export function withStandardPages(files: SourceProjectFileDto[]): { files: SourceProjectFileDto[]; added: string[]; slotAdded: boolean } {
  const shell = files.find(file => file.path === 'components/Shell.tsx');
  if (!shell) return { files, added: [], slotAdded: false };
  const pages = contentPagesFor(files);
  const patched = withNavSlot(shell.content);
  return { files: [...files.map(file => (file === shell && patched ? { ...file, content: patched } : file)), ...pages], added: pages.map(page => page.path), slotAdded: patched !== null };
}
