import { CHECKOUT_ORIGIN } from './api';
import { sourceShoppingProbe } from './source-shopping-probe';
import { sourcePreviewDocument, type SourceSnapshot } from './source-preview';
export type SourceCheck = { label: string; status: 'passed' | 'failed' | 'skipped' | 'warning'; detail?: string; blocking?: boolean };

export function sourceChecksBlockPublishing(rows: SourceCheck[]) {
  return rows.some(row => row.status === 'failed' || row.blocking);
}

/** Inspect links before the preview removes unsupported external resources. */
export function sourceLinkChecks(snapshot: SourceSnapshot): SourceCheck[] {
  const pages = new Map(snapshot.files.filter(f => f.path.endsWith('.html')).map(f => [f.path, new DOMParser().parseFromString(f.content, 'text/html')]));
  const failures: string[] = [];
  if (snapshot.files.some(f => f.path === 'storefront-framework.json')) {
    try { const layout = JSON.parse(snapshot.files.find(f => f.path === 'source-next-layout.json')?.content || '{}'); for (const [path, markup] of Object.entries(layout)) { const doc = pages.get(path); if (doc && typeof markup === 'string') doc.body.innerHTML = markup; } } catch { failures.push('No se pudo leer la estructura React.'); }
  }
  for (const [path, doc] of pages) for (const anchor of doc.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')!;
    if (!href || /^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    try {
      const url = new URL(href, `https://source.invalid/${path}`);
      const target = decodeURIComponent(url.pathname.slice(1));
      const destination = pages.get(target);
      if (!destination) { failures.push(`${path}: ${href}`); continue; }
      const id = decodeURIComponent(url.hash.slice(1));
      if (id && !['pedido', 'carrito', 'cart', 'checkout', 'pago-de-prueba'].includes(id) && !destination.getElementById(id) && !destination.getElementsByName(id).length) failures.push(`${path}: ${href}`);
    } catch { failures.push(`${path}: ${href}`); }
  }
  const brand = snapshot.files.find(f => f.path === 'brand.css');
  const brandChecks: SourceCheck[] = brand ? [{ label: 'Identidad compartida en todas las páginas', status: [...pages.values()].every(doc => [...doc.querySelectorAll('link[rel=stylesheet]')].some(link => /(?:^|\/)brand\.css$/.test(link.getAttribute('href') || ''))) ? 'passed' : 'failed', detail: 'Cada página debe cargar las reglas confirmadas de brand.css.' }] : [];
  return [...brandChecks, { label: 'Enlaces y secciones internas', status: failures.length ? 'failed' : 'passed', ...(failures.length ? { detail: failures.slice(0, 8).join(' · ') } : {}) }];
}

/** Functional diagnostics, never a security attestation or a live payment test. */
export async function checkSourceWebsite(snapshot: SourceSnapshot, signal?: AbortSignal): Promise<SourceCheck[]> {
  const results = sourceLinkChecks(snapshot);
  let designLayout: unknown;
  try {
    const design = JSON.parse(snapshot.files.find(f => f.path === 'design-direction.json')?.content || 'null');
    const layout = design?.concepts?.[design.selected]?.layout;
    if (layout && Array.isArray(layout.sections) && layout.sections.length <= 12 && layout.sections.every((id: unknown) => typeof id === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(id)) && typeof layout.catalogSection === 'string' && typeof layout.standaloneIntro === 'boolean' && typeof layout.productsInOpening === 'boolean') designLayout = layout;
  } catch { /* Legacy snapshots have no design contract. */ }
  let productId = '', configuredCheckout = '', optionsId = '', optionsDestination = '';
  let checkedSnapshot = snapshot;
  const htmlPages = snapshot.files.filter(f => f.path.endsWith('.html')).sort((a, b) => a.path === 'index.html' ? -1 : b.path === 'index.html' ? 1 : a.path.localeCompare(b.path));
  try {
    const config = snapshot.files.find(f => f.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    const parsed = config ? JSON.parse(config[1]) : {};
    configuredCheckout = typeof parsed.checkoutPage === 'string' ? parsed.checkoutPage : '';
    const items = parsed.data?.items || [];
    productId = items?.find((p: any) => p.stock !== 0 && p.purchaseLimit !== 0 && !p.variants?.length && !p.extras?.length)?.id || '';
    if (!productId) {
      optionsId = items.find((p: any) => p.stock !== 0 && p.purchaseLimit !== 0 && (p.variants?.length || p.extras?.length))?.id || '';
      if (optionsId) {
        const checkoutOrigin = parsed.checkoutOrigin || CHECKOUT_ORIGIN;
        optionsDestination = new URL(`/s/${encodeURIComponent(parsed.slug)}/p/${encodeURIComponent(optionsId)}`, checkoutOrigin).href;
        checkedSnapshot = { ...snapshot, files: snapshot.files.map(file => file.path === 'config.js' ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...parsed, demo: false, checkoutOrigin })};` } : file) };
      }
    }
  } catch { results.push({ label: 'Catálogo de prueba', status: 'failed', detail: 'Configuración no válida' }); }
  if (!productId && !optionsId) results.push({ label: 'Catálogo pendiente', status: 'skipped', blocking: true, detail: 'Añade un producto disponible con nombre y precio para comprobar la compra y el pago. Las imágenes del diseño no crean productos en el catálogo.' });
  for (const width of [1280, 768, 390, 320]) {
    const viewportLabel = width === 320 ? 'Móvil pequeño' : width === 390 ? 'Móvil' : width === 768 ? 'Tablet' : 'Escritorio';
    let paymentOpened = false, optionsOpened = false;
    let checkoutCart: Array<{ id: string; quantity: number }> | undefined;
    for (const file of htmlPages) {
      if (signal?.aborted) return results;
      const pageResults = await new Promise<SourceCheck[]>(resolve => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const frame = document.createElement('iframe');
        frame.inert = true; frame.title = 'Comprobación automática del sitio'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
        frame.sandbox.add('allow-scripts'); frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:844px;border:0;pointer-events:none;`;
        let settled = false, pagePaymentOpened = false, checkoutNavigation = false;
        const finish = (rows: SourceCheck[]) => { if (settled) return; settled = true; clearTimeout(timeout); window.removeEventListener('message', receive); signal?.removeEventListener('abort', abort); const restoreFocus = document.activeElement === frame; frame.remove(); if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); resolve(rows); };
        const abort = () => finish([]);
        const timeout = window.setTimeout(() => finish([{ label: 'Carga del sitio', status: 'failed', detail: 'La página no respondió en 8 segundos.' }]), 8000);
        const receive = (event: MessageEvent) => {
          if (event.source !== frame.contentWindow || event.origin !== 'null') return;
          if (optionsId && event.data?.type === 'pagosya:hosted-request') frame.contentWindow?.postMessage({ type: 'pagosya:hosted-response', id: event.data.id, result: { ok: false, body: { message: 'Comprobación sin solicitudes reales.' } } }, '*');
          if (optionsId && event.data?.type === 'pagosya:source-external' && event.data.url === optionsDestination) optionsOpened = true;
          if (event.data?.type === 'pagosya:source-payment-preview' && Array.isArray(event.data.cart) && event.data.cart.length) { paymentOpened = true; pagePaymentOpened = true; }
          if (event.data?.type === 'pagosya:source-navigate' && event.data.page === configuredCheckout && Array.isArray(event.data.cart)) {
            checkoutCart = event.data.cart.filter((item: any) => item?.id === productId && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99);
            checkoutNavigation = Boolean(checkoutCart?.length);
          }
          if (event.data?.type === 'pagosya:source-check-result' && Array.isArray(event.data.results)) {
            const extra: SourceCheck[] = [];
            if (productId && configuredCheckout && file.path === 'index.html') extra.push({ label: 'Carrito al navegar a checkout', status: checkoutNavigation ? 'passed' : 'failed' });
            if (productId && (file.path === configuredCheckout || /(?:^|\/)checkout\.html$/.test(file.path))) extra.push({ label: 'Botón de pago en checkout', status: pagePaymentOpened ? 'passed' : 'failed' });
            finish([...extra, ...event.data.results.slice(0, 40).filter((r: any) => ['passed', 'failed', 'skipped', 'warning'].includes(r?.status) && typeof r.label === 'string').map((r: any) => ({ label: r.label.slice(0, 160), status: r.status, ...(typeof r.detail === 'string' ? { detail: r.detail.slice(0, 300) } : {}) }))]);
          }
        };
        window.addEventListener('message', receive); signal?.addEventListener('abort', abort, { once: true });
        const isHome = file.path === 'index.html';
        const doc = new DOMParser().parseFromString(sourcePreviewDocument(checkedSnapshot, file.path, { paymentForm: true, hosted: Boolean(optionsId), query: productId || optionsId ? `?id=${encodeURIComponent(productId || optionsId)}` : '', cart: !isHome && productId ? checkoutCart || [{ id: productId, quantity: 1 }] : [] }), 'text/html');
        const script = doc.createElement('script'); script.textContent = `(${sourceShoppingProbe.toString()})(${JSON.stringify(isHome ? designLayout : null)?.replace(/</g, '\\u003c') || 'null'})`;
        doc.head.querySelector('meta[http-equiv]')!.after(script);
        frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
        document.body.append(frame);
      });
      results.push(...pageResults.filter(row => productId || optionsId || row.label !== 'Compra de producto').map(row => ({ ...row, label: `${viewportLabel} · ${file.path} · ${row.label}` })));
    }
    if (optionsId) results.push({ label: `${viewportLabel} · Apertura de opciones en la plataforma`, status: optionsOpened ? 'passed' : 'failed' });
    if (productId || optionsId) results.push({ label: `${viewportLabel} · Apertura del formulario de pago`, status: productId ? paymentOpened ? 'passed' : 'failed' : optionsOpened ? 'skipped' : 'failed', detail: productId ? 'Verifica el paso al formulario en modo de prueba.' : 'La ruta al formulario compartido de opciones está comprobada. Revisa variantes y extras en una compra de prueba; este chequeo aislado no completa esa selección.' });
  }
  return results;
}
