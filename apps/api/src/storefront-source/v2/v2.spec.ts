import sharp from 'sharp';
import { assembleV2Files, OWN_CARDS_REQUEST, OWN_ICONS_REQUEST, readConfigData, type V2Context, type V2File, withStoreSettings } from './v2-context';
import { composeV2Home, halfChapters, readV2Half } from './v2-prompts';
import { kitProps, v2WriterInput as writerInput } from './v2-prompts';
import { newestStores, readStoreLooks } from './v2-heroes';
import { v2LookPrompt } from './v2-look';
import { uiRuntime } from '../source-creative';
import { backstageCopy, freeMin, joinV2Parts, mergeV2Fix, readV2Part, showcaseRules, v2ContractProblems, v2DirectionInput, v2DirectionSchema, v2HalfInput, v2Hint, v2Repairs } from './v2-prompts';
import { freeBlocking, inspectionRules, runV2Build } from './v2-run';
import { v2LookLines } from './v2-look';
import { classesIn, cssFor, homeSections, mergeSectionFix, problemsBySection, sectionFixPlan } from './v2-section-fix';
import { v2CartSheet, withKitBaseline } from './v2-kit-baseline';
import { nextPageMarkup } from '../source-next';
import { signatureDistance, type SectionShape } from './v2-signature';
import { cardText, pickReferences, storeShapes } from './v2-references';
import { buildV2Library, readV2LibraryFile, v2LibraryFile, withoutRepeatedPhotos, withUniquePhotos } from './v2-library';
import { SourceV2PrototypeService } from './v2-prototype.service';
import { cropShare, markWordPhotos } from './v2-words';
import { BASIC_BLOCKERS, FREE_BLOCKERS } from './v2-run';
import { allowedHeroIdeas, drawsLibre, heroMarker, readHeroMarker, readShowcases, V2_HERO_IDEAS } from './v2-heroes';
import { existsSync as heroFrameExists, readFileSync as readRuleSource } from 'node:fs';
import { join as heroJoin } from 'node:path';
import { allowedMenus, cleanMenu, menuParts, menuProblems, V2_MENU_MODELS, v2MenuSchema, withStoreMenu } from './v2-menus';
import { SourceV2PrototypeController } from './v2-prototype.controller';
import { capHeight, withPhotoCaps } from './v2-settle';
import { claudeJson, claudeSchema } from './v2-claude';
import { V2_LOOSE_PROMPT, v2WriterPrompt, creativeText, V2_CREATIVE_RULES, V2_MODERN_RULES } from './v2-prompts';

const context: V2Context = {
  storeName: 'Oh Belly', tagline: '', about: '', request: 'sodas', checkoutMode: 'payment', categories: ['Sodas'],
  products: [{ id: 'p1', name: 'Soda', category: 'Sodas', about: '', photos: 1 }],
  photos: [{ path: 'assets/image-a.jpg', width: 1600, height: 1000, shape: 'wide' }],
  places: ['Oh Belly Sopocachi · Av. 20 de Octubre 2150'], whatsapp: true, packs: 0, ownCards: false, goods: 'soda', ownIcons: false,
};
const good: V2File[] = [
  { path: 'components/Shell.tsx', content: `import type { ReactNode } from 'react';\nimport { CommerceSlots, NavShell } from '@pagosya/ui';\nexport function Header() { return <NavShell brand="Oh Belly" links={[{ label: 'Sodas', href: 'productos.html' }]} structure="split" className="v2-nav" />; }\nexport function Footer() { return <footer /> }\nexport default function Shell({ children }: { children: ReactNode }) { return <><Header />{children}<Footer /><CommerceSlots /></>; }` },
  { path: 'components/home.tsx', content: `import Shell from './Shell';\nimport { LibrarySlot } from './v2-library';\nexport default function Home() { return <Shell><main id="contenido"><LibrarySlot name="hero" /><LibrarySlot name="s1" /><LibrarySlot name="s2" /><LibrarySlot name="s3" /><img src="assets/image-a.jpg" alt="Lata" /><div data-pagosya-catalog data-products="p1" /><button type="button" data-add="p1" data-quantity="1">Agregar</button></main></Shell>; }` },
  { path: 'components/product.tsx', content: `import Shell from './Shell';\nimport { ProductPageTemplate, KitSlot } from '@pagosya/ui';\nexport default function Product() { return <Shell><ProductPageTemplate><div><KitSlot kind="product" name="gallery" /><KitSlot kind="product" name="title" /><KitSlot kind="product" name="pricing" /><KitSlot kind="product" name="buy" /></div></ProductPageTemplate><main id="contenido" data-pagosya-product-page /></Shell>; }` },
  { path: 'styles/globals.css', content: ':root { --v2-ink: #111; } .v2-hero { display: grid; }' },
  v2LibraryFile({ blocks: { hero: { type: 'cover-split', title: 'Oh Belly', photo: 'assets/image-a.jpg' }, s1: { type: 'statement-inline', title: 'Burbujas' },
    s2: { type: 'faq', title: 'Preguntas' }, s3: { type: 'closing-photo', title: 'Salud', photo: 'assets/image-a.jpg' } }, order: ['hero', 's1', 's2', 's3'], dropped: {} }),
];

describe('v2 prototype: the source tree', () => {
  const base = [
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"storeName":"Oh Belly"}};' },
    { path: 'components/Shell.tsx', content: "import { layout } from './store-data';\nimport { CardTemplate } from './library';" },
    { path: 'components/home.tsx', content: "import Shell from './Shell';\nimport { LibraryHome } from './library';" },
    { path: 'components/library.tsx', content: "import { IconX } from './icons';" },
    { path: 'components/icons.tsx', content: 'export const IconX = 1;' },
    { path: 'components/store-data.tsx', content: 'export const layout = [];' },
    { path: 'components/account/orders.tsx', content: "// @pagosya-page\nimport Shell from '../Shell';" },
    { path: 'components/page-productos.tsx', content: "// @pagosya-catalog-page — the platform's catalogue page\nimport Shell from './Shell';" },
    { path: 'components/checkout.tsx', content: "import { Header, Footer } from './Shell';" },
    { path: 'styles/globals.css', content: '/* 485 KB of template */' },
    { path: '_compiled/home.js', content: 'old' },
    { path: 'assets/image-a.jpg', content: 'AAAA', encoding: 'base64' as const },
  ];

  it('keeps no template design file: only the platform\'s pages, runtime, data and photos, and the four written files', () => {
    const paths = assembleV2Files(base as never, good).map(file => file.path).sort();
    // The home places a library section: the library's code comes fresh from the template package, with the store's data file.
    expect(paths).toEqual(['assets/image-a.jpg', 'components/Shell.tsx', 'components/account/orders.tsx', 'components/checkout.tsx', 'components/home.tsx',
      'components/icons.tsx', 'components/library.tsx', 'components/page-productos.tsx', 'components/product.tsx', 'components/store-data.tsx', 'components/v2-library.tsx',
      'config.js', 'styles/globals.css'].sort());
    const out = assembleV2Files(base as never, good);
    expect(out.find(file => file.path === 'components/library.tsx')!.content).toContain('export function LibraryBlockView');
    expect(out.find(file => file.path === 'styles/globals.css')!.content).toMatch(/\/\* v2:library[^]*--es-paper:var\(--kit-paper[^]*\.lb-/);
    const sheet = out.find(file => file.path === 'styles/globals.css')!.content;
    expect(sheet).toContain('.v2-hero');
    expect(sheet).toMatch(/^\/\* v2:kit-baseline/);
    expect(sheet.trimEnd().endsWith('/* /v2:cards */')).toBe(true);
    expect(sheet).toMatch(/:where\(\[data-part=payment-logos\]\) :where\(svg, img\)\{width:38px;height:24px/);
    // The design's part (the writer's sheet is refused with !important); the library's own template styles keep theirs.
    expect(sheet.slice(0, sheet.indexOf('/* v2:library'))).not.toMatch(/!important/);
    expect(readConfigData(out).data.storeName).toBe('Oh Belly');
  });

  it('keeps the product card the platform\'s: the design\'s card rules go, the rest of its sheet stays — unless the merchant asked', () => {
    const css = `:root{--kit-ink:#222}.v2-shop{padding:40px}.v2-shop .menu-item{display:flex;writing-mode:vertical-rl}.v2-shop .menu-add,.v2-cta{width:100%}
@media (max-width:600px){.menu-item__image{height:200px}.v2-shop{padding:16px}}[data-pagosya-catalog]{grid-template-columns:1fr}`;
    const written = good.map(file => file.path === 'styles/globals.css' ? { ...file, content: css } : file);
    const sheet = assembleV2Files([], written).find(file => file.path === 'styles/globals.css')!.content;
    const design = sheet.slice(sheet.indexOf('/* /v2:kit-baseline */'), sheet.indexOf('/* v2:library'));
    expect(design).toContain('.v2-shop{padding:40px}');
    expect(design).toContain('.v2-cta{width:100%}');
    expect(design).toContain('.v2-shop{padding:16px}');
    expect(design).not.toMatch(/menu-item|menu-add|writing-mode|data-pagosya-catalog/);
    expect(sheet).toContain('.menu-item[data-product-id] .menu-item__image{display:block;width:100%;height:auto;aspect-ratio:var(--kit-card-ratio,4/5)');
    const own = assembleV2Files([], written, true).find(file => file.path === 'styles/globals.css')!.content;
    expect(own).toContain('.v2-shop .menu-item{display:flex');
    expect(own).not.toContain('v2:cards');
  });

  it('moves a product mount written inside ProductPageTemplate to right after it', () => {
    const inside = `export default function Product() {\n  return (\n    <Shell>\n      <ProductPageTemplate>\n        <div><KitSlot kind="product" name="gallery" /></div>\n\n        <main id="contenido" data-pagosya-product-page />\n      </ProductPageTemplate>\n    </Shell>\n  );\n}`;
    const out = v2Repairs([{ path: 'components/product.tsx', content: inside }]);
    const product = out.files[0].content;
    expect(product.indexOf('data-pagosya-product-page')).toBeGreaterThan(product.indexOf('</ProductPageTemplate>'));
    expect(product.match(/data-pagosya-product-page/g)).toHaveLength(1);
    expect(out.repairs.join()).toMatch(/fuera de ProductPageTemplate/);
    expect(v2Repairs(good).repairs.join()).not.toMatch(/ProductPageTemplate/);
  });

  it('keeps size buttons and the main photo the platform\'s', () => {
    const css = '.v2-buy .product-detail__values{display:grid}.v2-buy [data-part=swatch]{width:100%}.v2-buy{gap:12px}';
    const written = good.map(file => file.path === 'styles/globals.css' ? { ...file, content: css } : file);
    const sheet = assembleV2Files([], written).find(file => file.path === 'styles/globals.css')!.content;
    const design = sheet.slice(sheet.indexOf('/* /v2:kit-baseline */'), sheet.indexOf('/* v2:library'));
    expect(design).toContain('.v2-buy{gap:12px}');
    expect(design).not.toMatch(/product-detail__values|swatch/);
    expect(sheet).toContain('.product-detail__values{display:flex;flex-wrap:wrap');
  });

  it('keeps the header\'s three icons and draws the cart as what the store sells, unless the merchant asked for other icons', () => {
    const shell = good[0].content.replace('structure="split"', 'structure="split" actions="labels"');
    const written = good.map(file => file.path === 'components/Shell.tsx' ? { ...file, content: shell } : file);
    const out = v2Repairs(written, { goods: 'shirt', ownIcons: false }).files.find(file => file.path === 'components/Shell.tsx')!.content;
    expect(out).toContain('<NavShell cart="shirt"');
    expect(out).toContain('actions="icons"');
    expect(out).not.toContain('actions="labels"');
    const own = v2Repairs(written, { goods: 'shirt', ownIcons: true }).files.find(file => file.path === 'components/Shell.tsx')!.content;
    expect(own).toBe(shell);
    const css = '.v2-nav{gap:20px}.v2-nav .ui-nav__icon{display:none}.v2-nav [data-nav-action=bag]{background:red}';
    const sheet = assembleV2Files([], good.map(file => file.path === 'styles/globals.css' ? { ...file, content: css } : file)).find(file => file.path === 'styles/globals.css')!.content;
    expect(sheet).toContain('.v2-nav{gap:20px}');
    // How the icons look is the platform's; where the design places them stays (live round 4: NOA's icons fell to a second row).
    expect(sheet).not.toMatch(/ui-nav__icon\{display:none/);
    expect(sheet).toContain('.v2-nav [data-nav-action=bag]{background:red}');
    for (const ask of ['cambia los íconos del header', 'otro ícono para el carrito']) expect(OWN_ICONS_REQUEST.test(ask)).toBe(true);
    expect(OWN_ICONS_REQUEST.test('vendo poleras y hoodies')).toBe(false);
  });

  it('hears a merchant asking for their own product cards', () => {
    for (const ask of ['cambia las tarjetas de producto', 'quiero tarjetas de productos más grandes', 'rediseña las tarjetas']) expect(OWN_CARDS_REQUEST.test(ask)).toBe(true);
    for (const ask of ['vendo sodas prebióticas', 'aceptamos tarjeta de crédito', 'una tienda de tarjetas de regalo']) expect(OWN_CARDS_REQUEST.test(ask)).toBe(false);
  });

  it('keeps a template component a written file still imports', () => {
    const written = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: `import { IconX } from './icons';\n${file.content}` } : file);
    expect(assembleV2Files(base as never, written).some(file => file.path === 'components/icons.tsx')).toBe(true);
  });
});

