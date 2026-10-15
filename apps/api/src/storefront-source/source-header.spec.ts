import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { FRAME_CATALOGUE } from './design-engine/frame-draw';
import { CONVENTIONAL_HEADERS } from './design-engine/playbook';
import { emptySourceHeaders, FALLBACK_HEADER_SHAPE, headerFact, HEADER_SHAPES, renderSourceHeader, withSourceHeader, type HeaderShape } from './source-header';
import { createHash } from 'node:crypto';
import { CART_ICONS, CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';
import postcss from 'postcss';
import { CONTROL_BADGES, CONTROL_BORDERS, CONTROL_COLOURS, CONTROL_FILLS, CONTROL_OUTLINES, type StoreControls } from './store-controls';

const links = [{ href: '#servicios', label: 'Servicios' }, { href: 'nosotros.html', label: 'Nosotros' }];
const render = (shape: HeaderShape, purpose: 'shop' | 'service', extra: Partial<Parameters<typeof renderSourceHeader>[0]> = {}) =>
  renderSourceHeader({ shape, purpose, storeName: 'Estudio deff', links, action: { kind: 'whatsapp', value: '59170012345' }, fact: 'Atendemos de lunes a viernes.', search: true, ...extra });

describe('the platform header library (spec 2026-10-13)', () => {
  it('has one kit template for every drawn header shape, calm and bold as the catalogue draws them', () => {
    expect([...HEADER_SHAPES].sort()).toEqual(FRAME_CATALOGUE.header.map(entry => entry.id).sort());
    expect(FRAME_CATALOGUE.header.filter(entry => !entry.bold).map(entry => entry.id)).toEqual([...CONVENTIONAL_HEADERS]);
    for (const shape of HEADER_SHAPES) expect(readFileSync(kitPath('headers', `${shape}.html`), 'utf8')).toContain('{{menu}}');
    expect(FALLBACK_HEADER_SHAPE).toBe('menu-button');
  });

  it.each([...HEADER_SHAPES])('«%s» renders a shop header with Buscar, Mi cuenta, the kit cart and one menu', shape => {
    const html = render(shape, 'shop');
    expect(html.startsWith(`<header data-pagosya-header data-shape="${shape}" data-purpose="shop" class="pyh pyh--${shape}">`)).toBe(true);
    expect(html).toContain('<style data-pagosya-header-style>');
    expect(html).toContain('<span data-store-name>Estudio deff</span>');
    expect(html).toContain('href="buscar.html"');
    expect(html).toContain('data-pagosya-account="login"');
    expect(html).toContain('data-cart-open');
    expect(html).toContain('data-cart-count');
    expect(html.match(/data-pagosya-header-toggle/g)).toHaveLength(1);
    expect(html.match(/data-pagosya-header-menu/g)).toHaveLength(1);
    expect(html).toContain('id="pyh-menu" data-pagosya-header-menu hidden');
    expect(html).toContain('<a href="#servicios">Servicios</a>');
    expect(html).not.toContain('{{');
    expect(html.endsWith('</header>')).toBe(true);
  });

  it.each([...HEADER_SHAPES])('«%s» renders a showcase header around its main action, with no shop controls', shape => {
    const html = render(shape, 'service');
    expect(html).toContain(`data-shape="${shape}" data-purpose="showcase"`);
    expect(html).toContain('href="https://wa.me/59170012345" target="_blank" rel="noopener">Escríbenos</a>');
    expect(html).not.toContain('data-cart-open');
    expect(html).not.toContain('buscar.html');
    expect(html).not.toContain('data-pagosya-account');
  });

  it('shows the brief fact only in the info-bar shape, and no bar without a fact', () => {
    expect(render('info-bar', 'shop')).toContain('<p class="pyh-fact">Atendemos de lunes a viernes.</p>');
    expect(render('menu-button', 'shop')).not.toContain('class="pyh-fact"');
    expect(render('info-bar', 'shop', { fact: '  ' })).not.toContain('class="pyh-fact"');
  });

  it('styles itself only from the store tokens, and resets what a store rule for a bare header would leak in', () => {
    const css = readFileSync(kitPath('headers', 'headers.css'), 'utf8');
    expect(css).toContain('var(--store-background,var(--brand-background,var(--paper,');
    expect(css).toContain('var(--store-heading-font,var(--brand-heading-font,inherit))');
    expect(css).toMatch(/\.pyh\{all:initial;/);
    // A colour literal may appear only as the last fallback of a token chain.
    const withoutFallbacks = css.replace(/var\(--[\w-]+,(?:var\(--[\w-]+,)*#[0-9a-f]{3,8}\)+/gi, '');
    expect(withoutFallbacks).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('escapes the store name and labels it was given', () => {
    const html = render('menu-button', 'shop', { storeName: '<img src=x onerror=alert(1)> $& Café', links: [{ href: '#a"b', label: '<b>Menú</b>' }] });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; $&amp; Café');
    expect(html).toContain('&lt;b&gt;Menú&lt;/b&gt;');
    expect(html).toContain('href="#a&quot;b"');
  });

  it('prefixes its own links for a page in a folder, and leaves anchors and absolute links alone', () => {
    const html = renderSourceHeader({ shape: 'menu-button', purpose: 'service', storeName: 'deff', links: [{ href: 'index.html#servicios', label: 'Servicios' }, { href: '#arriba', label: 'Arriba' }], action: { kind: 'form' }, logoPath: 'assets/logo.png', prefix: '../' });
    expect(html).toContain('href="../index.html#servicios"');
    expect(html).toContain('href="#arriba"');
    expect(html).toContain('<a class="pyh-brand" href="../index.html"><img class="pyh-logo" src="../assets/logo.png" alt="">');
    expect(html).toContain('<a class="pyh-action" href="../contacto.html" data-pagosya-contact-open>Pide una cotización</a>');
    expect(renderSourceHeader({ shape: 'menu-button', purpose: 'service', storeName: 'deff', links: [], action: { kind: 'phone', value: '59122441234' }, prefix: '../' })).toContain('href="tel:+59122441234"');
  });

  it('leaves Buscar out when the store has no search page', () => {
    expect(render('centered-split', 'shop', { search: false })).not.toContain('buscar.html');
  });
});

describe('withSourceHeader: the save step that draws the header on every page (spec 2026-10-13)', () => {
  const page = (main: string, header = '<header data-pagosya-header></header>') => `<!doctype html><html lang="es"><head><link rel="stylesheet" href="styles.css"></head><body>${header}<main>${main}</main><footer><p>deff</p></footer><script src="config.js" defer></script><script src="commerce.js" defer></script></body></html>`;
  const home = page('<section id="servicios" data-nav-label="Servicios"><h1>Arquitectura</h1></section><section id="obra" data-nav-label="Obra &amp; diseño"></section><section id="sin-menu"></section>');
  const site = () => [
    { path: 'index.html', content: home },
    { path: 'nosotros.html', content: page('<div data-pagosya-page="about"></div>') },
    { path: 'pages/equipo.html', content: page('<h1>Equipo</h1>') },
    { path: 'pages/viejo.html', content: page('<h1>Sin slot</h1>', '<header class="mio">Mío</header>') },
    { path: 'styles.css', content: 'body{}' },
  ];
  const input = { shape: 'stacked', purpose: 'shop' as const, storeName: 'deff', platformPages: ['buscar.html'] };
  const file = (files: Array<{ path: string; content: string }>, path: string) => files.find(entry => entry.path === path)!.content;

  it('draws the drawn shape into every page slot, linking the sections the home page marks', () => {
    const out = withSourceHeader(site(), input);
    expect(out).toMatchObject({ rendered: true, shape: 'stacked', fallback: false, missing: ['pages/viejo.html'] });
    expect(file(out.files, 'index.html')).toContain('<header data-pagosya-header data-shape="stacked" data-purpose="shop"');
    expect(file(out.files, 'index.html')).toContain('<a href="#servicios">Servicios</a>');
    expect(file(out.files, 'index.html')).toContain('<a href="#obra">Obra &amp; diseño</a>');
    expect(file(out.files, 'index.html')).not.toContain('href="#sin-menu"');
    expect(file(out.files, 'nosotros.html')).toContain('<a href="index.html#servicios">Servicios</a>');
    expect(file(out.files, 'pages/equipo.html')).toContain('<a href="../index.html#servicios">Servicios</a>');
    expect(file(out.files, 'pages/equipo.html')).toContain('<a class="pyh-brand" href="../index.html">');
    expect(file(out.files, 'pages/equipo.html')).toContain('href="../buscar.html"');
    expect(file(out.files, 'pages/viejo.html')).toBe(site()[3].content);
    expect(file(out.files, 'styles.css')).toBe('body{}');
  });

  it('renders the same bytes on every save', () => {
    const once = withSourceHeader(site(), input).files;
    expect(withSourceHeader(once, input).files).toEqual(once);
    expect(withSourceHeader(emptySourceHeaders(once), input).files).toEqual(once);
  });

  it('leaves an older store without a slot exactly as it was', () => {
    const older = site().map(entry => entry.path === 'index.html' ? { ...entry, content: page('<h1>Antes</h1>', '<header class="viejo">Viejo</header>') } : entry);
    const out = withSourceHeader(older, input);
    expect(out.rendered).toBe(false);
    expect(out.files).toBe(older);
    expect(out.missing).toEqual([]);
  });

  it('falls back to menu-button for an unknown or missing drawn shape', () => {
    for (const shape of ['zigzag', undefined]) {
      const out = withSourceHeader(site(), { ...input, shape });
      expect(out).toMatchObject({ shape: FALLBACK_HEADER_SHAPE, fallback: true });
      expect(file(out.files, 'index.html')).toContain('data-shape="menu-button"');
    }
  });

  it('turns a kit commerce page stock or copied header into the slot, and drops the panels the old copy brought along', () => {
    const kit = readFileSync(kitPath('product.html'), 'utf8');
    const copied = kit.replace(/<header class="commerce-header">[\s\S]*?<\/header>/, '<header class="site-header" data-pagosya-shared-shell="header"><button aria-controls="menu-panel">Menú</button></header>\n<div id="menu-panel" data-pagosya-shared-shell="header-panel"><a href="index.html#servicios">Servicios</a></div>');
    const out = withSourceHeader([...site(), { path: 'product.html', content: kit }, { path: 'productos.html', content: copied }], input);
    for (const path of ['product.html', 'productos.html']) {
      const html = file(out.files, path);
      expect(html).toContain('<header data-pagosya-header data-shape="stacked"');
      expect(html).toContain('<a href="index.html#servicios">Servicios</a>');
      expect(html).not.toContain('class="commerce-header"');
      expect(html).not.toContain('data-pagosya-shared-shell');
    }
  });

  it('puts back a slot an edit removed from a page that had one', () => {
    const edited = site().map(entry => entry.path === 'nosotros.html' ? { ...entry, content: entry.content.replace('<header data-pagosya-header></header>', '') } : entry);
    const out = withSourceHeader(edited, { ...input, previous: site() });
    expect(file(out.files, 'nosotros.html')).toContain('<body><header data-pagosya-header data-shape="stacked"');
    expect(out.missing).not.toContain('nosotros.html');
  });

  it('links the information pages that exist when no section is marked for the menu', () => {
    const plain = site().map(entry => entry.path === 'index.html' ? { ...entry, content: page('<section id="hola"><h1>Hola</h1></section>') } : entry);
    const html = file(withSourceHeader(plain, { ...input, purpose: 'service', platformPages: ['contacto.html'] }).files, 'index.html');
    expect(html).toContain('<a href="nosotros.html">Nosotros</a>');
    expect(html).toContain('<a href="contacto.html">Contacto</a>');
    expect(html).not.toContain('productos.html');
  });

  it('takes the info bar from one real fact in the brief, else the first address, else nothing', () => {
    expect(headerFact('Diseñamos casas. Atendemos de lunes a viernes de 9:00 a 18:00. Llámanos.')).toBe('Atendemos de lunes a viernes de 9:00 a 18:00.');
    expect(headerFact(`Hacemos envíos a toda Bolivia ${'con mucho cuidado '.repeat(10)}`).length).toBeLessThanOrEqual(90);
    expect(headerFact('Diseñamos casas.', [{ name: 'Estudio', address: 'Av. Arce 2020, La Paz' }])).toBe('Estamos en Av. Arce 2020, La Paz');
    expect(headerFact(undefined, [])).toBe('');
  });
});

describe('the platform keeps the header it owns (final review, 2026-10-13)', () => {
  const page = (main: string, header = '<header data-pagosya-header></header>') => `<!doctype html><html lang="es"><head></head><body>${header}<main>${main}</main></body></html>`;
  const saved = [{ path: 'index.html', content: page('<section id="a" data-nav-label="Inicio"></section>') }, { path: 'nosotros.html', content: page('<h1>Nosotros</h1>') }];
  const input = { shape: 'stacked', purpose: 'shop' as const, storeName: 'deff' };
  const file = (files: Array<{ path: string; content: string }>, path: string) => files.find(entry => entry.path === path)!.content;

  it('puts the slot back on the home page when an edit removed it there, so no page loses its header', () => {
    const drawn = withSourceHeader(saved, input).files;
    const edited = emptySourceHeaders(drawn).map(entry => entry.path === 'index.html' ? { ...entry, content: entry.content.replace('<header data-pagosya-header></header>', '') } : entry);
    const out = withSourceHeader(edited, { ...input, previous: drawn });
    expect(out.rendered).toBe(true);
    for (const path of ['index.html', 'nosotros.html']) expect(file(out.files, path)).toContain('<header data-pagosya-header data-shape="stacked"');
  });

  it('takes over a header the author wrote when this build owns the header, and leaves an older store alone', () => {
    const own = saved.map(entry => ({ ...entry, content: entry.content.replace('<header data-pagosya-header></header>', '<header class="propio"><a href="index.html">deff</a></header>') }));
    const out = withSourceHeader(own, { ...input, claim: true });
    expect(out.rendered).toBe(true);
    for (const path of ['index.html', 'nosotros.html']) {
      expect(file(out.files, path)).toContain('<header data-pagosya-header data-shape="stacked"');
      expect(file(out.files, path)).not.toContain('class="propio"');
      expect(file(out.files, path).match(/<header\b/g)).toHaveLength(1);
    }
    expect(withSourceHeader(own, input).rendered).toBe(false);
  });

  it('keeps the logo the saved header showed when this save does not name one', () => {
    const withLogo = withSourceHeader(saved, { ...input, logoPath: 'assets/logo.png' }).files;
    const again = withSourceHeader(emptySourceHeaders(withLogo), { ...input, previous: withLogo });
    expect(file(again.files, 'index.html')).toContain('<img class="pyh-logo" src="assets/logo.png" alt="">');
    expect(file(again.files, 'nosotros.html')).toContain('<img class="pyh-logo" src="assets/logo.png" alt="">');
  });
});

describe('store controls in the header (spec 2026-10-14, part 3)', () => {
  const TICKET: StoreControls = libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'ticket-stub')!, 'cafe-food', 'cup');
  const withLayout = (cart: StoreControls['layout']['cart'], account: StoreControls['layout']['account']): StoreControls => ({ ...TICKET, layout: { cart, account } });
  const cartButton = (html: string) => html.match(/<button type="button" class="pyh-cart"[\s\S]*?<\/button>/)![0];
  const hasTools = (shape: HeaderShape) => readFileSync(kitPath('headers', `${shape}.html`), 'utf8').includes('{{tools}}');

  // Computed on 2026-10-14 from the unmodified renderSourceHeader. If it fails before your change, recompute it on the
  // unmodified code (git stash) with the same 20 headers and pin that value: it guards "no record, no change".
  it("draws today's header byte for byte when the store has no record", () => {
    const all = HEADER_SHAPES.flatMap(shape => (['shop', 'service'] as const).map(purpose => render(shape, purpose)));
    expect(createHash('sha256').update(all.join('\n')).digest('hex')).toBe('5617e18c2b27a30604a6f008efd4edb0aef8226b1eb5699344bb329db027f480');
  });

  it.each([...HEADER_SHAPES])('«%s» shop: the record on the header, icons and words on the controls, the locked hooks kept', shape => {
    const html = render(shape, 'shop', { controls: TICKET });
    expect(html).toContain(`class="pyh pyh--${shape}" data-controls-outline="ticket" data-controls-border="none" data-controls-fill="solid" data-controls-colour="accent" data-controls-badge="stamp" style="--ctl-corner:4px;--ctl-notch:5px;--ctl-tilt:0deg;--ctl-weight:2px">`);
    const cart = cartButton(html);
    expect(cart).toContain('data-cart-open data-ctl="cart"');
    expect(cart).toContain(`<path fill="currentColor" fill-rule="evenodd" d="${CART_ICONS.cup.solid}"/>`);
    expect(cart).toContain('<span class="ctl-word pyh-cart-word" aria-hidden="true">Tu pedido</span>');
    expect(cart).toContain('<span class="ctl-sr">Carrito, </span><span class="pyh-cart-count ctl-badge" data-cart-count data-empty>0</span><span class="ctl-sr" data-ctl-unit> productos</span>');
    expect(html.match(/data-cart-open/g)).toHaveLength(1);
    expect(html.match(/data-pagosya-header-toggle/g)).toHaveLength(1);
    expect(html).toContain('data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu" data-ctl="menu"><span class="ctl-face"><svg class="ctl-icon"');
    expect(html).toContain('<button type="button" class="pyh-close" data-pagosya-header-close aria-label="Cerrar" data-ctl="close">');
    expect(html).toContain('<a class="pyh-menu-link" href="#" data-pagosya-account="login">Mi cuenta</a>');
    if (hasTools(shape)) {
      expect(html).toContain('<a class="pyh-tool" href="#" data-pagosya-account="login" aria-label="Mi cuenta" data-ctl="account">');
      expect(html).toContain('<a class="pyh-tool" href="buscar.html" aria-label="Buscar" data-ctl="search">');
    }
    expect(html).not.toContain('{{');
  });

  it('draws every icon with the even-odd rule the sanitizer and the library assume', () => {
    const html = render('menu-button', 'shop', { controls: TICKET });
    const icons = html.match(/<svg class="ctl-icon"[\s\S]*?<\/svg>/g)!;
    expect(icons.length).toBeGreaterThan(1);
    for (const icon of icons) {
      expect(icon).toContain('clip-rule="evenodd"');
      expect(icon).toContain('<path fill="currentColor" fill-rule="evenodd" d="');
    }
  });

  it('follows the layout: icon only keeps the plain label, word only draws no icon, a missing icon falls back to the word', () => {
    const iconOnly = cartButton(render('menu-button', 'shop', { controls: withLayout('icon', 'icon') }));
    expect(iconOnly).toContain('<svg class="ctl-icon"');
    expect(iconOnly).not.toContain('ctl-word');
    expect(iconOnly).toContain('<span class="ctl-sr">Carrito, </span>');
    const wordOnly = cartButton(render('menu-button', 'shop', { controls: withLayout('word', 'word') }));
    expect(wordOnly).not.toContain('<svg');
    expect(wordOnly).toContain('>Tu pedido</span>');
    const noIcon = cartButton(render('menu-button', 'shop', { controls: { ...withLayout('icon', 'icon'), icons: {} } }));
    expect(noIcon).toContain('>Tu pedido</span>');
    expect(render('menu-button', 'shop', { controls: { ...TICKET, icons: { ...TICKET.icons, menu: undefined } } })).toContain('<span class="ctl-face"><span class="pyh-toggle-bars" aria-hidden="true"></span>');
  });

  it("shows the record's account word but keeps the plain accessible name, and Carrito without a cart word", () => {
    const html = render('shrinking', 'shop', { controls: { ...withLayout('word', 'word'), words: { account: 'Ingresar' } } });
    expect(html).toContain('aria-label="Mi cuenta" data-ctl="account"><span class="ctl-face"><span class="ctl-word" aria-hidden="true">Ingresar</span></span></a>');
    expect(cartButton(html)).toContain('>Carrito</span>');
  });

  it('gives a showcase header the language on its menu button and close button, never a cart', () => {
    const html = render('menu-button', 'service', { controls: TICKET });
    expect(html).toContain('data-controls-outline="ticket"');
    expect(html).not.toContain('data-cart-open');
    expect(html).not.toContain('data-ctl="cart"');
    expect(html).toContain('data-ctl="menu"');
    expect(html).toContain('data-ctl="close"');
    expect(html).toContain('href="https://wa.me/59170012345" target="_blank" rel="noopener">Escríbenos</a>');
  });

  it('withSourceHeader passes the record to every page', () => {
    const files = [{ path: 'index.html', content: '<body><header data-pagosya-header></header><main><section id="a" data-nav-label="Inicio"></section></main></body>' }, { path: 'nosotros.html', content: '<body><header data-pagosya-header></header><main></main></body>' }];
    const result = withSourceHeader(files, { shape: 'menu-button', purpose: 'shop', storeName: 'Café', controls: TICKET });
    for (const file of result.files) expect(file.content).toContain('data-controls-outline="ticket"');
  });

  it('controls.css has one recipe per outline and rules for every fill, colour, border and badge, from the store tokens only', () => {
    const css = readFileSync(kitPath('controls.css'), 'utf8');
    for (const outline of CONTROL_OUTLINES) expect(css).toContain(`[data-controls-outline=${outline}] .ctl-face{`);
    for (const fill of CONTROL_FILLS) expect(css).toContain(`[data-controls-fill=${fill}]{`);
    for (const colour of CONTROL_COLOURS) expect(css).toContain(`[data-controls-colour=${colour}]{`);
    for (const border of CONTROL_BORDERS) expect(css).toContain(`[data-controls-border=${border}]{`);
    for (const badge of CONTROL_BADGES) expect(css).toContain(`[data-controls-badge=${badge}]`);
    // A colour literal may appear only as the last fallback of a token chain, or as a mask's black and clear.
    const withoutFallbacks = css.replace(/var\(--[\w-]+,(?:var\(--[\w-]+,)*#[0-9a-f]{3,8}\)+/gi, '').replace(/#0{3,4}\b/g, '');
    expect(withoutFallbacks).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // No record, no change: every rule keys on a data-controls-* attribute.
    postcss.parse(css).walkRules(rule => expect(rule.selector).toMatch(/data-controls-/));
    expect(css).toMatch(/@layer pagosya-controls-locked\{[^@]*\[data-controls-outline\] \[data-ctl\]\{min-width:44px!important;min-height:44px!important;transform:none!important/);
  });

  it('carries the controls stylesheet only with a record', () => {
    expect(render('menu-button', 'shop', { controls: TICKET }).match(/<style data-pagosya-controls-style>/g)).toHaveLength(1);
    expect(render('menu-button', 'shop')).not.toContain('data-pagosya-controls-style');
  });
});
