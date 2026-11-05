import { applyPageOps, extraPageFile, extraPageSlug, withExtraPages, EXTRA_PAGE_MARK } from './source-extra-pages';
import type { LayoutOp } from './source-layout-edit';
import { readMasterState, templateStoreDataFile } from './source-templates';

/** YAPI creates anything (spec 2026-11-05): the pages the merchant asks for beyond the four menu pages. */
const files = [{ path: 'components/pages/about.tsx', content: '' }, { path: 'components/catalog/productos.tsx', content: '' }, { path: 'components/pages/mi-pagina.tsx', content: 'export default function X() {}' }];

it('makes a slug from the name, never an existing page', () => {
  expect(extraPageSlug('Novias & Noche', files, [])).toBe('novias-noche');
  expect(extraPageSlug('Productos', files, [])).toBe('productos-2');
  expect(extraPageSlug('Nosotros', files, [])).toBe('nosotros-2');
  expect(extraPageSlug('Mi página', files, [])).toBe('mi-pagina-2');
  expect(extraPageSlug('Novias', files, [{ slug: 'novias', name: 'Novias', menu: '', layout: [] }])).toBe('novias-2');
  expect(extraPageSlug('¡!', files, [])).toBeNull();
});

it('writes one marked file per page and removes only its own', () => {
  const page = { slug: 'novias', name: 'Novias', menu: '', layout: [] };
  const out = withExtraPages([...files, { path: 'components/pages/viejo.tsx', content: `${EXTRA_PAGE_MARK}\n` }], [page]);
  expect(out.find(f => f.path === 'components/pages/novias.tsx')!.content).toContain('data-lb-page="novias"');
  expect(out.some(f => f.path === 'components/pages/viejo.tsx')).toBe(false);
  expect(out.find(f => f.path === 'components/pages/mi-pagina.tsx')!.content).toBe('export default function X() {}');
  expect(extraPageFile(page).content.startsWith(EXTRA_PAGE_MARK)).toBe(true);
  // A page file the store's own design wrote at that path is never replaced.
  const own = withExtraPages([{ path: 'components/pages/novias.tsx', content: 'mine' }], [page]);
  expect(own).toEqual([{ path: 'components/pages/novias.tsx', content: 'mine' }]);
});

it('store-data carries extraPages', () => {
  const file = templateStoreDataFile({ name: 'x' }, {}, { copy: {} as never, look: { palette: 'mono', fonts: 'zancada' } as never, extraPages: [{ slug: 'novias', name: 'Novias', menu: '', layout: [] }] } as never);
  expect(readMasterState([file]).extraPages).toEqual([{ slug: 'novias', name: 'Novias', menu: '', layout: [] }]);
  expect(readMasterState([templateStoreDataFile({ name: 'x' }, {}, { copy: {} as never, look: { palette: 'mono', fonts: 'zancada' } as never } as never)]).extraPages).toEqual([]);
});

const pageOp = (over: Partial<LayoutOp>) => ({ op: 'page-add', at: -1, field: '', item: -1, value: '', to: -1, type: '', page: 'home', ...over }) as LayoutOp;
it('adds a page and points «nueva» ops at it', () => {
  const out = applyPageOps([], [pageOp({ value: 'Novias', field: 'colecciones' }), pageOp({ op: 'add', type: 'cover-split', page: 'nueva' })], [], ['Colecciones']);
  expect(out.pages).toEqual([{ slug: 'novias', name: 'Novias', menu: 'Colecciones', layout: [] }]);
  expect(out.ops[1].page).toBe('novias');
  expect(out.created).toBe('novias');
  expect(out.done[0]).toContain('creé la página «Novias»');
  // «nueva» ops without a page-add are dropped.
  expect(applyPageOps([], [pageOp({ op: 'add', type: 'cover-split', page: 'nueva' })], [], []).ops).toEqual([]);
});
it('renames, relinks and removes; refuses unknown pages, the seventh page and menu pages', () => {
  const pages = [{ slug: 'novias', name: 'Novias', menu: '', layout: [] }];
  expect(applyPageOps(pages, [pageOp({ op: 'page-rename', page: 'novias', value: 'Novias 2027' })], [], []).pages[0].name).toBe('Novias 2027');
  expect(applyPageOps(pages, [pageOp({ op: 'page-link', page: 'novias', field: 'Colecciones' })], [], ['Colecciones']).pages[0].menu).toBe('Colecciones');
  expect(applyPageOps(pages, [pageOp({ op: 'page-remove', page: 'novias' })], [], []).pages).toEqual([]);
  expect(applyPageOps(pages, [pageOp({ op: 'page-remove', page: 'about' })], [], []).refused[0]).toMatch(/no es una página que yo haya creado/);
  const six = Array.from({ length: 6 }, (_, n) => ({ slug: `p${n}`, name: `P${n}`, menu: '', layout: [] }));
  expect(applyPageOps(six, [pageOp({ value: 'Otra' })], [], []).refused[0]).toMatch(/ya tiene 6 páginas/);
});