describe('v2 prototype: the contract', () => {
  it('accepts a design that places every commerce part through the kit', () => {
    expect(v2ContractProblems(good, context)).toEqual([]);
  });

  it('reads the two writer parts and joins them, the pages\' CSS after the design system\'s', () => {
    const system = readV2Part({ files: [good[3], good[0]], css: '', notes: '' }, 'system')!;
    const pages = readV2Part({ files: [good[2], good[1]], css: '.v2-flavours { display: flex; }', notes: '' }, 'pages')!;
    expect(system.files.map(file => file.path)).toEqual(['components/Shell.tsx', 'styles/globals.css']);
    expect(readV2Part({ files: [good[1]], css: '', notes: '' }, 'pages')).toBeNull();
    const joined = joinV2Parts(system, pages);
    expect(joined.map(file => file.path)).toEqual(['components/Shell.tsx', 'components/home.tsx', 'components/product.tsx', 'styles/globals.css']);
    expect(joined[3].content).toBe(`${good[3].content}\n\n/* Páginas */\n.v2-flavours { display: flex; }\n`);
    expect(v2ContractProblems([...joined, good[4]], context)).toEqual([]);
  });

  it('refuses written prices, unknown products and photos, missing slots, !important and a page with two h1', () => {
    const bad = good.map(file => file.path === 'components/home.tsx'
      ? { ...file, content: file.content.replace('<LibrarySlot name="hero" />', '<LibrarySlot name="hero" /><h1>Oh Belly</h1><p>Solo Bs 25</p>').replace('data-add="p1"', 'data-add="p9"').replace('image-a', 'image-z') }
      : file.path === 'components/product.tsx' ? { ...file, content: file.content.replace('name="pricing"', 'name="price"') }
      : file.path === 'styles/globals.css' ? { ...file, content: '.v2 { color: red !important; }' } : file);
    const problems = v2ContractProblems(bad, context).join('\n');
    expect(problems).toMatch(/<h1>/);
    expect(problems).toMatch(/No escribas precios/);
    expect(problems).toMatch(/«p9» no es un producto/);
    expect(problems).toMatch(/image-z\.jpg no existe/);
    expect(problems).toMatch(/«pricing»/);
    expect(problems).toMatch(/!important/);
  });

  it('names each commerce mount that has children, by file and line, and refuses pipes in data-products (live 2026-11-14)', () => {
    const filled = good.map(file => file.path === 'components/home.tsx'
      ? { ...file, content: file.content.replace('<div data-pagosya-catalog data-products="p1" />', '<section data-pagosya-catalog data-products="p1|p1">\n<h2>Sabores</h2>\n</section>') } : file);
    const problems = v2ContractProblems(filled, context);
    expect(problems.find(line => /home\.tsx:\d+: <section data-pagosya-catalog> tiene contenido/.test(line))).toBeTruthy();
    expect(problems.find(line => /separa los ids con comas/.test(line))).toBeTruthy();
    expect(v2ContractProblems(good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('data-products="p1"', 'data-products="p1, p7"') } : file), context))
      .toContain('El id «p7» de data-products no es un producto de la tienda.');
  });

  it('refuses the same product row twice on the home, and more than three rows (live 2026-11-14, BOXY)', () => {
    const rail = '<div data-pagosya-catalog data-products={featured} className="rail" />';
    const twice = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<div data-pagosya-catalog data-products="p1" />', `${rail}<section>${rail}</section>`) } : file);
    expect(v2ContractProblems(twice, context).join('\n')).toMatch(/repite la misma fila de productos \(\{featured\}\)/);
    const many = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<div data-pagosya-catalog data-products="p1" />',
      '<div data-pagosya-catalog /><div data-pagosya-catalog data-category="A" /><div data-pagosya-catalog data-category="B" /><div data-pagosya-catalog data-products="p1" />') } : file);
    expect(v2ContractProblems(many, context).join('\n')).toMatch(/tiene 4 filas de productos/);
    expect(v2ContractProblems(good, context)).toEqual([]);
  });

  it('turns the template hint that adds product rows into «a store photo, or remove it» (live 2026-11-14)', () => {
    const line = 'Sección de solo texto sobre fondo liso («Cuidado»). Dale una foto real a su lado o muestra los productos (data-pagosya-catalog data-products="Nombre|Nombre"); si no queda una foto libre, quítala.';
    expect(v2Hint(line)).not.toMatch(/data-pagosya-catalog/);
    expect(v2Hint(line)).toMatch(/nunca agregues otra fila de productos/);
    expect(v2Hint('Banda de color oscuro solo con texto («x»). Ponle una foto real o productos al lado, o pásala a un fondo claro con una foto.')).toMatch(/foto real de la tienda al lado/);
    expect(v2Hint('Textos encimados (a con b)')).toBe('Textos encimados (a con b)');
  });

  it('accepts product slots named in a list the page maps over', () => {
    const mapped = good.map(file => file.path === 'components/product.tsx' ? { ...file, content: file.content.replace(/<KitSlot kind="product" name="(gallery|title|pricing|buy)" \/>/g, '').replace('<div>', `<div>{['gallery', 'title', 'pricing', 'buy'].map(slot => <KitSlot key={slot} kind="product" name={slot} />)}`) } : file);
    expect(v2ContractProblems(mapped, context)).toEqual([]);
  });

  it('refuses a packs section when the store has no packs, and lays chosen products out as a grid by default', () => {
    const withPacks = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('</main>', '<div data-pagosya-bundles /></main>') } : file);
    expect(v2ContractProblems(withPacks, context).join('\n')).toMatch(/no tiene packs activos/);
    expect(v2ContractProblems(withPacks, { ...context, packs: 2 })).toEqual([]);
    const sheet = assembleV2Files([], good).find(file => file.path === 'styles/globals.css')!.content;
    expect(sheet).toMatch(/:where\(\[data-pagosya-catalog\]:not\(\[data-catalog-full\]\)\)\{display:grid/);
    expect(sheet).toMatch(/@media \(max-width:600px\)\{\[data-pagosya-catalog\]:not\(\[data-catalog-full\]\)\{--cat-cols:2/);
    expect(sheet).toMatch(/> \.menu-item\[data-product-id\] > \.menu-add\{margin-top:auto\}/);
  });

  it('merges a fix over the previous files and ignores a fix that brings nothing usable', () => {
    const fixed = mergeV2Fix(good, { files: [{ path: 'components/home.tsx', content: 'export default function Home() { return null; }' }], notes: '' })!;
    expect(fixed.map(file => file.path)).toEqual(good.map(file => file.path));
    expect(fixed[1].content).toBe('export default function Home() { return null; }');
    expect(fixed[0]).toBe(good[0]);
    expect(mergeV2Fix(good, { files: [{ path: 'components/other.tsx', content: 'x' }], notes: '' })).toBeNull();
  });

  it('lets the direction pick only the store\'s photos and the bundled fonts', () => {
    const schema = v2DirectionSchema(context) as { properties: { hero: { properties: { photo: { enum: string[] } } }; display: { enum: string[] } } };
    expect(schema.properties.hero.properties.photo.enum).toEqual(['', 'assets/image-a.jpg']);
    expect(schema.properties.display.enum.length).toBeGreaterThan(20);
  });
});

