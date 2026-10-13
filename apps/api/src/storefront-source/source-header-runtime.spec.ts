/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { renderSourceHeader, type HeaderShape } from './source-header';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const links = [{ href: '#servicios', label: 'Servicios' }, { href: '#nosotros', label: 'Nosotros' }];

/** A page with the platform header, run by the real kit runtime in preview. */
async function store(options: { shape?: HeaderShape; purpose?: 'shop' | 'service'; contact?: boolean; overflow?: string } = {}) {
  const purpose = options.purpose ?? 'shop';
  const header = renderSourceHeader({ shape: options.shape ?? 'menu-button', purpose, storeName: 'Marca', links, action: { kind: 'form' }, search: true });
  const dom = new JSDOM(`<html><head></head><body>${header}<main><section id="servicios" data-nav-label="Servicios"><a href="contacto.html" data-pagosya-contact-open>Cotiza tu proyecto</a></section>${options.contact ? '<section data-pagosya-contact hidden></section>' : ''}</main><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: true });
  if (options.overflow) w.document.documentElement.style.overflow = options.overflow;
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', sitePurpose: purpose, data: { storeName: 'Marca', items: [], contactFormEnabled: Boolean(options.contact) } };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 30));
  return w;
}
const $ = (w: any, selector: string): any => w.document.querySelector(selector);
const click = (w: any, el: any) => { const event = new w.MouseEvent('click', { bubbles: true, cancelable: true }); el.dispatchEvent(event); return event; };
const key = (w: any, target: any, name: string, shiftKey = false) => { const event = new w.KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event; };
const scrollTo = (w: any, y: number) => { Object.defineProperty(w, 'scrollY', { value: y, configurable: true }); w.dispatchEvent(new w.Event('scroll')); };

describe('the platform header in the kit runtime (spec 2026-10-13)', () => {
  it('opens the menu with the focus inside it and the page locked, and Escape closes it, frees the page and returns the focus', async () => {
    const w = await store();
    const toggle = $(w, '[data-pagosya-header-toggle]'), menu = $(w, '[data-pagosya-header-menu]');
    click(w, toggle);
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.contains(w.document.activeElement)).toBe(true);
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    expect(key(w, w.document, 'Escape').defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(w.document.documentElement.style.overflow).toBe('');
    expect(w.document.activeElement).toBe(toggle);
    w.close();
  });

  it('closes on a link inside it, on Cerrar and on the backdrop, and gives back the overflow the page already had', async () => {
    const w = await store({ overflow: 'scroll' });
    const toggle = $(w, '[data-pagosya-header-toggle]'), menu = $(w, '[data-pagosya-header-menu]');
    for (const target of [() => $(w, '.pyh-menu-nav a'), () => $(w, '[data-pagosya-header-close]'), () => menu]) {
      click(w, toggle);
      expect(w.document.documentElement.style.overflow).toBe('hidden');
      click(w, target());
      expect(menu.hidden).toBe(true);
      expect(w.document.documentElement.style.overflow).toBe('scroll');
    }
    w.close();
  });

  it('frees the page when the shopper leaves it with the menu open', async () => {
    const w = await store();
    click(w, $(w, '[data-pagosya-header-toggle]'));
    w.dispatchEvent(new w.Event('pagehide'));
    expect($(w, '[data-pagosya-header-menu]').hidden).toBe(true);
    expect(w.document.documentElement.style.overflow).toBe('');
    w.close();
  });

  it('keeps Tab inside the open menu', async () => {
    const w = await store();
    click(w, $(w, '[data-pagosya-header-toggle]'));
    const items = [...$(w, '[data-pagosya-header-menu]').querySelectorAll('a[href],button')];
    const first = items[0], last = items[items.length - 1];
    last.focus();
    expect(key(w, last, 'Tab').defaultPrevented).toBe(true);
    expect(w.document.activeElement).toBe(first);
    expect(key(w, first, 'Tab', true).defaultPrevented).toBe(true);
    expect(w.document.activeElement).toBe(last);
    w.close();
  });

  it('tightens the shrinking header once the page scrolls, and slides the reveal header away going down and back going up', async () => {
    const shrink = await store({ shape: 'shrinking' });
    scrollTo(shrink, 200);
    expect($(shrink, 'header[data-pagosya-header]').hasAttribute('data-scrolled')).toBe(true);
    scrollTo(shrink, 30);
    expect($(shrink, 'header[data-pagosya-header]').hasAttribute('data-scrolled')).toBe(true);
    scrollTo(shrink, 0);
    expect($(shrink, 'header[data-pagosya-header]').hasAttribute('data-scrolled')).toBe(false);
    scrollTo(shrink, 60);
    expect($(shrink, 'header[data-pagosya-header]').hasAttribute('data-scrolled')).toBe(false);
    const reveal = await store({ shape: 'reveal' });
    scrollTo(reveal, 400);
    expect($(reveal, 'header[data-pagosya-header]').hasAttribute('data-hidden')).toBe(true);
    scrollTo(reveal, 300);
    expect($(reveal, 'header[data-pagosya-header]').hasAttribute('data-hidden')).toBe(false);
    shrink.close(); reveal.close();
  });

  it('opens the platform contact form from the header action and any marked call to action, and follows the link without one', async () => {
    const w = await store({ purpose: 'service', contact: true });
    const launcher = $(w, '[data-pagosya-contact] [data-contact-toggle]');
    expect(launcher).not.toBeNull();
    expect(click(w, $(w, '.pyh-action')).defaultPrevented).toBe(true);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    click(w, $(w, 'main [data-pagosya-contact-open]'));
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    w.close();
    const bare = await store({ purpose: 'service' });
    expect(click(bare, $(bare, '.pyh-action')).defaultPrevented).toBe(false);
    bare.close();
  });
});
