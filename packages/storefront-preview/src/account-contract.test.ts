import { describe, expect, it } from 'vitest';
import { ACCOUNT_ACTIONS, ACCOUNT_VIEW_PAGES, accountActionBody } from '@pagosya/shared-types';

describe('account bridge contract', () => {
  it('lists exactly the spec actions and maps every gate view to its page file', () => {
    expect(ACCOUNT_ACTIONS).toEqual(['state', 'login', 'register', 'verify', 'forgot', 'reset', 'me', 'update-me', 'orders', 'subscriptions', 'addresses', 'export', 'delete', 'logout']);
    expect(ACCOUNT_VIEW_PAGES).toEqual({ login: 'acceso-ingresar.html', register: 'acceso-registro.html', 'forgot-password': 'acceso-olvide-mi-contrasena.html', 'reset-password': 'acceso-restablecer-contrasena.html', orders: 'cuenta-pedidos.html', addresses: 'cuenta-direcciones.html', profile: 'cuenta-perfil.html', subscriptions: 'cuenta-suscripciones.html' });
  });
  it('keeps only the fields each action may send', () => {
    expect(accountActionBody('login', { email: ' a@b.bo ', password: 'secreto123', token: 'x' })).toEqual({ email: 'a@b.bo', password: 'secreto123' });
    expect(accountActionBody('reset', { password: 'nueva12345', token: 'stolen' })).toEqual({ password: 'nueva12345' });
    expect(accountActionBody('addresses', { addresses: [{ label: 'Casa', city: 'La Paz', evil: 1 }] })).toEqual({ addresses: [{ label: 'Casa', city: 'La Paz' }] });
    expect(accountActionBody('login', { email: 3 })).toBeNull();
    expect(accountActionBody('nope' as never, {})).toBeNull();
  });
});