describe('v2 prototype: free mode (owner 2026-11-14 «the freer path, like v0, Lovable or Amboras»)', () => {
  const sections = (count: number) => Array.from({ length: count }, (_, at) => `<section className="v2-ch${at}"><h2>Capítulo ${at}</h2>${at ? '' : '<img src="assets/image-a.jpg" alt="" />'}</section>`).join('');
  const chapters = '<section className="v2-uses" /><section className="v2-band" /><section data-pagosya-reviews-section><div data-pagosya-reviews /></section><section className="v2-related"><KitSlot kind="product" name="related" /></section>';
  const home = (body: string) => good.map(file => file.path === 'components/home.tsx'
    ? { ...file, content: `import Shell from './Shell';\nexport default function Home() { return <Shell><main id="contenido"><section className="v2-hero"><h1>Oh Belly</h1></section>${body}<div data-pagosya-catalog data-products="p1" /></main></Shell>; }` }
    : file.path === 'components/product.tsx' ? { ...file, content: file.content.replace('</div></ProductPageTemplate>', `</div>${chapters}</ProductPageTemplate>`) } : file)
    .filter(file => file.path !== 'components/v2-library.tsx');
  it('asks a free product page for the brand\'s chapters after its buy area, and no React state inside the template (owner 2026-11-15, Brightland)', () => {
    const short = home(sections(9)).map(file => file.path === 'components/product.tsx' ? good.find(entry => entry.path === file.path)! : file);
    expect(v2ContractProblems(short, { ...context, free: true }).join('\n')).toMatch(/página de producto se queda corta/);
    const stateful = home(sections(9)).map(file => file.path === 'components/product.tsx' ? { ...file, content: file.content.replace('<section className="v2-uses" />', '<section className="v2-uses" onClick={() => setOpen(true)} />') } : file);
    expect(v2ContractProblems(stateful, { ...context, free: true }).join('\n')).toMatch(/plantilla que se copia/);
  });
  it('takes a home of the writer\'s own sections — no library quota, no kit-only classes — from 9 to 14 sections', () => {
    expect(v2ContractProblems(home(sections(9)), { ...context, free: true })).toEqual([]);
    expect(v2ContractProblems(home(sections(4)), { ...context, free: true }).join('\n')).toMatch(/de 7 a 14 capítulos/); // one photo of its own: 7 is enough (freeMin)
    expect(v2ContractProblems(home(sections(15)), { ...context, free: true }).join('\n')).toMatch(/como mucho 14/);
    expect(v2ContractProblems(home(sections(9)), context).join('\n')).toMatch(/biblioteca/);
  });
  it('the header keeps its colours but never its own height or position, and the card takes the design\'s card tokens', () => {
    const sheet = withKitBaseline('.ui-nav{height:120px;position:absolute;background:#111;color:#fff}\n.site header{min-height:90px;border-bottom:1px solid}\n.ui-nav__links{position:relative}\n:root{--kit-card-ratio:1/1}');
    expect(sheet).toMatch(/\.ui-nav\{background:#111;color:#fff\}/);
    expect(sheet).toMatch(/\.site header\{border-bottom:1px solid\}/);
    expect(sheet).toMatch(/\.ui-nav__links\{position:relative\}/);
    expect(sheet).toMatch(/--kit-card-ratio:1\/1/);
    expect(sheet).toMatch(/text-transform:var\(--kit-card-case,none\)/);
  });
  it('takes the platform card class off a featured mount (live 2026-11-14, Meat House)', () => {
    const files = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<div data-pagosya-catalog data-products="p1" />', '<div data-pagosya-catalog data-products="p1" /><div data-pagosya-spotlight="p1" data-side="right" className="mh-hero-product spotlight" />') } : file);
    const out = v2Repairs(files);
    expect(out.files.find(file => file.path === 'components/home.tsx')!.content).toContain('className="mh-hero-product"');
    expect(out.repairs.join(' ')).toMatch(/data-pagosya-spotlight/);
  });
  it('gives a product page with none of its four slots a plain composition of them (live 2026-11-14: NOA, Meat House attempt 1)', () => {
    const files = good.map(file => file.path === 'components/product.tsx' ? { ...file, content: "import Shell from './Shell';\nimport { ProductPageTemplate } from '@pagosya/ui';\nexport default function Product() { return <Shell><ProductPageTemplate><div className=\"pp\" /></ProductPageTemplate><main id=\"contenido\" data-pagosya-product-page /></Shell>; }" } : file);
    const out = v2Repairs(files);
    const product = out.files.find(file => file.path === 'components/product.tsx')!.content;
    expect(product).toContain('import { ProductPageTemplate, KitSlot } from');
    expect(product).toMatch(/<ProductPageTemplate><div className="v2-product-page"><div className="pp" \/><div className="v2-pp-fallback"[\s\S]*name="buy" \/><\/div><\/div><\/div><\/ProductPageTemplate>/);
    expect(v2ContractProblems(out.files, context).filter(line => /hueco obligatorio/.test(line))).toEqual([]);
    expect(v2Repairs(good).files.find(file => file.path === 'components/product.tsx')!.content).toBe(good.find(file => file.path === 'components/product.tsx')!.content);
  });
  it('offers the showcase pieces only with two cut-outs, the stage to the first half and the rail to the second (owner 2026-11-15)', () => {
    const cutouts = [{ path: 'assets/image-aaaaaaaaaaaa.webp', product: 'p1', name: 'Uno', width: 600, height: 800 }, { path: 'assets/image-bbbbbbbbbbbb.webp', product: 'p2', name: 'Dos', width: 600, height: 800 }];
    expect(showcaseRules({ cutouts: cutouts.slice(0, 1) }, 'both')).toBe('');
    expect(showcaseRules({ cutouts }, 'stage')).toMatch(/<ProductStage/);
    expect(showcaseRules({ cutouts }, 'stage')).not.toMatch(/<HangingRail/);
    expect(showcaseRules({ cutouts }, 'rail')).toMatch(/<HangingRail/);
    expect(v2DirectionInput({ ...context, cutouts })).toMatch(/RECORTES \(fotos sin fondo[\s\S]*assets\/image-aaaaaaaaaaaa\.webp · p1 · Uno/);
    expect(v2DirectionInput({ ...context, cutouts })).toMatch(/VITRINAS/);
    const direction = { sections: ['vitrina', 'historia', 'preguntas', 'visita'].map(role => ({ role, composition: 'c' })) } as never;
    expect(v2HalfInput({ ...context, cutouts }, direction, 'a', [], { facts: '' })).toMatch(/<ProductStage/);
    expect(v2HalfInput({ ...context, cutouts }, direction, 'b', [], { facts: '' })).toMatch(/<HangingRail/);
    // A cut-out is a photo of the store for the contract.
    const withCut = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main', '<main data-x="assets/image-aaaaaaaaaaaa.webp"') } : file);
    expect(v2ContractProblems(withCut, context).join()).toMatch(/assets\/image-aaaaaaaaaaaa\.webp no existe/);
    expect(v2ContractProblems(withCut, { ...context, cutouts }).join()).not.toMatch(/no existe/);
    // The showcase pieces take cut-outs only (live 2026-11-15, Oh Belly rev 17).
    const photo = context.photos[0].path;
    const staged = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main', `<main><ProductStage slides={[{ product: 'p1', top: 'A', image: { src: '${photo}', alt: 'x' }, bg: '#000' }, { product: 'p1', top: 'B', image: { src: 'assets/image-aaaaaaaaaaaa.webp', alt: 'y' }, bg: '#111' }]} /></main><main`) } : file);
    const lines = v2ContractProblems(staged, { ...context, cutouts }).filter(line => /ProductStage usa/.test(line));
    expect(lines).toEqual([`ProductStage usa ${photo}, que no es un recorte: en las vitrinas van solo RECORTES (assets/…webp de la lista), nunca fotos con fondo.`]);
    // One cut-out per screen (live 2026-11-15, Oh Belly rev 18: one can on all five flavour screens).
    const cut = cutouts[0].path;
    const same = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main', `<main><ProductStage slides={[{ product: 'p1', top: 'A', image: { src: '${cut}', alt: 'x' }, bg: '#000' }, { product: 'p1', top: 'B', image: { src: '${cut}', alt: 'y' }, bg: '#111' }]} /></main><main`) } : file);
    expect(v2ContractProblems(same, { ...context, cutouts }).join()).toMatch(/ProductStage pone assets\/image-aaaaaaaaaaaa\.webp en más de una pantalla/);
    expect(v2ContractProblems(staged, { ...context, cutouts }).join()).not.toMatch(/en más de una pantalla/);
    // Each photo once on the home outside the stage, and the writer hears which photos are product photos and what each cut-out shows
    // (owner 2026-11-15 «there are some repeated things», Oh Belly rev 18).
    const twice = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main', `<main data-a="${photo}" data-b="${photo}"`) } : file);
    expect(v2ContractProblems(twice, { ...context, photos: [...context.photos, { path: 'assets/image-z.jpg', width: 800, height: 800, shape: 'square' } ] }).join()).toMatch(/aparece \d+ veces en la portada/);
    // With no photo left to use instead, a repeat does not block: the screenshot review asks for it.
    expect(v2ContractProblems(twice, context).join()).not.toMatch(/aparece \d+ veces/);
    expect(v2ContractProblems(staged, { ...context, cutouts }).join()).not.toMatch(/aparece \d+ veces/);
    expect(v2DirectionInput({ ...context, photos: [{ ...context.photos[0], product: 'Soda' }], cutouts: [{ ...cutouts[0], what: 'lata Lemon · Ginger' }, cutouts[1]] }))
      .toMatch(/es la foto del producto «Soda»[\s\S]*muestra: lata Lemon · Ginger/);
    expect(freeMin({ photos: [] })).toBe(7);
    // Two mistakes that cost whole rounds are repaired before the checks (Oh Belly build 2026-11-15).
    const sloppy = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('</main>', '<section className="packs"><h2>Packs</h2><div data-pagosya-bundles /></section><Parallax speed={0.3}><img src="x" alt="" /></Parallax></main>') } : file);
    const tidy = v2Repairs(sloppy, { goods: 'bag', ownIcons: true, packs: 0 }).files.find(file => file.path === 'components/home.tsx')!.content;
    expect(tidy).not.toMatch(/data-pagosya-bundles|className="packs"|speed=/);
    expect(tidy).toMatch(/<Parallax><img/);
    // The store's current contact setting wins over an old config.js copy (Oh Belly r22: «Hablemos» stood empty).
    const stale = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"ob","data":{"name":"Oh Belly","contactFormEnabled":false}};' }];
    expect(readConfigData(withStoreSettings(stale, { contactFormEnabled: true })).data).toEqual({ name: 'Oh Belly', contactFormEnabled: true });
    expect(withStoreSettings(stale, { contactFormEnabled: false })[0]).toBe(stale[0]);
    // The writer's own honesty rules never reach the shopper (Oh Belly r22).
    expect(backstageCopy([{ path: 'components/home.tsx', content: `const f = [{ note: 'Nombre previsto; activo final pendiente.' }];\n<p>Solo Lemon · Ginger cuenta hoy con recorte aprobado.</p><p>Sin nombre, fruta ni color inventados.</p><p>Sabores inventados en casa, hechos con fruta.</p>` }]))
      .toEqual(['Nombre previsto; activo final pendiente.', 'recorte aprobado.', 'ni color inventados.']);
    // Any prop a kit component does not take is dropped, read from the kit's own props (Oh Belly rev 22: style on ScrollScale).
    const props = v2Repairs([{ path: 'components/home.tsx', content: `import { ScrollScale, Marquee as Band, Hairline } from '@pagosya/ui';
function Wave({ style }: { style?: object }) { return <i style={style} />; }
export default function Home() { return <main><ScrollScale className="a" style={{ maxHeight: '60vh' }} data-x="1" from={0.9}><img src="x" alt="" /></ScrollScale><Band items={['a']} speed={20} tone="dark" /><Hairline className="h" /><Wave style={{}} /><ProductRail title="x" layout="grid" columns={3} /></main>; }` }]);
    const home = props.files[0].content;
    expect(home).toMatch(/<ScrollScale className="a" data-x="1" from=\{0\.9\}>/);
    expect(home).toMatch(/<Band items=\{\['a'\]\} speed=\{20\} \/>/);
    expect(home).toMatch(/<Hairline \/>/);
    expect(home).toMatch(/<Wave style=\{\{\}\} \/>/);
    expect(home).toMatch(/<ProductRail title="x" columns=\{3\} \/>/);
    expect(props.repairs).toEqual(expect.arrayContaining(['components/home.tsx: ScrollScale sin style', 'components/home.tsx: Band sin tone', 'components/home.tsx: ProductRail sin layout']));
    // A second use of a photo is swapped for a spare one before the contract runs (DooBoo r7, Oh Belly r19).
    const spare = { path: 'assets/image-b.jpg', width: 800, height: 800, shape: 'square' as const }, spare2 = { ...spare, path: 'assets/image-c.jpg' };
    const swapped = v2Repairs(twice, { goods: 'bag', ownIcons: true, photos: [...context.photos, spare, spare2], cutouts });
    expect(swapped.repairs.join()).toMatch(/repetida → assets\/image-b\.jpg/);
    expect(v2ContractProblems(swapped.files, { ...context, photos: [...context.photos, spare, spare2] }).join()).not.toMatch(/image-a\.jpg aparece/);
    // The home's last section is not a second footer (Oh Belly rev 18).
    const withFooter = (closing: string) => good.map(file => file.path === 'components/Shell.tsx' ? { ...file, content: file.content.replace('</Shell', '</Shell') + '\n// <footer><h3>Comprar</h3><a>Sodas</a><a>Packs</a><h3>Ayuda</h3><a>Contacto</a></footer>' }
      : file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('</main>', `${closing}</main>`) } : file);
    expect(v2ContractProblems(withFooter('<section className="ob-closing"><h3>Comprar</h3><a>Sodas</a><a>Packs</a><h3>Ayuda</h3></section>'), context).join()).toMatch(/«ob-closing» repite el pie/);
    expect(v2ContractProblems(withFooter('<section className="ob-offer"><h2>10% en tu primera compra</h2><a>Comprar</a></section>'), context).join()).not.toMatch(/repite el pie/);
    // Live 2026-11-16 (rhode failed 4 rounds): a category section names the categories the footer lists too — that is not a second footer.
    const shop = { ...context, categories: ['Labios', 'Rubor', 'Sets'] } as V2Context;
    const footerCats = withFooter('<section className="v2-runway"><a>Todo</a><a>Labios</a><a>Rubor</a><a>Sets</a></section>').map(file => file.path === 'components/Shell.tsx' ? { ...file, content: file.content.replace('</footer>', '<a>Todo</a><a>Labios</a><a>Rubor</a><a>Sets</a></footer>') } : file);
    expect(v2ContractProblems(footerCats as never, shop).join()).not.toMatch(/repite el pie/);
    expect(freeMin({ photos: Array.from({ length: 6 }, (_, i) => ({ path: `assets/p${i}.jpg`, width: 800, height: 800, shape: 'square' as const })) })).toBe(9);
  });
  it('gives the product template one root, the page one contact form, KineticHeadline its text (live 2026-11-15, DooBoo r3)', () => {
    const product = "import Shell from './Shell';\nimport { KitSlot, ProductPageTemplate } from '@pagosya/ui';\nexport default function Product() { return <Shell><ProductPageTemplate>\n<section className=\"buy\"><KitSlot kind=\"product\" name=\"gallery\" /><KitSlot kind=\"product\" name=\"title\" /><KitSlot kind=\"product\" name=\"pricing\" /><KitSlot kind=\"product\" name=\"buy\" /></section>\n{/* capítulos */}\n<section className=\"story\"><h2>Historia</h2></section>\n</ProductPageTemplate><main id=\"contenido\" data-pagosya-product-page /></Shell>; }";
    const home = '<a className="doo-text-link" href="productos.html">Ver todo</a><section><h3>Confirma</h3><div className="doo-inline" data-pagosya-contact /></section><a data-pagosya-contact-open href="contacto.html">x</a><section><h2>Correo</h2><div data-pagosya-contact /></section>'
      + '<KineticHeadline as="h1" className="t">Una cucharada <em>suave</em>{\' \'}hoy</KineticHeadline><KineticHeadline text="ok">ok</KineticHeadline>';
    const out = v2Repairs([{ path: 'components/product.tsx', content: product }, { path: 'components/home.tsx', content: home }]);
    const page = out.files.find(file => file.path === 'components/product.tsx')!.content;
    expect(page).toMatch(/<ProductPageTemplate><div className="v2-product-page">\n<section className="buy">[\s\S]*Historia<\/h2><\/section>\n<\/div><\/ProductPageTemplate>/);
    const again = v2Repairs(out.files);
    expect(again.files.find(file => file.path === 'components/product.tsx')!.content).toBe(page);
    const written = out.files.find(file => file.path === 'components/home.tsx')!.content;
    expect(written).toContain('<a className="doo-inline doo-text-link" href="contacto.html" data-pagosya-contact-open>Escríbenos</a>');
    // A link written before the design's link class counted (DooBoo r4) gets it on the next pass.
    const older = v2Repairs([{ path: 'components/home.tsx', content: '<a className="doo-text-link" href="x">x</a><a className="doo-Binline-contact" href="contacto.html" data-pagosya-contact-open>Escríbenos</a>' }]);
    expect(older.files[0].content).toContain('className="doo-Binline-contact doo-text-link"');
    expect(written.match(/data-pagosya-contact\b(?!-)/g)).toHaveLength(1);
    expect(written).toContain('<h2>Correo</h2><div data-pagosya-contact />');
    expect(written).toContain('<KineticHeadline as="h1" className="t" text={"Una cucharada suave hoy"} />');
    expect(written).toContain('<KineticHeadline text="ok">ok</KineticHeadline>');
  });
  it('dresses the cart drawer per store: its name, the look the direction chose, a store photo only for «photo» (owner 2026-11-14)', () => {
    const band = v2CartSheet('band', 'Gramiyaa');
    expect(band).toMatch(/--cart-store:"GRAMIYAA"/);
    expect(band).toMatch(/--store-accent:var\(--kit-accent/);
    expect(v2CartSheet('photo', 'Meat House', 'assets/image-a.jpg')).toMatch(/--cart-photo:url\(assets\/image-a\.jpg\)/);
    expect(v2CartSheet('photo', 'Meat House', 'https://evil.example/x.jpg')).not.toMatch(/cart-photo:url/);
    expect(v2CartSheet('nope', 'NOA "x"')).toMatch(/v2:cart \(band\)[\s\S]*--cart-store:"NOA  X "/);
    const sheet = assembleV2Files([], good, false, false, band).find(file => file.path === 'styles/globals.css')!.content;
    expect(sheet.match(/v2:cart \(band\)/g)).toHaveLength(1);
  });
  it('blocks only real breakage', () => {
    const line = (rule: string) => ({ rule, severity: 'block', line: `BLOQUEA: ${rule}` });
    expect(freeBlocking([line('h-overflow'), line('stacked-titles'), line('off-font-title'), { rule: 'text-only-band', severity: 'advice', line: 'x' }])).toEqual(['h-overflow']);
    expect(freeBlocking([{ rule: 'covered-text', severity: 'advice', line: 'CONSEJO: Una foto tapa letras' }])).toEqual(['Una foto tapa letras']);
    expect(freeBlocking(['empty-section', 'weak-hero', 'short-home'].map(rule => ({ rule, severity: 'advice', line: `CONSEJO: ${rule}` })))).toEqual(['empty-section', 'weak-hero']);
  });
});

