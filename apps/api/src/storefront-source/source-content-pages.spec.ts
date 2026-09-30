import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { nextStoreFiles } from './fixtures/next-store';
import { CONTENT_PAGE_FILES } from './source-content-pages';
import { nextContentPages } from './source-next';
import { assembleTemplateRevision } from './source-templates';

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
