import { prepareSourceLocations } from './source-location';
import { compactPreviewImageData } from './source-preview-media';
import videoLoopRuntime from '@pagosya/storefront-kit/kit/video.js?raw';
import privacyRuntime from '@pagosya/storefront-kit/kit/privacy.js?raw';
import commerceRuntime from '@pagosya/storefront-kit/kit/commerce.js?raw';
import retentionRuntime from '@pagosya/storefront-kit/kit/retention.js?raw';
import chatRuntime from '@pagosya/storefront-kit/kit/chat.js?raw';
import previewAssetsRuntime from './source-preview-assets.js?raw';
import editModeRuntime from './source-preview-edit-mode.js?raw';
import bocetoModeRuntime from './source-preview-boceto-mode.js?raw';

export interface SourceFile { path: string; content: string; encoding?: "utf8" | "base64" | "url" }
export interface SourceSnapshot { schemaVersion: number; brief: { sitePurpose?: 'shop' | 'service' | 'portfolio' | 'editorial'; businessType: string; audience: string; primaryAction: string; visualDirection: string; templateId?: string; templateRevision?: number }; files: SourceFile[] }

const mediaTypes: Record<string, string> = { mp4: "video/mp4", svg: "image/svg+xml", html: "text/html", css: "text/css", js: "text/javascript", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", gif: "image/gif", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2" };
function base64(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }

/** Inline a static revision into an opaque-origin iframe. Never inject source into Studio's DOM. */
export interface PreviewNavigation { page: string; fragment?: string; query?: string; newTab?: boolean; theme?: 'light' | 'dark'; cart?: Array<{ id: string; quantity: number }> }
export function receivePreviewNavigation(event: MessageEvent, frame: HTMLIFrameElement | null, snapshot?: SourceSnapshot): PreviewNavigation | null {
  const data = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || data?.type !== 'pagosya:source-navigate' || !snapshot?.files.some(f => f.path === data.page && f.path.endsWith('.html'))) return null;
  return { page: data.page, theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : undefined, newTab: data.newTab === true, query: typeof data.query === 'string' && data.query.startsWith('?') ? data.query.slice(0, 2000) : '', fragment: typeof data.fragment === 'string' && data.fragment.startsWith('#') ? data.fragment.slice(0, 1000) : '',
    cart: Array.isArray(data.cart) ? data.cart.slice(0, 100).filter((item: any) => typeof item?.id === 'string' && item.id.length <= 200 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99) : [] };
}
/** The store's own contact links (WhatsApp, phone, email): the editor preview keeps them, the editor opens them for the merchant. */
const CONTACT_PREFIXES = ['https://wa.me/', 'https://api.whatsapp.com/', 'tel:', 'mailto:'];
const isContactLink = (href: string) => CONTACT_PREFIXES.some(prefix => href.toLowerCase().startsWith(prefix));
/** A WhatsApp, phone or email link the merchant clicked in the preview frame, or null. */
export function receivePreviewContact(event: MessageEvent, frame: HTMLIFrameElement | null): string | null {
  const url = event.data?.url;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.type !== 'pagosya:source-contact' || typeof url !== 'string' || url.length > 2000 || !isContactLink(url)) return null;
  return url;
}
/** Opens a contact link from the preview in a new tab, never with access back to the editor. */
export function openPreviewContact(url: string): void {
  const link = document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.click();
}
/** What the merchant clicked in the preview while editing: a section of the page, or a part the platform owns.
 * An empty section id with kind 'section' means "clear the selection". */
export interface PreviewSelection { kind: 'section' | 'platform'; sectionId: string; label: string; text?: string }
export function receivePreviewSelection(event: MessageEvent, frame: HTMLIFrameElement | null): PreviewSelection | null {
  const data = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || data?.type !== 'pagosya:source-select') return null;
  if ((data.kind !== 'section' && data.kind !== 'platform') || typeof data.sectionId !== 'string' || typeof data.label !== 'string' || data.label.length > 60) return null;
  if (data.kind === 'platform' ? data.sectionId !== '' : data.sectionId !== '' && !/^[a-z][a-z0-9-]{0,47}$/.test(data.sectionId)) return null;
  const text = typeof data.text === 'string' ? data.text.slice(0, 200) : '';
  return { kind: data.kind, sectionId: data.sectionId, label: data.label, ...(text ? { text } : {}) };
}

/** Only the platform's own upload directory may be allowed as an image source, and only over HTTPS
 * (or a local development origin). Any request the design makes there reaches pagosYa, never a third party. */
