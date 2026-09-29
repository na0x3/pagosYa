// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { expiryNotice, openDomainShop } from './domain-shop';

afterEach(() => document.body.replaceChildren());

const order = (extra: Record<string, unknown> = {}) => ({ id: 'o1', hostname: 'mitienda.com', status: 'ACTIVE', amount: 12000, currency: 'BOB', renewalAmount: 12000, message: '', expiresAt: null, sandbox: false, contactVerified: true, url: 'https://mitienda.com', ...extra });
const shopApi = (orders: unknown[] = [], extra: Record<string, unknown> = {}) => ({ domainShop: async () => ({ available: true, sandbox: false, tlds: ['com', 'shop'], orders, ...extra }) }) as never;
async function openInHost(api: never) {
  const host = document.createElement('div'); document.body.append(host);
  await openDomainShop(api, 's1', undefined, host);
  return { host, dialog: host.querySelector('dialog')! };
}

it('draws into the settings window as cards: buy a domain, and your domains with an empty state', async () => {
  const { dialog } = await openInHost(shopApi());
  expect(dialog.hasAttribute('open')).toBe(true);
  const cards = [...dialog.querySelectorAll('.settings-card')].map(card => card.querySelector('h3')!.textContent);
  expect(cards).toEqual(['Comprar un dominio', 'Tus dominios']);
  expect(dialog.querySelector('#domain-search input[name="query"]')).not.toBeNull();
  expect(dialog.querySelector('#domain-search button[type="submit"]')!.textContent).toBe('Buscar');
  expect(dialog.querySelector('.settings-empty')!.textContent).toContain('Aún no tienes dominios');
  expect(dialog.textContent).toContain('.com, .shop');
});

it('lists the store\'s domains in the Tus dominios card instead of the empty state', async () => {
  const { dialog } = await openInHost(shopApi([order()]));
  expect(dialog.querySelector('.settings-empty')).toBeNull();
  expect(dialog.querySelector('.settings-card:last-of-type')!.textContent).toContain('mitienda.com');
  expect(dialog.textContent).toContain('Conectado');
});

it('says plainly that purchases are in test mode and keeps the search working', async () => {
  const { dialog } = await openInHost(shopApi([], { sandbox: true }));
  expect(dialog.textContent).toContain('Modo de prueba');
  expect(dialog.querySelector('#domain-search')).not.toBeNull();
});

it('explains that buying is unavailable and offers connecting an existing domain, without a search form', async () => {
  const { dialog } = await openInHost(shopApi([], { available: false }));
  expect(dialog.querySelector('#domain-search')).toBeNull();
  expect(dialog.textContent).toContain('estará disponible pronto');
});

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();

it('says nothing about a domain that has not been registered yet', () => {
  expect(expiryNotice(null)).toBe('');
});

it('states the date plainly while renewal is far away', () => {
  const notice = expiryNotice(inDays(200));
  expect(notice).toContain('Vence el');
  expect(notice).not.toMatch(/escríbenos/i);
});

it('asks the merchant to write to support inside the last month', () => {
  // Renewal is manual, so a merchant who ignores this loses the storefront.
  const notice = expiryNotice(inDays(20));
  expect(notice).toContain('20 días');
  expect(notice).toMatch(/escríbenos/i);
});

it('counts a domain that already expired as expired rather than as days left', () => {
  expect(expiryNotice(inDays(-3))).toContain('venció');
});
