import { validateSourcePreflight } from './source-preflight';

const file = (path: string, content: string) => ({ path, content });

describe('source preflight', () => {
  it('requires requested photos to appear in authored pages or the real catalog', () => {
    const files = [file('components/home.tsx', '<h1>Casa</h1>'), file('assets/photo.jpg', 'bytes')];
    expect(() => validateSourcePreflight(files, { requiredImagePaths: ['assets/photo.jpg'] })).toThrow(/requested images are absent/);
    expect(() => validateSourcePreflight([...files, file('components/Gallery.tsx', '<img src="/assets/photo.jpg"/>')], { requiredImagePaths: ['assets/photo.jpg'] })).not.toThrow();
    expect(() => validateSourcePreflight(files, { requiredImagePaths: ['assets/photo.jpg'], catalogImagePaths: ['assets/photo.jpg'] })).not.toThrow();
    expect(() => validateSourcePreflight(files)).not.toThrow();
  });
  it('accepts a complete local storefront contract', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1><img src="assets/icons/menu.svg" alt=""><a href="product.html?id=p0">Ver</a><script src="config.js"></script><script src="commerce.js"></script><script src="site.js"></script>'),
      file('product.html', '<h1>Producto</h1>'),
      file('assets/icons/menu.svg', '<svg/>'),
      file('site.js', ''),
    ])).not.toThrow();
  });

  it('rejects broken assets, links and page-wide overflow masking', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1><img src="assets/icons/missing.svg"><a href="missing.html">Ver</a>'),
      file('styles.css', 'body { overflow-x: hidden; }'),
    ])).toThrow(/preflight automático/);
  });

  it('allows overflow clipping on individual visual components', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles.css', '.hero-media { overflow-x: clip; } .card { overflow-x: hidden; }'),
    ])).not.toThrow();
  });

  it('rejects page-root overflow masking inside responsive at-rules', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles.css', '@media (max-width: 700px) { :where(html, body) { overflow-x: hidden; } }'),
    ])).toThrow(/page-wide horizontal overflow/);
  });

  it('resolves root-relative assets from nested stylesheets', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles/globals.css', "@font-face { font-family: Bricolage; src: url('/assets/bricolage.ttf'); }"),
      file('assets/bricolage.ttf', 'font-bytes'),
    ])).not.toThrow();
  });
});