describe('v2 prototype: fixing only the broken sections (owner 2026-11-14 «faster, cheaper, more reliable»)', () => {
  const home = `import Shell from './Shell';\nimport { Reveal } from '@pagosya/ui';\nimport { LibrarySlot } from './v2-library';\nexport default function Home() { return <Shell><main id="contenido">
  <section className="v2-hero"><h1>Oh Belly</h1></section>
  <section className="v2-story v2-band"><h2>Hecho en La Paz</h2></section>
  <LibrarySlot name="s1" />
  <div data-pagosya-catalog data-products="p1" />
</main></Shell>; }`;
  const files = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: home } : file.path === 'styles/globals.css' ? { ...file, content: ':root{--kit-accent:#e33}\n.v2-story{padding:40px}\n@media (max-width:600px){.v2-story{padding:20px}}\n.v2-other{color:red}' } : file);
  it('reads the home\'s sections in order and sorts the check lines by section', () => {
    expect(homeSections(home)!.map(section => [section.index, section.library])).toEqual([[0, false], [1, false], [2, true], [3, false]]);
    expect(homeSections(home.replace('<LibrarySlot name="s1" />', '{false && <LibrarySlot name="s1" />}'))).toBeNull();
    const { bySection, rest } = problemsBySection(['Escritorio: [sección 1] Texto cortado', 'Celular: [sección 1] Banda oscura', 'Escritorio: La página se mueve de lado']);
    expect(bySection.get(1)).toEqual(['Escritorio: Texto cortado', 'Celular: Banda oscura']);
    expect(rest).toEqual(['Escritorio: La página se mueve de lado']);
    expect(freeBlocking([{ rule: 'clipped-text', severity: 'advice', line: 'CONSEJO: Texto cortado', part: 1 }])).toEqual(['[sección 1] Texto cortado']);
  });
  it('plans a section fix only when every problem names a written section', () => {
    expect(sectionFixPlan(files, ['Escritorio: [sección 1] Texto cortado'])!.sections.map(section => section.index)).toEqual([1]);
    expect(sectionFixPlan(files, ['Escritorio: [sección 2] Texto cortado'])).toBeNull();
    expect(sectionFixPlan(files, ['Escritorio: [sección 1] x', 'La página se mueve de lado'])).toBeNull();
  });
  it('shows the writer only that section\'s CSS and puts its answer back in place', () => {
    expect(classesIn('<section className="v2-story v2-band"><p className={\'v2-x\'}>')).toEqual(['v2-story', 'v2-band', 'v2-x']);
    const css = cssFor(files.find(file => file.path === 'styles/globals.css')!.content, ['v2-story']);
    expect(css).toMatch(/:root\{--kit-accent:#e33\}/); expect(css).toMatch(/max-width:600px/); expect(css).not.toMatch(/v2-other/);
    const plan = sectionFixPlan(files, ['Escritorio: [sección 1] Texto cortado'])!;
    const merged = mergeSectionFix(files, plan, { sections: [{ index: 1, jsx: '<section className="v2-story"><h2>Hecho en La Paz</h2><Marquee items={["a"]} /></section>' }], css: '.v2-story{padding:60px}', imports: ['Marquee', 'fetch'], notes: '' })!;
    const out = merged.find(file => file.path === 'components/home.tsx')!.content;
    expect(out).toContain("import { Reveal, Marquee } from '@pagosya/ui';");
    expect(out).toContain('<section className="v2-hero"><h1>Oh Belly</h1></section>\n  <section className="v2-story"><h2>Hecho en La Paz</h2><Marquee');
    expect(merged.find(file => file.path === 'styles/globals.css')!.content).toMatch(/Arreglos de sección \*\/\n\.v2-story\{padding:60px\}/);
    expect(mergeSectionFix(files, plan, { sections: [{ index: 0, jsx: '<section />' }], css: '', imports: [], notes: '' })).toBeNull();
    expect(mergeSectionFix(files, plan, { sections: [{ index: 1, jsx: '<section></section></main><main>' }], css: '', imports: [], notes: '' })).toBeNull();
  });
});

describe('v2 prototype: the home in two halves (owner 2026-11-14, step 2 «faster»)', () => {
  it('gives the first screen and the first chapters to one half, the rest to the other', () => {
    const direction = { sections: [1, 2, 3, 4, 5].map(n => ({ role: `c${n}`, composition: 'x', photo: '', why: '' })) };
    expect(halfChapters(direction, 'a').mine.map(line => line.slice(0, 4))).toEqual(['0. P', '1. c', '2. c']);
    expect(halfChapters(direction, 'b').mine.map(line => line.slice(0, 4))).toEqual(['3. c', '4. c', '5. c']);
  });
  it('puts both halves into one home that passes the contract', () => {
    const a = readV2Half({ sections: '<section className="v2-hero"><h1>Oh Belly</h1><img src="assets/image-a.jpg" alt="Lata" /></section>\n<div data-pagosya-catalog data-products="p1" />', helpers: 'export const AIds = "p1";', ui: ['Reveal', 'fetch'], react: ['useState'], css: '.v2-hero{}', library: [], notes: '' })!;
    const b = readV2Half({ sections: '<section className="v2-faq"><h2>Preguntas</h2><button type="button" data-add="p1" data-quantity="1">Agregar</button></section>', helpers: '', ui: ['Marquee'], react: [], css: '', library: [], notes: '' })!;
    expect(readV2Half({ sections: 'hola', helpers: '', ui: [], react: [], css: '', library: [], notes: '' })).toBeNull();
    const home = composeV2Home(a, b);
    expect(home).toContain("import { Reveal, Marquee } from '@pagosya/ui';");
    expect(home).toContain("import { useState } from 'react';");
    expect(home).toContain('const AIds = "p1";');
    expect(home).not.toContain('export const');
    expect(home.indexOf('v2-hero')).toBeLessThan(home.indexOf('v2-faq'));
    const files = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: home } : file).filter(file => file.path !== 'components/v2-library.tsx');
    expect(v2ContractProblems(files, { ...context, free: true }).filter(line => !/capítulos/.test(line))).toEqual([]);
  });
});

describe('v2 prototype: library sections', () => {
  const facts = { storeName: 'Oh Belly', what: 'sodas prebióticas', story: '', city: 'La Paz', request: '', tone: 'bold' as const,
    products: [{ id: 'p1', name: 'Soda', category: 'Sodas' }], categories: ['Sodas'], photos: [{ url: 'assets/image-a.jpg', width: 1600 }],
    codes: [], services: [{ title: 'Envío en La Paz', text: '', icon: 'truck' }], reviews: 0 };
  const store = { storeName: 'Oh Belly', tagline: 'Sodas con burbujas', categories: ['Sodas'] };

  it('keeps the blocks that pass, says why the others did not, and makes the hero one of the structured covers', () => {
    const built = buildV2Library([
      { slot: 'hero', block: { type: 'cover-poster', title: 'OH', photo: 0 } },
      { slot: 's1', block: { type: 'faq', title: 'Preguntas', items: [{ title: '¿Tiene azúcar?', text: 'Cero azúcar añadida.' }] } },
      { slot: 's2', block: { type: 'products-grid', title: 'Todo', products: ['p1'] } },
      { slot: 's3', block: { type: 'products-spotlight', title: 'Soda', text: 'Con burbujas', product: 'p1', photo: 0 } },
    ], facts as never, store);
    // The validator builds a whole home around a block (cover, grid, closing): the slot keeps the block it asked for (live round 4).
    expect(built.blocks.s3?.type).toBe('products-spotlight');
    expect(built.order).toContain('s3');
    expect(built.order[0]).toBe('hero');
    expect(['cover-full', 'hero-split', 'cover-split']).toContain(built.blocks.hero.type);
    expect(built.dropped.s2).toMatch(/data-pagosya-catalog/);
    const file = v2LibraryFile(built);
    expect(file.content).toContain("import { LibraryBlockView, LibraryScript, type LibraryBlock } from './library';");
    expect(readV2LibraryFile(file.content).slots).toEqual(built.order);
  });

  it('counts the library hero as the home\'s h1 when the platform reads the page (live round 4)', () => {
    const files = assembleV2Files([], good) as never;
    expect(nextPageMarkup(files, 'home')).toMatch(/<h1\b/);
  });

  it('keeps the home library-first: at least four library sections, at most three of its own, ten in all', () => {
    const few = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<LibrarySlot name="s2" /><LibrarySlot name="s3" />', '') } : file);
    expect(v2ContractProblems(few, context).join('\n')).toMatch(/2 secciones de biblioteca/);
    const own = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('</main>', '<section>a</section><section>b</section><section>c</section><section>d</section></main>') } : file);
    expect(v2ContractProblems(own, context).join('\n')).toMatch(/4 secciones propias/);
    expect(v2ContractProblems(good, context)).toEqual([]);
  });

  it('gives each section a photo of its own: the hero first, then the others, around the ones the home already shows (live round 4)', () => {
    const photos = { photos: [0, 1, 2, 3].map(index => ({ url: `assets/p${index}.jpg` })) };
    const out = withUniquePhotos([
      { slot: 's1', block: { type: 'statement-inline', photo: 0, items: [{ title: 'a', photo: 1 }] } },
      { slot: 'hero', block: { type: 'cover-split', photo: 0 } },
      { slot: 's2', block: { type: 'closing-photo', photo: 1 } },
    ], photos as never, ['assets/p2.jpg']);
    expect(out.map(entry => entry.slot)).toEqual(['hero', 's1', 's2']);
    expect(out[0].block.photo).toBe(0);
    expect(out[1].block.photo).toBe(1);
    expect((out[1].block.items as Array<{ photo: number }>)[0].photo).toBe(3);
    expect(out[2].block.photo).toBe(1);
  });

  it('builds the writer\'s own sections from the kit and keeps the kit\'s sizes its own (owner 2026-11-14, the design kit)', () => {
    const withOwn = (tag: string) => good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('</main>', `${tag}<h2 className="es-h2">Hola</h2></section></main>`) } : file);
    expect(v2ContractProblems(withOwn('<section className="v2-story">'), context).join('\n')).toMatch(/sin el kit/);
    expect(v2ContractProblems(withOwn('<section className="es-section v2-story">'), context).join('\n')).not.toMatch(/sin el kit/);
    const css = '.v2-story{background:#f0e}.es-h2{font-size:12px}.v2-story .es-btn{padding:2px}.lb-title{color:red}';
    const sheet = assembleV2Files([], good.map(file => file.path === 'styles/globals.css' ? { ...file, content: css } : file)).find(file => file.path === 'styles/globals.css')!.content;
    const design = sheet.slice(sheet.indexOf('/* /v2:kit-baseline */'), sheet.indexOf('/* v2:library'));
    expect(design).toContain('.v2-story{background:#f0e}');
    expect(design).not.toMatch(/es-h2\{font-size:12px|es-btn\{padding:2px|lb-title\{color:red/);
    expect(sheet).toContain('.es-lead{');
    expect(sheet).toMatch(/\[data-lb-at\] \[class\$="__inner"\]\{padding-left:clamp/);
  });

  it('drops a photo a later section repeats; the hero keeps its own (live Lullu r3)', () => {
    const out = withoutRepeatedPhotos({ hero: { type: 'cover-split', photo: 'assets/a.jpg' }, s1: { type: 'faq', photo: 'assets/a.jpg' },
      s2: { type: 'visit-store', photo: 'assets/b.jpg', items: [{ title: 'x', photo: 'assets/c.jpg' }] } }, ['hero', 's1', 's2'], ['assets/c.jpg', 'assets/a.jpg']);
    expect(out.hero.photo).toBe('assets/a.jpg');
    expect(out.s1.photo).toBeUndefined();
    expect(out.s2.photo).toBe('assets/b.jpg');
    expect(out.s2.items![0].photo).toBeUndefined();
  });

  it('sends a dropped slot back to the writer with its reason', () => {
    const library = v2LibraryFile({ blocks: { hero: { type: 'cover-split', title: 'Oh Belly', photo: 'assets/image-a.jpg' }, s1: { type: 'faq' }, s2: { type: 'faq' }, s3: { type: 'faq' } },
      order: ['hero', 's1', 's2', 's3'], dropped: { s4: '«reviews-wall» no pasó la revisión de datos' } });
    const files = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('</main>', '<LibrarySlot name="s4" /></main>') } : file.path === 'components/v2-library.tsx' ? library : file);
    expect(v2ContractProblems(files, context).join('\n')).toMatch(/«s4» no pasó: «reviews-wall»/);
    const noHero = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<LibrarySlot name="hero" />', '<h1>Oh Belly</h1>') } : file);
    expect(v2ContractProblems(noHero, context).join('\n')).toMatch(/sección de biblioteca «hero»/);
  });
});

