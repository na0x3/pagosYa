const VIEWS = new Set(['registro', 'recuperar', 'pedidos', 'direcciones', 'perfil', 'suscripciones']);

/** Where a sandboxed store may send the shopper: its own account pages on this trusted origin (spec
 * 2026-09-30-store-account-page-files-design). `verificar` and `restablecer` are left out: they only work with an email token. */
export function isAccountDestination(url: URL, origin: string, slug: string): boolean {
  if (url.origin !== origin) return false;
  const base = `/cuenta/${encodeURIComponent(slug)}`;
  const path = url.pathname.replace(/\/$/, '');
  if (path === base) return true;
  return path.startsWith(`${base}/`) && VIEWS.has(path.slice(base.length + 1));
}
