import { describe, expect, it } from 'vitest';
import { isAccountDestination } from './account-destinations';

const ok = (path: string, origin = 'https://pay.test', slug = 'marca') => isAccountDestination(new URL(`https://pay.test${path}`), origin, slug);

describe('isAccountDestination', () => {
  it('allows the sign-in page and the six token-free views, with or without a trailing slash', () => {
    for (const path of ['/cuenta/marca', '/cuenta/marca/', '/cuenta/marca/registro', '/cuenta/marca/recuperar', '/cuenta/marca/pedidos', '/cuenta/marca/direcciones', '/cuenta/marca/perfil', '/cuenta/marca/suscripciones/']) expect(ok(path)).toBe(true);
  });
  it('refuses views that need an email token', () => {
    expect(ok('/cuenta/marca/restablecer')).toBe(false);
    expect(ok('/cuenta/marca/verificar')).toBe(false);
  });
  it('refuses another store, an unknown view, a deeper path and a traversal', () => {
    for (const path of ['/cuenta/otra/pedidos', '/cuenta/marca/otra', '/cuenta/marca/pedidos/x', '/cuenta/marca/pedidos/../x', '/cuenta/marca%2Fpedidos']) expect(ok(path)).toBe(false);
  });
  it('refuses a different origin', () => {
    expect(isAccountDestination(new URL('https://evil.test/cuenta/marca/pedidos'), 'https://pay.test', 'marca')).toBe(false);
  });
  it('matches a slug with special characters literally', () => {
    expect(isAccountDestination(new URL('https://pay.test/cuenta/a.b/pedidos'), 'https://pay.test', 'a.b')).toBe(true);
    expect(isAccountDestination(new URL('https://pay.test/cuenta/axb/pedidos'), 'https://pay.test', 'a.b')).toBe(false);
  });
});