describe('v2 prototype: real stores to learn from', () => {
  const store = (request: string, products: string[] = [], categories: string[] = []) =>
    ({ storeName: 'Tienda', tagline: '', about: '', request, categories, products: products.map(name => ({ id: name, name, category: '', about: '', photos: 0 })) });
  const pets = /wildone|fablepets|maxbone/;
  it('picks the references closest to the business, then the craft bar', () => {
    expect(pickReferences(store('soda prebiótica con burbujas', ['Oh Belly soda'])).map(ref => ref.host)).toEqual(['drinkpoppi.com', 'drinkrecess.com', 'mirrorwater.earth']);
    expect(pickReferences(store('vestidos de novia y de noche, alta costura')).map(ref => ref.host)[0]).toMatch(/daniellefrankel|khaite/);
    expect(pickReferences(store('licuadoras para batidos')).map(ref => ref.host)).toContain('vitamix.com');
    for (const host of pickReferences(store('comida fresca para perros, snacks y croquetas')).map(ref => ref.host).slice(0, 2)) expect(host).toMatch(pets);
    expect(pickReferences(store('láminas de arte enmarcadas', [], ['Láminas'])).map(ref => ref.host).slice(0, 2)).toEqual(expect.arrayContaining(['framebridge.com']));
    expect(pickReferences(store('pasteles y galletas para cumpleaños')).map(ref => ref.host)[0]).toMatch(/milkbar|levain|sugarfina/);
    expect(pickReferences(store('aretes y anillos de plata')).map(ref => ref.host)[0]).toMatch(/mejuri|catbird|puravida/);
    expect(pickReferences(store('algo que nadie vende')).map(ref => ref.host)).toEqual(['mirrorwater.earth']);
  });

  it('draws the lead per store among the close matches and seconds it with another mood', () => {
    const fashion = store('ropa de mujer, vestidos y blusas', Array.from({ length: 12 }, (_, i) => `Prenda ${i}`));
    const leads = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(seed => pickReferences(fashion, 3, seed)[0].host));
    expect(leads.size).toBeGreaterThan(1);
    expect(pickReferences(fashion, 3, 'x')).toEqual(pickReferences(fashion, 3, 'x'));
    const [lead, second] = pickReferences(fashion, 3, 'store-1');
    if (second.host !== 'mirrorwater.earth') expect(second.mood).not.toBe(lead.mood);
    expect(pickReferences(store('comida fresca para perros'), 3, 'z')[0].host).toMatch(pets);
  });

  it('reads the catalogue shape from the store', () => {
    expect(storeShapes(store('una sola soda', ['Soda']))).toEqual(['few']);
    expect(storeShapes(store('poleras en tallas S a XL, también por suscripción', Array.from({ length: 9 }, (_, i) => `P${i}`)))).toEqual(['many', 'subscription', 'variants']);
  });

  it('gives the lead card in full and the others as a touch', () => {
    const card = { host: 'graza.co', name: 'Graza', at: '', mood: 'juguetón', idea: 'aceite como objeto pop', header: 'logo a la izquierda', hero: 'botella a sangre',
      home: [{ role: 'héroe', composition: 'foto a sangre' }, { role: 'productos', composition: '3 columnas' }], catalog: '4 columnas', card: 'foto 3:4', product: 'galería izquierda',
      cart: 'cajón', type: 'serif condensada', colour: 'crema y verde lima', photos: 'producto en vida real', motion: 'ninguno', phone: '2 columnas', signature: 'pestañas con borde punteado', lessons: ['a', 'b', 'c'] };
    expect(cardText(card, true)).toContain('2. productos: 3 columnas');
    expect(cardText(card, true)).toContain('Página de producto: galería izquierda');
    expect(cardText(card, false)).toContain('Firma: pestañas con borde punteado');
    expect(cardText(card, false)).not.toContain('Catálogo');
  });
});

describe('v2 prototype: layout distance', () => {
  const shape = (over: Partial<SectionShape> = {}): SectionShape => ({ cols: 2, media: 2, side: 'left', bleed: false, tall: 1, align: 'left', ...over });
  it('reads the same skeleton as 0 and different compositions as far apart', () => {
    const template = [shape({ side: 'full', bleed: true, tall: 2, cols: 1 }), shape({ cols: 4, media: 2, side: 'center' }), shape(), shape({ media: 0, side: 'none', align: 'center', cols: 1 })];
    expect(signatureDistance(template, template.map(entry => ({ ...entry })))).toBe(0);
    const other = [shape({ cols: 3, media: 3, side: 'right', tall: 3 }), shape({ cols: 1, media: 1, side: 'center', align: 'center' })];
    expect(signatureDistance(template, other)).toBeGreaterThan(0.6);
  });
});

