jest.setTimeout(180_000);

import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import type { Page } from 'playwright';
import { sourceProjectSnapshot } from '../storefront-source/source-project';
import { withVisualSandbox } from '../storefront-source/source-visual-capture';

// baek (tholhejh), 2026-10-16: with the store assistant on, the runtime hid every contact form slot, so the quote page's
// «Comparte los detalles de tu consulta en el formulario de BAEK» card stood empty. The bot keeps the corner; a form the
// page placed in its content stays, shown inline.
const brief = { businessType: 'Panadería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Cálida' };
const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css">
<header><a href="#" data-pagosya-contact-open>Pide una cotización</a></header>
<main><article class="card"><h2>Conversemos sobre lo que necesitas.</h2><p>Comparte tu consulta.</p><div data-pagosya-contact></div></article><section style="height:1400px"></section></main>
<p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script>`;
const store = async (data: Record<string, unknown>, html = page) => {
  const runtime = [await readFile(kitPath('commerce.js'), 'utf8'), await readFile(kitPath('chat.js'), 'utf8')].join('\n');
  const config = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'baek', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', demo: true, sitePurpose: 'service', data: { storeName: 'baek', items: [], ...data } }) + ';';
  return sourceProjectSnapshot({ revision: 1, label: 'Draft', brief, files: [
    { path: 'commerce.js', content: runtime }, { path: 'config.js', content: config }, { path: 'styles.css', content: 'body{margin:0;font:16px sans-serif}.card{max-width:640px;margin:40px auto;padding:24px;border:1px solid #ccc}' },
    { path: 'package.json', content: '{"name":"t","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# t' }, { path: 'index.html', content: html },
  ] });
};
const visit = async (data: Record<string, unknown>, width: number, check: (page: Page) => Promise<void>, html = page) => {
  const snapshot = await store(data, html);
  await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width, height: 800 });
    await tab.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
    await tab.waitForTimeout(600);
    await check(tab);
    await tab.close();
  });
};
const assistant = { greeting: 'Hola, soy el asistente.' };

it.each([1440, 390])('bot on (%ipx): the page\'s contact form shows inline in its card, no corner launcher, the bot keeps the corner', async width => {
  await visit({ contactFormEnabled: true, assistant }, width, async tab => {
    const form = tab.locator('[data-pagosya-contact] textarea[name=message]');
    expect(await form.isVisible()).toBe(true);
    const inside = await tab.evaluate(() => { const card = document.querySelector('.card')!.getBoundingClientRect(), field = document.querySelector('[data-pagosya-contact] textarea')!.getBoundingClientRect(); return field.top >= card.top && field.bottom <= card.bottom + 1; });
    expect(inside).toBe(true);
    expect(await tab.locator('.pagosya-contact-launcher').isVisible()).toBe(false);
    expect(await tab.locator('[data-pagosya-assistant] [data-assistant-toggle]').isVisible()).toBe(true);
    // «Pide una cotización» takes the shopper to the form on this page, never to the bot.
    await tab.click('[data-pagosya-contact-open]');
    await tab.waitForTimeout(300);
    expect(await tab.evaluate(() => Boolean(document.activeElement?.closest('[data-pagosya-contact]')))).toBe(true);
    expect(await tab.locator('[data-pagosya-assistant] .pya-panel').isVisible()).toBe(false);
  });
});

// Deferred minor (brand source final review, 2026-10-16): a store's own CSS that pins the slot as a fixed corner panel, as
// models write for a floating form, must not pull the inline form out of its card.
it.each([1440, 390])('bot on (%ipx): the inline form stays in its card when the store\'s CSS pins the slot fixed', async width => {
  const pinned = page.replace('<main>', '<style>[data-pagosya-contact]{position:fixed;right:0;bottom:0;width:320px;z-index:5}</style><main>');
  await visit({ contactFormEnabled: true, assistant }, width, async tab => {
    const inside = await tab.evaluate(() => { const card = document.querySelector('.card')!.getBoundingClientRect(), field = document.querySelector('[data-pagosya-contact] textarea')!.getBoundingClientRect(); return field.top >= card.top && field.bottom <= card.bottom; });
    expect(inside).toBe(true);
  }, pinned);
});

it('bot off: the contact form is the corner launcher, as before', async () => {
  await visit({ contactFormEnabled: true }, 1440, async tab => {
    expect(await tab.locator('.pagosya-contact-launcher').isVisible()).toBe(true);
    expect(await tab.locator('[data-pagosya-contact] textarea[name=message]').isVisible()).toBe(false);
    expect(await tab.locator('[data-pagosya-assistant]').count()).toBe(0);
  });
});

it('bot on, contact form off: the slot stays hidden and «Pide una cotización» opens the bot', async () => {
  await visit({ contactFormEnabled: false, assistant }, 1440, async tab => {
    expect(await tab.locator('[data-pagosya-contact] textarea').count()).toBe(0);
    await tab.click('[data-pagosya-contact-open]');
    await tab.waitForTimeout(300);
    expect(await tab.locator('[data-pagosya-assistant] .pya-panel').isVisible()).toBe(true);
  });
});

// Final review 2026-10-16 (I4): every showcase home carries a hidden placeholder slot; with the bot on it stays hidden.
it('bot on: the hidden placeholder slot a showcase home carries stays hidden', async () => {
  const home = page.replace('<article class="card"><h2>Conversemos sobre lo que necesitas.</h2><p>Comparte tu consulta.</p><div data-pagosya-contact></div></article>', '<section data-pagosya-contact hidden></section>');
  await visit({ contactFormEnabled: true, assistant }, 1440, async tab => {
    expect(await tab.locator('[data-pagosya-contact] textarea').isVisible().catch(() => false)).toBe(false);
    expect(await tab.locator('[data-pagosya-assistant] [data-assistant-toggle]').isVisible()).toBe(true);
  }, home);
});
