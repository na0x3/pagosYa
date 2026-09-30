import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/** The information pages every store applied from a template gets (spec 2026-09-30-store-content-pages-design). Each is
 * a thin file: the template's Shell around a kit InfoPage whose content the storefront runtime fills from the live store. */
const PAGES: Array<{ file: string; component: string; kind: string }> = [
  { file: 'about', component: 'About', kind: 'about' }, { file: 'contact', component: 'Contact', kind: 'contact' },
  { file: 'shipping', component: 'Shipping', kind: 'shipping' }, { file: 'faq', component: 'Faq', kind: 'faq' },
  { file: 'refund-policy', component: 'RefundPolicy', kind: 'refund' }, { file: 'privacy', component: 'Privacy', kind: 'privacy' },
  { file: 'terms', component: 'Terms', kind: 'terms' }, { file: 'cookies', component: 'Cookies', kind: 'cookies' },
  { file: 'not-found', component: 'NotFound', kind: 'notfound' },
];

export const CONTENT_PAGE_FILES: SourceProjectFileDto[] = PAGES.map(({ file, component, kind }) => ({
  path: `components/pages/${file}.tsx`,
  content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { InfoPage } from '@pagosya/ui';\nexport default function ${component}() { return <Shell><InfoPage kind="${kind}" /></Shell>; }\n`,
}));

/** The pages to add to a template's source: none when it has no Shell to host them, and never one the template ships itself. */
export function contentPagesFor(source: ReadonlyArray<{ path: string }>): SourceProjectFileDto[] {
  if (!source.some(file => file.path === 'components/Shell.tsx')) return [];
  return CONTENT_PAGE_FILES.filter(page => !source.some(file => file.path === page.path));
}
