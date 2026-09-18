import { sourceTaskContext, sourceSiteContext, sourceRedesignRequested } from './source-context';
const files = ['index.html', 'product.html', 'checkout.html', 'styles.css', 'site.js'].map(path => ({ path, content: path }));
it('exposes saved assets and page structure without sending binary content or configuration', () => {
  const context = sourceSiteContext([
    { path: 'index.html', content: '<title>Tortas</title><h1>QUEMADO</h1><img src="assets/cake.webp">' },
    { path: 'assets/cake.webp', content: 'private-binary', encoding: 'base64' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"motion":"subtle","private":"excluded"};' },
  ]);
  expect(context).toMatchObject({ pages: [{ path: 'index.html', title: 'Tortas', headings: ['QUEMADO'] }], bundledAssets: [{ path: 'assets/cake.webp', references: ['index.html'] }], motion: 'subtle' });
  expect(JSON.stringify(context)).not.toContain('private');
});
it('authorizes broad redesigns only from the current request', () => {
  for (const text of ['I want my website like this one https://example.com', 'Make my website look like https://example.com', 'Quiero que mi sitio se vea como https://example.com']) expect(sourceRedesignRequested(text)).toBe(true);
  for (const text of ['Make the header of my website look like https://example.com', 'No quiero mi sitio como https://example.com', 'I want my website like this one\nPedido actual del comercio:\nCambia el título']) expect(sourceRedesignRequested(text)).toBe(false);
  expect(sourceRedesignRequested('cambia los colores, las secciones, haz mas animaciones, personajes comiendo torta basca etc')).toBe(true);
  expect(sourceRedesignRequested('Rediseña todo el website')).toBe(true);
  expect(sourceRedesignRequested('Rediseña todo el sitio, no uses degradados')).toBe(true);
  for (const text of ['Rediseña toda la página usando las mismas fotos', 'Rediseña la pagina entera', 'Redesign the whole page']) expect(sourceRedesignRequested(text)).toBe(true);
  for (const text of ['Make the site completely different', 'Make the whole site look completely different', 'Hazlo totalmente diferente', 'Give my store a new visual direction']) expect(sourceRedesignRequested(text)).toBe(true);
  for (const text of ['Rediseña el botón', 'Cambia el color del botón', 'No rediseñes el sitio', "Don't make the site completely different", 'No hagas que se vea totalmente diferente', 'Rediseña todo\nPedido actual del comercio:\nCambia el título']) expect(sourceRedesignRequested(text)).toBe(false);
});
it('keeps scripts and styles for an explicit page edit while omitting unrelated page bodies', () => {
  const result = sourceTaskContext(files, 'Cambia el título en checkout.html');
  expect(result.files.map(f => f.path)).toEqual(['checkout.html', 'styles.css', 'site.js']);
  expect(result.omitted).toEqual(['index.html', 'product.html']);
});
it('retains full context for global, ambiguous, and nonexistent page requests', () => {
  for (const text of ['Cambia los colores en todas las páginas, empezando con index.html', 'Make every page match checkout.html', 'Mejora el checkout', 'Edit unknown.html']) expect(sourceTaskContext(files, text).files).toBe(files);
});
