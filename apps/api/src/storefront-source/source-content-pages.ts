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

/** The customer-access and account pages (spec 2026-09-30-store-account-page-files-design). Each is a gate: the template's Shell
 * around a kit AccountGatePage whose button opens the real form on the trusted checkout origin. No input is ever drawn here. */
const ACCOUNT_PAGES: Array<{ group: 'auth' | 'account'; file: string; component: string; view: string }> = [
  { group: 'auth', file: 'login', component: 'Login', view: 'login' }, { group: 'auth', file: 'register', component: 'Register', view: 'register' },
  { group: 'auth', file: 'forgot-password', component: 'ForgotPassword', view: 'forgot-password' }, { group: 'auth', file: 'reset-password', component: 'ResetPassword', view: 'reset-password' },
  { group: 'account', file: 'orders', component: 'Orders', view: 'orders' }, { group: 'account', file: 'addresses', component: 'Addresses', view: 'addresses' },
  { group: 'account', file: 'profile', component: 'Profile', view: 'profile' }, { group: 'account', file: 'subscriptions', component: 'Subscriptions', view: 'subscriptions' },
];

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
