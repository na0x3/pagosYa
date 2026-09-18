import { API_BASE_URL } from './api';
let sequence = 0; let lastRoute = '';
export function markPrivateStorePage() {
  sequence++; lastRoute = '';
  let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
  robots.content = 'noindex, nofollow';
}
export async function refreshStoreSeo(slug: string, productId?: string, page?: string) {
  const route = `${slug}|${productId || ''}|${page || ''}`;
  if (route === lastRoute) return;
  lastRoute = route; const current = ++sequence;
  const query = new URLSearchParams(); if (productId) query.set('productId', productId); if (page && page !== 'index.html') query.set('page', page);
  try {
    const response = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/seo?${query}`, { credentials: 'omit', signal: AbortSignal.timeout(6000) });
    if (current !== sequence) return;
    if (!response.ok) { lastRoute = ''; return; }
    const data = await response.json(); if (current !== sequence) return;
    const parsed = new DOMParser().parseFromString(`<html><head>${data.head}</head></html>`, 'text/html');
    document.head.querySelectorAll('title,meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"],script[data-pagosya-seo]').forEach(el => el.remove());
    parsed.head.querySelectorAll('title,meta,link[rel="canonical"],script[type="application/ld+json"]').forEach(el => { el.setAttribute('data-pagosya-seo', ''); document.head.append(document.importNode(el, true)); });
    if (['recover', 'comeback', 'unsubscribe', 'client_secret', 'source_owner', 'publishable_key', 'source_payment_preview', 'preview', 'source_preview'].some(key => new URLSearchParams(location.search).has(key))) document.querySelector('meta[name=robots]')?.setAttribute('content', 'noindex, nofollow');
  } catch { if (current === sequence) lastRoute = ''; }
}
