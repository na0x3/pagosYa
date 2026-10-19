// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openCommerceContent } from './commerce-content';
import type { MerchantStudioApi } from './api';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
  // jsdom has no CSS.escape; the form uses it to find each product's quantity box.
  if (!globalThis.CSS?.escape) vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/["\\]/g, '\\$&') });
});
afterEach(() => document.body.replaceChildren());

async function open() {
  const api = {
    commerceContent: vi.fn().mockResolvedValue({ articles: [], bundles: [], testimonials: [], reviews: [], reviewCounts: {} }),
    sourceCatalog: vi.fn().mockResolvedValue({ items: [{ id: 'cafe', name: 'Café 500 g', amount: 4500, currency: 'BOB', imageUrls: [] }, { id: 'taza', name: 'Taza', amount: 3000, currency: 'BOB', imageUrls: [] }] }),
    writeCommerceContent: vi.fn().mockResolvedValue({}),
  };
  await openCommerceContent(api as unknown as MerchantStudioApi, 'store-1');
  await vi.waitFor(() => expect(document.querySelector('#bundle-form')).not.toBeNull());
  const form = () => document.querySelector<HTMLFormElement>('#bundle-form')!;
  const set = (selector: string, value: string) => { const el = form().querySelector<HTMLInputElement | HTMLSelectElement>(selector)!; el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const check = (id: string) => { const box = form().querySelector<HTMLInputElement>(`input[name=product][value="${id}"]`)!; box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); };
  return { api, form, set, check };
}

describe('quantity discounts (showcase commerce 2026-10-19)', () => {
  it('turns tier rows for one product into one pack per row, in order, with the optional label', async () => {
    const t = await open();
    t.set('select[name=kind]', 'TIERS');
    expect(t.form().querySelector<HTMLElement>('[data-tier-rows]')!.hidden).toBe(false);
    expect((t.form().elements.namedItem('name') as HTMLInputElement).required).toBe(false);
    t.check('cafe'); t.check('taza');
    // Quantity discounts are for one product: choosing a second one replaces the first.
    expect(t.form().querySelectorAll('input[name=product]:checked').length).toBe(1);
    t.check('cafe');
    t.set('[name="tierQuantity-0"]', '2'); t.set('[name="tierDiscount-0"]', '10'); t.set('[name="tierLabel-0"]', ' Recomendado ');
    t.set('[name="tierQuantity-1"]', '3'); t.set('[name="tierDiscount-1"]', '15');
    t.form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(t.api.writeCommerceContent).toHaveBeenCalledTimes(2));
    expect(t.api.writeCommerceContent.mock.calls[0]).toEqual(['store-1', 'bundles', 'POST', { name: 'Lleva 2 · Café 500 g', kind: 'FIXED', items: [{ productId: 'cafe', quantity: 2 }], minimumQuantity: 2, discountPercent: 10, label: 'Recomendado' }]);
    expect(t.api.writeCommerceContent.mock.calls[1]).toEqual(['store-1', 'bundles', 'POST', { name: 'Lleva 3 · Café 500 g', kind: 'FIXED', items: [{ productId: 'cafe', quantity: 3 }], minimumQuantity: 2, discountPercent: 15 }]);
  });
  it('a pack of products can carry a label too, capped at 24 characters', async () => {
    const t = await open();
    const label = t.form().querySelector<HTMLInputElement>('[name=label]')!;
    expect(label.maxLength).toBe(24);
    (t.form().elements.namedItem('name') as HTMLInputElement).value = 'Dúo';
    t.check('cafe'); t.check('taza'); t.set('[name=label]', 'La favorita');
    t.form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(t.api.writeCommerceContent).toHaveBeenCalledOnce());
    expect(t.api.writeCommerceContent.mock.calls[0][3]).toMatchObject({ name: 'Dúo', kind: 'FIXED', label: 'La favorita' });
  });
  it('shows a pack label in the list', async () => {
    const api = {
      commerceContent: vi.fn().mockResolvedValue({ articles: [], bundles: [{ id: 'b1', name: 'Lleva 3 · Café', kind: 'FIXED', items: [{ productId: 'cafe', quantity: 3 }], discountPercent: 15, minimumQuantity: 2, active: true, label: 'Recomendado' }], testimonials: [], reviews: [], reviewCounts: {} }),
      sourceCatalog: vi.fn().mockResolvedValue({ items: [{ id: 'cafe', name: 'Café', amount: 4500, currency: 'BOB', imageUrls: [] }] }),
      writeCommerceContent: vi.fn(),
    };
    await openCommerceContent(api as unknown as MerchantStudioApi, 'store-1');
    await vi.waitFor(() => expect(document.querySelector('.bundle-card')!.textContent).toContain('Recomendado'));
  });
});
