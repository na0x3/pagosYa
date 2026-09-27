import { validateSourcePreflight } from './source-preflight';
import { SourceValidationError } from './source-validation-error';

const file = (path: string, content: string) => ({ path, content });

/** Merchants read error.message; the bounded repair reads error.diagnostic. */
const diagnosticOf = (run: () => unknown) => {
  try {
    run();
    return '';
  } catch (error) {
    return error instanceof SourceValidationError ? error.diagnostic : String((error as Error)?.message);
  }
};

describe('source preflight', () => {
  it('reports requested photos the design left out instead of discarding the draft', () => {
    const files = [file('components/home.tsx', '<h1>Casa</h1>'), file('assets/photo.jpg', 'bytes')];
    // Placement is a design decision, so an unused photo is reported, never fatal.
    expect(() => validateSourcePreflight(files, { requiredImagePaths: ['assets/photo.jpg'] })).not.toThrow();
    expect(validateSourcePreflight(files, { requiredImagePaths: ['assets/photo.jpg'] }).unusedImagePaths).toEqual(['assets/photo.jpg']);
    expect(validateSourcePreflight([...files, file('components/Gallery.tsx', '<img src="/assets/photo.jpg" alt=""/>')], { requiredImagePaths: ['assets/photo.jpg'] }).unusedImagePaths).toEqual([]);
    expect(validateSourcePreflight(files, { requiredImagePaths: ['assets/photo.jpg'], catalogImagePaths: ['assets/photo.jpg'] }).unusedImagePaths).toEqual([]);
    expect(validateSourcePreflight(files).unusedImagePaths).toEqual([]);
  });

  it('never puts an internal diagnostic in front of a merchant', () => {
    const broken = [file('index.html', '<h1>Casa</h1><img src="assets/icons/missing.svg" alt=""><a href="missing.html">Ver</a>')];
    const error = (() => { try { validateSourcePreflight(broken); return null; } catch (thrown) { return thrown as SourceValidationError; } })();
    expect(error).toBeInstanceOf(SourceValidationError);
    expect(error!.diagnostic).toMatch(/missing local asset/);
    // The merchant copy names no path, file or contract.
    expect(error!.message).not.toMatch(/assets\/|\.svg|\.html|missing|Preflight/i);
  });

  it('accepts a complete local storefront contract', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1><img src="assets/icons/menu.svg" alt=""><a href="product.html?id=p0">Ver</a><script src="config.js"></script><script src="commerce.js"></script><script src="site.js"></script>'),
      file('product.html', '<h1>Producto</h1>'),
      file('assets/icons/menu.svg', '<svg/>'),
      file('site.js', ''),
    ])).not.toThrow();
  });

  it('recognizes a primary heading supplied by the trusted React hero', () => {
    expect(() => validateSourcePreflight([
      file('components/home.tsx', `import { Hero } from '@pagosya/ui'; export default function Home(){ return <main><Hero title="Casa" /></main>; }`),
    ])).not.toThrow();
  });

  it('still rejects a React homepage with no semantic primary heading', () => {
    expect(diagnosticOf(() => validateSourcePreflight([
      file('components/home.tsx', `export default function Home(){ return <main><p>Casa</p></main>; }`),
    ]))).toMatch(/missing a primary h1/);
  });

  it('rejects broken assets, links and page-wide overflow masking', () => {
    expect(diagnosticOf(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1><img src="assets/icons/missing.svg"><a href="missing.html">Ver</a>'),
      file('styles.css', 'body { overflow-x: hidden; }'),
    ]))).toMatch(/Preflight failed/);
  });

  it('allows overflow clipping on individual visual components', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles.css', '.hero-media { overflow-x: clip; } .card { overflow-x: hidden; }'),
    ])).not.toThrow();
  });

  it('rejects page-root overflow masking inside responsive at-rules', () => {
    expect(diagnosticOf(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles.css', '@media (max-width: 700px) { :where(html, body) { overflow-x: hidden; } }'),
    ]))).toMatch(/page-wide horizontal overflow/);
  });

  it('resolves root-relative assets from nested stylesheets', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles/globals.css', "@font-face { font-family: Bricolage; src: url('/assets/bricolage.ttf'); }"),
      file('assets/bricolage.ttf', 'font-bytes'),
    ])).not.toThrow();
  });

  // The Plantillas write url(assets/…) in styles/globals.css; the compiler serves that stylesheet from the site root
  // (it rewrites the url to /assets/…), so the check must resolve it there too — or every edit of a template store fails.
  it('resolves assets/ in the component stylesheet from the site root, as the compiler does', () => {
    expect(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles/globals.css', "@font-face { font-family: Fraunces; src: url(assets/fraunces.ttf) format('truetype'); }\n.hero { background: url('./assets/hero.jpg'); }"),
      file('assets/fraunces.ttf', 'font-bytes'),
      file('assets/hero.jpg', 'jpg-bytes'),
    ])).not.toThrow();
    expect(diagnosticOf(() => validateSourcePreflight([
      file('index.html', '<h1>Casa</h1>'),
      file('styles/globals.css', "@font-face { font-family: Fraunces; src: url(assets/missing.ttf); }"),
    ]))).toMatch(/missing local asset assets\/missing\.ttf/);
  });
});
