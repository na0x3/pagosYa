import { compileNextPreview, nextContentPages, nextProjectExport, nextProjectScaffold, validateNextSources } from './source-next';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { sourceProjectSnapshot } from './source-project';
import { nextBrief } from './fixtures/next-store';
import { SOURCE_SITE_PURPOSES, sourceSitePurpose, sourceSitePurposePrompt } from './source-site-purpose';
import { validateSourceDesignImplementation } from './source-design';

jest.setTimeout(60_000);

export const presentationFiles = () => [
  { path: 'components/home.tsx', content: `export default function Home(){return <><header><a href="index.html">Estudio</a><a href="about.html">Nuestro trabajo</a></header><main><section id="work"><h1>Diseño de interiores</h1><p>Conoce nuestros proyectos.</p></section></main><section data-pagosya-contact hidden/><p data-pagosya-status role="status" aria-live="polite"/></>}` },
  { path: 'components/page-about.tsx', content: `export default function About(){return <><a href="index.html">Inicio</a><main><h1>Nuestro trabajo</h1><p>Proyectos del estudio.</p></main><p data-pagosya-status role="status"/></>}` },
  { path: 'styles/globals.css', content: 'body{margin:0;font-family:system-ui;color:#222;background:#faf8f2}header,main{padding:24px}a{display:inline-flex;min-height:44px;align-items:center}' },
];

describe('website purposes', () => {
  it('preserves legitimate authored service pricing without requiring a commerce catalog', () => {
    const files = presentationFiles().map(file => ({ ...file, content: file.path === 'components/home.tsx' ? file.content.replace('<p>Conoce nuestros proyectos.</p>', '<p>Consulta inicial</p><p className="price">Bs 50</p>') : file.content }));
    expect(() => validateNextSources(files, 'service')).not.toThrow();
    expect(() => validateNextSources(files, 'shop')).toThrow('Precios estáticos');
    const snapshot = sourceProjectSnapshot({ revision: 0, label: 'Services', brief: { ...nextBrief, sitePurpose: 'service' }, files: [
      ...files, ...nextProjectScaffold('service', nextContentPages(files, 'service')),
      { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"sitePurpose":"service"};' }, { path: 'commerce.js', content: '/* platform runtime */' },
    ] });
    expect(() => assertSourceCommerceContract(snapshot)).not.toThrow();
  });
  it('reports every missing image alternative together so a bounded repair can fix the whole candidate', () => {
    const files = presentationFiles().map(file => ({ ...file, content: file.path.endsWith('.tsx') ? file.content.replace('</main>', '<img src="/assets/example.jpg"/></main>') : file.content }));
    try { validateNextSources(files, 'portfolio'); throw new Error('Expected validation failure'); }
    catch (error) {
      expect((error as Error).message).toContain('components/home.tsx:1');
      expect((error as Error).message).toContain('components/page-about.tsx:1');
    }
  });
  it('defaults historical briefs to commerce and preserves explicit purposes in snapshots', () => {
    expect(sourceSitePurpose()).toBe('shop');
    expect(sourceSitePurpose({ sitePurpose: 'unrecognized' })).toBe('shop');
    for (const sitePurpose of SOURCE_SITE_PURPOSES) {
      const snapshot = sourceProjectSnapshot({ revision: 0, label: 'Site', brief: { ...nextBrief, sitePurpose }, files: [...presentationFiles(), ...nextProjectScaffold('site', [{ name: 'home', path: 'index.html' }])] });
      expect(snapshot.brief.sitePurpose).toBe(sitePurpose);
    }
  });

  it.each(['service', 'portfolio', 'editorial'] as const)('accepts %s content without fake cart/product pages, but still requires the real contact slot', purpose => {
    expect(() => validateNextSources(presentationFiles(), purpose)).not.toThrow();
    const noContact = presentationFiles().map(file => ({ ...file, content: file.content.replace('<section data-pagosya-contact hidden/>', '') }));
    expect(() => validateNextSources(noContact, purpose)).toThrow('data-pagosya-contact');
    expect(sourceSitePurposePrompt(purpose)).toContain('Never create personal-data inputs');
  });

  it('keeps the commerce requirements intact for shop and legacy inputs', () => {
    expect(() => validateNextSources(presentationFiles())).toThrow('components/product.tsx');
    expect(sourceSitePurposePrompt('shop')).toBe('');
  });

  it('compiles and exports real content routes and passes publication without a selling catalog', async () => {
    const source = presentationFiles();
    const pages = nextContentPages(source, 'portfolio');
    expect(pages).toEqual([{ name: 'home', path: 'index.html' }, { name: 'page-about', path: 'about.html' }]);
    const compiled = await compileNextPreview(source, 'portfolio');
    expect(compiled.some(file => file.path === '_compiled/page-about.js')).toBe(true);
    expect(compiled.some(file => file.path === 'product.html')).toBe(false);
    const snapshot = sourceProjectSnapshot({ revision: 0, label: 'Portfolio', brief: { ...nextBrief, sitePurpose: 'portfolio' }, files: [
      ...source, ...compiled, ...nextProjectScaffold('portfolio', pages),
      { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"sitePurpose":"portfolio"};' }, { path: 'commerce.js', content: '/* real platform runtime supplied at render */' },
    ] });
    expect(() => assertSourceCommerceContract(snapshot)).not.toThrow();
    expect(() => assertSourceCommerceContract({ ...snapshot, brief: { ...snapshot.brief, sitePurpose: 'shop' } })).toThrow();
    const exported = nextProjectExport(snapshot.files, 'portfolio');
    expect(exported.find(file => file.path === 'pages/about.tsx')?.content).toContain("../components/page-about");
    expect(exported.find(file => file.path === 'pages/about.tsx')?.content).toContain('page="page-about"');
    expect(exported.some(file => file.path === 'pages/product.tsx')).toBe(false);
  });

  it('still checks the chosen section order for presentation sites', () => {
    const design: any = { selected: 0, concepts: [{ layout: { sections: ['work'], catalogSection: 'work', standaloneIntro: true, productsInOpening: false } }] };
    const files = [{ path: 'index.html', content: '<main><section id="work"><h1>Projects</h1></section></main>' }];
    expect(() => validateSourceDesignImplementation(design, files, 'portfolio')).not.toThrow();
    expect(() => validateSourceDesignImplementation(design, files)).toThrow('catálogo real');
    expect(() => validateSourceDesignImplementation(design, [{ ...files[0], content: files[0].content.replace('id="work"', 'id="wrong"') }], 'portfolio')).toThrow('los bloques directos');
  });
});