describe('v2 prototype: the build loop', () => {
  const base = { revision: 3, brief: {} as never, files: [] };
  it('hands the writer its own files and the reasons until the sandbox builds, then stops', async () => {
    const write = jest.fn(async (feedback: string[]) => feedback.length ? good : good.map(file => file.path === 'styles/globals.css' ? { ...file, content: 'a { color: red !important }' } : file));
    const build = jest.fn(async () => ({ ok: true as const, snapshot: { files: [] } as never, ms: 10 }));
    const result = await runV2Build(base, context, 'Diseño V2', { write, build, commerce: () => null });
    expect(result.ok).toBe(true);
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual(['contract', 'built']);
    expect(write.mock.calls[1][0].join()).toMatch(/!important/);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('gives up after four attempts, reporting each one as it ends', async () => {
    const seen: string[] = [];
    const result = await runV2Build(base, context, 'Diseño V2', { write: async () => good, build: async () => ({ ok: false, kind: 'build', error: 'TS2304 Cannot find name', ms: 5 }), commerce: () => null,
      onAttempt: attempt => seen.push(`${attempt.attempt}:${attempt.outcome}`) });
    expect(result.ok).toBe(false);
    expect(seen).toEqual(['1:build', '2:build', '3:build', '4:build']);
    expect(result.attempts[0].problems[0]).toMatch(/No compiló: TS2304/);
  });

  it('keeps the version that built when the plan runs out in a later round (owner 2026-11-14, Gramiyaa)', async () => {
    let calls = 0;
    const result = await runV2Build(base, context, 'Diseño V2', { write: async () => { if (++calls > 1) throw new Error('límite de uso'); return good; },
      build: async () => ({ ok: true, snapshot: { files: [] } as never, ms: 1 }), commerce: () => null, inspect: async () => ['Escritorio: [sección 1] Texto cortado'] });
    expect(result.ok).toBe(true);
    expect(result.attempts.at(-1)!.problems.join(' ')).toMatch(/Se guarda la mejor versión/);
    await expect(runV2Build(base, context, 'Diseño V2', { write: async () => { throw new Error('límite de uso'); }, build: async () => ({ ok: true, snapshot: { files: [] } as never, ms: 1 }), commerce: () => null })).rejects.toThrow('límite');
  });
  it('looks at the built pages once the rules are clean, and a look that finds something earns its own fix round (owner 2026-11-15)', async () => {
    const calls: string[][] = [];
    const write = async (feedback: string[]) => { calls.push(feedback); return good; };
    let builds = 0;
    const snapshots: object[] = [];
    const build = async () => { const snapshot = { files: [], n: ++builds }; snapshots.push(snapshot); return { ok: true as const, snapshot: snapshot as never, ms: 1 }; };
    const look = jest.fn(async (_snapshot: unknown, attempt: number) => attempt === 1 ? ['Escritorio: [sección 4] Vista de la página: el formulario queda apretado en una columna → dale todo el ancho'] : []);
    const result = await runV2Build(base, context, 'Diseño V2', { write, build, commerce: () => null, inspect: async () => [], look, attempts: 1 });
    expect(result.ok).toBe(true);
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual(['visual', 'built']);
    expect(calls[1].join()).toMatch(/\[sección 4\] Vista de la página: el formulario/);
    expect(look).toHaveBeenCalledTimes(2);
    expect((result as { snapshot: unknown }).snapshot).toBe(snapshots[1]);
    // Rules still failing on the last attempt: the look runs anyway, at most `looks` times.
    const rulesLeft = jest.fn(async () => ['Escritorio: [sección 2] Fotos demasiado grandes']);
    const always = jest.fn(async () => ['Escritorio: [sección 3] Vista de la página: caja vacía → quítala']);
    const last = await runV2Build(base, context, 'Diseño V2', { write: async () => good, build, commerce: () => null, inspect: rulesLeft, look: always, attempts: 2, looks: 1 });
    expect(last.attempts.map(attempt => attempt.outcome)).toEqual(['visual', 'visual', 'built']);
    expect(always).toHaveBeenCalledTimes(1);
    expect(last.attempts[1].problems).toEqual(['Escritorio: [sección 2] Fotos demasiado grandes', 'Escritorio: [sección 3] Vista de la página: caja vacía → quítala']);
  });
  it('reads the look as check lines by section; the product page and unknown sections go to the full fix', () => {
    const lines = v2LookLines({ problems: [
      { page: 'home', section: 7, see: 'El formulario queda en la columna del medio', fix: 'Sácalo a su propia banda' },
      { page: 'phone', section: 2, see: 'Mucho aire bajo el titular', fix: '' },
      { page: 'home', section: 40, see: 'Algo raro', fix: 'x' },
      { page: 'product', section: 3, see: 'Es la página simple', fix: 'Pon los capítulos' },
      { page: 'home', section: 1, see: ' ', fix: 'x' },
    ] }, { productTemplateInvalid: true, sections: [0, 1, 2, 7] });
    expect(lines[0]).toMatch(/^Escritorio: Página de producto: el sistema descartó tu <ProductPageTemplate>/);
    expect(lines.slice(1)).toEqual([
      'Escritorio: [sección 7] Vista de la página: El formulario queda en la columna del medio → Sácalo a su propia banda',
      'Celular: [sección 2] Vista de la página: Mucho aire bajo el titular',
      'Escritorio: Vista de la página: Algo raro → x',
      'Escritorio: Página de producto: Vista de la página: Es la página simple → Pon los capítulos',
    ]);
    expect(problemsBySection(lines).bySection.get(7)).toHaveLength(1);
    expect(v2LookLines(null, { productTemplateInvalid: false, sections: [] })).toEqual([]);
  });
  it('keeps the last problems for the next fix when a fix call brings nothing back', async () => {
    const calls: string[][] = [];
    const answers: Array<V2File[] | null> = [good, null, good];
    const write = async (feedback: string[]) => { calls.push(feedback); return answers[calls.length - 1]; };
    let builds = 0;
    await runV2Build(base, context, 'Diseño V2', { write, build: async () => (++builds === 1 ? { ok: false, kind: 'build', error: 'contenedores', ms: 1 } : { ok: true, snapshot: { files: [] } as never, ms: 1 }), commerce: () => null });
    expect(calls[2].join()).toMatch(/contenedores/);
  });

  it('repairs in code what has one right answer: commas in data-products and a filled commerce slot', () => {
    const messy = good.map(file => file.path === 'components/home.tsx'
      ? { ...file, content: file.content.replace('<div data-pagosya-catalog data-products="p1" />', '<div data-pagosya-catalog data-products="p1|p1"><h2>Sabores</h2></div>') } : file);
    const { files, repairs } = v2Repairs(messy);
    const home = files.find(file => file.path === 'components/home.tsx')!.content;
    expect(home).toMatch(/data-products="p1,p1"/);
    expect(home).not.toMatch(/<h2>Sabores<\/h2>/);
    expect(repairs.length).toBeGreaterThanOrEqual(2);
    expect(v2ContractProblems(files, context)).toEqual([]);
  });

  it('sends what the rendered page shows back as a fix and keeps the best version that built', async () => {
    const seen = [['Celular: Palabras cortadas', 'Escritorio: Textos encimados'], ['Celular: Palabras cortadas', 'Escritorio: Textos encimados', 'Celular: otra'], ['Celular: Palabras cortadas']];
    const write = jest.fn(async (_feedback: string[]) => good);
    let builds = 0;
    const result = await runV2Build(base, context, 'Diseño V2', { write, build: async () => ({ ok: true, snapshot: { files: [], n: ++builds } as never, ms: 1 }),
      commerce: () => null, inspect: async () => seen.shift() ?? [], attempts: 3 });
    expect(result.ok).toBe(true);
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual(['visual', 'visual', 'built']);
    expect(write.mock.calls[1][0]).toEqual(['Celular: Palabras cortadas', 'Escritorio: Textos encimados']);
    if (result.ok) { expect((result.snapshot as unknown as { n: number }).n).toBe(3); expect(result.visual).toEqual(['Celular: Palabras cortadas']); }
  });

  it('keeps a good build when a later fix does not compile', async () => {
    let builds = 0;
    const result = await runV2Build(base, context, 'Diseño V2', { write: async () => good,
      build: async () => (++builds === 1 ? { ok: true, snapshot: { files: [], n: 1 } as never, ms: 1 } : { ok: false, kind: 'build', error: 'x', ms: 1 }),
      commerce: () => null, inspect: async () => ['Celular: Palabras cortadas'], attempts: 2 });
    expect(result.ok).toBe(true);
    expect(result.attempts.map(attempt => attempt.outcome)).toEqual(['visual', 'build']);
  });

  it('refuses a build the commerce contract rejects', async () => {
    const result = await runV2Build(base, context, 'Diseño V2', { write: async () => good, build: async () => ({ ok: true, snapshot: { files: [] } as never, ms: 5 }), commerce: () => 'falta el catálogo', attempts: 1 });
    expect(result.ok).toBe(false);
    expect(result.attempts[0]).toMatchObject({ outcome: 'commerce' });
  });

  it('is wired as a Nest service and controller', () => {
    expect(typeof SourceV2PrototypeService).toBe('function');
    expect(typeof SourceV2PrototypeController).toBe('function');
  });
});

describe('v2 menus (spec 2026-11-15 store menu models)', () => {
  it('live 2026-11-16 (Oh Belly r24): a wrapper around the header never puts the menu under the page; menu links carry a label', () => {
    expect(withKitBaseline('.ob-header{isolation:isolate}')).toMatch(/:has\(> \.ui-nav\)[^{]*\{[^}]*display:\s*contents/);
    const link = (v2MenuSchema(['dropdown']) as any).properties.groups.items.properties.links.items;
    expect(link.required).toContain('label');
  });
  it('checks the selling rules: 7 top links, plain names, real photos once', () => {
    const photos = [{ path: 'assets/a.jpg', width: 800, height: 800, shape: 'square' as const }];
    const ok = { model: 'mega', groups: [{ label: 'Tienda', links: [{ to: 'all' }], tiles: [{ to: 'all', image: 'assets/a.jpg' }] }] };
    expect(menuProblems(ok, { photos })).toEqual([]);
    const bad = { model: 'mega', groups: Array.from({ length: 8 }, (_, i) => ({ label: i ? `Grupo ${i}` : 'Una categoría con un nombre demasiado largo', links: [{ to: 'all' }], tiles: [{ to: 'all', image: 'assets/zz.jpg' }] })) };
    const lines = menuProblems(bad, { photos }).join(' | ');
    expect(lines).toMatch(/como mucho 7/); expect(lines).toMatch(/28 letras/); expect(lines).toMatch(/assets\/zz\.jpg/);
  });
  it('writes the chosen menu into config.js and keeps the rest of the config', () => {
    const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"ob","header":{"x":1},"data":{"name":"Oh Belly"}};' }];
    const out = withStoreMenu(files, { model: 'overlay', groups: [{ label: 'Sabores', links: [{ to: 'all' }] }] });
    expect(readConfigData(out)).toMatchObject({ header: { x: 1, menu: { model: 'overlay', groups: [{ label: 'Sabores' }] } }, data: { name: 'Oh Belly' } });
  });
  it('limits the direction to unused models, all of them when every one is used', () => {
    expect((v2MenuSchema(['overlay', 'drawer']) as any).properties.model.enum).toEqual(['overlay', 'drawer']);
    // Owner 2026-11-16 evening: all 16 menus again, the used ones left out until every one is used.
    expect(allowedMenus(V2_MENU_MODELS.map(m => m.id))).toHaveLength(16);
    expect(allowedMenus(['mega'])).toHaveLength(15);
    expect(allowedMenus(['stickers', 'tabs'])).not.toContain('stickers');
  });
  it('asks the direction for a menu among the allowed models and checks the chosen one in the contract', () => {
    const ctx = { ...context, menusAllowed: ['overlay', 'drawer'] } as V2Context;
    const schema = v2DirectionSchema(ctx) as any;
    expect(schema.required).toContain('menu');
    expect(schema.properties.menu.properties.model.enum).toEqual(['overlay', 'drawer']);
    expect(v2DirectionInput(ctx)).toMatch(/MENÚ[\s\S]*overlay: [\s\S]*drawer: /);
    expect(v2DirectionInput(ctx)).not.toMatch(/mega: /);
    const withMenu = { ...ctx, menu: { model: 'overlay', groups: [{ label: 'Una categoría con un nombre demasiado largo', links: [{ to: 'all' }] }] } } as V2Context;
    // Final review C1: the writer cannot change the menu, so a menu problem never blocks a build — the menu is cleaned in code.
    expect(v2ContractProblems(good, withMenu).join()).not.toMatch(/28 letras|más de dos niveles|del menú no es de la tienda/i);
  });

  it('final review: cleans the direction’s menu in code — short labels, store photos once, two levels, 7 groups', () => {
    const photos = [{ path: 'assets/a.jpg', width: 800, height: 800, shape: 'square' as const }];
    const messy = { model: 'mega', groups: [
      { label: 'Una categoría con un nombre demasiado largo para el menú', links: [{ to: 'all' }, { to: 'collection:x/category:y' }, { to: 'a/b/c' }], tiles: [{ to: 'all', image: 'assets/a.jpg' }, { to: 'all', image: 'assets/a.jpg' }, { to: 'all', image: 'https://cdn.x/y.jpg' }] },
      ...Array.from({ length: 8 }, (_, i) => ({ label: `G${i}`, links: [{ to: 'all' }] })),
    ] };
    const clean = cleanMenu(messy, { photos });
    expect(menuProblems(clean, { photos })).toEqual([]);
    expect(clean.groups).toHaveLength(7);
    expect(clean.groups[0].label.length).toBeLessThanOrEqual(28);
    expect(clean.groups[0].tiles).toEqual([{ to: 'all', image: 'assets/a.jpg' }]);
    expect(clean.groups[0].links.map(l => l.to)).toEqual(['all', 'collection:x/category:y']);
  });

});

describe('v2 hero briefs (heroes plan 2026-11-15)', () => {
  it('offers the ideas this merchant has not used, filtered by what the store can show', () => {
    const ctx = { cutouts: [{ path: 'assets/image-aaaaaaaaaaaa.webp' }], products: [] } as any;
    const allowed = allowedHeroIdeas(['laps', 'zippa'], ctx);
    expect(allowed).not.toContain('laps'); expect(allowed).not.toContain('zippa'); expect(allowed).toContain('lift');
    expect(allowedHeroIdeas(V2_HERO_IDEAS.map(h => h.id), ctx).length).toBeGreaterThan(0);
    expect(allowedHeroIdeas([], { cutouts: [], products: [] } as any)).not.toContain('laps');
    expect(V2_HERO_IDEAS.map(h => h.id)).not.toContain('atelier');
  });
  it('marks and reads the hero idea on the saved home', () => {
    expect(readHeroMarker(`${heroMarker('hearthen')}\nexport default function Home(){}`)).toBe('hearthen');
    expect(readHeroMarker('export default function Home(){}')).toBeNull();
  });
  it('every idea has a Spanish brief and real reference frames on disk', () => {
    for (const idea of V2_HERO_IDEAS) {
      expect(idea.brief.length).toBeGreaterThan(200);
      for (const frame of idea.frames) expect(heroFrameExists(heroJoin(__dirname, '../../../../../examples/v2-proto/references/_heroes', frame))).toBe(true);
    }
  });
  it('gives about a third of the stores an open hero brief, the same draw every time', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `store-${i}`);
    const share = ids.filter(drawsLibre).length / ids.length;
    expect(share).toBeGreaterThan(0.25); expect(share).toBeLessThan(0.42);
    expect(drawsLibre('store-7')).toBe(drawsLibre('store-7'));
  });
  it('the direction offers only the allowed ideas; the first half gets the brief; repairs keep the hero marker', () => {
    const ctx = { ...context, heroesAllowed: ['hearthen', 'zippa'] } as V2Context;
    expect((v2DirectionSchema(ctx) as any).properties.hero.properties.idea.enum).toEqual(['hearthen', 'zippa']);
    expect(v2DirectionInput(ctx)).toMatch(/PORTADA[\s\S]*hearthen — Foto cálida/);
    const direction = { hero: { idea: 'hearthen', composition: 'c', photo: '' }, sections: ['a', 'b', 'c', 'd'].map(role => ({ role, composition: 'c' })) } as never;
    expect(v2HalfInput(ctx, direction, 'a', [], { facts: '' })).toMatch(/IDEA DE PORTADA «Foto cálida y sello que gira»[\s\S]*sello redondo[\s\S]*mezclarla/);
    expect(v2HalfInput(ctx, direction, 'b', [], { facts: '' })).not.toMatch(/IDEA DE PORTADA/);
    const libre = { hero: { idea: 'libre', composition: 'c', photo: '' }, sections: direction['sections' as never] } as never;
    expect(v2HalfInput(ctx, libre, 'a', [], { facts: '' })).toMatch(/Inventa tu propia portada/);
    const home = good.find(file => file.path === 'components/home.tsx')!;
    const out = v2Repairs([home], { goods: '', ownIcons: true, heroIdea: 'hearthen' } as never).files[0].content;
    expect(readHeroMarker(out)).toBe('hearthen');
    expect(readHeroMarker(v2Repairs([{ ...home, content: `${heroMarker('laps')}\n${home.content}` }], { goods: '', ownIcons: true, heroIdea: 'hearthen' } as never).files[0].content)).toBe('hearthen');
  });

  it('the hero rule names what is wrong, never which layout to use (owner 2026-11-15: every hero became a split)', () => {
    const src = readRuleSource(heroJoin(__dirname, '../source-template-qa-rules.ts'), 'utf8');
    const at = src.indexOf("push('weak-hero'");
    const line = src.slice(at, at + 420);
    expect(line).not.toMatch(/titular grande a un lado y una foto/);
    expect(line).toMatch(/idea de portada/);
  });

});

describe('v2 photos with words (owner 2026-11-15: DooBoo hero cut through its words)', () => {
  it('measures how much of a photo a box cuts; contain never cuts', () => {
    expect(cropShare({ w: 800, h: 1000 }, { w: 400, h: 500 }, 'cover')).toBe(0);
    expect(cropShare({ w: 800, h: 1000 }, { w: 500, h: 400 }, 'contain')).toBe(0);
    expect(cropShare({ w: 800, h: 1000 }, { w: 500, h: 400 }, 'cover')).toBeCloseTo(0.36, 2);   // shown 500×625 of which 500×400
  });
  it('marks the images that show a photo with words', () => {
    expect(markWordPhotos('<img src="assets/a.jpg" alt="x" /><img src="assets/b.jpg" alt="y" />', new Set(['assets/a.jpg'])))
      .toBe('<img src="assets/a.jpg" data-pagosya-words alt="x" /><img src="assets/b.jpg" alt="y" />');
  });
  it('never marks a photo twice, wherever the mark sits in the tag (live 2026-11-16: Oh Belly r24 lost two rounds)', () => {
    const once = '<img src="assets/a.jpg" alt="x" data-pagosya-words />';
    expect(markWordPhotos(once, new Set(['assets/a.jpg']))).toBe(once);
  });
  it('a cropped photo with words blocks a free-mode build', () => {
    expect(FREE_BLOCKERS.has('cropped-words')).toBe(true);
  });
  it('tells the direction which photos have words and marks them in the repairs', () => {
    const ctx = { ...context, photos: [{ ...context.photos[0], words: true }] } as V2Context;
    expect(v2DirectionInput(ctx)).toMatch(/tiene letras: muéstrala ENTERA/);
    const home = { path: 'components/home.tsx' as const, content: `export default function Home(){ return <main><img src="${ctx.photos[0].path}" alt="x" /></main>; }` };
    expect(v2Repairs([home], { goods: '', ownIcons: true, photos: ctx.photos } as never).files[0].content).toMatch(/data-pagosya-words/);
  });
  it("the store's current game and popup settings win over an old config.js copy", () => {
    const stale = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"contactFormEnabled":true,"retention":null}};' }];
    const out = withStoreSettings(stale, { contactFormEnabled: true, retention: { popupGame: 'scratch', popupGameSlices: [{ label: '10%' }] } });
    expect(readConfigData(out).data.retention).toEqual({ popupGame: 'scratch', popupGameSlices: [{ label: '10%' }] });
  });

});

