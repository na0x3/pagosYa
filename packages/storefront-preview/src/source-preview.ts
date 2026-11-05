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
import inlineTextRuntime from './source-preview-inline-text.js?raw';

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
export type PointPage = 'home' | 'product' | 'about' | 'contact' | 'faq' | 'shipping';
export const POINT_PAGES: readonly PointPage[] = ['home', 'product', 'about', 'contact', 'faq', 'shipping'];
export type PointPart = 'header' | 'announcement' | 'footer' | 'menu';
/** A loop the merchant drew around part of the preview (spec 2026-11-05 point-at), in page coordinates. */
export interface PointArea { points: number[]; rect: { x: number; y: number; width: number; height: number }; sections: Array<{ page: PointPage; at: number; label: string }>; texts: string[]; photos: string[]; parts: PointPart[]; width: number; pageQuery: string }
export interface PreviewSelection { kind: 'section' | 'platform' | 'area'; sectionId: string; label: string; text?: string; at?: number; page?: PointPage; area?: PointArea }
const validAt = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 40;
const POINT_PARTS: readonly PointPart[] = ['header', 'announcement', 'footer', 'menu'];
const PAGE_QUERY = /^[a-z0-9][a-z0-9-]{0,63}\.html(\?[A-Za-z0-9=&_.%-]{0,135})?$/;
const inRange = (n: unknown, max = 100000) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
/** Everything a circle in the preview says (spec 2026-11-05 point-at), checked before the Studio trusts it; null when anything is off. */
export function validPointArea(value: unknown): PointArea | null {
  const a = value as PointArea | null;
  if (!a || typeof a !== 'object') return null;
  if (!Array.isArray(a.points) || a.points.length < 6 || a.points.length > 128 || a.points.length % 2 || !a.points.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const r = a.rect;
  if (!r || ![r.x, r.y, r.width, r.height].every(n => inRange(n))) return null;
  if (!Array.isArray(a.sections) || a.sections.length > 3 || !a.sections.every(s => s && POINT_PAGES.includes(s.page) && validAt(s.at) && typeof s.label === 'string' && s.label.length <= 60)) return null;
  if (!Array.isArray(a.texts) || a.texts.length > 12 || !a.texts.every(t => typeof t === 'string' && t.length <= 200)) return null;
  if (!Array.isArray(a.photos) || a.photos.length > 6 || !a.photos.every(p => typeof p === 'string' && p.length <= 500 && /^(https?:\/\/|\/|assets\/)/.test(p))) return null;
  if (!Array.isArray(a.parts) || !a.parts.every(p => POINT_PARTS.includes(p))) return null;
  if (!inRange(a.width, 2400) || a.width < 280 || typeof a.pageQuery !== 'string' || !PAGE_QUERY.test(a.pageQuery)) return null;
  return { points: [...a.points], rect: { x: r.x, y: r.y, width: r.width, height: r.height }, sections: a.sections.map(s => ({ page: s.page, at: s.at, label: s.label })),
    texts: [...a.texts], photos: [...a.photos], parts: [...new Set(a.parts)], width: a.width, pageQuery: a.pageQuery };
}

/** The section in the middle of the preview (spec 2026-11-05 point-at), checked like a selection. */
export interface PreviewViewing { page: PointPage; at?: number; sectionId?: string; label: string }
export function receivePreviewViewing(event: MessageEvent, frame: HTMLIFrameElement | null): PreviewViewing | null {
  const data = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || data?.type !== 'pagosya:source-viewing') return null;
  if (!POINT_PAGES.includes(data.page) || typeof data.label !== 'string' || data.label.length > 60) return null;
  if (data.at !== undefined && !validAt(data.at)) return null;
  if (data.sectionId !== undefined && (typeof data.sectionId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(data.sectionId))) return null;
  return { page: data.page, label: data.label, ...(data.at !== undefined ? { at: data.at } : {}), ...(data.sectionId ? { sectionId: data.sectionId } : {}) };
}

export function receivePreviewSelection(event: MessageEvent, frame: HTMLIFrameElement | null): PreviewSelection | null {
  const data = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || data?.type !== 'pagosya:source-select') return null;
  if (data.kind === 'area') {
    const area = validPointArea(data.area);
    if (!area || typeof data.label !== 'string' || data.label.length > 60 || typeof data.sectionId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(data.sectionId)) return null;
    return { kind: 'area', sectionId: data.sectionId, label: data.label, area };
  }
  if ((data.kind !== 'section' && data.kind !== 'platform') || typeof data.sectionId !== 'string' || typeof data.label !== 'string' || data.label.length > 60) return null;
  if (data.kind === 'platform' ? data.sectionId !== '' : data.sectionId !== '' && !/^[a-z][a-z0-9-]{0,47}$/.test(data.sectionId)) return null;
  const text = typeof data.text === 'string' ? data.text.slice(0, 200) : '';
  // A template section carries its address (page + number), both valid or the message is dropped.
  const addressed = data.kind === 'section' && (data.at !== undefined || data.page !== undefined);
  if (addressed && (!validAt(data.at) || !POINT_PAGES.includes(data.page))) return null;
  return { kind: data.kind, sectionId: data.sectionId, label: data.label, ...(text ? { text } : {}), ...(addressed ? { at: data.at, page: data.page } : {}) };
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

