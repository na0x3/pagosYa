import { beforeEach, expect, it, vi } from 'vitest';
import { privacy } from '../src/privacy';
import { createStoreFunnel } from '../src/store-funnel';
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });
it('does not create identifiers or requests without consent or in previews', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch'); privacy.save('private', false);
  createStoreFunnel('private', false).track('visit');
  privacy.save('preview', true); createStoreFunnel('preview', true).track('visit');
  expect(sessionStorage.getItem('pagosya:funnel:private')).toBeNull();
  expect(sessionStorage.getItem('pagosya:funnel:preview')).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
});
it('deduplicates stages, sends no customer fields, and discards attribution after withdrawal', async () => {
  privacy.save('shop', true);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok:true, json:async()=>({token:'t'.repeat(32)}) } as Response);
  const funnel = createStoreFunnel('shop', false);
  funnel.track('add_to_cart'); funnel.track('add_to_cart'); funnel.track('payment_completed');
  await vi.waitFor(() => expect(funnel.token()).toBe('t'.repeat(32)));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ sessionId: expect.stringMatching(/^[a-f0-9-]{36}$/), event:'add_to_cart' });
  privacy.save('shop', false); expect(funnel.token()).toBeUndefined();
  expect(sessionStorage.getItem('pagosya:funnel:shop')).toBeNull();
});
it('analytics failures never reject or prevent a subsequent retry', async () => {
  privacy.save('offline', true);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  const funnel = createStoreFunnel('offline', false); funnel.track('checkout_started');
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await Promise.resolve(); funnel.track('checkout_started');
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(funnel.token()).toBeUndefined();
});
