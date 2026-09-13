import { beforeEach, expect, it, vi } from 'vitest';
import { mountComebackCard } from '../src/comeback-card';

const card = { paymentIntentId: 'pi_paid', brand: { name: 'Urban Roasters Co', background: '#b69b88', foreground: '#241e19', stamp: 'coffee' }, customerName: 'Doris', visits: 1, visitsRequired: 10, rewardLabel: 'Un café gratis', currentPurchaseOnly: true, availableRewards: null, emailAvailable: true, cardUrl: 'https://checkout.example/track/private-order' };
beforeEach(() => { document.body.innerHTML = '<main></main>'; vi.restoreAllMocks(); });
it('renders the correct store after payment and sends only the order credential when requesting the private card', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(card)));
  const root = document.querySelector('main')!;
  await mountComebackCard(root, 'order-token', 'pi_paid');
  expect(root.querySelector('.comeback-brand')?.textContent).toContain('Urban Roasters Co');
  expect(root.querySelectorAll('[data-earned=true]')).toHaveLength(1);
  expect(root.querySelectorAll('.comeback-stamps li')).toHaveLength(10);
  expect(root.textContent).toContain('Doris'); expect(root.textContent).toContain('solo esta compra');
  fetch.mockResolvedValue(new Response(JSON.stringify({ submitted: true })));
  root.querySelector<HTMLButtonElement>('[data-comeback-email]')!.click();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1][1]?.body).toBe(JSON.stringify({ trackingToken: 'order-token' }));
});
it('does not show a disabled card, failed response, or stale card from a different order', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch'); const root = document.querySelector('main')!;
  for (const response of [new Response('null'), new Response('', { status: 404 }), new Response(JSON.stringify(card))]) {
    fetch.mockResolvedValue(response);
    await mountComebackCard(root, 'order-token', 'another-payment');
    expect(root.querySelector('[data-payment-comeback]')).toBeNull();
  }
});
it('does not insert cards into a screen that has been replaced while loading', async () => {
  let resolve!: (r: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(r => { resolve = r; }));
  const root = document.querySelector('main')!; const pending = mountComebackCard(root, 'order-token');
  root.replaceChildren(); resolve(new Response(JSON.stringify(card))); await pending;
  expect(root.children).toHaveLength(0);
});
it('escapes card copy and rejects executable image and link URLs', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...card, brand: { name: '<script>bad()</script>', logoUrl: 'javascript:bad()' }, cardUrl: 'javascript:bad()', customerName: '<img src=x onerror=bad()>' })));
  const root = document.querySelector('main')!; await mountComebackCard(root, 'order-token');
  expect(root.querySelector('script')).toBeNull(); expect(root.querySelector('a')).toBeNull();
  expect(root.textContent).toContain('<img src=x onerror=bad()>');
});
