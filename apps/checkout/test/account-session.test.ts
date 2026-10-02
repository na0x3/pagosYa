// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, readSession, saveSession } from '../src/account/account-session';
const session = { token: 'trusted-token', expiresAt: new Date(Date.now() + 60_000).toISOString() };
afterEach(() => { vi.restoreAllMocks(); clearSession('shop'); clearSession('other'); localStorage.clear(); });
describe('trusted account sessions', () => {
  it('keeps blocked-storage login usable for this visit and clears it on logout', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    saveSession('shop', session);
    expect(readSession('shop')).toBe(session.token);
    expect(readSession('other')).toBeNull();
    clearSession('shop');
    expect(readSession('shop')).toBeNull();
  });
  it('expires sessions and observes logout from another tab when storage works', () => {
    saveSession('shop', { ...session, expiresAt: new Date(0).toISOString() });
    expect(readSession('shop')).toBeNull();
    saveSession('shop', session);
    localStorage.removeItem('pagosya:customer:shop');
    expect(readSession('shop')).toBeNull();
  });
  it('does not resurrect a stored token if logout could not remove it', () => {
    saveSession('shop', session);
    const remove = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    clearSession('shop');
    remove.mockRestore();
    expect(readSession('shop')).toBeNull();
  });
});
