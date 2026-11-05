import { extraPageFile, extraPageSlug, withExtraPages, EXTRA_PAGE_MARK } from './source-extra-pages';
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
