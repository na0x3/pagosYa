import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { FRAME_CATALOGUE } from './design-engine/frame-draw';
import { CONVENTIONAL_HEADERS } from './design-engine/playbook';
import { FALLBACK_HEADER_SHAPE, HEADER_SHAPES, renderSourceHeader, type HeaderShape } from './source-header';

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
