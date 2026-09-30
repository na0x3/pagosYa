import { nextContentPages, standardPageRoute } from './source-next';
import { nextStoreFiles } from './fixtures/next-store';

const file = (path: string) => ({ path, content: 'export default function P() { return null; }' });
const base = () => nextStoreFiles();
const commerce = ['index.html', 'product.html', 'checkout.html'];

describe('standard page routes', () => {
  it('gives a store with none of the new folders the same routes as before, old page-SLUG form included', () => {
    expect(nextContentPages(base()).map(p => p.path)).toEqual(commerce);
    expect(nextContentPages([...base(), file('components/page-nosotros.tsx')]).map(p => p.path)).toEqual([...commerce, 'nosotros.html']);
  });

  it('routes each group folder to its Spanish slug, in file order', () => {
    const pages = nextContentPages([...base(), file('components/pages/faq.tsx'), file('components/pages/shipping.tsx'), file('components/pages/not-found.tsx'),
      file('components/catalog/collections.tsx'), file('components/auth/login.tsx'), file('components/account/orders.tsx')]);
    expect(pages.slice(3)).toEqual([
      { name: 'pages/faq', path: 'faq.html' }, { name: 'pages/shipping', path: 'envios.html' }, { name: 'pages/not-found', path: '404.html' },
      { name: 'catalog/collections', path: 'colecciones.html' }, { name: 'auth/login', path: 'acceso-ingresar.html' }, { name: 'account/orders', path: 'cuenta-pedidos.html' },
    ]);
  });

  it('routes a file the table does not know with its group prefix', () => {
    expect(standardPageRoute('components/account/wishlist.tsx')).toEqual({ name: 'account/wishlist', path: 'cuenta-wishlist.html' });
    expect(standardPageRoute('components/auth/sso.tsx')).toEqual({ name: 'auth/sso', path: 'acceso-sso.html' });
    expect(standardPageRoute('components/pages/careers.tsx')).toEqual({ name: 'pages/careers', path: 'careers.html' });
  });

  it.each([
    'components/Shell.tsx', 'components/account.tsx', 'components/pages/Faq.tsx', 'components/pages/-x.tsx',
    'components/pages/faq/deep.tsx', 'components/other/faq.tsx', 'components/pages/faq.ts', 'pages/faq.tsx',
  ])('does not treat %s as a route', path => {
    expect(standardPageRoute(path)).toBeNull();
    expect(nextContentPages([...base(), file(path)]).map(p => p.path)).toEqual(commerce);
  });

  it('fails naming both files when two produce the same page', () => {
    expect(() => nextContentPages([...base(), file('components/page-faq.tsx'), file('components/pages/faq.tsx')])).toThrow(/components\/page-faq\.tsx.*components\/pages\/faq\.tsx.*faq\.html/);
    expect(() => nextContentPages([...base(), file('components/pages/checkout.tsx')])).toThrow(/components\/checkout\.tsx.*components\/pages\/checkout\.tsx.*checkout\.html/);
  });

  it('still routes only the pages a non-shop site has, as before', () => {
    const homeOnly = base().filter(f => !/components\/(product|checkout)\.tsx$/.test(f.path));
    expect(nextContentPages(homeOnly, 'portfolio').map(p => p.path)).toEqual(['index.html']);
    expect(nextContentPages(base(), 'portfolio').map(p => p.path)).toEqual(commerce);
  });
});
