import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { FRAME_CATALOGUE } from './design-engine/frame-draw';
import { CONVENTIONAL_HEADERS } from './design-engine/playbook';
import { emptySourceHeaders, FALLBACK_HEADER_SHAPE, headerFact, HEADER_SHAPES, renderSourceHeader, withSourceHeader, type HeaderShape } from './source-header';

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
