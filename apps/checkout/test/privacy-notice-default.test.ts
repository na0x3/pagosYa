import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';

// Owner 2026-10-29 («make yapi create a cookies button for the store by default»): every published store asks once, on the first
// visit, with or without an ad pixel; the choice is remembered and the button stays to change it.
const privacy = readFileSync(kitPath('privacy.js'), 'utf8');
const windows: JSDOM[] = [];
afterEach(() => { while (windows.length) windows.pop()!.window.close(); });
function load() {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'https://tienda.test/' });
  windows.push(dom);
  (dom.window as unknown as { eval: (code: string) => void }).eval(privacy);
  return dom.window as unknown as Window & { PAGOSYA_PRIVACY: { mount(slug: string, options?: object): void; save(slug: string, analytics: boolean): void } };
}

it('opens the notice on the first visit even when the store has no pixel', () => {
  const w = load();
  w.PAGOSYA_PRIVACY.mount('tienda', {});
  expect(w.document.querySelector<HTMLElement>('[data-privacy-panel]')!.hidden).toBe(false);
});

it('stays closed once the shopper chose', () => {
  const w = load();
  w.PAGOSYA_PRIVACY.save('tienda', false);
  w.PAGOSYA_PRIVACY.mount('tienda', {});
  expect(w.document.querySelector<HTMLElement>('[data-privacy-panel]')!.hidden).toBe(true);
  expect(w.document.querySelector('[data-privacy-open]')).not.toBeNull();
});

it('never shows in the merchant\'s preview', () => {
  const w = load();
  w.PAGOSYA_PRIVACY.mount('tienda', { preview: true });
  expect(w.document.querySelector('[data-pagosya-privacy]')).toBeNull();
});
