// Compiles real Next.js projects; under a full parallel run this takes well past the 5s default.
jest.setTimeout(60_000);

import { compileNextPreview, nextPageMarkup, nextProjectExport, nextProjectScaffold, repairNextSharedComponentReferences, validateNextDesign, validateNextSources } from './source-next';
import { nextBrief, nextStoreFiles, nextStoreConfig, nextStoreImage } from './fixtures/next-store';
import { sourceProjectSnapshot } from './source-project';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { creativeStoreFiles } from './fixtures/creative-store';
import { withCreativeAssets } from './source-creative-assets';

describe('Next.js storefront compilation', () => {
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
  it('keeps the trusted page entrance outside the committed content-section count', () => {
    const files = nextStoreFiles();
    files[1].content = files[1].content
      .replace("import Header from './Header';", "import Header from './Header'; import { SignatureStrokeEntrance } from '@pagosya/ui';")
      .replace('<main>', '<main><SignatureStrokeEntrance/>');
    const design: any = { selected: 0, concepts: [{ layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true } }] };
    expect(nextPageMarkup(files, 'home')).toContain('ui-entrance');
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
    expect(compiled.filter(f => f.path.startsWith('_compiled/'))).toHaveLength(3);
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
