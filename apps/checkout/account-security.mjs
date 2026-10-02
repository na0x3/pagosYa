/** Customer accounts are sensitive: only our editor and the same-origin storefront may frame them. */
export function accountFramePolicy(env = process.env) {
  const origins = new Set(["'self'"]);
  for (const value of [env.MERCHANT_DASHBOARD_ORIGIN, env.MERCHANT_STUDIO_ORIGIN]) {
    if (!value) continue;
    try { const url = new URL(value); if (url.protocol === 'https:' || env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)) origins.add(url.origin); } catch { /* Invalid origins never widen the policy. */ }
  }
  if (env.NODE_ENV !== 'production') for (const host of ['localhost','127.0.0.1']) for (const port of [4312,4322,4323]) origins.add(`http://${host}:${port}`);
  return `frame-ancestors ${[...origins].join(' ')}; base-uri 'self'; object-src 'none'; form-action 'self'`;
}
export function protectAccountResponse(pathname, response, env = process.env) {
  if (!/^\/cuenta\//.test(pathname)) return;
  response.setHeader('Content-Security-Policy', accountFramePolicy(env));
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Referrer-Policy','no-referrer');
  response.setHeader('X-Robots-Tag','noindex, nofollow');
}
