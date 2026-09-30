import { compileNextPreview, nextContentPages, nextPageMarkup, nextProjectScaffold, standardPageRoute, validateNextSources } from './source-next';
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateStoreDataFile } from './source-templates';
import { SourceValidationError } from './source-validation-error';
import { nextStoreFiles } from './fixtures/next-store';

// Compiles real Next.js projects and renders 61 templates.
jest.setTimeout(60_000);

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

  it('fails with a Spanish message for the merchant and a diagnostic naming both files for the repair', () => {
    const collide = (files: Array<{ path: string; content: string }>) => { try { nextContentPages(files); } catch (error) { return error as SourceValidationError; } throw new Error('expected a collision'); };
    const faq = collide([...base(), file('components/page-faq.tsx'), file('components/pages/faq.tsx')]);
    expect(faq).toBeInstanceOf(SourceValidationError);
    expect(faq.diagnostic).toMatch(/components\/page-faq\.tsx.*components\/pages\/faq\.tsx.*faq\.html/);
    expect(faq.message).toMatch(/misma dirección/);
    expect(faq.message).not.toMatch(/components\/|\.html|\.tsx/);
    expect(collide([...base(), file('components/pages/checkout.tsx')]).diagnostic).toMatch(/components\/checkout\.tsx.*components\/pages\/checkout\.tsx.*checkout\.html/);
  });

  it('still routes only the pages a non-shop site has, as before', () => {
    const homeOnly = base().filter(f => !/components\/(product|checkout)\.tsx$/.test(f.path));
    expect(nextContentPages(homeOnly, 'portfolio').map(p => p.path)).toEqual(['index.html']);
    expect(nextContentPages(base(), 'portfolio').map(p => p.path)).toEqual(commerce);
  });
});

describe('validating standard pages', () => {
  const faq = { path: 'components/pages/faq.tsx', content: "import Header from '../Header';\nexport default function Faq() { return <><Header /><main id=\"contenido\"><h1>Preguntas frecuentes</h1></main></>; }" };

  it('does not ask a content page for the checkout mount', () => {
    expect(() => validateNextSources([...nextStoreFiles(), faq], 'shop')).not.toThrow();
  });

  it('still asks a hand-written page-SLUG page for the hooks it always needed', () => {
    const old = { ...faq, path: 'components/page-faq.tsx' };
    expect(() => validateNextSources([...nextStoreFiles(), old], 'shop')).toThrow(/page-faq necesita data-pagosya-checkout-page/);
  });
});

const thinPage = (path: string, title: string) => ({ path, content: `import Shell from '../Shell';\nimport { StandardPagePlaceholder } from '@pagosya/ui';\nexport default function Page() { return <Shell><StandardPagePlaceholder title="${title}" /></Shell>; }\n` });

describe('standard pages end to end', () => {
  it.each(listTemplates().map(t => t.id))('%s renders a standard page inside its own Shell', id => {
    const files = [...templateSourceFiles(id), templateStoreDataFile({ name: 'Tienda' }, {}), thinPage('components/pages/faq.tsx', 'Preguntas frecuentes')];
    const markup = nextPageMarkup(files, 'pages/faq');
    expect(markup).toMatch(/<h1\b/);
    expect(markup).toContain('data-standard-page');
  });

  it('compiles a grouped page to its own html and script, and the scaffold routes it', async () => {
    const files = [...nextStoreFiles(), { path: 'components/pages/faq.tsx', content: "import Header from '../Header';\nimport { StandardPagePlaceholder } from '@pagosya/ui';\nexport default function Faq() { return <><Header /><StandardPagePlaceholder title=\"Preguntas\" /></>; }" }];
    const out = await compileNextPreview(files, 'shop');
    expect(out.some(f => f.path === 'faq.html')).toBe(true);
    expect(out.some(f => f.path === '_compiled/pages/faq.js')).toBe(true);
    const scaffold = nextProjectScaffold('tienda', nextContentPages(files));
    expect(scaffold.find(f => f.path === 'pages/faq.tsx')!.content).toContain('../components/pages/faq');
  });

  it("writes the not-found page as Next's own 404", () => {
    const scaffold = nextProjectScaffold('tienda', nextContentPages([...nextStoreFiles(), { path: 'components/pages/not-found.tsx', content: 'export default function NotFound() { return null; }' }]));
    expect(scaffold.some(f => f.path === 'pages/404.tsx')).toBe(true);
  });
});
