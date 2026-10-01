// Compiles real Next.js projects; under a full parallel run this takes well past the 5s default.
jest.setTimeout(60_000);

import { compileNextPreview, nextPageMarkup, nextProjectExport, nextProjectScaffold, repairNextAuthoredMarkup, repairNextCommerceMounts, repairNextSharedComponentReferences, validateNextDesign, validateNextSources } from './source-next';
import { nextBrief, nextStoreFiles, nextStoreConfig, nextStoreImage } from './fixtures/next-store';
import { sourceProjectSnapshot } from './source-project';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { creativeStoreFiles } from './fixtures/creative-store';
import { withCreativeAssets } from './source-creative-assets';

describe('Next.js storefront compilation', () => {
  it('compiles the pagosya-kit block of globals.css into the served store kit CSS, linked after the store stylesheet', async () => {
    const source = nextStoreFiles().map(f => f.path === 'styles/globals.css' ? { ...f, content: f.content + '\n/* pagosya-kit:start */\n.cart-drawer{background:rgb(9,8,7)}\n.product-detail__buy{border-radius:3px}\n/* pagosya-kit:end */\n' } : f);
    const compiled = await compileNextPreview(source);
    const kit = compiled.find(f => f.path === 'styles/kit.css')!.content;
    expect(kit).toContain('@layer pagosya-store-kit');
    expect(kit).toContain(':root:not(#pagosya-store-kit) .product-detail__buy');
    expect(compiled.find(f => f.path === 'styles.css')!.content).not.toMatch(/rgb\(9, ?8, ?7\)|product-detail__buy/);
    expect(compiled.find(f => f.path === 'index.html')!.content).toContain('<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="styles/kit.css" data-pagosya-kit="store">');
    const plain = await compileNextPreview(nextStoreFiles());
    expect(plain.some(f => f.path === 'styles/kit.css')).toBe(false);
    expect(plain.find(f => f.path === 'index.html')!.content).not.toContain('kit.css');
  });
  it('holds the compiled Tailwind output to the protected-element rules: an arbitrary variant cannot fade the buy button', async () => {
    const source = nextStoreFiles().map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content + '\n// [&_.menu-add]:opacity-0 [&_.checkout-button]:hidden [&_.hero]:opacity-0\n' } : f);
    expect(source.some(f => f.content.includes('[&_.menu-add]:opacity-0'))).toBe(true);
    const css = (await compileNextPreview(source)).find(f => f.path === 'styles.css')!.content;
    expect(css).toMatch(/\.hero\s*\{\s*opacity:\s*0/);
    expect(css).not.toMatch(/\.menu-add\s*\{\s*opacity:\s*0/);
    expect(css).not.toMatch(/\.checkout-button\s*\{\s*display:\s*none/);
  });
  it.each([
    '<img src="foto.png" />', '<img src="foto.png"></img>',
    '<img {...props} />', '<img alt="" />', '<img alt={""} />',
    '<img alt=" " />', '<img alt />', '<img alt={null} />',
    '<img alt="" aria-hidden="false" />', '<img alt="" aria-hidden={false} />',
    '<img alt="" role="img" />',
  ])('rejects JSX images without alternative text: %s', markup => {
    const files = nextStoreFiles();
    files.push({ path: 'components/photo.tsx', content: `export const Photo = (props: any) => ${markup};` });
    expect(() => validateNextSources(files)).toThrow('Añade texto alternativo (alt) a cada imagen indicada: components/photo.tsx:1.');
  });
  it.each([
    '<img alt="Café" />', '<img alt={"Café"} />', '<img alt={props.name} />',
    '<img alt="" aria-hidden="true" />', '<img alt={""} aria-hidden={true} />', '<img alt="" aria-hidden />',
    '<img alt="" role="presentation" />', '<img alt="" role={"presentation"} />',
  ])('accepts named or explicitly decorative JSX images: %s', markup => {
    const files = nextStoreFiles();
    files.push({ path: 'components/photo.tsx', content: `export const Photo = (props: any) => ${markup};` });
    expect(() => validateNextSources(files)).not.toThrow();
  });
  it('accepts DNA motif drawings as the one non-component output, and nothing else', () => {
    const drawing = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0h4"/></svg>';
    expect(() => validateNextSources([...nextStoreFiles(), { path: 'motifs/lampara.svg', content: drawing }])).not.toThrow();
    for (const path of ['motifs/a/b.svg', 'assets/lampara.svg', 'motifs/lampara.js']) expect(() => validateNextSources([...nextStoreFiles(), { path, content: drawing }])).toThrow('Archivo React no permitido');
  });
  it('trusts UI components but still validates authored images in their children', () => {
    const files = nextStoreFiles();
    files.push({ path: 'components/photo.tsx', content: 'import { ProductImage as Photo } from "@pagosya/ui"; export const Gallery = () => <Photo />;' });
    expect(() => validateNextSources(files)).not.toThrow();
    files.at(-1)!.content = files.at(-1)!.content.replace('<Photo />', '<Photo><img src="foto.png" /></Photo>');
    expect(() => validateNextSources(files)).toThrow('Añade texto alternativo (alt) a cada imagen indicada: components/photo.tsx:1.');
  });
  it.each(['Hero', 'VideoHero', 'FloatingMedia', 'ScrollScrubHero'])('recognizes the h1 supplied by the trusted %s component', component => {
    const files = nextStoreFiles();
    files[1].content = files[1].content
      .replace("import Header from './Header';", `import Header from './Header'; import { ${component} } from '@pagosya/ui';`)
      .replace('<h1 className="text-3xl font-bold">Nuestra carta</h1>', component === 'Hero'
        ? '<Hero title="Café Norte" />'
        : component === 'VideoHero'
          ? '<VideoHero poster={{src:"/assets/sample.png",alt:"Café"}} title="Café Norte" />'
          : component === 'FloatingMedia'
            ? '<FloatingMedia images={[]} title="Café Norte" />'
            : '<ScrollScrubHero poster={{src:"/assets/sample.png",alt:"Café"}} title="Café Norte" />');
    expect(nextPageMarkup(files, 'home')).toContain('<h1>');
    expect(() => validateNextSources(files)).not.toThrow();
  });
  it('reports a missing h1 during the bounded React repair instead of late preflight', () => {
    const files = nextStoreFiles();
    files[1].content = files[1].content.replace('<h1 className="text-3xl font-bold">Nuestra carta</h1>', '<p>Nuestra carta</p>');
    expect(() => validateNextSources(files)).toThrow('home necesita un encabezado principal h1 visible');
  });
  it('compiles a store that still mounts a retired entrance, which renders nothing', () => {
    const files = nextStoreFiles();
    files[1].content = files[1].content
      .replace("import Header from './Header';", "import Header from './Header'; import { SignatureStrokeEntrance } from '@pagosya/ui';")
      .replace('<main>', '<main><SignatureStrokeEntrance/>');
    const design: any = { selected: 0, concepts: [{ layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true } }] };
    expect(nextPageMarkup(files, 'home')).not.toContain('ui-entrance');
    expect(() => validateNextDesign(files, design)).not.toThrow();
  });
  it('compiles Motion and Lottie and preserves animated semantic layout and portable assets', async () => {
    const source = creativeStoreFiles();
    const compiled = await compileNextPreview(source);
    const design: any = { selected: 0, concepts: [{ layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true } }] };
    expect(() => validateNextDesign(source, design)).not.toThrow();
    const files = withCreativeAssets([...source, ...compiled, ...nextProjectScaffold('creative')]);
    const exported = nextProjectExport(files, 'creative');
    expect(exported.map(file => file.path)).toEqual(expect.arrayContaining(['lib/creative.tsx', 'creative.d.ts', 'public/assets/creative/fluent-flat/coffee.svg', 'public/assets/creative/fluent-3d/croissant.png', 'public/assets/creative/LICENSE-fluent.txt']));
    expect(JSON.parse(exported.find(file => file.path === 'package.json')!.content).dependencies).toMatchObject({ lenis: '1.3.26', motion: '13.1.1', 'lottie-web': '5.13.0' });
    expect(compiled.find(file => file.path === '_compiled/home.js')!.content.length).toBeLessThan(800000);
  });
  it('compiles three React pages and Tailwind without executing merchant modules', async () => {
    const source = nextStoreFiles(); source[1].content = '(globalThis as any).__nextAuthoredExecution = true;\n' + source[1].content;
    const compiled = await compileNextPreview(source);
    expect((globalThis as any).__nextAuthoredExecution).toBeUndefined();
    expect(compiled.find(f => f.path === 'styles.css')!.content).toContain('.text-3xl');
    // One script per page, plus the vendor script they share.
    expect(compiled.filter(f => f.path.startsWith('_compiled/')).map(f => f.path).sort()).toEqual(['_compiled/checkout.js', '_compiled/home.js', '_compiled/product.js', '_compiled/vendor.js']);
    const snapshot = sourceProjectSnapshot({ revision: 0, label: 'Next', brief: nextBrief, files: [...source, ...compiled, ...nextProjectScaffold('test'), { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify(nextStoreConfig)};` }, { path: 'commerce.js', content: '/* runtime */' }, nextStoreImage] });
    expect(() => assertSourceCommerceContract(snapshot)).not.toThrow();
    const exported = nextProjectExport(snapshot.files, 'test');
    expect(JSON.parse(exported.find(f => f.path === 'package.json')!.content).scripts.build).toBe('next build');
    expect(exported.some(f => f.path === 'public/assets/sample.png')).toBe(true);
    expect(exported.some(f => f.path.startsWith('_compiled/'))).toBe(false);
    expect(exported.find(f => f.path === 'pages/index.tsx')!.content).toContain('withCommerce(Page)');
  });
  it.each([
    "import fs from 'node:fs';", "import x from '/etc/passwd';", "import('react');", "new Function('return 1')();",
  ])('rejects unsupported source imports/evaluation: %s', code => {
    const files = nextStoreFiles(); files[1].content = code + files[1].content;
    expect(() => validateNextSources(files)).toThrow();
  });
  it('rejects missing hooks, even if their names occur in comments or another page', () => {
    const files = nextStoreFiles(); files[1].content = files[1].content.replace('data-pagosya-catalog', 'data-other') + '/* data-pagosya-catalog */';
    expect(() => validateNextSources(files)).toThrow('home necesita data-pagosya-catalog');
  });
  it('finds hooks in named shared components and aliases, without borrowing unused exports', async () => {
    const files = nextStoreFiles();
    files[0] = { path: 'components/shared.tsx', content: 'export function Header(){return <header><a href="index.html">Home</a><button data-cart-open>Pedido</button></header>} export const Status = () => <p data-pagosya-status role="status"/>; export function Unused(){return <div data-pagosya-catalog/>}' };
    for (const file of files.filter(f => /components\/(home|product|checkout)\.tsx/.test(f.path))) file.content = file.content.replace("import Header from './Header';", "import { Header as Navigation, Status } from './shared';").replace('<Header/>', '<Navigation/>');
    files[1].content = files[1].content.replace('<p data-pagosya-status role="status" aria-live="polite"/>', '<Status/>');
    expect(() => validateNextSources(files)).not.toThrow();
    const markup = nextPageMarkup(files, 'home');
    expect(markup.match(/data-pagosya-catalog/g)).toHaveLength(1);
    expect(markup).toContain('data-cart-open');
    await expect(compileNextPreview(files)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ path: '_compiled/home.js' })]));
    files[1].content = files[1].content.replace('<div data-pagosya-catalog />', '');
    expect(() => validateNextSources(files)).toThrow('home necesita data-pagosya-catalog');
  });
  it('reports every missing hook across pages so one repair can fix them all', () => {
    const files = nextStoreFiles(); files[0].content = files[0].content.replace('data-cart-open', 'data-other');
    let message = '';
    try { validateNextSources(files); } catch (error) { message = (error as Error).message; }
    expect(message).toContain('home necesita data-cart-open');
    expect(message).toContain('product necesita data-cart-open');
  });
  it('reports image alternatives and missing commerce hooks in the same bounded repair', () => {
    const files = nextStoreFiles();
    files[1].content = files[1].content.replace('<div data-pagosya-catalog />', '<img src="/assets/example.jpg" />');
    let message = '';
    try { validateNextSources(files); } catch (error) { message = (error as Error).message; }
    expect(message).toContain('Añade texto alternativo');
    expect(message).toContain('home necesita data-pagosya-catalog');
  });
  it('sees hooks forwarded through prop spreads and children of shared components', () => {
    const files = nextStoreFiles();
    files[0].content = `function IconButton({ children, ...props }: any) { return <button className="icon" {...props}>{children}</button>; }
export default function Header() { return <header><a href="index.html">Home</a><IconButton data-cart-open aria-label="Pedido">Pedido</IconButton></header>; }`;
    files[2].content = `import Header from './Header'; const Shell = (props: any) => <><Header/>{props.children}</>; export default function Product() { return <Shell><main data-pagosya-product-page/><div data-pagosya-cart hidden/><p data-pagosya-status role="status"/></Shell>; }`;
    expect(() => validateNextSources(files)).not.toThrow();
    expect(nextPageMarkup(files, 'product')).toMatch(/<button[^>]*data-cart-open/);
  });
  it('renders reused tab panels each time with their forwarded ids', () => {
    const files = nextStoreFiles();
    files[1].content = `import { useState } from 'react'; import Header from './Header';
const Panel = ({ children, ...rest }: any) => <section {...rest}>{children}</section>;
export default function Home() { const [tab] = useState('portada'); return <><Header/><main><Panel id="portada" hidden={tab !== 'portada'}><h1>Hola</h1></Panel><Panel id="menu" hidden={tab !== 'menu'}><div data-pagosya-catalog /></Panel></main><div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/></>; }`;
    const design: any = { selected: 0, concepts: [{ layout: { sections: ['portada', 'menu'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false } }] };
    expect(() => validateNextSources(files)).not.toThrow();
    expect(() => validateNextDesign(files, design)).not.toThrow();
  });
  it('supports local components and a separately exported default component', () => {
    const files = nextStoreFiles();
    files[0].content = 'const Cart = () => <button data-cart-open>Pedido</button>; const Header = () => <header><a href="index.html">Home</a><Cart/></header>; export default Header;';
    expect(() => validateNextSources(files)).not.toThrow();
  });
  it('rejects React children inside runtime mounts', () => {
    const files = nextStoreFiles(); files[1].content = files[1].content.replace('<div data-pagosya-catalog />', '<div data-pagosya-catalog><p>Fake product</p></div>');
    expect(() => validateNextSources(files)).toThrow('vacíos');
  });
  it('rejects remote/unsafe maps while preserving supported literal locations', () => {
    const files = nextStoreFiles(); files[1].content = files[1].content.replace('<main>', '<iframe src="https://www.google.com/maps/embed?pb=place" title="Central"/><main>');
    expect(() => validateNextSources(files)).not.toThrow();
    expect(nextPageMarkup(files, 'home')).toContain('maps/embed?pb=place');
    files[1].content = files[1].content.replace('www.google.com', 'attacker.test');
    expect(() => validateNextSources(files)).toThrow('HTTPS');
  });
  it('retains the committed literal layout gate for React', () => {
    const design: any = { selected: 0, concepts: [{ layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true } }] };
    expect(() => validateNextDesign(nextStoreFiles(), design)).not.toThrow();
    const files = nextStoreFiles(); files[1].content = files[1].content.replace('<main>', '<main><section id="hero">Unplanned hero</section>');
    expect(() => validateNextDesign(files, design)).toThrow();
  });
  it('lists every TypeScript error with its line so one repair can fix them all', async () => {
    const files = nextStoreFiles();
    files[1].content = files[1].content.replace('export default function Home()', 'const wrongHome: number = "text";\nexport default function Home()');
    files[2].content = files[2].content.replace('export default function Product()', 'const wrongProduct: number = "text";\nexport default function Product()');
    let message = '';
    try { await compileNextPreview(files); } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/TypeScript components\/home\.tsx:\d+: Type 'string' is not assignable to type 'number'/);
    expect(message).toMatch(/TypeScript components\/product\.tsx:\d+: Type 'string' is not assignable to type 'number'/);
  });
  it('bounds a flood of TypeScript errors to eight lines and a count', async () => {
    const files = nextStoreFiles();
    files[1].content = Array.from({ length: 11 }, (_, i) => `const wrong${i}: number = "x";`).join('\n') + '\n' + files[1].content;
    let message = '';
    try { await compileNextPreview(files); } catch (error) { message = (error as Error).message; }
    expect(message.split('\n').filter(line => line.startsWith('TypeScript '))).toHaveLength(8);
    expect(message).toContain('…y 3 errores más.');
  });
  it('keeps the whole TypeScript report within the repair prompt budget', async () => {
    const files = nextStoreFiles();
    // "missing properties" diagnostics print the whole target type, so each detail is long.
    const shape = Array.from({ length: 12 }, (_, i) => `veryLongPropertyNameForTheDiagnostic${i}: number`).join('; ');
    files[1].content = Array.from({ length: 8 }, (_, i) => `const wrong${i}: { ${shape} } = {};`).join('\n') + '\n' + files[1].content;
    let message = '';
    try { await compileNextPreview(files); } catch (error) { message = (error as Error).message; }
    expect(message.length).toBeLessThanOrEqual(1800);
    expect(message).toMatch(/TypeScript components\/home\.tsx:\d+:/);
  });
  it('returns an actionable compile error for missing local components', async () => {
    const files = nextStoreFiles(); files[1].content = "import Missing from './Missing';\n" + files[1].content.replace('<main>', '<Missing/><main>');
    await expect(compileNextPreview(files)).rejects.toThrow('Missing');
  });
  it('repairs an omitted shared Header or Footer reference without masking unknown components', async () => {
    const files = nextStoreFiles();
    files[3].content = files[3].content.replace('<Header/>', '<Header/><Footer/>');
    const repaired = repairNextSharedComponentReferences(files);
    expect(repaired.find(file => file.path === 'components/checkout.tsx')!.content).toContain('generated page referenced Footer');
    await expect(compileNextPreview(repaired)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ path: '_compiled/checkout.js' })]));
    const unknownFiles = nextStoreFiles();
    const unknown = unknownFiles[3].content.replace('<Header/>', '<Header/><Missing/>');
    expect(repairNextSharedComponentReferences(unknownFiles.map(file => file.path === 'components/checkout.tsx' ? { ...file, content: unknown } : file))).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'components/checkout.tsx', content: unknown })]));
  });
  it('adds a missing import when the generated component file already exists', async () => {
    const files = nextStoreFiles();
    files.push({ path: 'components/Footer.tsx', content: 'export default function Footer() { return <footer><a href="index.html">Inicio</a></footer>; }' });
    files[3].content = files[3].content.replace('<Header/>', '<Header/><Footer/>');
    const repaired = repairNextSharedComponentReferences(files);
    const checkout = repaired.find(file => file.path === 'components/checkout.tsx')!;
    expect(checkout.content).toContain("import Footer from './Footer';");
    expect(checkout.content).not.toContain('generated page referenced Footer');
    await expect(compileNextPreview(repaired)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ path: '_compiled/checkout.js' })]));
  });
});

describe('mechanical authored markup repair', () => {
  const home = (files: ReturnType<typeof nextStoreFiles>) => files.find(f => f.path === 'components/home.tsx')!;

  it('marks an image without alt as decorative instead of failing the generation', () => {
    const files = nextStoreFiles();
    home(files).content = home(files).content.replace('<img src="/assets/sample.png" alt="Marca de prueba" width="16" height="16"/>', '<img src="/assets/sample.png" width="16" height="16"/><img src="/assets/sample.png" alt="" />');
    expect(() => validateNextSources(files)).toThrow(/texto alternativo/);
    const { files: repaired, repairs } = repairNextAuthoredMarkup(files);
    expect(home(repaired).content).toContain('<img src="/assets/sample.png" width="16" height="16" alt="" aria-hidden="true"/>');
    expect(home(repaired).content).toContain('<img src="/assets/sample.png" alt="" aria-hidden="true" />');
    expect(repairs).toEqual(['components/home.tsx: marked 2 images without alt text as decorative']);
    expect(() => validateNextSources(repaired)).not.toThrow();
  });

  it('empties a commerce slot React filled, since the runtime owns what goes inside', async () => {
    const files = nextStoreFiles();
    home(files).content = home(files).content.replace('<div data-pagosya-catalog />', '<div data-pagosya-catalog className="grid"><article>Producto de muestra</article>{null}</div>');
    expect(() => validateNextSources(files)).toThrow(/contenedores de comercio/);
    const { files: repaired, repairs } = repairNextAuthoredMarkup(files);
    expect(home(repaired).content).toContain('<div data-pagosya-catalog className="grid"></div>');
    expect(repairs).toEqual(['components/home.tsx: emptied 1 commerce slot']);
    expect(() => validateNextSources(repaired)).not.toThrow();
    await expect(compileNextPreview(repaired)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ path: '_compiled/home.js' })]));
  });

  it('leaves valid markup untouched', () => {
    const files = nextStoreFiles();
    const { files: repaired, repairs } = repairNextAuthoredMarkup(files);
    expect(repairs).toEqual([]);
    expect(repaired).toEqual(files);
  });
});

describe('mechanical commerce mount repair', () => {
  const home = (files: ReturnType<typeof nextStoreFiles>) => files.find(f => f.path === 'components/home.tsx')!;
  const product = (files: ReturnType<typeof nextStoreFiles>) => files.find(f => f.path === 'components/product.tsx')!;

  it('adds CommerceSlots when a page lacks the cart and status mounts, and the result compiles', async () => {
    const files = nextStoreFiles();
    home(files).content = home(files).content.replace('<div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/>', '');
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(home(repaired).content).toContain('<CommerceSlots />');
    expect(home(repaired).content).toMatch(/import \{[^}]*\bCommerceSlots\b[^}]*\} from '@pagosya\/ui';/);
    expect(repairs).toEqual(['components/home.tsx: added CommerceSlots']);
    expect(() => validateNextSources(repaired)).not.toThrow();
    await expect(compileNextPreview(repaired)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ path: '_compiled/home.js' })]));
  });

  it('leaves design-bearing mounts (product page, catalog) to the AI repair', () => {
    const files = nextStoreFiles();
    product(files).content = product(files).content.replace('<main data-pagosya-product-page/>', '<main/>');
    home(files).content = home(files).content.replace('<div data-pagosya-catalog />', '');
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(product(repaired).content).not.toContain('ProductDetail');
    expect(home(repaired).content).not.toContain('Catalog');
    expect(repairs).toEqual([]);
    expect(() => validateNextSources(repaired)).toThrow('product necesita data-pagosya-product-page');
  });

  it('never duplicates a mount that an imported component renders conditionally', () => {
    const files = nextStoreFiles();
    home(files).content = home(files).content.replace('<div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/>', '');
    files[0].content = "import { CommerceSlots } from '@pagosya/ui';\n" + files[0].content.replace('</header>', '{Math.random() > 1 && <CommerceSlots />}</header>');
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(home(repaired).content).not.toContain('CommerceSlots');
    expect(repairs).toEqual([]);
  });

  it('extends an existing @pagosya/ui import instead of adding a second one', () => {
    const files = nextStoreFiles();
    home(files).content = "import { Reveal } from '@pagosya/ui';\n" + home(files).content.replace('<div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/>', '');
    const { files: repaired } = repairNextCommerceMounts(files);
    expect(home(repaired).content.match(/from '@pagosya\/ui'/g)).toHaveLength(1);
    expect(home(repaired).content).toMatch(/import \{ Reveal, CommerceSlots \} from '@pagosya\/ui';/);
  });

  it('never duplicates a mount the page already names, even inside a conditional', () => {
    const files = nextStoreFiles();
    home(files).content = home(files).content.replace('<div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/>', '{open && <CommerceSlots />}');
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(home(repaired).content.match(/CommerceSlots \/>/g)).toHaveLength(1);
    expect(repairs).toEqual([]);
  });

  it('leaves a page without a default-exported JSX return unchanged', () => {
    const files = nextStoreFiles();
    home(files).content = 'const Page = () => null; export default Page;';
    const { files: repaired, repairs } = repairNextCommerceMounts(files);
    expect(home(repaired).content).toBe('const Page = () => null; export default Page;');
    expect(repairs).toEqual([]);
  });

  it('does not decide where the cart button goes: a missing data-cart-open still fails', () => {
    const files = nextStoreFiles();
    files[0].content = files[0].content.replace('data-cart-open', 'data-other');
    const { files: repaired } = repairNextCommerceMounts(files);
    expect(() => validateNextSources(repaired)).toThrow('home necesita data-cart-open');
  });
});

describe('kit templates in React', () => {
  it('a store using every kit template helper validates and compiles', async () => {
    const files = nextStoreFiles();
    const home = files.find(f => f.path === 'components/home.tsx')!;
    home.content = "import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, ProductPageTemplate, KitSlot } from '@pagosya/ui';\n"
      + home.content.replace('<div data-pagosya-catalog />', `<div data-pagosya-catalog />
<CartTemplate><div className="canasta"><h2>Tu canasta</h2><button data-cart-close>Cerrar</button><KitSlot kind="cart" name="lines" /><KitSlot kind="cart" name="total" /><KitSlot kind="cart" name="action" /></div></CartTemplate>
<CartLineTemplate><li><KitSlot kind="line" name="name" as="h3" /><KitSlot kind="line" name="line-total" as="strong" /><KitSlot kind="line" name="quantity" /></li></CartLineTemplate>
<AddedTemplate><div><KitSlot kind="added" name="message" as="span" /><button data-cart-open>Ver</button></div></AddedTemplate>
<ReviewTemplate><div><KitSlot kind="review" name="summary" /><KitSlot kind="review" name="fields" /></div></ReviewTemplate>
<ProductPageTemplate><article><KitSlot kind="product" name="gallery" /><KitSlot kind="product" name="title" /><KitSlot kind="product" name="pricing" /><KitSlot kind="product" name="buy" /></article></ProductPageTemplate>`);
    expect(() => validateNextSources(files)).not.toThrow();
    const compiled = await compileNextPreview(files);
    const compiledHome = compiled.find(f => f.path === '_compiled/home.js')!;
    expect(compiledHome.content).toContain('data-pagosya-cart-template');
    expect(compiledHome.content).toContain('data-cart-slot');
  });
});

it.each([
  ['type="password"', '<input type="password" />'],
  ["type='password'", "<input type='password' />"],
  ['autoComplete current-password', '<input autoComplete="current-password" />'],
  ['autoComplete new-password', '<input autoComplete="new-password" />'],
  ['expression password', '<input type={"password"} />'],
  ['expression autocomplete', '<input autoComplete={"new-password"} />'],
])('rejects a password field in store code (%s)', async (_label, markup) => {
  const files = nextStoreFiles().map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace('export default function', `const Extra = () => ${markup};\nexport default function`) } : f);
  await expect(compileNextPreview(files)).rejects.toThrow(/contraseña/i);
});

it('accepts an ordinary text input', async () => {
  const files = nextStoreFiles().map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace('export default function', 'const Extra = () => <input type="text" aria-label="Nombre" />;\nexport default function') } : f);
  await expect(compileNextPreview(files)).resolves.toBeDefined();
});
