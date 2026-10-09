import { platformSuppliedPages, repairSourceContracts } from './source-autorepair';
import { validateSourcePreflight } from './source-preflight';

const file = (path: string, content: string) => ({ path, content });
const repair = (files: { path: string; content: string }[], altFor?: (src: string) => string | undefined) =>
  repairSourceContracts(files, { knownPaths: new Set(files.map(entry => entry.path)), altFor });

describe('source contract auto-repair', () => {
  it('supplies missing alt text, preferring the merchant description of the photo', () => {
    const { files, repairs } = repair(
      [file('index.html', '<h1>Casa</h1><img src="assets/photo.jpg"><img src="assets/icons/menu.svg" />')],
      source => (source === 'assets/photo.jpg' ? 'Galletas recién horneadas' : undefined),
    );
    expect(files[0].content).toContain('<img src="assets/photo.jpg" alt="Galletas recién horneadas">');
    expect(files[0].content).toContain('<img src="assets/icons/menu.svg" alt="" />');
    expect(repairs).toHaveLength(2);
  });

  it('leaves an image that already declares alt untouched', () => {
    const original = [file('index.html', '<h1>Casa</h1><img src="assets/photo.jpg" alt="Ya descrita">')];
    const { files, repairs } = repair(original);
    expect(files[0].content).toBe(original[0].content);
    expect(repairs).toEqual([]);
  });

  it('repoints a dead reference when exactly one real file matches, and declines when ambiguous', () => {
    const single = repairSourceContracts([file('index.html', '<img src="assets/menu.svg" alt="">')], {
      knownPaths: new Set(['index.html', 'assets/icons/menu.svg']),
    });
    expect(single.files[0].content).toContain('assets/icons/menu.svg');

    const ambiguous = repairSourceContracts([file('index.html', '<img src="assets/menu.svg" alt="">')], {
      knownPaths: new Set(['index.html', 'assets/icons/menu.svg', 'assets/brand/menu.svg']),
    });
    // Two candidates is a decision, not a repair: it stays for the bounded repair.
    expect(ambiguous.files[0].content).toContain('assets/menu.svg');
    expect(ambiguous.repairs).toEqual([]);
  });

  it('drops a dead script tag but keeps scripts the storefront kit supplies at save time', () => {
    const { files } = repair([file('index.html', '<script src="missing.js"></script><script src="config.js"></script><script src="commerce.js"></script>')]);
    expect(files[0].content).not.toContain('missing.js');
    expect(files[0].content).toContain('config.js');
    expect(files[0].content).toContain('commerce.js');
  });

  it('removes a broken link without losing its text', () => {
    const { files } = repair([file('index.html', '<a href="missing.html" class="cta">Ver la carta</a>')]);
    expect(files[0].content).not.toContain('href');
    expect(files[0].content).toContain('Ver la carta');
    expect(files[0].content).toContain('class="cta"');
  });

  it('strips page-root overflow masking while preserving component clipping', () => {
    const { files } = repair([file('styles.css', 'body { overflow-x: hidden; color: red; }\n.hero { overflow-x: clip; }')]);
    expect(files[0].content).not.toMatch(/body[^}]*overflow-x/);
    expect(files[0].content).toContain('color: red');
    expect(files[0].content).toContain('.hero { overflow-x: clip; }');
  });

  it('promotes a leading h2 on a plain homepage but leaves React homepages alone', () => {
    const html = repair([file('index.html', '<h2 class="hero">Casa</h2><h2>Otra</h2>')]);
    expect(html.files[0].content).toContain('<h1 class="hero">Casa</h1>');
    expect(html.files[0].content).toContain('<h2>Otra</h2>');

    const react = repair([file('components/home.tsx', 'export default function Home(){ return <main><p>Casa</p></main>; }')]);
    expect(react.repairs).toEqual([]);
  });

  it('turns a draft that would have failed preflight into one that passes', () => {
    const broken = [
      file('index.html', '<h2>Casa</h2><img src="assets/menu.svg"><a href="missing.html">Ver</a><script src="missing.js"></script>'),
      file('assets/icons/menu.svg', '<svg/>'),
      file('styles.css', 'html { overflow-x: hidden; }'),
    ];
    expect(() => validateSourcePreflight(broken)).toThrow();
    const { files, repairs } = repair(broken);
    expect(repairs.length).toBeGreaterThan(0);
    // No second model attempt, no credits, no red box.
    expect(() => validateSourcePreflight(files)).not.toThrow();
  });
});

describe('links to pages the platform adds after the repair', () => {
  // Huerta Viva (2026-10-09): every header and footer link lost its href because nosotros.html, faq.html,
  // contacto.html and productos.html are added after this repair, so they looked dead when it ran.
  const nav = '<nav><a href="index.html">Inicio</a><a href="productos.html">Catálogo</a><a href="nosotros.html">Nosotros</a><a href="faq.html">Preguntas frecuentes</a><a href="contacto.html">Contacto</a><a href="como-funciona.html">Cómo funciona</a></nav>';
  const generated = [file('index.html', nav), file('styles.css', 'a{color:red}')];

  it('keeps links to standard and commerce pages of a shop', () => {
    const { files } = repairSourceContracts(generated, { knownPaths: new Set([...generated.map(entry => entry.path), ...platformSuppliedPages('shop')]) });
    for (const page of ['productos.html', 'nosotros.html', 'faq.html', 'contacto.html']) expect(files[0].content).toContain(`href="${page}"`);
  });

  it('still removes a link to a page nobody will supply', () => {
    const { files, repairs } = repairSourceContracts(generated, { knownPaths: new Set([...generated.map(entry => entry.path), ...platformSuppliedPages('shop')]) });
    expect(files[0].content).toMatch(/<a\s*>Cómo funciona<\/a>/);
    expect(repairs).toEqual(['index.html: removed broken link to como-funciona.html']);
  });

  it('does not promise the commerce pages to a site that is not a shop', () => {
    expect(platformSuppliedPages('portfolio')).not.toContain('productos.html');
    expect(platformSuppliedPages('portfolio')).toContain('nosotros.html');
  });

  it('passes the preflight once the platform pages are known, and still flags a page nobody supplies', () => {
    const diagnostic = (run: () => unknown) => { try { run(); return ''; } catch (error) { return (error as { diagnostic?: string }).diagnostic ?? String(error); } };
    const files = [file('index.html', '<h1>Huerta Viva</h1><a href="nosotros.html">Nosotros</a><a href="productos.html">Catálogo</a>'), file('styles.css', 'a{color:red}')];
    expect(diagnostic(() => validateSourcePreflight(files))).toContain('broken internal link nosotros.html');
    expect(diagnostic(() => validateSourcePreflight(files, { platformPages: platformSuppliedPages('shop') }))).toBe('');
    expect(diagnostic(() => validateSourcePreflight([file('index.html', '<h1>x</h1><a href="como-funciona.html">x</a>')], { platformPages: platformSuppliedPages('shop') }))).toContain('broken internal link como-funciona.html');
  });
});