describe('v2 assembly fixes 2026-11-16', () => {
  it('live 2026-11-16 (DooBoo): the library is refreshed whenever the generated library file is there, however the home imports it', () => {
    const base = [{ path: 'components/library.tsx', content: 'export function LibraryBlock() { return null; }' }];
    const written = [{ path: 'components/home.tsx' as const, content: "import { V2Slot } from '@/components/v2-library';\nexport default function Home(){ return <main><V2Slot name=\"a1\" /></main>; }" },
      { path: 'components/v2-library.tsx' as const, content: "import { LibraryBlockView } from './library';\nexport function V2Slot(){ return null; }" }];
    const lib = assembleV2Files(base as never, written as never).find(file => file.path === 'components/library.tsx')!;
    expect(lib.content).toMatch(/LibraryBlockView/);
  });
  it('headers plan Task 11: NavShell can float over the hero, take a tone and draw its links as pills with one highlighted', () => {
    const props = kitProps().get('NavShell')!;
    for (const prop of ['over', 'tone', 'linkStyle', 'highlight']) expect(props.has(prop)).toBe(true);
    const ui = uiRuntime();
    expect(ui).toMatch(/\.ui-nav\[data-over\]/); expect(ui).toMatch(/\.ui-nav\[data-over\]\[data-scrolled\]/);
    expect(ui).toMatch(/\.ui-nav\[data-links=pills\]/); expect(ui).toMatch(/\[data-highlight\]/);
  });
  it('headers plan Task 12: the announcement bar takes several messages and turns with arrows', () => {
    expect(kitProps().get('AnnouncementBar')!.has('messages')).toBe(true);
    expect(uiRuntime()).toMatch(/ui-announcement__arrow/);
  });
  it('headers plan Task 13: the direction picks the header look, the repairs write it onto NavShell, history avoids repeats', () => {
    const ctx = { ...context, headersUsed: ['over:pills'] } as V2Context;
    const schema = v2DirectionSchema(ctx) as any;
    expect(schema.required).toContain('header');
    expect(schema.properties.header.required).toEqual(['over', 'tone', 'links', 'announce']);
    expect(v2DirectionInput(ctx)).toMatch(/CABECERA[\s\S]*over:pills/);
    const shell = { path: 'components/Shell.tsx' as const, content: '<NavShell brand={<b>X</b>} links={[]} actions="icons" /><AnnouncementBar>Hola</AnnouncementBar>' };
    const header = { over: true, tone: 'light', links: 'pills', announce: ['Envío gratis desde Bs 250', 'Recoge en Sopocachi'] };
    const out = v2Repairs([shell], { goods: '', ownIcons: true, header } as never).files[0].content;
    expect(out).toMatch(/<NavShell[^>]* over tone="light" linkStyle="pills"/);
    expect(out).toMatch(/<AnnouncementBar messages=\{\["Envío gratis desde Bs 250","Recoge en Sopocachi"\]\} \/>/);
  });
  it('headers plan Task 13: a floating header tells the hero half to leave room at the top', () => {
    const d = { hero: { idea: 'zippa', composition: 'c', photo: '' }, sections: ['a', 'b', 'c', 'd'].map(role => ({ role, composition: 'x', photo: '', why: '' })), header: { over: true, tone: 'light', links: 'plain', announce: [] } } as never;
    expect(v2HalfInput(context, d, 'a', [], { facts: '' })).toMatch(/CABECERA FLOTA/);
    expect(v2HalfInput(context, d, 'a', [], { facts: '' })).toMatch(/calc\(var\(--ui-nav-h/);
    expect(uiRuntime()).toMatch(/documentElement\.style\.setProperty\('--ui-nav-h'/);
    expect(v2HalfInput(context, d, 'b', [], { facts: '' })).not.toMatch(/CABECERA FLOTA/);
  });
  it('final minors M1+M2: one reader gives a saved design its hero idea, menu model and header look, and skips broken snapshots', () => {
    const files = [{ path: 'components/home.tsx', content: '// @pagosya-hero zippa\nexport default function Home(){}' },
      { path: 'components/Shell.tsx', content: '<NavShell over tone="light" linkStyle="pills" brand={<b/>} />' },
      { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"header":{"menu":{"model":"mega","groups":[]}}};' }];
    expect(readStoreLooks(files)).toEqual({ hero: 'zippa', menu: 'mega', header: 'over:pills' });
    expect(readStoreLooks([{ path: 'config.js', content: 'not js' }])).toEqual({ hero: null, menu: null, header: null });
    expect(readStoreLooks(null as never)).toEqual({ hero: null, menu: null, header: null });
  });
  it('final minor M3: the whole-page writer (split off) gets the hero brief and the floating-header note too', () => {
    const d = { hero: { idea: 'zippa', composition: 'c', photo: '' }, sections: ['a', 'b', 'c', 'd'].map(role => ({ role, composition: 'x', photo: '', why: '' })), header: { over: true, tone: 'light', links: 'plain', announce: [] } } as never;
    const text = writerInput(context, d, 'pages');
    expect(text).toMatch(/IDEA DE PORTADA «Foto de acción/);
    expect(text).toMatch(/CABECERA FLOTA/);
    expect(writerInput(context, d, 'system')).not.toMatch(/IDEA DE PORTADA/);
  });
  it('owner 2026-11-16 evening: all 16 menus are offered again, the ones this merchant used last', () => {
    expect(allowedMenus([])).toHaveLength(16);
    expect(allowedMenus(['mega', 'split'])).not.toContain('mega');
    expect(allowedMenus(V2_MENU_MODELS.map(model => model.id))).toHaveLength(16);
  });
  it('owner 2026-11-16 («personalize the css of each menu»): the design-system writer dresses its menu, and a bare menu goes back', () => {
    const withMenu = { ...context, menu: { model: 'stickers', groups: [{ label: 'Sodas', links: [{ to: 'all' }] }] } };
    expect(menuParts('stickers')).toContain('.pym-sticker-photo');
    expect(menuParts('rail')).toContain('.pym-panel[data-model=drawer]');
    expect(writerInput(withMenu as never, {} as never, 'system')).toMatch(/EL MENÚ DE ESTA TIENDA ES «stickers»[\s\S]*html body \.pym-panel\[data-model=stickers\]/);
    expect(writerInput(withMenu as never, {} as never, 'pages')).not.toMatch(/EL MENÚ DE ESTA TIENDA/);
    expect(v2ContractProblems(good, withMenu as never).join()).toMatch(/El menú «stickers» quedó de plantilla/);
    const dressed = good.map(file => file.path === 'styles/globals.css' ? { ...file, content: `${file.content}\nhtml body .pym-panel[data-model=stickers]{background:#fde}\nhtml body .pym-links a{font-family:serif}\nhtml body .pym-sticker-photo{border-radius:50%}` } : file);
    expect(v2ContractProblems(dressed, withMenu as never).join()).not.toMatch(/quedó de plantilla/);
    expect(v2ContractProblems(good, context).join()).not.toMatch(/quedó de plantilla/);
  });
  it('spec 2026-11-15: the look sees the menu open and names a menu under the page, empty or cut', () => {
    expect(v2LookPrompt()).toMatch(/Menú abierto[\s\S]*debajo de la página/);
  });
  it('live 2026-11-16 (Meat House r8 = DooBoo r11): the history is the newest stores with a V2 design, each once', () => {
    const rows = [{ storeId: 'dooboo' }, { storeId: 'dooboo' }, { storeId: 'oh' }, { storeId: 'gram' }, { storeId: 'oh' }];
    expect(newestStores(rows, 2)).toEqual(['dooboo', 'oh']);
    expect(newestStores(rows, 20)).toEqual(['dooboo', 'oh', 'gram']);
  });
});

describe('spec 2026-11-16 store quality: the new checks reach a V2 run and its look', () => {
  it('turns the new findings into fix lines with their section', () => {
    const findings = ['photo-less-tile', 'hero-actions', 'hollow-tiles', 'squeezed-title', 'repeated-facts']
      .map((rule, part) => ({ rule, severity: 'advice', part, line: `CONSEJO: ${rule}` }))
      .concat([{ rule: 'phone-cut-tiles', severity: 'block', part: 6, line: 'BLOQUEA: phone-cut-tiles' }]);
    expect(freeBlocking(findings)).toEqual(['[sección 0] photo-less-tile', '[sección 1] hero-actions', '[sección 2] hollow-tiles', '[sección 3] squeezed-title', '[sección 4] repeated-facts', '[sección 6] phone-cut-tiles']);
  });
  it('asks the look for the same defects', () => {
    const prompt = v2LookPrompt();
    expect(prompt).toMatch(/foto de producto encima de las letras/);
    expect(prompt).toMatch(/tarjetas de color sin foto/);
    expect(prompt).toMatch(/botones de la portada/);
    expect(prompt).toMatch(/una palabra por línea/);
    expect(prompt).toMatch(/cortadas en el borde/);
  });
  it('names the rules behind each attempt, by width (benchmark, Part 4)', () => {
    const widths = [
      { width: 1280, findings: [{ rule: 'hero-actions', severity: 'advice' }, { rule: 'small-headline', severity: 'advice' }] },
      { width: 390, findings: [{ rule: 'phone-cut-tiles', severity: 'block' }] },
    ];
    expect(inspectionRules(widths, true)).toEqual(['desktop:hero-actions', 'phone:phone-cut-tiles']);
  });
});

describe('settled in code, not by the writer (owner 2026-11-16 «cant we fix this directly?»)', () => {
  const base = { revision: 3, brief: {} as never, files: [] };
  const css = (files: V2File[]) => files.find(file => file.path === 'styles/globals.css')!.content;
  const huge = (file: string, width: number, height: number, more: Partial<{ positioned: boolean; words: boolean }> = {}) => ({ file, width, height, positioned: false, words: false, ...more });

  it('caps a photo over the desktop size rule in the design CSS, keeping the caps it had', () => {
    expect([capHeight(1280), capHeight(736), capHeight(400)]).toEqual([500, 665, 780]);
    const first = withPhotoCaps(good, [huge('image-a.jpg', 736, 920)])!;
    expect(css(first.files)).toMatch(/@media \(min-width:1000px\)\{\nhtml body main :is\(img,video\)\[src\$="image-a\.jpg"\][^{]*\{max-height:665px;box-sizing:border-box;object-fit:cover\}/);
    expect(first.repairs).toEqual(['styles/globals.css: image-a.jpg 736×920 → alto máx. 665 px']);
    // The V2 contract refuses !important (live 2026-11-16, rg store): a capped design passes it.
    expect(v2ContractProblems(first.files, context).join()).not.toMatch(/important/);
    // A cut-out is never cropped; a second settle keeps one block with both caps.
    const second = withPhotoCaps(first.files, [huge('image-b.webp', 1280, 780)], new Set(['assets/image-b.webp']))!;
    expect(css(second.files).match(/v2:photo-caps —/g)).toHaveLength(1);
    expect(css(second.files)).toMatch(/image-a\.jpg[^}]*max-height:665px/);
    expect(css(second.files)).toMatch(/image-b\.webp[^}]*max-height:500px;box-sizing:border-box;object-fit:contain/);
    // A photo laid over its box is left to the writer (a cap would leave a hole).
    expect(withPhotoCaps(good, [huge('image-a.jpg', 1280, 900, { positioned: true })])).toBeNull();
    // A photo drawn bigger than its box (a scroll zoom, Oh Belly r26 ×1.02) gets its box capped that much lower.
    expect(css(withPhotoCaps(good, [{ ...huge('image-a.jpg', 672, 895), scale: 1.0245 }])!.files)).toMatch(/max-height:711px/);
  });

  it('settles a huge photo with one more build and check, no writer call, and keeps it only when the page has fewer problems', async () => {
    const write = jest.fn(async () => good);
    let builds = 0;
    const build = async () => ({ ok: true as const, snapshot: { files: [], n: ++builds } as never, ms: 1 });
    const settle = jest.fn(async (_snapshot: unknown, files: V2File[]) => withPhotoCaps(files, [huge('image-a.jpg', 736, 920)]));
    const fixed = await runV2Build(base, context, 'Diseño V2', { write, build, commerce: () => null, settle,
      inspect: async snapshot => (snapshot as unknown as { n: number }).n === 1 ? ['Escritorio: [sección 2] Fotos demasiado grandes (736×920 px)'] : [] });
    expect(fixed.attempts.map(attempt => attempt.outcome)).toEqual(['built']);
    expect(write).toHaveBeenCalledTimes(1);
    expect(fixed.ok && css(fixed.files)).toMatch(/v2:photo-caps/);
    expect(fixed.attempts[0].repairs?.join()).toMatch(/alto máx\. 665 px/);
    // A cap that makes the page worse is dropped: the version as written stays, with its line for the writer.
    builds = 0;
    const worse = await runV2Build(base, context, 'Diseño V2', { write, build, commerce: () => null, settle, attempts: 1,
      inspect: async snapshot => (snapshot as unknown as { n: number }).n === 1 ? ['Escritorio: Fotos demasiado grandes (736×920 px)'] : ['Escritorio: Una foto tapa letras', 'Escritorio: Texto cortado'] });
    expect(worse.ok && css(worse.files)).not.toMatch(/v2:photo-caps/);
    expect(worse.attempts[0].problems).toEqual(['Escritorio: Fotos demasiado grandes (736×920 px)']);
  });

  it('a home photo the library sections already show is swapped for a spare one (DooBoo r13, Meat House r9)', () => {
    const home = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main id="contenido">', '<main id="contenido"><img src="assets/image-a.jpg" alt="" />') } : file);
    const spare = { path: 'assets/image-b.jpg', width: 800, height: 800, shape: 'square' as const };
    const repaired = v2Repairs(home, { goods: 'soda', ownIcons: true, photos: [...context.photos, spare] });
    expect(repaired.repairs).toContain('components/home.tsx: assets/image-a.jpg repetida → assets/image-b.jpg');
    expect(repaired.files.find(file => file.path === 'components/home.tsx')!.content).toMatch(/<img src="assets\/image-b\.jpg"/);
  });
});

describe('a V2 run on Claude (owner 2026-11-16 «100 usd in claude api tokens… minimize the costs»)', () => {
  it('drops the schema keywords Claude does not take, never a property that happens to share their name', () => {
    const schema = { type: 'object', additionalProperties: false, required: ['pattern', 'list'], properties: {
      pattern: { type: 'string', maxLength: 9, pattern: '^a' }, list: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'integer', minimum: 0, maximum: 9 } }, one: { type: 'array', minItems: 1, items: { type: 'string' } } } };
    expect(claudeSchema(schema)).toEqual({ type: 'object', additionalProperties: false, required: ['pattern', 'list'], properties: {
      pattern: { type: 'string' }, list: { type: 'array', items: { type: 'integer' } }, one: { type: 'array', minItems: 1, items: { type: 'string' } } } });
  });

  it('streams the answer, caches the instructions, shrinks low-detail images and counts cached tokens inside the input', async () => {
    const events = [
      { type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"color":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '"rojo"}' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } },
    ];
    const stream = new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)); controller.close(); } });
    let sent: any = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(stream, { status: 200 }); }) as unknown as typeof fetch;
    const big = (await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#c33' } }).jpeg().toBuffer()).toString('base64');
    const result = await claudeJson({ apiKey: 'k', model: 'claude-sonnet-5-5', instructions: 'reglas', schema: { type: 'object' }, maxOutput: 1000, effort: 'medium', fetchImpl,
      content: [{ type: 'input_text', text: 'hola' }, { type: 'input_image', image_url: `data:image/jpeg;base64,${big}`, detail: 'low' }] });
    expect(result.json).toEqual({ color: 'rojo' });
    expect(result.usage).toEqual({ input_tokens: 1000, output_tokens: 40, input_tokens_details: { cached_tokens: 900, cache_write_tokens: 0 } });
    expect(sent).toMatchObject({ model: 'claude-sonnet-5-5', stream: true, max_tokens: 17000, system: [{ type: 'text', text: 'reglas', cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'medium', format: { type: 'json_schema' } }, fallbacks: 'default' });
    const image = sent.messages[0].content[1];
    expect(image.source.media_type).toBe('image/webp');
    expect((await sharp(Buffer.from(image.source.data, 'base64')).metadata()).width).toBe(512);
  });
});

