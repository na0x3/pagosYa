import { STATIC_STANDARD_PAGE_PATHS } from './source-static-pages';
import { isAuthorableSourcePath, sep5AuthorableFiles, sep5PreviousSource } from './source-authorable';

const file = (path: string) => ({ path, content: 'x' });
// Pulso Pilates rev 1, 2026-10-10: everything a redesign showed the author.
const pulso = ['404.html', 'README.md', 'build.mjs', 'buscar.html', 'checkout.html', 'commerce-pages.css', 'commerce.js', 'config.js', 'design-direction.json', 'index.html', 'llms.txt', 'package.json', 'product.html', 'robots.txt', 'server.mjs', 'site.js', 'sitemap.xml', 'styles.css', 'visual-assets.json', 'visual-system.json', 'pages/historia.html'];

describe('authorable source paths', () => {
  it('allows html, css and js the model may write, and nothing the platform owns', () => {
    expect(pulso.filter(isAuthorableSourcePath)).toEqual(['404.html', 'buscar.html', 'checkout.html', 'commerce-pages.css', 'index.html', 'product.html', 'site.js', 'styles.css', 'pages/historia.html']);
  });
  // The redesign that failed with "La generación intentó cambiar un archivo reservado": the author echoed a platform file.
  it('drops platform files the author returned instead of failing the whole draft', () => {
    const { files, dropped } = sep5AuthorableFiles(['index.html', 'styles.css', 'site.js', 'config.js', 'package.json', 'design-direction.json'].map(file));
    expect(files.map(f => f.path)).toEqual(['index.html', 'styles.css', 'site.js']);
    expect(dropped).toEqual(['config.js', 'package.json', 'design-direction.json']);
  });
  // Night run 2026-10-11: Tostadero Illimani's finished draft failed the whole store with "Duplicate or reserved source
  // file path" because the author returned one file twice. The last copy is the author's final word.
  it('keeps one copy of a file the author returned twice, the last one, whatever its case', () => {
    const { files, dropped } = sep5AuthorableFiles([{ path: 'index.html', content: 'a' }, { path: 'styles.css', content: 'b' }, { path: 'Styles.css', content: 'c' }, { path: 'index.html', content: 'd' }]);
    expect(files).toEqual([{ path: 'Styles.css', content: 'c' }, { path: 'index.html', content: 'd' }]);
    expect(dropped).toEqual(['index.html (duplicate)', 'styles.css (duplicate)']);
  });
  it('shows a redesign only the files the author may rewrite, and never the platform copies or kit stylesheet', () => {
    const shown = sep5PreviousSource(pulso.map(file)).map(f => f.path);
    expect(shown).toEqual(expect.arrayContaining(['index.html', 'styles.css', 'site.js', 'product.html', 'pages/historia.html']));
    for (const path of ['config.js', 'commerce.js', 'commerce-pages.css', 'package.json', 'README.md', 'design-direction.json', 'robots.txt', ...STATIC_STANDARD_PAGE_PATHS]) expect(shown).not.toContain(path);
  });
});
