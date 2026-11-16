/**
 * «La tienda que vende sola» (spec 2026-11-16), hosted side. The store's selling switches come from the site JSON (the API picks
 * this visitor's side of a running test), and the products this shopper looked at are remembered on this device only — never sent
 * anywhere — so a returning shopper sees «Seguir viendo».
 */
const RECENT_MAX = 8;
const PRODUCT_ID = /^[\w-]{1,64}$/;
const key = (slug: string) => `pagosya:recent:${slug}`;

export function readRecent(slug: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key(slug)) || '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && PRODUCT_ID.test(id)).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

/** The product views among the store's analytics events, newest first. */
export function rememberRecent(slug: string, events: unknown[]) {
  const viewed = events.flatMap(event => {
    const input = event && typeof event === 'object' ? event as Record<string, unknown> : null;
    return input?.type === 'product_view' && typeof input.productId === 'string' && PRODUCT_ID.test(input.productId) ? [input.productId] : [];
  });
  if (!viewed.length) return;
  const next = [...new Set([...viewed.reverse(), ...readRecent(slug)])].slice(0, RECENT_MAX);
  try { localStorage.setItem(key(slug), JSON.stringify(next)); } catch { /* storage may be unavailable */ }
}

/** The config.js fields the kit's selling part reads. */
export function sellingConfig(site: { selling?: unknown }, recent: string[]): { selling?: Record<string, unknown>; recent?: string[] } {
  const selling = site.selling && typeof site.selling === 'object' && !Array.isArray(site.selling) ? site.selling as Record<string, unknown> : null;
  return { ...(selling ? { selling } : {}), ...(recent.length ? { recent } : {}) };
}
