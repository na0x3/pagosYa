// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { AccountError, accountApi } from './account-api';
import { readSession, saveSession } from './account-session';
import { createAccountBridgeHandler, takeAccountEmailToken } from './account-bridge-handler';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
const handler = (emailToken: ReturnType<typeof takeAccountEmailToken> = null, preview = false) => createAccountBridgeHandler('cafe', { preview, emailToken: () => emailToken, download: vi.fn() });

// Spec 2026-10-08-store-built-in-account-pages: the published store answers the account pages; the token stays here.
it('signs in, keeps the token on this origin and answers the store only with the name', async () => {
  vi.spyOn(accountApi, 'login').mockResolvedValue({ token: 't1', expiresAt: '2999-01-01T00:00:00Z', customer: { name: 'Ana' } } as any);
  expect(await handler()('login', { email: 'a@b.bo', password: 'Gelato2026!' })).toEqual({ ok: true, body: { signedIn: true, name: 'Ana' } });
  expect(readSession('cafe')).toBe('t1');
});
it('adds the emailed reset token itself; the store never sends or sees it', async () => {
  const reset = vi.spyOn(accountApi, 'resetPassword').mockResolvedValue({ ok: true });
  expect(await handler({ kind: 'restablecer', token: 'rt' })('reset', { password: 'nueva12345' })).toEqual({ ok: true, body: { ok: true } });
  expect(reset).toHaveBeenCalledWith('cafe', { token: 'rt', password: 'nueva12345' });
  expect((await handler(null)('reset', { password: 'nueva12345' })).ok).toBe(false);
});
it('answers an expired session as signed out and clears it', async () => {
  saveSession('cafe', { token: 'old', expiresAt: '2999-01-01T00:00:00Z' });
  vi.spyOn(accountApi, 'orders').mockRejectedValue(new AccountError('Sesión vencida', 401));
  expect(await handler()('orders', {})).toEqual({ ok: false, body: { status: 401, message: 'Sesión vencida' } });
  expect(readSession('cafe')).toBeNull();
});
it('reports a confirmed email once, on the first state after the link', async () => {
  vi.spyOn(accountApi, 'verifyEmail').mockResolvedValue({ ok: true });
  const handle = handler({ kind: 'verificar', token: 'vt' });
  expect(await handle('state', {})).toEqual({ ok: true, body: { signedIn: false, verified: true } });
  expect(await handle('state', {})).toEqual({ ok: true, body: { signedIn: false } });
});
it('takes #restablecer= out of the address bar once', () => {
  history.replaceState(null, '', '/s/cafe?source_page=acceso-restablecer-contrasena.html#restablecer=abcdefghijklmnop');
  expect(takeAccountEmailToken(location, history)).toEqual({ kind: 'restablecer', token: 'abcdefghijklmnop' });
  expect(location.hash).toBe('');
  expect(location.search).toBe('?source_page=acceso-restablecer-contrasena.html');
  expect(takeAccountEmailToken(location, history)).toBeNull();
});
it('in the owner preview never calls the API', async () => {
  const login = vi.spyOn(accountApi, 'login');
  expect((await handler(null, true)('login', { email: 'a@b.bo', password: 'Gelato2026!' })).ok).toBe(true);
  expect(login).not.toHaveBeenCalled();
});

it('drops store messages that carry a password the shopper typed, answering requests neutrally', async () => {
  const { createPasswordGuard } = await import('@pagosya/storefront-preview');
  const { blockedStoreMessage } = await import('./account-bridge-handler');
  const passwords = createPasswordGuard();
  passwords.remember('Gelato2026!');
  expect(blockedStoreMessage(passwords, { type: 'pagosya:hosted-request', id: 4, action: 'review', body: { text: 'rico gelato2026!' } })).toEqual({ blocked: true, reply: { type: 'pagosya:hosted-response', id: 4, result: { ok: false, body: { message: 'No se pudo enviar.' } } } });
  expect(blockedStoreMessage(passwords, { type: 'pagosya:analytics', events: [{ q: btoa('Gelato2026!') }] })).toEqual({ blocked: true });
  expect(blockedStoreMessage(passwords, { type: 'pagosya:hosted-request', id: 5, action: 'review', body: { text: 'muy rico' } })).toEqual({ blocked: false });
  expect(blockedStoreMessage(passwords, { type: 'pagosya:account-request', id: 6, action: 'login', body: { password: 'Gelato2026!' } })).toEqual({ blocked: false });
});
