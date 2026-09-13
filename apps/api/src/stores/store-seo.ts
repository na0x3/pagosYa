/** Deterministic metadata; never executes merchant HTML or invents product claims. */
export const seoEscape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function seoText(html: string): string {
  return html.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|template|noscript)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
}
export function sourceSeoCopy(html: string) {
  const safe = html.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|template|noscript|head)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ');
  const blocks = [...safe.matchAll(/<(h[1-3]|p|li)\b([^>]*)>([^]*?)<\/\1\s*>/gi)].filter(m => !/\bhidden\b|aria-hidden\s*=\s*["']true|display\s*:\s*none/i.test(m[2])).map(m => ({ tag: m[1].toLowerCase(), text: seoText(m[3]) })).filter(b => b.text).slice(0, 150);
  const title = seoText(/<title\b[^>]*>([^]*?)<\/title>/i.exec(html)?.[1] || blocks.find(b => b.tag === 'h1')?.text || '').slice(0, 200);
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].find(m => /\bname\s*=\s*["']description["']/i.test(m[0]))?.[0] || '';
  const description = seoText(/\bcontent\s*=\s*(["'])([^]*?)\1/i.exec(meta)?.[2] || blocks.find(b => b.tag === 'p')?.text || '').slice(0, 300);
  const noindex = [...html.matchAll(/<meta\b[^>]*>/gi)].some(m => /\bname\s*=\s*["']robots["']/i.test(m[0]) && /\bnoindex\b/i.test(m[0]));
  return { title, description, blocks, noindex };
}
export function seoPrice(product: any, now = Date.now()) {
  const discount = product.discountPercent > 0 && (!product.discountStartsAt || new Date(product.discountStartsAt).getTime() <= now) && (!product.discountEndsAt || new Date(product.discountEndsAt).getTime() > now);
  return discount ? Math.round(product.amount * (1 - product.discountPercent / 100)) : product.amount;
}
export function publicImage(value: string | undefined | null, apiBase: string) {
  if (!value) return undefined;
  try { const url = new URL(value, apiBase); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function seoHead(input: { title: string; description: string; canonical: string; image?: string; graph: unknown[]; noindex?: boolean; kind?: string }) {
  const e = seoEscape;
  return `<title>${e(input.title)}</title><meta name="description" content="${e(input.description)}"><meta name="robots" content="${input.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}"><link rel="canonical" href="${e(input.canonical)}"><meta property="og:type" content="${input.kind || 'website'}"><meta property="og:title" content="${e(input.title)}"><meta property="og:description" content="${e(input.description)}"><meta property="og:url" content="${e(input.canonical)}"><meta name="twitter:card" content="${input.image ? 'summary_large_image' : 'summary'}">${input.image ? `<meta property="og:image" content="${e(input.image)}"><meta name="twitter:image" content="${e(input.image)}">` : ''}<script type="application/ld+json" data-pagosya-seo>${JSON.stringify({ '@context': 'https://schema.org', '@graph': input.graph }).replace(/</g, '\\u003c')}</script>`;
}