export function sourcePreviewDocument(snapshot: SourceSnapshot, page = "index.html", navigation: Partial<PreviewNavigation> & { paymentForm?: boolean; accountForms?: boolean; editing?: boolean; hosted?: boolean; imageSources?: string[]; assetSources?: string[]; inlineText?: boolean; popupDemo?: boolean; scrollY?: number; inlineProducts?: Record<string, { price: boolean }> } = {}): string {
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
  flag.textContent = `${previewAssetsRuntime}(${encoded(mediaAssets)},${encoded(page)},${navigation.editing === true && navigation.hosted !== true});\nwindow.PAGOSYA_PREVIEW=true;window.PAGOSYA_HOSTED=${navigation.hosted === true};${navigation.popupDemo === true ? 'window.PAGOSYA_POPUP_DEMO=true;' : ''}window.PAGOSYA_PREVIEW_PAGE=${encoded(page)};window.PAGOSYA_PREVIEW_QUERY=${encoded(navigation.query || "")};window.PAGOSYA_PREVIEW_CART=${encoded(navigation.cart || [])};
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
    // A GET form aimed at a store page (the search on buscar.html, which the header's magnifier opens) navigates like a
    // link, carrying its fields as the query: the CSP's form-action 'none' blocks a real submit in the editor and in the
    // published store alike (owner 2026-10-22: «la lupa del header nunca sirve»).
    // Owner 2026-10-28 («the buscar button does not work»): the editor's frame is sandboxed without allow-forms, where the browser
    // drops a submit before any submit event fires; the button press and Enter in a field therefore navigate the form themselves.
    const storeForm = function(form) {
      if (!(form instanceof HTMLFormElement) || (form.getAttribute('method') || 'get').toLowerCase() !== 'get') return null;
      const url = new URL(form.getAttribute('action') || ${encoded(page)}, ${encoded(`https://source.invalid/${page}`)});
      const path = decodeURIComponent(url.pathname.slice(1));
      return url.origin === 'https://source.invalid' && ${encoded(snapshot.files.filter(f => f.path.endsWith('.html')).map(f => f.path))}.includes(path) ? path : null;
    };
    const sendForm = function(form, event) {
      const path = storeForm(form); if (!path) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const params = new URLSearchParams();
      new FormData(form).forEach(function(value, key) { if (typeof value === 'string') params.append(key, value.slice(0, 200)); });
      const query = params.toString();
      const state = { items: [] }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail: state }));
      parent.postMessage({ type: 'pagosya:source-navigate', page: path, query: query ? '?' + query : '', theme: document.documentElement.dataset.theme, cart: state.items }, '*');
    };
    document.addEventListener('submit', function(event) { sendForm(event.target, event); }, true);
    document.addEventListener('click', function(event) {
      const button = event.target.closest && event.target.closest('button,input[type=submit]');
      // Only a form that names its page (the search box); signup and other forms keep their own handlers.
      if (!button || !button.form || !button.form.hasAttribute('action') || button.disabled || (button.getAttribute('type') || 'submit').toLowerCase() !== 'submit') return;
      sendForm(button.form, event);
    }, true);
    document.addEventListener('keydown', function(event) {
      const field = event.target;
      if (event.key !== 'Enter' || event.isComposing || !(field instanceof HTMLInputElement) || !field.form || !field.form.hasAttribute('action') || ['button', 'checkbox', 'radio', 'submit'].includes(field.type)) return;
      sendForm(field.form, event);
    }, true);
    window.addEventListener('load', function() {
      const fragment = ${encoded(navigation.fragment || '')};
      if (fragment) { try { document.getElementById(decodeURIComponent(fragment.slice(1)))?.scrollIntoView(); } catch {} }
    });`;
  flag.textContent += '\n' + videoLoopRuntime;
  // Edit mode (visual selection) belongs to the Studio preview only: a published, hosted page never carries it.
  if (navigation.hosted !== true) flag.textContent += '\n' + editModeRuntime + '\n' + bocetoModeRuntime;
  // Spec 2026-10-20 §6: double-click text editing, only in the Studio's own preview.
  if (navigation.hosted !== true && navigation.inlineText === true) flag.textContent += `\nwindow.PAGOSYA_INLINE_PRODUCTS = ${encoded(navigation.inlineProducts || {})};\n` + inlineTextRuntime;
  // The Studio redraws its preview after every save; the page reports where it is scrolled and comes back there
  // (owner 2026-10-21: «every time I update something it reloads from the top»). Content that renders late (the
  // catalog) grows the page, so the restore retries for a moment and stops as soon as the merchant scrolls.
  if (navigation.hosted !== true) flag.textContent += `
(function () {
  var wanted = ${Math.max(0, Math.round(Number(navigation.scrollY) || 0))}, restoring = wanted > 0, timer = 0, began = Date.now();
  var report = function () { clearTimeout(timer); timer = setTimeout(function () { parent.postMessage({ type: 'pagosya:preview-scroll', y: Math.round(window.scrollY) }, '*'); }, 120); };
  // A wheel turned while the redrawn page is still empty (the merchant was scrolling as it redrew) must not leave it at
  // the top (live check 2026-10-21): input stops the restore only once the page has had a moment to fill.
  var stop = function () { if (Date.now() - began > 600) restoring = false; };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (name) { window.addEventListener(name, stop, { passive: true, capture: true }); });
  window.addEventListener('scroll', function () { if (!restoring) report(); }, { passive: true });
  if (restoring) {
    var started = Date.now();
    (function again() {
      if (!restoring) return;
      window.scrollTo(0, wanted);
      if (Math.abs(window.scrollY - wanted) < 2 || Date.now() - started > 2500) { restoring = false; report(); return; }
      requestAnimationFrame(again);
    })();
  }
})();`;
  policy.after(flag);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}
