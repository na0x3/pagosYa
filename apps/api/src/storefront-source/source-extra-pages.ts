import { STOREFRONT_PAGES } from '@pagosya/shared-types';
import type { LayoutBlock } from './source-section-library';
import type { LayoutOp } from './source-layout-edit';

/** YAPI creates anything (spec 2026-11-05, owner: «yapi … create anything inside the store»): pages the merchant asks for beyond the
 *  four menu pages. Each lives in store-data `extraPages`, is drawn by its own marked page file, and is linked in the store menu
 *  where `menu` says ("" = the bar, else the label of a dropdown). */
export type ExtraPage = { slug: string; name: string; menu: string; layout: LayoutBlock[] };
export const EXTRA_PAGE_LIMIT = 6;
/** The build makes an HTML page only for files whose first line says @pagosya-page (live NOA 2026-11-05: novias.html was missing). */
export const EXTRA_PAGE_MARK = '// @pagosya-page @pagosya-extra-page';
const OLDER_MARK = '// @pagosya-extra-page';
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
  const marked = (file: T) => file.content.startsWith(EXTRA_PAGE_MARK) || file.content.startsWith(OLDER_MARK);
  // A removed page goes with what the build made from it (live NOA 2026-11-05: novias.html stayed and still opened).
  const gone = new Set(files.filter(file => marked(file) && !wanted.has(file.path)).flatMap(file => {
    const slug = /^components\/pages\/([a-z][a-z0-9-]{0,39})\.tsx$/.exec(file.path)?.[1];
    return slug ? [file.path, `${slug}.html`, `_compiled/pages/${slug}.js`] : [file.path];
  }));
  const out = files.filter(file => !gone.has(file.path)).map(file => wanted.has(file.path) && marked(file) ? { ...file, content: wanted.get(file.path)! } : file);
  for (const [path, content] of wanted) if (!out.some(file => file.path === path)) out.push({ path, content } as T);
  return out;
}

/** The page ops of one quick edit (spec 2026-11-05 creates anything): at most one new page per request, renames, relinks and
 *  removals of pages YAPI made; the «nueva» ops pointed at the new page (dropped when no page was made). `menuGroups` = the store
 *  menu's dropdown labels, where a link may go. */
export function applyPageOps(current: readonly ExtraPage[], ops: readonly LayoutOp[], files: ReadonlyArray<{ path: string }>, menuGroups: readonly string[]) {
  let pages = current.map(page => ({ ...page }));
  const done: string[] = [], refused: string[] = [];
  let created: string | undefined;
  const place = (field: string) => menuGroups.find(group => group.toLowerCase() === String(field ?? '').trim().toLowerCase()) ?? '';
  const named = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  for (const op of ops) {
    if (op.op === 'page-add') {
      const name = named(op.value);
      if (!name || created) continue;
      if (pages.length >= EXTRA_PAGE_LIMIT) { refused.push(`Tu tienda ya tiene ${EXTRA_PAGE_LIMIT} páginas extra: quita una antes de crear «${name}».`); continue; }
      const slug = extraPageSlug(name, files, pages);
      if (!slug) { refused.push(`No pude crear una página con el nombre «${name}»: dime otro nombre.`); continue; }
      const menu = place(op.field);
      pages.push({ slug, name, menu, layout: [] });
      created = slug;
      // The link is said only where it is sure (a dropdown); a full bar is said by the menu step (live 2026-11-05).
      done.push(`creé la página «${name}» (${slug}.html)${menu ? ` con su enlace dentro de «${menu}»` : ''}`);
      continue;
    }
    if (op.op !== 'page-rename' && op.op !== 'page-remove' && op.op !== 'page-link') continue;
    const page = pages.find(entry => entry.slug === op.page);
    if (!page) { refused.push('Esa no es una página que yo haya creado: las páginas del menú (Nosotros, Contacto…) se cambian, no se quitan.'); continue; }
    if (op.op === 'page-rename') {
      const name = named(op.value);
      if (name && name !== page.name) { done.push(`la página «${page.name}» ahora se llama «${name}»`); page.name = name; }
    } else if (op.op === 'page-link') {
      page.menu = place(op.field);
      done.push(page.menu ? `puse «${page.name}» dentro de «${page.menu}»` : `puse «${page.name}» en la barra del menú`);
    } else {
      pages = pages.filter(entry => entry !== page);
      done.push(`quité la página «${page.name}» y su enlace del menú`);
    }
  }
  const rewritten = ops.flatMap(op => op.page !== 'nueva' ? [op] : created ? [{ ...op, page: created }] : []);
  return { pages, ops: rewritten, done, refused, ...(created ? { created } : {}) };
}
