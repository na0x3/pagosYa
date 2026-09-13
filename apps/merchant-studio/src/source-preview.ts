import { prepareSourceLocations } from './source-location';
import videoLoopRuntime from '../../api/src/stores/source-kit/video.js?raw';
import privacyRuntime from '../../api/src/stores/source-kit/privacy.js?raw';
import commerceRuntime from '../../api/src/stores/source-kit/commerce.js?raw';
import retentionRuntime from '../../api/src/stores/source-kit/retention.js?raw';
import previewAssetsRuntime from './source-preview-assets.js?raw';

export interface SourceFile { path: string; content: string; encoding?: "utf8" | "base64" }
export interface SourceSnapshot { schemaVersion: number; brief: { businessType: string; audience: string; primaryAction: string; visualDirection: string }; files: SourceFile[] }

const mediaTypes: Record<string, string> = { mp4: "video/mp4", svg: "image/svg+xml", html: "text/html", css: "text/css", js: "text/javascript", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", gif: "image/gif", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2" };
function base64(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }

/** Inline a static revision into an opaque-origin iframe. Never inject source into Studio's DOM. */
export interface PreviewNavigation { page: string; fragment?: string; query?: string; newTab?: boolean; cart?: Array<{ id: string; quantity: number }> }
export function receivePreviewNavigation(event: MessageEvent, frame: HTMLIFrameElement | null, snapshot?: SourceSnapshot): PreviewNavigation | null {
  const data = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || data?.type !== 'pagosya:source-navigate' || !snapshot?.files.some(f => f.path === data.page && f.path.endsWith('.html'))) return null;
  return { page: data.page, newTab: data.newTab === true, query: typeof data.query === 'string' && data.query.startsWith('?') ? data.query.slice(0, 2000) : '', fragment: typeof data.fragment === 'string' && data.fragment.startsWith('#') ? data.fragment.slice(0, 1000) : '',
    cart: Array.isArray(data.cart) ? data.cart.slice(0, 100).filter((item: any) => typeof item?.id === 'string' && item.id.length <= 200 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99) : [] };
}
export function sourcePreviewDocument(snapshot: SourceSnapshot, page = "index.html", navigation: Partial<PreviewNavigation> & { paymentForm?: boolean; hosted?: boolean } = {}): string {
  const entry = snapshot.files.find((file) => file.path === page && file.encoding !== "base64");
  if (!entry) throw new Error("Esta revisión no incluye la página seleccionada.");
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  const data = (file: SourceFile, content?: string) => `data:${mediaTypes[file.path.split(".").pop() || ""] || "application/octet-stream"};base64,${content !== undefined ? base64(content) : file.encoding === "base64" ? file.content : base64(file.content)}`;
  const resolve = (path: string, base = page): SourceFile | undefined => {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(path)) return undefined;
    const url = new URL(path, `https://source.invalid/${base}`);
    return files.get(decodeURIComponent(url.pathname.slice(1)));
  };
  const substituteAssets = (content: string, base: string) => content.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (_match, _quote, path: string) => {
    const file = resolve(path, base); return file ? `url("${data(file)}")` : 'url("")';
  });
  const doc = new DOMParser().parseFromString(entry.content, "text/html");
  doc.querySelectorAll("base,object,embed,meta[http-equiv],link[rel=preload],link[rel=prefetch]").forEach((el) => el.remove());
  const locationSources = prepareSourceLocations(doc);
  const layoutFile = snapshot.files.find(f => f.path === 'source-next-layout.json');
  if (layoutFile && snapshot.files.some(f => f.path === 'storefront-framework.json')) {
    try { const layout = JSON.parse(layoutFile.content); const structure = new DOMParser().parseFromString(layout[page] || '', 'text/html'); locationSources.push(...prepareSourceLocations(structure)); } catch {}
  }
  doc.querySelectorAll("script").forEach((el) => {
    const src = el.getAttribute("src");
    if (!src) return; // Inline scripts remain confined to the opaque sandbox.
    const file = resolve(src);
    if (!file || !file.path.endsWith(".js")) { el.remove(); return; }
    let content = file.content;
    if (file.path === "commerce.js") content = `${privacyRuntime}\n${commerceRuntime}\n${retentionRuntime}`;
    if (file.path === "config.js") {
      for (const asset of snapshot.files.filter((f) => f.encoding === "base64")) content = content.split(JSON.stringify(asset.path)).join(JSON.stringify(data(asset)));
    }
    el.src = data(file, content); el.removeAttribute("integrity"); el.removeAttribute("crossorigin");
  });
  doc.querySelectorAll("link[rel=stylesheet]").forEach((el) => {
    const file = resolve(el.getAttribute("href") || "");
    if (!file) { el.remove(); return; }
    el.setAttribute("href", data(file, substituteAssets(file.content, file.path)));
  });
  doc.querySelectorAll("style").forEach((el) => { el.textContent = substituteAssets(el.textContent || "", page); });
  doc.querySelectorAll("[style]").forEach((el) => el.setAttribute("style", substituteAssets(el.getAttribute("style") || "", page)));
  doc.querySelectorAll("img,source,video").forEach((el) => {
    el.removeAttribute("srcset");
    const file = resolve(el.getAttribute("src") || "");
    if (file) el.setAttribute("src", data(file));
    else if (!el.getAttribute("src")?.startsWith("data:")) el.removeAttribute("src");
  });
  doc.querySelectorAll('video[poster]').forEach(el => {
    const poster = resolve(el.getAttribute('poster') || '');
    if (poster) el.setAttribute('poster', data(poster)); else el.removeAttribute('poster');
  });
  doc.querySelectorAll("a").forEach((el) => {
    const href = el.getAttribute("href") || '';
    if (el.getAttribute('target') === '_blank') el.setAttribute('data-preview-new-tab', 'true');
    el.removeAttribute('target');
    if (!href.startsWith('#') && !resolve(href)?.path.endsWith('.html')) el.removeAttribute('href');
  });
  const policy = doc.createElement("meta"); policy.httpEquiv = "Content-Security-Policy";
  policy.content = `default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src ${locationSources.length ? locationSources.join(' ') : "'none'"}; worker-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`;
  doc.head.prepend(policy);
  const flag = doc.createElement("script");
  const encoded = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const mediaAssets = Object.fromEntries(snapshot.files.filter(file => /\.(png|jpe?g|webp|avif|gif|svg|mp4)$/i.test(file.path)).map(file => [file.path, data(file)]));
  flag.textContent = `${previewAssetsRuntime}(${encoded(mediaAssets)},${encoded(page)});\nwindow.PAGOSYA_PREVIEW=true;window.PAGOSYA_HOSTED=${navigation.hosted === true};window.PAGOSYA_PREVIEW_PAGE=${encoded(page)};window.PAGOSYA_PREVIEW_QUERY=${encoded(navigation.query || "")};window.PAGOSYA_PREVIEW_CART=${encoded(navigation.cart || [])};
    if (${navigation.hosted === true}) {
      let sequence = 0;
      window.PAGOSYA_HOSTED_REQUEST = (action, body) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const receive = event => { if (event.source !== parent || event.data?.type !== 'pagosya:hosted-response' || event.data.id !== id) return; clearTimeout(timer); window.removeEventListener('message',receive); resolve(event.data.result); };
        const timer = setTimeout(() => { window.removeEventListener('message',receive); reject(new Error('La solicitud tardó demasiado. Intenta de nuevo.')); }, 20000);
        window.addEventListener('message',receive);
        parent.postMessage({type:'pagosya:hosted-request', id, action, body},'*');
      });
    }
    document.addEventListener('click', function(event) {
      const pay = event.target.closest('button[data-pay],button[data-finish-demo]');
      if (${navigation.paymentForm === true} && pay && !pay.disabled) {
        event.preventDefault(); event.stopImmediatePropagation();
        const panel = pay.closest('[data-pagosya-cart]');
        const validation = { panel, valid: true }; document.dispatchEvent(new CustomEvent('pagosya:validate-checkout', { detail: validation }));
        if (!validation.valid) return;
        const fulfillment = { method: panel?.querySelector('[name=method]')?.value, address: panel?.querySelector('[name=shippingAddress]')?.value };
        const state = { items: [] }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail: state }));
        parent.postMessage({ type: 'pagosya:source-payment-preview', cart: state.items, fulfillment }, '*');
        return;
      }
      const link = event.target.closest('a[href]'); if (!link) return;
      const href = link.getAttribute('href'); if (!href) return;
      if (href.startsWith('#')) {
        // Native srcdoc anchors resolve against the host URL and leave the preview.
        // Updating this document's hash also preserves authored hashchange handlers.
        event.preventDefault();
        window.location.hash = href;
        try {
          const id = decodeURIComponent(href.slice(1));
          if (!id) window.scrollTo({ top: 0 });
          else (document.getElementById(id) || document.getElementsByName(id)[0])?.scrollIntoView();
        } catch {}
        return;
      }
      const url = new URL(href, ${encoded(`https://source.invalid/${page}`)});
      const path = decodeURIComponent(url.pathname.slice(1));
      if (${navigation.hosted === true} && url.origin !== 'https://source.invalid') { event.preventDefault(); parent.postMessage({type:'pagosya:source-external',url:url.href},'*'); return; }
      if (url.origin !== 'https://source.invalid' || !${encoded(snapshot.files.filter(f => f.path.endsWith('.html')).map(f => f.path))}.includes(path)) return;
      event.preventDefault();
      const state = { items: [] }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail: state }));
      parent.postMessage({ type: 'pagosya:source-navigate', page: path, query: url.search, fragment: url.hash, newTab: link.target === '_blank' || link.dataset.previewNewTab === 'true' || event.ctrlKey || event.metaKey, cart: state.items }, '*');
    }, true);
    window.addEventListener('load', function() {
      const fragment = ${encoded(navigation.fragment || '')};
      if (fragment) { try { document.getElementById(decodeURIComponent(fragment.slice(1)))?.scrollIntoView(); } catch {} }
    });`;
  flag.textContent += '\n' + videoLoopRuntime;
  policy.after(flag);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}
