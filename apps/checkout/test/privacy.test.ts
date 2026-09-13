import { beforeEach, expect, it, vi } from 'vitest';
import { privacy } from '../src/privacy';
import { sourceVisitorId, rememberSourceVisit, sourceVisitToken } from '../src/source-attribution';
import { storePartnerCode } from '../src/partner-referral';
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); document.body.innerHTML = ''; history.replaceState({}, '', '/'); });
it('does not allocate a visitor or persist partner attribution before consent', () => {
  history.replaceState({}, '', '/?partner=partner1234');
  expect(sourceVisitorId('shop')).toBeUndefined(); expect(storePartnerCode('shop')).toBeUndefined();
  rememberSourceVisit('shop', 'v'.repeat(32)); expect(sourceVisitToken('shop')).toBeUndefined(); expect(sessionStorage.length).toBe(0);
});
it('accepts, expires and revokes optional storage while retaining the cart', () => {
  privacy.save('shop', true); expect(sourceVisitorId('shop')).toBeTruthy(); rememberSourceVisit('shop', 'v'.repeat(32));
  localStorage.setItem('pagosya:cart:shop', '[1]'); privacy.save('shop', false);
  expect(localStorage.getItem('pagosya:source-visitor:shop')).toBeNull(); expect(sourceVisitToken('shop')).toBeUndefined(); expect(localStorage.getItem('pagosya:cart:shop')).toBe('[1]');
  privacy.save('shop', true); vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 181 * 86400000); expect(privacy.analyticsAllowed('shop')).toBe(false);
});
it('shows equally available choices only when analytics is used, and allows changing them', () => {
  privacy.mount('shop', { analyticsAvailable: true });
  const root = document.querySelector('[data-pagosya-privacy]')!; expect(root.querySelector<HTMLElement>('[data-privacy-panel]')!.hidden).toBe(false);
  root.querySelector<HTMLButtonElement>('[data-privacy-reject]')!.click(); expect(privacy.choice('shop')).toBe(false);
  root.querySelector<HTMLButtonElement>('[data-privacy-open]')!.click(); root.querySelector<HTMLButtonElement>('[data-privacy-accept]')!.click(); expect(privacy.choice('shop')).toBe(true);
});