export function uploadImageSource(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash || !/\/uploads\/$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

/** A published revision's own asset directory, served by the API. Same origin rules as uploads. */
export function hostedAssetSource(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash || !/\/source-site\/assets\/\d+-[a-f0-9]{12}\/$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function sourcePreviewDocument(snapshot: SourceSnapshot, page = "index.html", navigation: Partial<PreviewNavigation> & { paymentForm?: boolean; accountForms?: boolean; editing?: boolean; hosted?: boolean; imageSources?: string[]; assetSources?: string[] } = {}): string {
  const imageSources = (navigation.imageSources || []).map(uploadImageSource).filter((source): source is string => Boolean(source));
  const entry = snapshot.files.find((file) => file.path === page && file.encoding !== "base64");
  if (!entry) throw new Error("Esta revisión no incluye la página seleccionada.");
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  const assetSources = (navigation.assetSources || []).map(hostedAssetSource).filter((source): source is string => Boolean(source));
  const inline = (file: SourceFile, content?: string) => `data:${mediaTypes[file.path.split(".").pop() || ""] || "application/octet-stream"};base64,${content !== undefined ? base64(content) : file.encoding === "base64" ? file.content : base64(file.content)}`;
  // Hosted stores hand us URLs for binary files; anything outside the validated directory resolves to nothing.
  const data = (file: SourceFile, content?: string) => file.encoding === 'url'
    ? (assetSources.some(source => file.content.startsWith(source)) ? file.content : '')
    : inline(file, content);
  const resolve = (path: string, base = page): SourceFile | undefined => {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(path)) return undefined;
    const url = new URL(path, `https://source.invalid/${base}`);
    return files.get(decodeURIComponent(url.pathname.slice(1)));
  };
  const substituteAssets = (content: string, base: string) => content.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (_match, _quote, path: string) => {
    const file = resolve(path, base); return file ? `url("${data(file)}")` : 'url("")';
  });
  const doc = new DOMParser().parseFromString(entry.content, "text/html");
  if (navigation.theme === 'light' || navigation.theme === 'dark') doc.documentElement.dataset.theme = navigation.theme;
  doc.querySelectorAll("base,object,embed,meta[http-equiv],link[rel=preload],link[rel=prefetch],link[rel=dns-prefetch],link[rel=preconnect]").forEach((el) => el.remove());
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
    if (file.path === "commerce.js") content = `${privacyRuntime}\n${commerceRuntime}\n${retentionRuntime}\n${chatRuntime}`;
    if (file.path === "config.js") {
      for (const asset of snapshot.files.filter((f) => f.encoding === "base64" || f.encoding === "url")) content = content.split(JSON.stringify(asset.path)).join(JSON.stringify(data(asset)));
      content = compactPreviewImageData(content);
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
    const src = el.getAttribute("src") || "";
    // An empty path resolves to this page: a <video> playing its <source> children would get the page as its src.
    if (!src.trim()) { el.removeAttribute("src"); return; }
    const file = resolve(src);
    if (file) { const value = data(file); if (value) el.setAttribute("src", value); else el.removeAttribute("src"); }
    else if (!src.startsWith("data:") && !(el.tagName === "IMG" && imageSources.some(source => src.startsWith(source)))) el.removeAttribute("src");
  });
  doc.querySelectorAll('video[poster]').forEach(el => {
    const poster = el.getAttribute('poster')?.trim() ? resolve(el.getAttribute('poster')!) : undefined;
    const value = poster ? data(poster) : ''; if (value) el.setAttribute('poster', value); else el.removeAttribute('poster');
  });
  doc.querySelectorAll("a").forEach((el) => {
    const href = el.getAttribute("href") || '';
    if (el.getAttribute('target') === '_blank') el.setAttribute('data-preview-new-tab', 'true');
    el.removeAttribute('target');
    // Published stores keep outside links clickable; the trusted parent decides whether they may open.
    // The editor keeps the store's contact links too: clicking one asks the editor to open it (pagosya:source-contact).
    const outside = (navigation.hosted === true && /^(?:https?:|tel:|mailto:)/i.test(href)) || isContactLink(href);
    if (!outside && !href.startsWith('#') && !resolve(href)?.path.endsWith('.html')) el.removeAttribute('href');
  });
  const assets = assetSources.length ? ' ' + assetSources.join(' ') : '';
  const policy = doc.createElement("meta"); policy.httpEquiv = "Content-Security-Policy";
  policy.content = `default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:${assets}${imageSources.length ? ' ' + imageSources.join(' ') : ''}; font-src data:${assets}; media-src data: blob:${assets}; connect-src 'none'; frame-src ${locationSources.length ? locationSources.join(' ') : "'none'"}; worker-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`;
  doc.head.prepend(policy);
  // CSP does not govern DNS prefetching; turn it off so generated code cannot leak data through lookups.
  const dnsPrefetch = doc.createElement('meta'); dnsPrefetch.httpEquiv = 'x-dns-prefetch-control'; dnsPrefetch.content = 'off';
  doc.head.prepend(dnsPrefetch);
  const flag = doc.createElement("script");
  const encoded = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const mediaAssets = Object.fromEntries(snapshot.files.filter(file => /\.(png|jpe?g|webp|avif|gif|svg|mp4)$/i.test(file.path)).map(file => [file.path, data(file)]));
  flag.textContent = `${previewAssetsRuntime}(${encoded(mediaAssets)},${encoded(page)},${navigation.editing === true && navigation.hosted !== true});\nwindow.PAGOSYA_PREVIEW=true;window.PAGOSYA_HOSTED=${navigation.hosted === true};window.PAGOSYA_PREVIEW_PAGE=${encoded(page)};window.PAGOSYA_PREVIEW_QUERY=${encoded(navigation.query || "")};window.PAGOSYA_PREVIEW_CART=${encoded(navigation.cart || [])};
    new MutationObserver(() => {
      const theme = document.documentElement.dataset.theme;
      if (theme === 'light' || theme === 'dark') parent.postMessage({type:'pagosya:source-theme', theme}, '*');
    }).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
    if (${navigation.hosted === true}) {
      let sequence = 0;
      window.PAGOSYA_HOSTED_REQUEST = (action, body) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const receive = event => { if (event.source !== parent || event.data?.type !== 'pagosya:hosted-response' || event.data.id !== id) return; clearTimeout(timer); window.removeEventListener('message',receive); resolve(event.data.result); };
        const timer = setTimeout(() => { window.removeEventListener('message',receive); reject(new Error('La solicitud tardó demasiado. Intenta de nuevo.')); }, action === 'assistant' ? 35000 : 20000);
        window.addEventListener('message',receive);
        parent.postMessage({type:'pagosya:hosted-request', id, action, body},'*');
      });
    }
    ${navigation.accountForms === true ? `{
      let accountSequence = 0;
      window.PAGOSYA_ACCOUNT_REQUEST = (action, body) => new Promise((resolve, reject) => {
        const id = ++accountSequence;
        const receive = event => { if (event.source !== parent || event.data?.type !== 'pagosya:account-response' || event.data.id !== id) return; clearTimeout(timer); window.removeEventListener('message', receive); resolve({ ok: event.data.ok === true, body: event.data.body }); };
        const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('timeout')); }, 15000);
        window.addEventListener('message', receive);
        parent.postMessage({ type: 'pagosya:account-request', id, action, body }, '*');
      });
    }` : ''}
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
      if (link.hasAttribute('data-pagosya-account')) {
        const routes = {login:'acceso-ingresar.html',register:'acceso-registro.html','forgot-password':'acceso-olvide-mi-contrasena.html','reset-password':'acceso-restablecer-contrasena.html',orders:'cuenta-pedidos.html',addresses:'cuenta-direcciones.html',profile:'cuenta-perfil.html',subscriptions:'cuenta-suscripciones.html'};
        const page = routes[link.getAttribute('data-pagosya-account') || 'login'];
        if (page && ${encoded(snapshot.files.filter(f => f.path.endsWith('.html')).map(f => f.path))}.includes(page)) {
          event.preventDefault(); event.stopImmediatePropagation(); const state = {items:[]}; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart',{detail:state})); parent.postMessage({type:'pagosya:source-navigate',page,cart:state.items},'*'); return;
        }
        if (${navigation.hosted !== true}) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      }
      if (${navigation.hosted !== true} && ${encoded(CONTACT_PREFIXES)}.some(prefix => href.toLowerCase().startsWith(prefix))) { event.preventDefault(); event.stopImmediatePropagation(); parent.postMessage({ type: 'pagosya:source-contact', url: href }, '*'); return; }
      if (href.startsWith('#')) {
        // Scroll real section anchors without navigating the opaque srcdoc URL.
        // Hash-only application routes (such as checkout) still dispatch hashchange.
        event.preventDefault();
        try {
          const id = decodeURIComponent(href.slice(1));
          if (!id) { window.scrollTo({ top: 0 }); return; }
          const target = document.getElementById(id) || document.getElementsByName(id)[0];
          if (target) { target.scrollIntoView(); return; }
        } catch {}
        window.location.hash = href;
        return;
      }
      const url = new URL(href, ${encoded(`https://source.invalid/${page}`)});
      const path = decodeURIComponent(url.pathname.slice(1));
      if (${navigation.hosted === true} && url.origin !== 'https://source.invalid') { event.preventDefault(); parent.postMessage({type:'pagosya:source-external',url:url.href},'*'); return; }
      if (url.origin !== 'https://source.invalid' || !${encoded(snapshot.files.filter(f => f.path.endsWith('.html')).map(f => f.path))}.includes(path)) return;
      event.preventDefault();
      const state = { items: [] }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail: state }));
      parent.postMessage({ type: 'pagosya:source-navigate', page: path, query: url.search, fragment: url.hash, theme: document.documentElement.dataset.theme, newTab: link.target === '_blank' || link.dataset.previewNewTab === 'true' || event.ctrlKey || event.metaKey, cart: state.items }, '*');
    }, true);
    window.addEventListener('load', function() {
      const fragment = ${encoded(navigation.fragment || '')};
      if (fragment) { try { document.getElementById(decodeURIComponent(fragment.slice(1)))?.scrollIntoView(); } catch {} }
    });`;
  flag.textContent += '\n' + videoLoopRuntime;
  // Edit mode (visual selection) belongs to the Studio preview only: a published, hosted page never carries it.
  if (navigation.hosted !== true) flag.textContent += '\n' + editModeRuntime + '\n' + bocetoModeRuntime;
  policy.after(flag);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}
