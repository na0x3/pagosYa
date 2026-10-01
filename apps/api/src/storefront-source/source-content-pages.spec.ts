import { createRequire } from 'node:module';
import { join } from 'node:path';
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { nextStoreFiles } from './fixtures/next-store';
import { ACCOUNT_PAGE_FILES, STANDARD_PAGE_FILES, CONTENT_PAGE_FILES, withStandardPages } from './source-content-pages';
import { nextContentPages } from './source-next';
import { assembleTemplateRevision } from './source-templates';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');

// Assembling compiles a real React store with esbuild.
jest.setTimeout(120_000);

const publicStore = () => ({
  storeName: 'Acuarela', tagline: 'Materiales de arte', checkoutMode: 'catalog', creditsEnabled: false, digitalGoodsEnabled: false, shippingEnabled: false,
  shippingPickupEnabled: false, shippingCarriersEnabled: false, bundlesEnabled: false, logoUrl: null, contactPhone: null, leadCaptureUrl: null,
  contactFormEnabled: false, contactTitle: null, contactSubtitle: null, categories: [], locations: [{ city: 'La Paz' }], cartRecommendationsEnabled: false,
  cartRecommendationProductIds: [], bundles: [], items: [],
}) as any;
const apply = (source: Array<{ path: string; content: string }>, id = 'acuarela') => assembleTemplateRevision({
  manifest: listTemplates().find(t => t.id === id)!, source, storeId: 's1', slug: 'tienda', publicStore: publicStore(), apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: true,
});

describe('content page files', () => {
  it('are eleven thin files, each marked as a page and routed to its Spanish URL', () => {
    expect(CONTENT_PAGE_FILES.map(file => file.path).sort()).toEqual([
      ...['about', 'contact', 'cookies', 'faq', 'not-found', 'privacy', 'refund-policy', 'shipping', 'terms'].map(name => `components/pages/${name}.tsx`),
      ...['collections', 'search'].map(name => `components/catalog/${name}.tsx`),
    ].sort());
    for (const file of CONTENT_PAGE_FILES) { expect(file.content.startsWith('// @pagosya-page\n')).toBe(true); expect(file.content).toContain('<InfoPage kind='); }
    expect(nextContentPages([...templateSourceFiles('acuarela'), ...CONTENT_PAGE_FILES]).map(p => p.path).sort()).toEqual([
      '404.html', 'buscar.html', 'checkout.html', 'colecciones.html', 'contacto.html', 'cookies.html', 'envios.html', 'faq.html', 'index.html', 'nosotros.html', 'privacidad.html', 'product.html', 'reembolsos.html', 'terminos.html',
    ].sort());
  });

  it('are added to the revision when a template is applied, and compile to their own pages', async () => {
    const revision = await apply(templateSourceFiles('acuarela'));
    const paths = revision.files.map(f => f.path);
    for (const file of CONTENT_PAGE_FILES) expect(paths).toContain(file.path);
    for (const html of ['nosotros.html', 'faq.html', '404.html', 'cookies.html', 'contacto.html', 'colecciones.html', 'buscar.html']) expect(paths).toContain(html);
  });

  it('are not added to a source that has no Shell to host them', async () => {
    const revision = await apply(nextStoreFiles(), 'acuarela');
    expect(revision.files.some(f => f.path.startsWith('components/pages/'))).toBe(false);
    expect(revision.files.some(f => f.path === 'nosotros.html')).toBe(false);
  });

  it('keep a page the template ships itself', async () => {
    const own = { path: 'components/pages/faq.tsx', content: "// @pagosya-page\nimport Shell from '../Shell';\nexport default function Faq() { return <Shell><main id=\"contenido\"><h1>Mi FAQ</h1></main></Shell>; }\n" };
    const revision = await apply([...templateSourceFiles('acuarela'), own]);
    expect(revision.files.filter(f => f.path === 'components/pages/faq.tsx')).toHaveLength(1);
    expect(revision.files.find(f => f.path === 'components/pages/faq.tsx')!.content).toContain('Mi FAQ');
  });
});

