import { currentSourceRuntime, currentSourceRuntimeBundle, sourceRuntimeBundleDigest, withSourceRuntime } from './source-runtime';

describe('current source runtime hardening', () => {
  it('retrofits the global layout floor and referenced local fonts for older snapshots', async () => {
    const result = await currentSourceRuntime({
      schemaVersion: 1,
      brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Cálida' },
      files: [
        { path: 'styles.css', encoding: 'utf8', content: '@font-face{font-family:Bricolage;src:url(/assets/bricolage.ttf)} body{}' },
        { path: 'index.html', encoding: 'utf8', content: '<main><h1>Café</h1></main>' },
      ],
    });

    expect(result.files.find(file => file.path === 'styles.css')?.content).toContain('pagosya-layout-baseline:start');
    expect(result.files.some(file => file.path === 'assets/bricolage.ttf')).toBe(true);
  });

  // Regression for a review finding: an already-published branded store's index.html never
  // regenerates, so productos.html/coleccion.html are injected as raw kit files. Without also
  // routing them through withSourceCommerceDesign, they would render unbranded, with stock
  // "Tu tienda" chrome instead of the store's real header/footer — exactly the scenario this
  // task exists to fix.
  it('brands and syncs the header/footer of the injected productos.html and coleccion.html for an already-published branded store', async () => {
    const home = '<html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body class="brand-theme"><header class="site-header"><a href="index.html">Marca Real</a></header><main id="catalogo" data-pagosya-catalog></main><footer class="site-footer">Pie de Marca</footer></body></html>';
    const result = await currentSourceRuntime({
      schemaVersion: 1,
      brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Libre' },
      files: [
        { path: 'index.html', encoding: 'utf8', content: home },
        { path: 'styles.css', encoding: 'utf8', content: 'body{}' },
        { path: 'brand.css', encoding: 'utf8', content: ':root{--brand-body-font:serif}' },
        { path: 'config.js', encoding: 'utf8', content: 'window.PAGOSYA_CONFIG = {"slug":"marca","checkoutOrigin":"https://pay.test","data":{"storeName":"Marca"}};' },
        { path: 'commerce.js', encoding: 'utf8', content: '' },
      ],
    });
    for (const path of ['productos.html', 'coleccion.html']) {
      const page = result.files.find(file => file.path === path)!.content;
      expect(page).toContain('href="brand.css"');
      expect(page).toContain('class="site-header"');
      expect(page).toContain('Marca Real');
      expect(page).toContain('class="site-footer"');
      expect(page).toContain('Pie de Marca');
    }
  });
});


describe('runtime bundle integrity', () => {
  const snapshot = { schemaVersion: 1 as const, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [] };
  it('rejects corrupted or incomplete pinned bundles instead of silently substituting the current kit', async () => {
    const bundle = await currentSourceRuntimeBundle();
    bundle.files[0].content += 'corrupto';
    await expect(withSourceRuntime(snapshot, bundle)).rejects.toMatchObject({ status: 409 });
    bundle.files.pop();
    bundle.digest = sourceRuntimeBundleDigest(bundle.files);
    await expect(withSourceRuntime(snapshot, bundle)).rejects.toMatchObject({ status: 409 });
  });
});
