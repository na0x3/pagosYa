jest.setTimeout(60_000);

import { compileNextPreview, nextPageMarkup, nextProjectExport, nextProjectScaffold, validateNextSources } from './source-next';
import { uiStoreFiles } from './fixtures/ui-store';
import { nextBrief, nextStoreConfig, nextStoreImage } from './fixtures/next-store';
import { sourceProjectSnapshot } from './source-project';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { SOURCE_NEXT_INSTRUCTIONS } from './source-next';
import { SOURCE_UI_TOOLS, sourceUiComposition, sourceUiCompositionPrompt } from './source-ui';

describe('@pagosya/ui storefront framework', () => {
  it('counts commerce hooks rendered by library sections as page markup', () => {
    const files = uiStoreFiles();
    expect(() => validateNextSources(files)).not.toThrow();
    const home = nextPageMarkup(files, 'home');
    for (const hook of ['data-pagosya-catalog', 'data-cart-open', 'data-pagosya-cart', 'data-pagosya-status', 'data-pagosya-product-template']) expect(home).toContain(hook);
    expect(nextPageMarkup(files, 'product')).toContain('data-pagosya-product-page');
    expect(nextPageMarkup(files, 'checkout')).toContain('data-pagosya-checkout-page');
  });

  it('still rejects a page that uses the library without the catalog', () => {
    const files = uiStoreFiles();
    files[1].content = files[1].content.replace(/<Catalog [^>]*\/>/, '');
    expect(() => validateNextSources(files)).toThrow('home necesita data-pagosya-catalog');
  });

  it('compiles, passes the publish contract and exports a runnable project with the library', async () => {
    const source = uiStoreFiles();
    const compiled = await compileNextPreview(source);
    const home = compiled.find(f => f.path === '_compiled/home.js')!.content;
    expect(home).toContain('ui-showcase');
    expect(home.length).toBeLessThan(800000);
    const snapshot = sourceProjectSnapshot({ revision: 0, label: 'UI', brief: nextBrief, files: [...source, ...compiled, ...nextProjectScaffold('ui'), { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify(nextStoreConfig)};` }, { path: 'commerce.js', content: '/* runtime */' }, nextStoreImage] });
    expect(() => assertSourceCommerceContract(snapshot)).not.toThrow();
    const exported = nextProjectExport(snapshot.files, 'ui');
    expect(exported.some(f => f.path === 'lib/ui.tsx')).toBe(true);
    expect(JSON.parse(exported.find(f => f.path === 'tsconfig.json')!.content).compilerOptions.paths['@pagosya/ui']).toEqual(['./lib/ui.tsx']);
  });

  it('keeps authored code unable to inject executable HTML even though the library may', () => {
    const files = uiStoreFiles();
    files[1].content = files[1].content.replace('<main id="contenido">', '<main id="contenido"><div dangerouslySetInnerHTML={{ __html: "<img onerror=alert(1)>" }} />');
    expect(() => validateNextSources(files)).toThrow();
  });

  it('teaches every React generation the framework and a brief-compatible starting direction', () => {
    expect(SOURCE_NEXT_INSTRUCTIONS).toContain(SOURCE_UI_TOOLS);
    // The story scenes and smooth-scroll contract add a small, bounded amount of
    // guidance while keeping the stable prompt well below the next 1k boundary.
    expect(SOURCE_UI_TOOLS.length).toBeLessThan(5600);
    const first = sourceUiComposition({ brief: 'Café', seed: 'cafe', assets: [] });
    expect(first.family).toBe('cafe-expressive');
    expect(sourceUiCompositionPrompt(first)).toContain('header classic');
    expect(sourceUiCompositionPrompt(first)).toContain('Merchant instructions');
  });
});
