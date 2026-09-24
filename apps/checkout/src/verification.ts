import { API_BASE_URL } from './api';

export type StoreVerification = {
  storeName: string; slug: string; verifiedBusiness: boolean; verifiedSince: string | null; electronicInvoicing: boolean;
  securePayments: boolean; onPlatformSince: string; reviews: { count: number; average: number | null }; officialDomain: string | null;
};

/** The verification page always lives on pagosYa's own origin, never on a merchant's custom domain,
 * so a look-alike seal drawn inside a generated design cannot lead to a look-alike page. */
const PLATFORM_ORIGIN: string = import.meta.env.VITE_CHECKOUT_ORIGIN ?? location.origin;
export const verificationUrl = (slug: string) => `${PLATFORM_ORIGIN.replace(/\/$/, '')}/verificar/${encodeURIComponent(slug)}`;

export async function fetchVerification(slug: string): Promise<StoreVerification | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/verification`, { credentials: 'omit', signal: AbortSignal.timeout(6000) });
    return response.ok ? await response.json() as StoreVerification : null;
  } catch { return null; }
}

const SHIELD = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const date = (iso: string | null) => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

function injectStyles() {
  if (document.getElementById('pagosya-verification-styles')) return;
  const style = document.createElement('style');
  style.id = 'pagosya-verification-styles';
  style.textContent = `
.pagosya-seal{position:fixed;left:12px;bottom:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px 0 10px;border-radius:999px;background:#0f3d2e;color:#fff;font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em;text-decoration:none;box-shadow:0 2px 10px rgb(0 0 0/.22);transition:transform .2s cubic-bezier(.22,1,.36,1)}
.pagosya-seal:hover{transform:translateY(-1px)}.pagosya-seal:focus-visible{outline:2px solid #fff;outline-offset:2px;box-shadow:0 0 0 4px #0f3d2e}
.pagosya-seal small{font-weight:500;opacity:.8}
@media (max-width:520px){.pagosya-seal small{display:none}}
@media print{.pagosya-seal{display:none}}
.pagosya-verification{min-height:100dvh;margin:0;padding:48px 16px!important;background:#f5f3ee;color:#1b1a17;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
.pagosya-verification main{max-width:560px;margin:0 auto;padding:32px;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgb(0 0 0/.06),0 12px 40px -16px rgb(0 0 0/.18)}
.pagosya-verification h1{margin:12px 0 4px;font-size:26px;line-height:1.2}
body.pagosya-verification:not(.store-page):not(.source-store-page) #app{max-width:none;margin:0;padding:0;background:none;border:0;border-radius:0;box-shadow:none;animation:none}
.pagosya-verification .pv-status{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:600;font-size:14px}
.pagosya-verification .pv-status[data-ok]{background:#e3f1ea;color:#0f3d2e}.pagosya-verification .pv-status:not([data-ok]){background:#f6ece1;color:#7a3e0a}
.pagosya-verification dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin:24px 0}
.pagosya-verification dt{color:#5c5850}.pagosya-verification dd{margin:0;font-weight:600}
.pagosya-verification p{color:#4a463f;font-size:14px}.pagosya-verification a{color:#0f3d2e}
@media (max-width:520px){.pagosya-verification main{padding:24px}.pagosya-verification dl{grid-template-columns:1fr;gap:2px}.pagosya-verification dd{margin-bottom:10px}}`;
  document.head.append(style);
}

/** Drawn by the trusted page around the store, outside the sandboxed design, which cannot cover or restyle it. */
export function mountVerificationSeal(verification: StoreVerification) {
  if (!verification.verifiedBusiness || document.querySelector('.pagosya-seal')) return;
  injectStyles();
  const seal = document.createElement('a');
  seal.className = 'pagosya-seal';
  seal.href = verificationUrl(verification.slug);
  seal.target = '_blank';
  seal.rel = 'noopener noreferrer';
  seal.setAttribute('aria-label', `Comercio verificado por pagosYa: ver la verificación de ${verification.storeName}`);
  seal.innerHTML = `${SHIELD}<span>Comercio verificado</span><small>· pagosYa</small>`;
  document.body.append(seal);
}

export async function mountVerificationPage(slug: string, root: HTMLElement) {
  injectStyles();
  document.title = 'Verificación de comercio · pagosYa';
  const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex'; document.head.append(robots);
  document.body.classList.add('pagosya-verification');
  root.innerHTML = '<main aria-busy="true"><p>Consultando la verificación…</p></main>';
  const v = await fetchVerification(slug);
  if (!v) { root.innerHTML = '<main><h1>Tienda no encontrada</h1><p>Esta dirección no corresponde a una tienda publicada en pagosYa. Si alguien te mostró un sello con este enlace, no confíes en él.</p></main>'; return; }
  const storeUrl = v.officialDomain ? `https://${v.officialDomain}/` : `${PLATFORM_ORIGIN.replace(/\/$/, '')}/s/${encodeURIComponent(v.slug)}`;
  const rows: Array<[string, string]> = [
    ['Identidad del negocio', escape(v.verifiedBusiness ? `Verificada${v.verifiedSince ? ` el ${date(v.verifiedSince)}` : ''}` : 'Pendiente de verificación')],
    ['Pagos', escape(v.securePayments ? 'Procesados por pagosYa' : 'Por contacto directo con el comercio')],
    ['Factura electrónica SIN', escape(v.electronicInvoicing ? 'Emite factura electrónica' : 'No emite factura electrónica por pagosYa')],
    ['Reseñas de compras verificadas', escape(v.reviews.count ? `${v.reviews.count} · ${v.reviews.average?.toLocaleString('es-BO')} de 5` : 'Todavía no tiene reseñas')],
    ['En pagosYa desde', escape(date(v.onPlatformSince))],
    ['Dirección oficial de la tienda', `<a href="${escape(storeUrl)}" rel="noopener">${escape(storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`],
  ];
  root.innerHTML = `<main>
    <span class="pv-status"${v.verifiedBusiness ? ' data-ok' : ''}>${SHIELD}${v.verifiedBusiness ? 'Comercio verificado por pagosYa' : 'Comercio sin verificar'}</span>
    <h1>${escape(v.storeName)}</h1>
    <dl>${rows.map(([term, value]) => `<dt>${escape(term)}</dt><dd>${value}</dd>`).join('')}</dl>
    <p>Esta página está alojada por pagosYa. Comprueba que la dirección del navegador empiece con <strong>${escape(new URL(PLATFORM_ORIGIN).host)}</strong> y que la tienda donde compras sea la dirección oficial de arriba. pagosYa verifica la identidad del negocio antes de habilitar pagos reales; no garantiza la calidad de cada producto.</p>
  </main>`;
}