describe('owner 2026-11-16 («i dont like these heroes, i find them weak»)', () => {
  it('never offers the four weak hero ideas, and every hero brief asks for a strong first screen', () => {
    const cut = { ...context, cutouts: [{ path: 'assets/image-aaaaaaaaaaaa.webp', product: 'p1', name: 'Uno', width: 600, height: 800 }] };
    for (const used of [[], ['zippa', 'hearthen', 'lift', 'halflife']]) for (const weak of ['laps', 'specsheet', 'buyfirst', 'zahra']) expect(allowedHeroIdeas(used, cut as never)).not.toContain(weak);
    expect(allowedHeroIdeas([], cut as never)).toEqual(expect.arrayContaining(['zippa', 'hearthen', 'lift', 'halflife']));
    expect(writerInput(context, { hero: { idea: 'zippa' } } as never, 'pages')).toMatch(/PORTADA FUERTE[\s\S]*mitad del ancho/);
  });
});

describe('loose mode (owner 2026-11-16 «drop restrictions for now»)', () => {
  it('the writer gets only what keeps the store working, and the contract keeps only those lines', () => {
    const loose = { ...context, loose: true, free: true };
    expect(v2WriterPrompt(true, true)).toBe(V2_LOOSE_PROMPT);
    expect(V2_LOOSE_PROMPT.length).toBeLessThan(v2WriterPrompt(true).length / 2);
    expect(V2_LOOSE_PROMPT).toMatch(/NUNCA escribas precios/);
    const input = writerInput(loose as never, { hero: { idea: 'zippa' } } as never, 'pages');
    expect(input).not.toMatch(/PORTADA FUERTE|BIBLIOTECA|TIENDA MODERNA/);
    expect(writerInput(loose as never, {} as never, 'system')).toMatch(/FUENTES que puedes usar[\s\S]*gloock|FUENTES que puedes usar[\s\S]*Gloock/);
    expect(V2_LOOSE_PROMPT).toMatch(/SIN HUECOS/);
    // A home with no hero slot, no catalogue and a price: loose keeps only the catalogue and the price.
    const bare = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: `import Shell from './Shell';\nexport default function Home() { return <Shell><main id="contenido"><section><h1>Hola</h1><p>Bs 15</p></section><section/><section/><section/><section/></main></Shell>; }` } : file);
    const strict = v2ContractProblems(bare, { ...context, free: true } as never).join('\n');
    const kept = v2ContractProblems(bare, loose as never);
    expect(strict).toMatch(/secciones|biblioteca/);
    expect(kept.join('\n')).toMatch(/data-pagosya-catalog/);
    expect(kept.join('\n')).not.toMatch(/secciones|biblioteca|hero/);
  });
});

describe('the Nov 14 rule set (owner 2026-11-16: the rules Gramiyaa r3 was built with)', () => {
  it('no hero brief, no product-page minimum, only the basic breakage checks', () => {
    const basic = { ...context, free: true, basic: true };
    expect(writerInput(basic as never, { hero: { idea: 'zippa' }, header: { over: true } } as never, 'pages')).not.toMatch(/IDEA DE PORTADA|PORTADA FUERTE|LA CABECERA FLOTA/);
    expect(writerInput({ ...context, free: true } as never, { hero: { idea: 'zippa' } } as never, 'pages')).toMatch(/IDEA DE PORTADA/);
    expect(BASIC_BLOCKERS.has('empty-section')).toBe(true);
    for (const later of ['weak-hero', 'huge-photo', 'pale-page', 'cropped-words', 'phone-cut-tiles']) expect(BASIC_BLOCKERS.has(later)).toBe(false);
    expect(BASIC_BLOCKERS.has('h-overflow') && BASIC_BLOCKERS.has('overlapping-text')).toBe(true);
  });
});

describe('the model creates the menu (owner 2026-11-16)', () => {
  it('the Nov 14 and loose design-system writers are asked for their own menu through NavShell menu', () => {
    expect(writerInput({ ...context, free: true, basic: true } as never, {} as never, 'system')).toMatch(/TU MENÚ: lo creas tú[\s\S]*menu=\{/);
    expect(writerInput({ ...context, free: true, loose: true } as never, {} as never, 'system')).toMatch(/TU MENÚ: lo creas tú/);
    expect(writerInput({ ...context, free: true } as never, {} as never, 'system')).not.toMatch(/TU MENÚ/);
    expect(kitProps().get('NavShell')?.has('menu')).toBe(true);
  });
});

describe('the showcases rotate (owner 2026-11-16 «i really like that one but i dont want it to be repetitive»)', () => {
  it('a showcase the last stores placed is not offered again; the other one is', () => {
    const cuts = { cutouts: [{ path: 'assets/a.webp', product: 'p1', name: 'A', width: 1, height: 1 }, { path: 'assets/b.webp', product: 'p1', name: 'B', width: 1, height: 1 }] };
    expect(readShowcases([{ path: 'components/home.tsx', content: '<ProductStage slides={[]} /><HangingRail items={[]} />' }])).toEqual(['stage', 'rail']);
    expect(showcaseRules(cuts as never, 'both')).toMatch(/ProductStage[\s\S]*HangingRail/);
    const noStage = showcaseRules({ ...cuts, showcasesUsed: ['stage'] } as never, 'both');
    expect(noStage).not.toMatch(/<ProductStage/);
    expect(noStage).toMatch(/HangingRail/);
    expect(showcaseRules({ ...cuts, showcasesUsed: ['stage'] } as never, 'stage')).toBe('');
    expect(showcaseRules({ ...cuts, showcasesUsed: ['stage', 'rail'] } as never, 'both')).toBe('');
  });
});

describe('the creative setting (owner 2026-11-17 «very creative and innovative layouts»)', () => {
  it('swaps the average-store rules and the craft bans for an invitation to invent, and lets the home be shorter', () => {
    const writer = creativeText(v2WriterPrompt(true));
    expect(writer).not.toMatch(/BORDES Y FORMAS: nunca dibujes formas/);
    expect(writer).toMatch(/OFICIO CREATIVO: puedes usar formas, máscaras, clip-path/);
    expect(writer).toMatch(/NUNCA \(fallas/);
    const pages = creativeText(writerInput({ ...context, free: true, basic: true } as never, {} as never, 'pages'));
    expect(pages).not.toContain(V2_MODERN_RULES);
    expect(pages).toContain(V2_CREATIVE_RULES);
    expect(writerInput({ ...context, free: true, concept: 'Carnicería de cartel: …' } as never, {} as never, 'pages')).toMatch(/CONCEPTO ELEGIDO[\s\S]*Carnicería de cartel/);
    expect(freeMin({ photos: [], creative: true } as never)).toBe(5);
  });
});

it('owner 2026-11-17 («more standard product cards»): a home that builds its own product cards goes back; one featured product may keep its button', () => {
  const two = { ...context, products: [...context.products, { id: 'p2', name: 'Otra', category: 'Sodas', about: '', photos: 1 }] };
  const own = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main id="contenido">', `<main id="contenido"><ul>{['p1', 'p2'].map(id => <li key={id}><button data-add={id}>+</button></li>)}</ul>`) } : file);
  expect(v2ContractProblems(own, two as never).join()).toMatch(/Armaste tus propias tarjetas de producto/);
  const one = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main id="contenido">', `<main id="contenido"><button data-add="p1">Agregar</button>`) } : file);
  expect(v2ContractProblems(one, two as never).join()).not.toMatch(/propias tarjetas/);
  // Live 2026-11-17 (The Bake Lab ozenbkpd, Opus, 4 attempts lost): links to product pages are not cards with their own button.
  const links = good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main id="contenido">', `<main id="contenido"><button data-add="p1">Agregar</button><a href="product.html?id=p1">Ver</a><a href="product.html?id=p2">Otra</a>`) } : file);
  expect(v2ContractProblems(links, two as never).join()).not.toMatch(/propias tarjetas/);
  const at = (html: string) => v2ContractProblems(good.map(file => file.path === 'components/home.tsx' ? { ...file, content: file.content.replace('<main id="contenido">', `<main id="contenido">${html}`) } : file), two as never).join();
  // Platform cards written as expressions and a featured product kept in a constant are not own cards.
  expect(at(`<div data-pagosya-catalog data-products={['p1', 'p2'].join(',')} /><button data-add={TOWER}>Agregar</button>`)).not.toMatch(/propias tarjetas/);
  expect(at(`<ul>{faq.map(q => <li key={q}>{q}</li>)}</ul><button data-add={'p1'}>Agregar</button>`)).not.toMatch(/propias tarjetas/);
  // Two literal buttons, or a button per item of a mapped list, are.
  expect(at(`<button data-add="p1">A</button><button data-add="p2">B</button>`)).toMatch(/propias tarjetas/);
  expect(at(`{items.map(item => (<article key={item.id}><h3>{item.name}</h3><button data-add={item.id}>+</button></article>))}`)).toMatch(/propias tarjetas/);
});
