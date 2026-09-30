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
