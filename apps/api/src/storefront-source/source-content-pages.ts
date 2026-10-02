import { STOREFRONT_PAGES } from '@pagosya/shared-types';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/** The information pages every store applied from a template gets (spec 2026-09-30-store-content-pages-design). Each is
 * a thin file: the template's Shell around a kit InfoPage whose content the storefront runtime fills from the live store. */
const PAGES = STOREFRONT_PAGES.filter(page => page.kind).map(page => ({ group: page.key.split('/')[0], file: page.key.split('/')[1], component: page.key.split('/')[1].replace(/(^|-)([a-z])/g, (_, dash, c) => c.toUpperCase()), kind: page.kind }));

export const CONTENT_PAGE_FILES: SourceProjectFileDto[] = PAGES.map(({ group, file, component, kind }) => ({
  path: `components/${group}/${file}.tsx`,
  content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { InfoPage } from '@pagosya/ui';\nexport default function ${component}() { return <Shell><InfoPage kind="${kind}" /></Shell>; }\n`,
}));

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