describe('withStandardPages: adding the pages to a store that already exists', () => {
  const shell = (footer = '<footer className="x"><p>Pie</p></footer>') => ({ path: 'components/Shell.tsx', content: `import type { ReactNode } from 'react';\nexport function Footer() {\n  return ${footer};\n}\nexport default function Shell({ children }: { children: ReactNode }) { return <div>{children}<Footer /></div>; }\n` });
  const home = { path: 'components/home.tsx', content: 'export default function Home() { return null; }' };

  it('adds the standard pages and the footer nav slot', () => {
    const result = withStandardPages([home, shell()]);
    expect(result.added.sort()).toEqual(STANDARD_PAGE_FILES.map(file => file.path).sort());
    expect(result.slotAdded).toBe(true);
    const footer = result.files.find(file => file.path === 'components/Shell.tsx')!.content;
    expect(footer.match(/data-pagosya-pages/g)).toHaveLength(1);
    expect(footer.indexOf('data-pagosya-pages')).toBeLessThan(footer.indexOf('</footer>'));
    expect(result.files.find(file => file.path === 'components/home.tsx')).toEqual(home);
  });

  it('changes nothing when the pages and the slot are already there', () => {
    const once = withStandardPages([home, shell()]);
    const twice = withStandardPages(once.files);
    expect(twice.added).toEqual([]);
    expect(twice.slotAdded).toBe(false);
    expect(twice.files).toEqual(once.files);
  });

  it('adds nothing to a store with no Shell to host the pages', () => {
    const result = withStandardPages([home]);
    expect(result).toEqual({ files: [home], added: [], slotAdded: false });
  });

  it('keeps a page the store already has, and adds the rest', () => {
    const own = { path: 'components/pages/faq.tsx', content: '// @pagosya-page\nexport default function Faq() { return null; }' };
    const result = withStandardPages([home, shell(), own]);
    expect(result.added).not.toContain('components/pages/faq.tsx');
    expect(result.files.find(file => file.path === 'components/pages/faq.tsx')).toEqual(own);
    expect(result.added).toHaveLength(STANDARD_PAGE_FILES.length - 1);
  });

  it('still adds the pages, without touching the Shell, when its footer cannot be found safely', () => {
    const odd = { path: 'components/Shell.tsx', content: 'export default function Shell({ children }: { children: unknown }) { return <div>{children}</div>; }\n' };
    const result = withStandardPages([home, odd]);
    expect(result.slotAdded).toBe(false);
    expect(result.files.find(file => file.path === 'components/Shell.tsx')).toEqual(odd);
    expect(result.added).toHaveLength(STANDARD_PAGE_FILES.length);
    const two = { path: 'components/Shell.tsx', content: 'export function Footer() { return <footer>a</footer>; }\nexport function Other() { return <footer>b</footer>; }\n' };
    expect(withStandardPages([home, two]).slotAdded).toBe(false);
  });
});

describe('account page files', () => {
  const SLUGS: Record<string, string> = {
    'components/auth/login.tsx': 'acceso-ingresar.html', 'components/auth/register.tsx': 'acceso-registro.html',
    'components/auth/forgot-password.tsx': 'acceso-olvide-mi-contrasena.html', 'components/auth/reset-password.tsx': 'acceso-restablecer-contrasena.html',
    'components/account/orders.tsx': 'cuenta-pedidos.html', 'components/account/addresses.tsx': 'cuenta-direcciones.html',
    'components/account/profile.tsx': 'cuenta-perfil.html', 'components/account/subscriptions.tsx': 'cuenta-suscripciones.html',
  };

  it('are eight thin files, each marked as a page and drawing the account gate', () => {
    expect(ACCOUNT_PAGE_FILES.map(file => file.path).sort()).toEqual(Object.keys(SLUGS).sort());
    for (const file of ACCOUNT_PAGE_FILES) {
      expect(file.content.startsWith('// @pagosya-page\n')).toBe(true);
      expect(file.content).toContain('<AccountGatePage view=');
    }
    expect(STANDARD_PAGE_FILES).toHaveLength(19);
  });

  it('are added to an applied template, compile to their own pages and draw no input', async () => {
    const revision = await apply(templateSourceFiles('acuarela'));
    const paths = revision.files.map(f => f.path);
    for (const [file, html] of Object.entries(SLUGS)) { expect(paths).toContain(file); expect(paths).toContain(html); }
    for (const file of ACCOUNT_PAGE_FILES) {
      const dom = new JSDOM('<div id="pagosya-react-root"></div>', { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
      try {
        dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
        dom.window.eval(revision.files.find(f => f.path === '_compiled/vendor.js')!.content);
        dom.window.eval(revision.files.find(f => f.path === file.path.replace('components/', '_compiled/').replace('.tsx', '.js'))!.content);
        const main = dom.window.document.querySelector('main[data-account-gate]');
        expect(main).not.toBeNull();
        expect(main.querySelector('h1').textContent).not.toBe('');
        expect(main.querySelector('p').textContent).not.toBe('');
        expect(main.querySelectorAll('a[data-pagosya-account]')).toHaveLength(1);
        expect(main.querySelector('input, textarea, select, form')).toBeNull();
      } finally { dom.window.close(); }
    }
  });

  it('keep a page the store already has and add the rest', () => {
    const own = { path: 'components/auth/login.tsx', content: '// @pagosya-page\nexport default function Login() { return null; }\n' };
    const shell = { path: 'components/Shell.tsx', content: "export default function Shell({ children }: any) { return <div>{children}</div>; }\n" };
    const result = withStandardPages([shell, own]);
    expect(result.added).not.toContain('components/auth/login.tsx');
    expect(result.added).toContain('components/account/orders.tsx');
    expect(result.files.filter(f => f.path === 'components/auth/login.tsx')).toHaveLength(1);
  });
});
