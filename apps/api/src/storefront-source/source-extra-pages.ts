import { STOREFRONT_PAGES } from '@pagosya/shared-types';
import type { LayoutBlock } from './source-section-library';

/** YAPI creates anything (spec 2026-11-05, owner: «yapi … create anything inside the store»): pages the merchant asks for beyond the
 *  four menu pages. Each lives in store-data `extraPages`, is drawn by its own marked page file, and is linked in the store menu
 *  where `menu` says ("" = the bar, else the label of a dropdown). */
export type ExtraPage = { slug: string; name: string; menu: string; layout: LayoutBlock[] };
export const EXTRA_PAGE_LIMIT = 6;
export const EXTRA_PAGE_MARK = '// @pagosya-extra-page';
const RESERVED = new Set(['index', 'producto', 'productos', 'coleccion', 'checkout', 'buscar', 'nosotros', 'contacto', 'faq', 'envios', 'nueva',
  ...STOREFRONT_PAGES.map(page => page.url.replace(/\.html$/, ''))]);

/** The page's address from its name; never a page the store already has (a clash gets -2, -3…). Null when the name has no letters. */
export function extraPageSlug(name: string, files: ReadonlyArray<{ path: string }>, pages: readonly ExtraPage[]): string | null {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+/, '').slice(0, 36).replace(/-+$/, '');
  if (!base) return null;
  const taken = (slug: string) => RESERVED.has(slug) || pages.some(page => page.slug === slug)
    || files.some(file => file.path === `${slug}.html` || new RegExp(`^components/[a-z]+/${slug}\\.tsx$`).test(file.path));
  for (let n = 1; n < 50; n++) { const slug = n === 1 ? base : `${base}-${n}`; if (!taken(slug)) return slug; }
  return null;
}

/** The page's file: the template's Shell and LibraryHome over its sections, the page name as its title unless a cover opens it. */
export function extraPageFile(page: ExtraPage): { path: string; content: string } {
  return { path: `components/pages/${page.slug}.tsx`, content: `${EXTRA_PAGE_MARK}\nimport Shell from '../Shell';\nimport { Container, Display } from '@pagosya/ui';\n`
    + `import { LibraryHome, type LibraryBlock } from '../library';\nimport { extraPages } from '../store-data';\n`
    + `export default function ExtraPage() {\n  const page = (extraPages as Array<{ slug: string; name: string; layout: LibraryBlock[] }>).find(entry => entry.slug === ${JSON.stringify(page.slug)});\n`
    + `  const layout = page?.layout ?? [];\n  const covered = /^(cover-|hero-split$)/.test(String(layout[0]?.type ?? ''));\n`
    + `  return <Shell><main id="contenido" data-lb-home data-lb-page=${JSON.stringify(page.slug)} style={{ overflowX: 'clip' }}>`
    + `{covered ? null : <Container><Display>{page?.name ?? ''}</Display></Container>}<LibraryHome layout={layout} /></main></Shell>;\n}\n` };
}

/** Each listed page's file written, the marked files of pages no longer listed removed; a file without the mark is never touched. */
export function withExtraPages<T extends { path: string; content: string }>(files: T[], pages: readonly ExtraPage[]): T[] {
  const wanted = new Map(pages.map(page => { const file = extraPageFile(page); return [file.path, file.content] as const; }));
  const marked = (file: T) => file.content.startsWith(EXTRA_PAGE_MARK);
  const out = files.filter(file => !(marked(file) && !wanted.has(file.path))).map(file => wanted.has(file.path) && marked(file) ? { ...file, content: wanted.get(file.path)! } : file);
  for (const [path, content] of wanted) if (!out.some(file => file.path === path)) out.push({ path, content } as T);
  return out;
}
