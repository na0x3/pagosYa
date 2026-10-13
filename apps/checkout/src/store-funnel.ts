import { privacy } from './privacy';
import { API_BASE_URL } from './api';
/**
 * Hosted-store analytics stays outside authored pages and never receives customer fields. Only `visit` is sent: its
 * token links a paid order to the session. The checkout steps are G1 analytics events (store-analytics.ts), counted on
 * the server from those events alone (spec 2026-10-13-abandoned-carts).
 */
export function createStoreFunnel(slug: string, preview: boolean) {
  let token: string | undefined, activeId = '', queue = Promise.resolve();
  const sent = new Set<string>();
  const allowed = () => !preview && privacy.analyticsAllowed(slug);
  function session() {
    if (!allowed()) { token = undefined; return; }
    try {
      const key = `pagosya:funnel:${slug}`;
      let saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!saved || saved.expires <= Date.now() || !/^[a-f0-9-]{36}$/.test(saved.id)) saved = { id: crypto.randomUUID(), expires: Date.now() + 30 * 60000 };
      sessionStorage.setItem(key, JSON.stringify(saved));
      if (activeId !== saved.id) { activeId = saved.id; token = undefined; sent.clear(); }
      return saved.id as string;
    } catch { return; }
  }
  function track(event: 'visit') {
    if (event !== 'visit') return;
    const sessionId = session(); if (!sessionId || sent.has(event)) return;
    sent.add(event);
    queue = queue.then(async () => {
      if (!allowed() || sessionId !== activeId) { sent.delete(event); return; }
      try {
        const response = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/funnel`, {
          method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, event }),
          signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (allowed() && sessionId === activeId && /^[\w-]{32}$/.test(result.token)) token = result.token;
      } catch { sent.delete(event); /* Analytics must never interrupt buying. */ }
    });
  }
  // The session id is shared with store analytics (G1); the server keys the two hashes differently, so they never join.
  return { track, token: () => { session(); return allowed() ? token : undefined; }, sessionId: () => session() };
}
