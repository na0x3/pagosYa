// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { demoAccountHandler } from './source-account-demo';

// Spec 2026-10-08-store-built-in-account-pages: in the Studio the account pages behave, and nothing is created or sent.
it('behaves like a store and sends nothing: two demo orders after a demo sign-in', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  expect(await demoAccountHandler('state', {})).toEqual({ ok: true, body: { signedIn: false } });
  expect(await demoAccountHandler('login', { email: 'a@b.bo', password: 'x' })).toEqual({ ok: true, body: { signedIn: true, name: 'Cliente de prueba' } });
  const orders = await demoAccountHandler('orders', {});
  expect(orders.ok).toBe(true);
  expect((orders.body as unknown[]).length).toBe(2);
  expect((await demoAccountHandler('register', { name: 'A', email: 'a@b.bo', password: 'x' })).body).toEqual({ message: 'Vista previa · No se crean cuentas' });
  await demoAccountHandler('logout', {});
  expect(await demoAccountHandler('state', {})).toEqual({ ok: true, body: { signedIn: false } });
  expect(fetchSpy).not.toHaveBeenCalled();
});
