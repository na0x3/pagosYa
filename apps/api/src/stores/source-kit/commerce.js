(() => {
  "use strict";
  // pagosya-product-options:v1 — bounded variant IDs, prices, stock and galleries.
  const config = window.PAGOSYA_CONFIG || {};
  const hosted = window.PAGOSYA_HOSTED === true;
  const track = (event, method) => { if (hosted) parent.postMessage({ type: 'pagosya:funnel', event, ...(method ? { method } : {}) }, '*'); };
  const preview = window.PAGOSYA_PREVIEW === true && !hosted;
  const request = async (url, options) => {
    if (!hosted) return fetch(url, options);
    const action = url.endsWith('/cart-checkout') ? 'checkout' : url.endsWith('/leads') ? 'lead' : url.endsWith('/shipping/quote') ? 'shipping' : url.includes('/content/reviews') ? 'review' : url.includes('/content') ? 'content' : 'catalog';
    const result = await window.PAGOSYA_HOSTED_REQUEST(action, options?.body ? JSON.parse(options.body) : url.includes('/content') ? { locale: document.documentElement.lang || 'es' } : {});
    return { ok: result.ok, json: async () => result.body };
  };
  let store = config.data || {};
  let ready = Boolean(config.demo || preview || hosted);
  let category = "all";
  let checkingOut = false;
  const cart = new Map();
  let partnerCode;
  if (!preview && !config.demo && window.PAGOSYA_PRIVACY?.analyticsAllowed(config.slug)) {
    const key = `pagosya:partner:${config.slug}`;
    const incoming = new URLSearchParams(location.search).get('partner');
    const valid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,40}$/.test(value);
    if (valid(incoming)) partnerCode = incoming;
    try {
      if (partnerCode) sessionStorage.setItem(key, partnerCode);
      else { const stored = sessionStorage.getItem(key); if (valid(stored)) partnerCode = stored; }
    } catch {}
  }

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (amount, currency = "BOB") => new Intl.NumberFormat("es-BO", { style: "currency", currency }).format(amount / 100);
  const products = () => Array.isArray(store.items) ? store.items : [];
  const limit = (p) => Math.max(0, Math.min(99, p.purchaseLimit ?? 99, p.stock ?? 99));
  const price = (p) => {
    const now = Date.now();
    const active = p.discountPercent > 0 && (!p.discountStartsAt || Date.parse(p.discountStartsAt) <= now) && (!p.discountEndsAt || Date.parse(p.discountEndsAt) > now);
    return active ? Math.round(p.amount * (1 - p.discountPercent / 100)) : p.amount;
  };
  const safeUrl = (value) => { try { if (typeof value !== "string" || !value.trim()) return ""; const source = value.trim(); if (/^data:image\/[a-z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/i.test(source)) return source; if (source.startsWith("blob:")) return source; const u = new URL(source, source.startsWith("assets/") ? document.baseURI : config.apiBaseUrl || location.href); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const hostedProduct = (id) => `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}/p/${encodeURIComponent(id)}${partnerCode ? "?partner=" + encodeURIComponent(partnerCode) : ""}`;
  // Only unambiguous, bounded option sets can be purchased inline. Legacy named
  // variants use one group; extras still need the hosted configuration flow.
  const optionGroupCache = new WeakMap();
  function optionGroups(p) {
    if (!p) return null;
    // Catalog refreshes replace product objects. Reuse their validated groups
    // while checking availability across all values and existing cart lines.
    if (!optionGroupCache.has(p)) optionGroupCache.set(p, buildOptionGroups(p));
    return optionGroupCache.get(p);
  }
  function buildOptionGroups(p) {
    const variants = p?.variants;
    if (p?.extras?.length || !Array.isArray(variants) || !variants.length || variants.length > 256 || variants.some(v => !v || typeof v !== 'object')) return null;
    const structured = variants.some(v => v.options?.length);
    const groups = [];
    const ids = new Set(), combinations = new Set();
    for (const variant of variants) {
      const options = structured ? variant.options : [{ name: 'Opción', value: variant.name }];
      if (!variant.id || ids.has(variant.id) || !Number.isSafeInteger(variant.amount) || variant.amount < 0 || !Array.isArray(options) || !options.length || options.length > 6) return null;
      ids.add(variant.id);
      if (options.some(o => typeof o?.name !== 'string' || !o.name.trim() || typeof o.value !== 'string' || !o.value.trim()) || new Set(options.map(o => o.name)).size !== options.length) return null;
      if (!groups.length) options.forEach(o => groups.push({ name: o.name, values: [] }));
      if (options.length !== groups.length || options.some((o, i) => o.name !== groups[i].name)) return null;
      const key = JSON.stringify(options.map(o => o.value));
      if (combinations.has(key)) return null;
      combinations.add(key);
      options.forEach((o, i) => { if (!groups[i].values.includes(o.value)) groups[i].values.push(o.value); });
    }
    return groups;
  }
  const variantValues = v => v.options?.length ? v.options.map(o => o.value) : [v.name];
  const lineKey = (id, variantId) => variantId ? JSON.stringify([id, variantId]) : id;
  function cartLine(key) {
    let p = products().find(p => p.id === key), variant;
    if (!p) {
      try { const [id, variantId] = JSON.parse(key); p = products().find(p => p.id === id); variant = p?.variants?.find(v => v.id === variantId); } catch {}
      if (!variant) return null;
    }
    if (!p || p.extras?.length || (p.variants?.length && (!variant || !optionGroups(p)))) return null;
    return { p, variant, name: variant ? `${p.name} · ${variant.name}` : p.name, amount: price(variant ? { ...p, amount: variant.amount } : p) };
  }
  function remaining(p, variant) {
    let quantity = 0;
    for (const [key, count] of cart) if (cartLine(key)?.p.id === p.id) quantity += count;
    return Math.max(0, Math.min(limit(p) - quantity, variant ? limit(variant) - (cart.get(lineKey(p.id, variant.id)) || 0) : 99));
  }
  const cartItems = () => [...cart].flatMap(([key, quantity]) => {
    const line = cartLine(key);
    return line ? [{ id: line.p.id, ...(line.variant ? { variantId: line.variant.id } : {}), quantity }] : [];
  });
  const checkoutItems = () => cartItems().map(({ id, ...item }) => ({ paymentLinkId: id, ...item }));
  function message(text) {
    document.querySelectorAll("[data-pagosya-status]").forEach((el) => { el.textContent = text; });
    // Keep feedback beside the payment action on long mobile checkout pages.
    // The existing live region announces it; this copy remains ordinary text.
    document.querySelectorAll('[data-pagosya-checkout-status]').forEach(el => { el.textContent = text; el.hidden = !text; });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-article-url]');
    if (link && hosted) { event.preventDefault(); parent.postMessage({ type: 'pagosya:source-external', url: link.href }, '*'); }
  });
  const cartKey = `pagosya:cart:${config.slug || 'store'}`;
  function restoreCart(items) {
    if (!Array.isArray(items)) return;
    cart.clear();
    for (const item of items.slice(0, 100)) {
      const p = products().find(p => p.id === item?.id);
      const key = lineKey(item?.id, item?.variantId), line = cartLine(key);
      if (p && line && !cart.has(key) && Number.isInteger(item.quantity) && item.quantity > 0) {
        const quantity = Math.min(item.quantity, remaining(p, line.variant));
        if (quantity > 0) cart.set(key, quantity);
      }
    }
  }
  if (preview || hosted) restoreCart(window.PAGOSYA_PREVIEW_CART);
  else {
    try { restoreCart(JSON.parse((config.demo ? sessionStorage : localStorage).getItem(cartKey) || "[]")); } catch { /* Storage can be unavailable. */ }
    window.addEventListener("storage", event => {
      if (event.key !== cartKey || checkingOut) return;
      try { restoreCart(JSON.parse(event.newValue || "[]")); renderCart(); } catch { /* Ignore invalid stored state. */ }
    });
  }
  document.addEventListener("pagosya:serialize-cart", event => {
    if (event.detail && typeof event.detail === "object") event.detail.items = cartItems();
  });
  document.addEventListener("pagosya:restore-cart", event => { restoreCart(event.detail?.items); renderCart(); });
  const galleryImages = (p) => {
    const sources = [
      ...(Array.isArray(p?.imageUrls) ? p.imageUrls : []),
      ...(typeof p?.imageUrl === "string" ? [p.imageUrl] : []),
      ...(Array.isArray(p?.variants) ? p.variants.map(v => v.imageUrl) : []),
    ];
    return [...new Set(sources.map(safeUrl).filter(Boolean))];
  };
  const imagePosition = (p, url) => {
    const index = (Array.isArray(p.imageUrls) ? p.imageUrls : []).findIndex(value => safeUrl(value) === url);
    const value = index >= 0 ? p.imagePositions?.[index] : null;
    return typeof value === 'string' && /^(?:100|[0-9]{1,2})(?:\.\d+)?% (?:100|[0-9]{1,2})(?:\.\d+)?%$/.test(value) ? value : '50% 50%';
  };
  const detailStyle = document.createElement("style");
  detailStyle.dataset.pagosyaKit = 'product';
  detailStyle.textContent = `
    .menu-item{position:relative}.menu-item:not([data-custom-product]) .menu-item__details{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;padding:0;border:0;border-radius:inherit;background:transparent;box-shadow:none;cursor:pointer;color:inherit}
    .menu-item .menu-item__details:focus-visible{outline:3px solid currentColor;outline-offset:-4px}.menu-item:not([data-custom-product]) .menu-add{position:relative;inset:auto;z-index:2}
    .menu-item:not([data-custom-product]) button.menu-add[data-product]{width:auto;height:auto;min-width:44px;min-height:44px;padding:10px 14px;border-radius:var(--store-radius,var(--brand-radius,0px));font:inherit}
    [data-pagosya-categories][hidden],[data-product-field][hidden],[data-product-media][hidden],[data-product-link][hidden],[data-pagosya-cart][hidden]{display:none!important}
    [data-pagosya-status]:empty{width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;box-shadow:none!important}
    /* Product page: platform-owned layout in two styles (editorial, dense). Stores supply tokens only. */
    [data-pagosya-product]{--pd-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#302c2a)));--pd-paper:var(--store-background,var(--brand-background,var(--paper,#fffdfb)));--pd-surface:var(--store-surface,var(--brand-surface,var(--pd-paper)));--pd-accent:var(--store-accent,var(--brand-accent,var(--accent,var(--pd-ink))));--pd-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,var(--pd-paper)));--pd-muted:color-mix(in srgb,var(--pd-ink) 64%,var(--pd-paper));--pd-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--pd-ink) 16%,var(--pd-paper))));--pd-tint:color-mix(in srgb,var(--pd-accent) 7%,var(--pd-paper));--pd-radius:min(var(--store-radius,var(--brand-radius,0px)),6px);--pd-heading:var(--store-heading-font,var(--brand-heading-font,var(--font-heading,inherit)));--pd-body:var(--store-body-font,var(--brand-body-font,var(--font-body,inherit)));box-sizing:border-box;color:var(--pd-ink);background:var(--pd-paper);font-family:var(--pd-body)}
    [data-pagosya-product] *{box-sizing:border-box}
    [data-pagosya-product] [hidden]{display:none!important}
    dialog[data-pagosya-product]{width:min(1040px,calc(100% - 32px));max-width:none;max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid var(--pd-line);border-radius:var(--pd-radius);box-shadow:0 16px 64px #0003;overflow:auto;overscroll-behavior:contain}
    dialog[data-pagosya-product]::backdrop{background:#0009}
    [data-pagosya-product][data-pagosya-product-page]{display:block;width:100%;max-width:1440px;max-height:none;margin:0 auto;padding:0;border:0;border-radius:0;box-shadow:none;overflow:visible}
    [data-pagosya-product][data-style] :is(button,a){font:inherit;cursor:pointer}
    [data-pagosya-product][data-style] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-product][data-style] :is(button,a,[tabindex]):focus-visible{outline:2px solid var(--pd-accent);outline-offset:3px}
    [data-pagosya-product][data-style] .product-detail__close{position:sticky;top:12px;z-index:3;display:grid;place-items:center;width:44px;height:44px;margin:12px 12px -56px auto;padding:0;border:1px solid var(--pd-line);border-radius:50%;background:var(--pd-paper);color:inherit;font-size:26px;line-height:1}
    [data-pagosya-product][data-style] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);align-items:start}
    [data-pagosya-product][data-style] .product-detail__layout[data-no-images]{grid-template-columns:minmax(0,1fr)}
    /* Gallery: the photo fills its column; dense pages overlay thumbnails and a plain counter, editorial pages use dots. */
    [data-pagosya-product][data-style] .product-detail__gallery{position:relative;min-width:0;margin:0;padding:0;border-radius:0;background:var(--pd-tint)}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:sticky;top:0}
    [data-pagosya-product][data-style] .product-detail__stage{position:relative;min-width:0}
    [data-pagosya-product][data-style] .product-detail__photo{display:block;width:100%;height:min(calc(100dvh - 64px),760px);min-height:420px;max-height:none;margin:0;object-fit:cover;border:0;border-radius:0;background:var(--pd-tint);touch-action:pan-y}
    dialog[data-pagosya-product][data-style] .product-detail__photo{height:min(calc(100dvh - 34px),640px);min-height:360px}
    [data-pagosya-product][data-style] .product-detail__navigation{position:absolute;right:16px;bottom:22px;display:flex;align-items:center;gap:8px;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;font-size:12px;font-variant-numeric:tabular-nums;color:var(--pd-ink);text-shadow:0 0 8px var(--pd-paper)}
    [data-pagosya-product][data-style] .product-detail__navigation span{order:-1}
    [data-pagosya-product][data-style] .product-detail__navigation button{display:grid;place-items:center;width:36px;height:36px;min-height:0;padding:0;border:1px solid color-mix(in srgb,var(--pd-ink) 35%,transparent);border-radius:50%;background:color-mix(in srgb,var(--pd-paper) 72%,transparent);color:inherit;font-size:15px;line-height:1}
    [data-pagosya-product][data-style] .product-detail__thumbnails{position:absolute;left:16px;bottom:16px;display:flex;gap:6px;max-width:calc(100% - 170px);margin:0;padding:5px;overflow-x:auto;border-radius:calc(var(--pd-radius) + 3px);background:color-mix(in srgb,var(--pd-paper) 84%,transparent)}
    [data-pagosya-product][data-style] .product-detail__thumbnails button{flex:0 0 56px;width:56px;height:56px;padding:0;border:0;border-radius:var(--pd-radius);overflow:hidden;background:var(--pd-tint);outline:1px solid color-mix(in srgb,var(--pd-ink) 12%,transparent);outline-offset:0}
    [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{outline:2px solid var(--pd-ink);outline-offset:1px}
    [data-pagosya-product][data-style] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}
    [data-pagosya-product][data-style=editorial] .product-detail__navigation{display:none}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button,[data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails img{display:none}
    [data-pagosya-product][data-style] .product-detail__empty{display:grid;min-height:220px;place-items:center;color:inherit}
    /* Purchase column */
    [data-pagosya-product][data-style] .product-detail__copy{align-self:center;min-width:0;width:100%;max-width:620px;margin:0;padding:clamp(28px,4vw,56px)}
    dialog[data-pagosya-product][data-style] .product-detail__copy{padding:44px 32px 28px}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{max-width:1200px;margin:0 auto}
    @media(min-width:900px){
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);grid-template-rows:auto 1fr;column-gap:clamp(40px,6vw,96px);align-items:start}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__summary{grid-column:1;grid-row:1}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__details{grid-column:1;grid-row:2}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__buybox{grid-column:2;grid-row:1 / span 2;position:sticky;top:24px;padding:clamp(20px,2.4vw,32px);border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    }
    [data-pagosya-product][data-style] .product-detail__breadcrumb{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 18px;font-size:12px;line-height:1.4;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__breadcrumb a{display:inline-flex;align-items:center;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__breadcrumb>span:last-child{max-width:28ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__eyebrow{margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] #pagosya-product-title{margin:0 0 12px;font-family:var(--pd-heading);font-size:clamp(32px,3.4vw,46px);font-weight:380;line-height:1.04;letter-spacing:-.02em;text-wrap:balance;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=editorial] #pagosya-product-title[data-length=long]{font-size:clamp(28px,2.7vw,38px)}
    [data-pagosya-product][data-style=dense] #pagosya-product-title{margin-bottom:10px;font-family:var(--pd-body);font-size:clamp(24px,2.3vw,30px);font-weight:650;line-height:1.12;letter-spacing:-.025em}
    [data-pagosya-product][data-style=dense] #pagosya-product-title[data-length=long]{font-size:clamp(22px,2vw,26px)}
    [data-pagosya-product][data-style] .product-detail__rating{display:flex;align-items:center;gap:8px;margin:-2px 0 12px;font-size:13px}
    [data-pagosya-product][data-style] .product-detail__rating a{display:inline-flex;align-items:center;gap:8px;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__stars{--rating:0;display:inline-block;letter-spacing:1px;line-height:1;background:linear-gradient(90deg,var(--pd-accent) calc(var(--rating) * 20%),color-mix(in srgb,var(--pd-ink) 22%,transparent) 0);-webkit-background-clip:text;background-clip:text;color:transparent}
    [data-pagosya-product][data-style] .product-detail__pricing{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;margin:0 0 14px}
    [data-pagosya-product][data-style] .product-detail__price{margin:0;font-size:17px;font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__original{font-size:.9em;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__saving{padding:3px 7px;border-radius:var(--pd-radius);background:var(--pd-tint);color:var(--pd-accent);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    [data-pagosya-product][data-style=dense] .product-detail__pricing{padding-bottom:14px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__price{font-size:30px;font-weight:700;letter-spacing:-.03em}
    [data-pagosya-product][data-style=dense] .product-detail__original{font-size:16px}
    [data-pagosya-product][data-style] .product-detail__intro{max-width:52ch;margin:0 0 20px;font-size:14.5px;line-height:1.6;color:var(--pd-muted);white-space:pre-line;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__intro{margin:12px 0 14px}
    [data-pagosya-product][data-style] .product-detail__chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__chips li{padding:5px 8px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    [data-pagosya-product][data-style] :is(.product-detail__sr,.product-detail__review-score){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    /* Choices: pills by default, swatch circles for colors, radio rows for priced dense choices. */
    [data-pagosya-product][data-style] .product-detail__options{display:grid;gap:18px;margin:0 0 20px;padding:18px 0 0;border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__options{padding-top:4px;border-top:0}
    [data-pagosya-product][data-style] .product-detail__options fieldset{min-width:0;margin:0;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__options legend{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__options legend{font-size:12.5px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style] [data-product-selection]{font-size:13px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__values{display:flex;flex-wrap:wrap;gap:8px}
    [data-pagosya-product][data-style] [data-product-option]{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:40px;max-width:100%;padding:8px 16px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:inherit;font-size:13.5px;line-height:1.2;overflow-wrap:anywhere;transition:border-color .15s,box-shadow .15s}
    [data-pagosya-product][data-style=dense] [data-product-option]{border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] [data-product-option]:hover:not(:disabled){border-color:color-mix(in srgb,var(--pd-ink) 55%,var(--pd-paper))}
    [data-pagosya-product][data-style] [data-product-option][aria-pressed=true]{border-color:var(--pd-ink);box-shadow:inset 0 0 0 1px var(--pd-ink)}
    [data-pagosya-product][data-style] [data-product-option]:disabled{opacity:.45;text-decoration:line-through}
    [data-pagosya-product][data-style] [data-product-option][data-option-delta]::after{content:attr(data-option-delta);color:var(--pd-muted);font-size:.85em;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__values[data-kind=swatch]{gap:14px}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option],[data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{flex-direction:column;gap:6px;min-width:0;min-height:0;padding:0;border:0;border-radius:0;box-shadow:none;background:none;font-size:11px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__swatch{display:block;width:22px;height:22px;flex:0 0 auto;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pd-ink) 15%,transparent)}
    [data-pagosya-product][data-style] [data-kind=swatch] .product-detail__swatch{width:34px;height:34px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__swatch{width:28px;height:28px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__option-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    [data-pagosya-product][data-style] [data-kind=swatch] [aria-pressed=true] .product-detail__swatch{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3.5px var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__values[data-priced]:not([data-kind=swatch]){display:grid;grid-template-columns:minmax(0,1fr);gap:7px}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]{display:grid;grid-template-columns:16px minmax(0,1fr) auto;justify-content:stretch;gap:12px;width:100%;min-height:48px;padding:10px 14px;background:var(--pd-surface);font-size:14px;text-align:left}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]::before{content:"";width:16px;height:16px;border:1.5px solid color-mix(in srgb,var(--pd-ink) 45%,var(--pd-paper));border-radius:50%}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][aria-pressed=true]::before{border:5px solid var(--pd-ink)}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][data-option-price]::after{content:attr(data-option-price);font-size:14px;font-weight:600;color:var(--pd-ink);font-variant-numeric:tabular-nums;white-space:nowrap}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]:disabled::after{text-decoration:line-through}
    /* Quantity and action share one row; the live total rides on the dense action. */
    [data-pagosya-product][data-style] .product-detail__purchase{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:stretch;gap:10px;margin:22px 0 12px}
    [data-pagosya-product][data-style] .product-detail__quantity{display:flex;align-items:center;justify-content:space-between;min-width:118px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);overflow:hidden}
    [data-pagosya-product][data-style] .product-detail__quantity button{width:40px;min-height:46px;padding:0;border:0;background:transparent;color:inherit;font-size:18px}
    [data-pagosya-product][data-style] .product-detail__quantity output{min-width:24px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__subtotal{grid-column:1 / -1;grid-row:2;font-size:13px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subtotal:empty{display:none}
    [data-pagosya-product][data-style] .product-detail__buy{display:flex;align-items:center;justify-content:center;gap:0;width:100%;min-height:48px;margin:0;padding:12px 20px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:filter .15s}
    [data-pagosya-product][data-style] .product-detail__buy:hover:not(:disabled){filter:brightness(.92)}
    [data-pagosya-product][data-style] .product-detail__buy-total{white-space:nowrap;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style=editorial] .product-detail__buy-total{display:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy{min-height:50px;font-size:15px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:"—";margin:0 8px}
    /* Narrow phones keep the action on one line; the price above already shows the total. */
    @media(max-width:480px){[data-pagosya-product][data-style=dense] .product-detail__buy-total{display:none}}
    [data-pagosya-product][data-style] .product-detail__status{min-height:20px;margin:0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__assurances{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px 18px;margin:14px 0 0;padding:12px 14px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);list-style:none}
    [data-pagosya-product][data-style=dense] .product-detail__assurances{grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));margin-top:16px;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__assurances li{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;line-height:1.4}
    [data-pagosya-product][data-style] .product-detail__assurances svg{flex:0 0 20px;color:var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__assurances svg{flex-basis:24px;width:24px;height:24px}
    [data-pagosya-product][data-style] .product-detail__assurances strong{display:block;font-size:12.5px;font-weight:600}
    [data-pagosya-product][data-style] .product-detail__assurances span{display:block;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__assurances button{display:flex;align-items:center;gap:10px;min-height:40px;margin:0;padding:0;border:0;background:transparent;color:inherit;font-size:inherit;text-align:left}
    [data-pagosya-product][data-style] .product-detail__assurances button strong{text-decoration:underline;text-decoration-color:var(--pd-line);text-underline-offset:4px}
    /* Details, related products and verified reviews use only published catalog data. */
    [data-pagosya-product][data-style] .product-tabs{display:flex;gap:24px;margin:28px 0 16px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-tabs button{min-height:44px;margin:0 0 -1px;padding:8px 0;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--pd-muted);font-size:13px}
    [data-pagosya-product][data-style] .product-tabs button[aria-selected=true]{border-bottom-color:var(--pd-ink);color:var(--pd-ink)}
    [data-pagosya-product][data-style] [role=tabpanel]{font-size:14px;line-height:1.6}
    [data-pagosya-product][data-style] .product-delivery-list{margin:0 0 12px;padding-left:18px;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-delivery-list li{margin-bottom:14px}
    [data-pagosya-product][data-style] .product-detail__specs{margin:0 0 16px;padding:0}
    [data-pagosya-product][data-style] .product-detail__specs div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__specs dt{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__specs dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__facts{margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__facts li{padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__fact{display:flex;justify-content:space-between;gap:16px}
    [data-pagosya-product][data-style] .product-detail__fact span:first-child{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__fact span:last-child{text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews):not([hidden]){display:grid;gap:20px;margin:clamp(40px,6vw,72px) clamp(16px,4vw,56px) 0;padding-top:clamp(24px,4vw,40px);border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews) h2{margin:0;font-family:var(--pd-heading);font-size:clamp(22px,2.4vw,28px);font-weight:400;line-height:1.2}
    [data-pagosya-product][data-style] .product-detail__related ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,160px),1fr));gap:20px 16px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__related a{display:grid;gap:6px;color:inherit;text-decoration:none}
    [data-pagosya-product][data-style] .product-detail__related img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__related a:hover .product-detail__related-name{text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__related-name{font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__related-price{font-size:14px;color:var(--pd-muted);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__reviews-summary{display:flex;align-items:center;gap:10px;margin:0}
    [data-pagosya-product][data-style] .product-detail__review-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:16px}
    [data-pagosya-product][data-style] .product-detail__review-list article{padding:18px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    [data-pagosya-product][data-style] .product-detail__review-list p{margin:0;line-height:1.55;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__review-list .product-detail__review-meta{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:13px}
    [data-pagosya-product][data-style] :is(.product-detail__sticky,.product-detail__sticky-space){display:none}
    @media(max-width:899px){
      [data-pagosya-product][data-style] .product-detail__layout{grid-template-columns:minmax(0,1fr)}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:relative}
      [data-pagosya-product][data-style] .product-detail__photo,dialog[data-pagosya-product][data-style] .product-detail__photo{height:auto;min-height:0;max-height:72dvh;aspect-ratio:4/5}
      [data-pagosya-product][data-style] .product-detail__navigation{display:none}
      [data-pagosya-product][data-style] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
      [data-pagosya-product][data-style] .product-detail__thumbnails button,[data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0}
      [data-pagosya-product][data-style] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
      [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
      [data-pagosya-product][data-style] .product-detail__thumbnails img{display:none}
      [data-pagosya-product][data-style] .product-detail__copy,dialog[data-pagosya-product][data-style] .product-detail__copy{max-width:none;padding:22px 16px 28px}
    }
    @media(max-width:640px){
      [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--pd-line);background:var(--pd-paper);color:var(--pd-ink);box-shadow:0 -6px 24px #0000001a}
      [data-pagosya-product][data-style] .product-detail__sticky>div{flex:1;min-width:0;font-size:13px;line-height:1.3}
      [data-pagosya-product][data-style] .product-detail__sticky strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      [data-pagosya-product][data-style] .product-detail__sticky button{flex:0 0 auto;min-height:44px;padding:10px 18px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-weight:700}
      [data-pagosya-product][data-style] .product-detail__sticky-space:not([hidden]){display:block;height:72px}
    }
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] *,[data-pagosya-product] *::before{transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.append(detailStyle);
  const fullProductPage = document.querySelector("[data-pagosya-product-page]");
  const fullCheckoutPage = document.querySelector("[data-pagosya-checkout-page]");
  const rootPath = /(?:^|\/)pages\//.test(window.PAGOSYA_PREVIEW_PAGE || location.pathname) ? "../" : "";
  const pageHref = (page, query = "") => rootPath + page + query;
  const detail = fullProductPage || document.createElement("dialog");
  detail.setAttribute("data-pagosya-product", "");
  detail.setAttribute("aria-labelledby", "pagosya-product-title");
  if (!fullProductPage) document.body.append(detail);
  // The product page is platform-rendered; authored rules aimed at its hooks would fight the kit layout.
  const productHook = /\[data-pagosya-product|\.product-detail__/;
  function splitSelectors(list) {
    const parts = []; let depth = 0, start = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
    }
    parts.push(list.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
  }
  function releaseRules(container) {
    const rules = container.cssRules;
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (rule.cssRules?.length) releaseRules(rule);
      if (typeof rule.selectorText !== 'string' || !productHook.test(rule.selectorText)) continue;
      const kept = splitSelectors(rule.selectorText).filter(selector => !productHook.test(selector));
      if (kept.length) rule.selectorText = kept.join(', '); else container.deleteRule(i);
    }
  }
  function releaseProductPageStyles() {
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.ownerNode?.dataset?.pagosyaKit !== undefined) continue;
      try { releaseRules(sheet); } catch { /* Unreadable sheets keep their rules; kit selectors still outrank them. */ }
    }
  }
  releaseProductPageStyles();
  window.addEventListener('load', releaseProductPageStyles);
  let selectedProduct = null, selectedImage = 0, detailTrigger = null, oldOverflow = "";
  let selectedOptions = [], selectedQuantity = 1;
  const swatchColors = { negro: '#292b29', black: '#292b29', blanco: '#fffdf7', white: '#fffdf7', rojo: '#b5443f', red: '#b5443f', azul: '#446a98', blue: '#446a98', verde: '#71866a', green: '#71866a', rosa: '#d89ca6', pink: '#d89ca6', beige: '#d8c5a9', crema: '#eee4c9', cream: '#eee4c9', salvia: '#8b987b', 'verde salvia': '#8b987b', sage: '#8b987b', coral: '#d98b70', marfil: '#f1e8d5', ivory: '#f1e8d5', marron: '#805d48', brown: '#805d48', gris: '#92928e', gray: '#92928e', grey: '#92928e', amarillo: '#e0b847', yellow: '#e0b847', naranja: '#d28349', orange: '#d28349', morado: '#80678f', purple: '#80678f', oliva: '#757853', olive: '#757853' };
  function swatchColor(group, value) {
    if (!/^(color|colour|tono|tinte|acabado|finish)$/i.test(group)) return '';
    return swatchColors[value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || '';
  }
  function priceMarkup(p, variant, from = false) {
    const base = variant ? { ...p, amount: variant.amount } : p;
    const amount = price(base), sale = amount < base.amount;
    return `<strong class="product-detail__price">${from ? 'Desde ' : ''}${money(amount, p.currency)}</strong>${sale ? `<del class="product-detail__original" aria-label="Precio anterior">${money(base.amount, p.currency)}</del><span class="product-detail__saving">${escape(p.discountPercent)}% de descuento</span>` : ''}`;
  }
  function quantityMarkup(action = '') {
    return '<div class="product-detail__purchase"><div class="product-detail__quantity" role="group" aria-label="Cantidad"><button type="button" data-product-quantity="-1" aria-label="Reducir cantidad" disabled>−</button><output data-product-quantity-value aria-live="polite" aria-label="Cantidad de unidades">1</output><button type="button" data-product-quantity="1" aria-label="Aumentar cantidad">+</button></div><span class="product-detail__subtotal" data-product-subtotal></span>' + action + '</div>';
  }
  function updateQuantity() {
    if (!selectedProduct || !detail.querySelector('[data-product-quantity-value]')) return;
    const groups = optionGroups(selectedProduct), variant = selectedVariant();
    const available = groups && !variant ? 0 : remaining(selectedProduct, variant);
    selectedQuantity = Math.max(1, Math.min(selectedQuantity, available));
    detail.querySelector('[data-product-quantity-value]').textContent = selectedQuantity;
    detail.querySelectorAll('[data-product-quantity]').forEach(button => {
      button.disabled = !ready || checkingOut || (Number(button.dataset.productQuantity) < 0 ? selectedQuantity <= 1 : selectedQuantity >= available);
    });
    const amount = price(variant ? { ...selectedProduct, amount: variant.amount } : selectedProduct);
    const pending = groups && !variant;
    const startingAt = pending ? selectedProduct.variants.filter(v => remaining(selectedProduct, v) > 0 && variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value)).map(v => price({ ...selectedProduct, amount: v.amount })) : [];
    const total = pending ? startingAt.length ? `desde ${money(Math.min(...startingAt), selectedProduct.currency)}` : '' : available ? money(amount * selectedQuantity, selectedProduct.currency) : '';
    // The action carries the live total; the subtotal line only adds information for several units.
    detail.querySelector('[data-product-subtotal]').textContent = !pending && total && selectedQuantity > 1 ? `Subtotal ${total}` : '';
    detail.querySelectorAll('[data-product-total]').forEach(el => { el.textContent = total; });
    updateStickyBar();
  }
  let stickyObserver = null, buyPassed = false, commerceData = null;
  const starsMarkup = rating => `<span class="product-detail__stars" style="--rating:${Math.max(0, Math.min(5, Number(rating) || 0))}" aria-hidden="true">★★★★★</span>`;
  // Exact published totals come from the server summary, never from the latest-reviews page.
  function decorateProductReviews() {
    const p = selectedProduct, line = detail.querySelector('[data-product-rating]'), section = detail.querySelector('[data-product-reviews]');
    if (!p || !line || !commerceData) return;
    const summary = commerceData.reviewSummary?.[p.id];
    if (!summary || !Number.isSafeInteger(summary.count) || summary.count < 1 || !(summary.average >= 1 && summary.average <= 5)) { line.hidden = true; if (section) section.hidden = true; return; }
    const list = (Array.isArray(commerceData.reviews) ? commerceData.reviews : []).filter(review => review.productId === p.id && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5).slice(0, 6);
    const authoredReviews = [...document.querySelectorAll('[data-pagosya-reviews]')].some(slot => !detail.contains(slot));
    const label = `${summary.average.toLocaleString('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} de 5 · ${summary.count} ${summary.count === 1 ? 'reseña verificada' : 'reseñas verificadas'}`;
    const showSection = !!section && list.length > 0 && !authoredReviews;
    line.innerHTML = showSection ? `<a href="#product-reviews">${starsMarkup(summary.average)}<span>${label}</span></a>` : `${starsMarkup(summary.average)}<span>${label}</span>`;
    line.hidden = false;
    if (!section) return;
    section.hidden = !showSection;
    section.innerHTML = showSection ? `<h2 id="product-reviews-title">Reseñas verificadas</h2><p class="product-detail__reviews-summary">${starsMarkup(summary.average)}<span>${label}</span></p><div class="product-detail__review-list">${list.map(review => `<article><p class="product-detail__review-meta">${starsMarkup(review.rating)}<span class="product-detail__review-score">${review.rating} de 5</span> <strong>${escape(review.displayName)}</strong></p><p>${escape(review.body)}</p></article>`).join('')}</div>` : '';
  }
  function relatedMarkup(p) {
    const ids = Array.isArray(p.recommendedProductIds) ? p.recommendedProductIds : [];
    const items = [...new Set(ids)].map(id => products().find(item => item.id === id)).filter(item => item && item.id !== p.id && limit(item) !== 0).slice(0, 4);
    if (!items.length) return '';
    return `<section class="product-detail__related" aria-labelledby="product-related-title"><h2 id="product-related-title">Combínalo con</h2><ul>${items.map(item => {
      const image = galleryImages(item)[0];
      const amounts = item.variants?.length ? item.variants.map(v => price({ ...item, amount: v.amount })) : [price(item)];
      const low = Math.min(...amounts);
      return `<li><a href="${escape(pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id)))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy" />` : ''}<span class="product-detail__related-name">${escape(item.name)}</span><span class="product-detail__related-price">${amounts.some(amount => amount !== low) ? 'Desde ' : ''}${money(low, item.currency)}</span></a></li>`;
    }).join('')}</ul></section>`;
  }
  function updateStickyBar() {
    const bar = detail.querySelector('[data-product-sticky]');
    if (!bar || !selectedProduct) return;
    const groups = optionGroups(selectedProduct), variant = selectedVariant(), buy = detail.querySelector('.product-detail__buy');
    const pending = groups && !variant;
    bar.querySelector('[data-product-sticky-price]').textContent = detail.querySelector('.product-detail__price')?.textContent || '';
    const jump = bar.querySelector('[data-product-jump]');
    jump.textContent = pending ? 'Elegir opciones' : 'Añadir';
    jump.disabled = !pending && (!buy || buy.disabled);
    const show = buyPassed && matchMedia('(max-width: 640px)').matches;
    bar.hidden = !show; detail.querySelector('[data-product-sticky-space]').hidden = !show;
  }
  function watchStickyBar() {
    stickyObserver?.disconnect(); buyPassed = false;
    const buy = fullProductPage && detail.querySelector('.product-detail__buy');
    if (!buy || typeof IntersectionObserver !== 'function') return;
    stickyObserver = new IntersectionObserver(entries => { const entry = entries[entries.length - 1]; buyPassed = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0; updateStickyBar(); });
    stickyObserver.observe(buy);
  }
  function optionPrices(groups) {
    const p = selectedProduct;
    return groups.map((group, index) => {
      const prices = group.values.map(value => {
        const matches = p.variants.filter(v => variantValues(v).every((candidate, i) => i === index ? candidate === value : selectedOptions[i] === undefined || candidate === selectedOptions[i]));
        const amounts = (matches.some(v => remaining(p, v) > 0) ? matches.filter(v => remaining(p, v) > 0) : matches).map(v => price({ ...p, amount: v.amount }));
        return amounts.length ? { low: Math.min(...amounts), high: Math.max(...amounts) } : null;
      });
      // Only label choices when this group actually changes what the shopper pays.
      const distinct = new Set(prices.filter(Boolean).map(range => range.low + ':' + range.high));
      // Ranges ("desde") on every choice read as noise; label a group once each choice has one exact price.
      return distinct.size > 1 && prices.every(range => !range || range.low === range.high) ? prices.map(range => range ? range.low : null) : null;
    });
  }
  const assuranceIcons = {
    pickup: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 9v10h14V9"/><path d="M10 19v-5h4v5"/>',
    delivery: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>',
    digital: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    payment: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  };
  // Reassurance comes only from real store settings; nothing here is a marketing claim.
  function deliveryMarkup(p) {
    const locations = store.locations || [];
    const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${assuranceIcons[name]}</svg>`;
    const pickupPlaces = locations.filter(l => l.pickupEnabled).length;
    const items = p?.fulfillmentType === 'DIGITAL' ? [{ icon: 'digital', title: 'Entrega digital', detail: 'Descarga segura después del pago' }] : [
      (store.shippingPickupEnabled || pickupPlaces) && { icon: 'pickup', title: 'Retiro en tienda', detail: pickupPlaces > 1 ? `${pickupPlaces} sucursales disponibles` : 'Lo eliges al revisar tu pedido', delivery: true },
      (store.shippingEnabled || locations.some(l => l.deliveryEnabled)) && { icon: 'delivery', title: 'Entrega a domicilio', detail: 'El total se confirma al pagar', delivery: true },
    ].filter(Boolean);
    if (store.checkoutMode === 'whatsapp') items.push({ icon: 'chat', title: 'Pedido por WhatsApp', detail: 'Confirmas los detalles con la tienda' });
    else if (store.checkoutMode !== 'external') items.push({ icon: 'payment', title: 'Pago seguro', detail: 'Procesado por pagosYa' });
    const hasDeliveryTab = !!(locations.length || store.shippingEnabled || store.shippingPickupEnabled);
    return items.length ? `<ul class="product-detail__assurances" aria-label="Entrega y pago">${items.map(item => {
      const body = `${icon(item.icon)}<div><strong>${escape(item.title)}</strong><span>${escape(item.detail)}</span></div>`;
      return `<li>${item.delivery && hasDeliveryTab ? `<button type="button" data-product-delivery>${body}</button>` : body}</li>`;
    }).join('')}</ul>` : '';
  }
  function optionsMarkup(groups) {
    return `<div class="product-detail__options">${groups.map((group, index) => {
      const colors = group.values.map(value => swatchColor(group.name, value));
      return `<fieldset><legend>${escape(group.name)} <span data-product-selection="${index}"></span></legend><div class="product-detail__values"${colors.every(Boolean) ? ' data-kind="swatch"' : ''}>${group.values.map((value, valueIndex) => `<button type="button" data-product-option="${index}" data-option-value="${valueIndex}" aria-pressed="false">${colors[valueIndex] ? `<span class="product-detail__swatch" style="--swatch:${colors[valueIndex]}" aria-hidden="true"></span>` : ''}<span class="product-detail__option-label">${escape(value)}</span></button>`).join('')}</div></fieldset>`;
    }).join('')}</div>`;
  }
  /** Fill every group with an available value, keeping the shopper's choices where a variant still allows them. */
  function completeSelection(p, preferred) {
    const groups = optionGroups(p);
    if (!groups) return [];
    const result = [];
    for (let index = 0; index < groups.length; index++) {
      const available = value => p.variants.some(v => remaining(p, v) > 0 && variantValues(v).every((candidate, i) => i > index || (i === index ? candidate === value : candidate === result[i])));
      const value = preferred[index] !== undefined && available(preferred[index]) ? preferred[index] : groups[index].values.find(available);
      if (value === undefined) return preferred.slice(0, index);
      result[index] = value;
    }
    return result;
  }
  let selectionNote = '';
  function selectedVariant() {
    const groups = optionGroups(selectedProduct);
    return groups && groups.every((g, i) => selectedOptions[i] !== undefined)
      ? selectedProduct.variants.find(v => variantValues(v).every((value, i) => value === selectedOptions[i])) : null;
  }
  function updateOptions() {
    const p = selectedProduct, groups = optionGroups(p);
    if (!groups) return;
    const prices = optionPrices(groups);
    detail.querySelectorAll('.product-detail__values').forEach((values, index) => { values.toggleAttribute('data-priced', !!prices[index] && groups[index].values.length <= 4); });
    detail.querySelectorAll('[data-product-option]').forEach(button => {
      const index = Number(button.dataset.productOption), value = groups[index].values[Number(button.dataset.optionValue)];
      const amounts = prices[index], amount = amounts?.[Number(button.dataset.optionValue)];
      if (amount != null) {
        const lowest = Math.min(...amounts.filter(value => value != null));
        button.dataset.optionPrice = money(amount, p.currency);
        if (amount > lowest) button.dataset.optionDelta = `+ ${money(amount - lowest, p.currency)}`; else delete button.dataset.optionDelta;
      } else { delete button.dataset.optionPrice; delete button.dataset.optionDelta; }
      // Earlier groups constrain later ones. Changing an earlier choice clears
      // later choices, so sparse catalogs never trap shoppers in a combination.
      const matches = p.variants.filter(v => variantValues(v).every((candidate, i) => i === index ? candidate === value : i > index || selectedOptions[i] === undefined || candidate === selectedOptions[i]));
      const available = matches.some(v => remaining(p, v) > 0);
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(selectedOptions[index] === value));
      button.setAttribute('aria-label', `${value}${available ? '' : matches.length ? ' · Sin disponibilidad' : ' · Combinación no disponible'}`);
    });
    const variant = selectedVariant(), buy = detail.querySelector('[data-variant-add]');
    const available = variant && remaining(p, variant) > 0;
    buy.disabled = !ready || checkingOut || !available;
    if (variant) buy.dataset.add = lineKey(p.id, variant.id); else delete buy.dataset.add;
    const compatible = p.variants.filter(v => remaining(p, v) > 0 && variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value));
    const lowest = (compatible.length ? compatible : p.variants).reduce((a, b) => a.amount <= b.amount ? a : b);
    detail.querySelector('[data-product-pricing]').innerHTML = priceMarkup(p, variant || lowest, !variant);
    groups.forEach((group, index) => { detail.querySelector(`[data-product-selection="${index}"]`).textContent = selectedOptions[index] || ''; });
    updateQuantity();
    detail.querySelector('.product-detail__status').textContent = variant
      ? available ? `${selectionNote || variant.name}${preview || config.demo ? ' · Vista previa, sin cobros.' : ''}` : 'Ya añadiste la cantidad disponible de esta combinación.'
      : p.variants.some(v => remaining(p, v) > 0) ? 'Selecciona una opción de cada grupo.' : 'Sin disponibilidad para añadir más unidades.';
  }
  function showImage(index) {
    const images = galleryImages(selectedProduct);
    if (!images.length) return;
    selectedImage = (index + images.length) % images.length;
    const photo = detail.querySelector(".product-detail__photo");
    photo.src = images[selectedImage];
    photo.style.objectPosition = imagePosition(selectedProduct, images[selectedImage]);
    photo.alt = `${selectedProduct.name} · imagen ${selectedImage + 1} de ${images.length}`;
    const counter = detail.querySelector("[data-product-count]");
    if (counter) counter.textContent = `${selectedImage + 1} / ${images.length}`;
    detail.querySelectorAll("[data-product-image]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.productImage) === selectedImage)));
  }
  function openProduct(id, trigger) {
    const p = products().find(p => p.id === id);
    if (!p) { if (fullProductPage) detail.innerHTML = '<h1>Producto no disponible</h1><p>Este producto ya no está en el catálogo.</p><a href="index.html#catalogo">Explorar productos</a>'; return; }
    track('product_view');
    selectedProduct = p; selectedImage = 0; selectedQuantity = 1; detailTrigger = trigger; selectionNote = '';
    selectedOptions = completeSelection(p, []);
    const images = galleryImages(p), complex = p.variants?.length || p.extras?.length, groups = optionGroups(p);
    const style = productPageStyle();
    detail.dataset.style = style;
    const breadcrumb = `<nav class="product-detail__breadcrumb" aria-label="Ruta del producto"><a href="${escape(pageHref('index.html', '#catalogo'))}">Todos los productos</a><span aria-hidden="true">/</span><span>${escape(p.name)}</span></nav>`;
    detail.innerHTML = `${fullProductPage ? '' : '<button type="button" class="product-detail__close" data-product-close aria-label="Cerrar detalle del producto">×</button>'}<div class="product-detail__layout"${images.length ? '' : ' data-no-images'}><section class="product-detail__gallery" aria-label="Fotos del producto"${images.length ? '' : ' hidden'}${images.length > 1 ? ' data-rail' : ''}>${images.length ? `<div class="product-detail__stage"><img class="product-detail__photo" src="${escape(images[0])}" alt="${escape(p.name)}" /><div class="product-detail__navigation"${images.length > 1 ? '' : ' hidden'}>${images.length > 1 ? '<button type="button" data-product-prev aria-label="Foto anterior">←</button>' : ''}<span data-product-count aria-live="polite">1 / ${images.length}</span>${images.length > 1 ? '<button type="button" data-product-next aria-label="Foto siguiente">→</button>' : ''}</div></div>${images.length > 1 ? `<div class="product-detail__thumbnails" aria-label="Elegir foto">${images.map((url, index) => `<button type="button" data-product-image="${index}" aria-label="Ver foto ${index + 1}" aria-pressed="${index === 0}"><img src="${escape(url)}" alt="" loading="lazy" /></button>`).join('')}</div>` : ''}` : '<p class="product-detail__empty">Sin fotos disponibles</p>'}</section><section class="product-detail__copy">${fullProductPage ? breadcrumb : ''}<p class="product-detail__eyebrow">${escape((store.categories || []).find(c => c.id === p.categoryId)?.name || store.storeName || 'Tu tienda')}</p><${fullProductPage ? "h1" : "h2"} id="pagosya-product-title"${p.name.length > 32 ? ' data-length="long"' : ''}>${escape(p.name)}</${fullProductPage ? "h1" : "h2"}>${fullProductPage ? '<p class="product-detail__rating" data-product-rating hidden></p>' : ''}<div class="product-detail__pricing" data-product-pricing>${priceMarkup(p)}</div>${p.description ? `<p class="product-detail__intro">${escape(p.description)}</p>` : ''}${style === 'dense' ? specChipsMarkup(p) : ''}${groups ? `${optionsMarkup(groups)}${quantityMarkup('<button class="product-detail__buy checkout-button" type="button" data-variant-add disabled>Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>')}` : limit(p) === 0 ? '<p>Agotado</p>' : complex ? preview || config.demo ? '<button class="product-detail__buy checkout-button" disabled>Elegir opciones en la tienda</button>' : `<a class="product-detail__buy checkout-button" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `${quantityMarkup(`<button class="product-detail__buy checkout-button" type="button" data-add="${escape(p.id)}">Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>`)}`}<p class="product-detail__status" role="status" aria-live="polite"></p>${deliveryMarkup(p)}${productInformation(p)}</section></div>${fullProductPage ? `${relatedMarkup(p)}<section class="product-detail__reviews" id="product-reviews" data-product-reviews aria-labelledby="product-reviews-title" hidden></section><div class="product-detail__sticky-space" data-product-sticky-space hidden></div><div class="product-detail__sticky" data-product-sticky hidden><div><strong>${escape(p.name)}</strong><span data-product-sticky-price></span></div><button type="button" data-product-jump>Añadir</button></div>` : ''}`;
    showImage(0);
    if (fullProductPage && !images.length) {
      // Mobile reads identity, purchase, then details; desktop places the purchase panel beside both.
      const copy = detail.querySelector('.product-detail__copy'), [summary, buybox, details] = ['summary', 'buybox', 'details'].map(name => Object.assign(document.createElement('div'), { className: 'product-detail__' + name }));
      for (const child of [...copy.children]) (child.matches('.product-detail__options,.product-detail__purchase,.product-detail__buy,.product-detail__status,.product-detail__assurances,p:not([class])') ? buybox : child.matches('.product-tabs,[role=tabpanel]') ? details : summary).append(child);
      copy.append(summary, buybox, ...(details.children.length ? [details] : [])); copy.dataset.split = '';
    }
    watchStickyBar();
    decorateProductReviews();
    renderCart();
    if (!fullProductPage && !detail.open) { oldOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; detail.showModal(); }
    detail.querySelector("[data-product-close]")?.focus();
    let touchStart;
    const photo = detail.querySelector(".product-detail__photo");
    photo?.addEventListener("touchstart", event => { touchStart = event.touches[0]; }, { passive: true });
    photo?.addEventListener("touchend", event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.clientX, dy = event.changedTouches[0].clientY - touchStart.clientY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showImage(selectedImage + (dx < 0 ? 1 : -1));
      touchStart = null;
    }, { passive: true });
  }
  function specRows(p) {
    return (Array.isArray(p?.specifications) ? p.specifications : []).filter(row => row && typeof row.label === 'string' && typeof row.value === 'string' && row.label.trim() && row.value.trim());
  }
  // A stored choice wins; older stores read their catalog, and spec-heavy catalogs get the dense page.
  function productPageStyle() {
    if (config.productPageStyle === 'editorial' || config.productPageStyle === 'dense') return config.productPageStyle;
    const items = products();
    return items.length && items.filter(p => specRows(p).length >= 3).length * 2 >= items.length ? 'dense' : 'editorial';
  }
  function specChipsMarkup(p) {
    const chips = specRows(p).filter(row => row.value.trim().length <= 24).slice(0, 4);
    return chips.length ? `<ul class="product-detail__chips" aria-label="Características">${chips.map(row => `<li><span class="product-detail__sr">${escape(row.label.trim())}: </span>${escape(row.value.trim())}</li>`).join('')}</ul>` : '';
  }
  function productInformation(p) {
    const delivery = (store.locations || []).map(l => `<li><strong>${escape(l.name)}</strong>${l.address ? `<br>${escape(l.address)}` : ''}<br>${[l.pickupEnabled && 'Retiro en tienda', l.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ') || 'Sin métodos de entrega disponibles'}</li>`).join('');
    const tags = Array.isArray(p.tags) ? [...new Set(p.tags.filter(tag => typeof tag === 'string' && tag.trim()))] : [];
    const panels = [];
    const specs = specRows(p).slice(0, 8);
    if (tags.length || specs.length) panels.push({ id: 'description', label: 'Detalles', content: `${specs.length ? `<dl class="product-detail__specs">${specs.map(row => `<div><dt>${escape(row.label.trim())}</dt><dd>${escape(row.value.trim())}</dd></div>`).join('')}</dl>` : ''}${tags.length ? `<ul class="product-detail__facts">${tags.map(tag => { const fact = tag.match(/^([^:]{1,40}):\s*(\S.*)$/); return fact ? `<li class="product-detail__fact"><span>${escape(fact[1].trim())}</span><span>${escape(fact[2])}</span></li>` : `<li>${escape(tag)}</li>`; }).join('')}</ul>` : ''}` });
    if (delivery || store.shippingEnabled || store.shippingPickupEnabled) panels.push({ id: 'delivery', label: 'Envíos y retiro', content: `${delivery ? `<ul class="product-delivery-list">${delivery}</ul>` : ''}<p>Elige la opción disponible al revisar tu pedido. El total final se confirma en pagosYa.</p>` });
    if (!panels.length) return '';
    return `<div class="product-tabs" role="tablist" aria-label="Información del producto">${panels.map((panel, index) => `<button type="button" role="tab" id="product-${panel.id}-tab" aria-controls="product-${panel.id}-panel" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-product-tab="${panel.id}">${panel.label}</button>`).join('')}</div>${panels.map((panel, index) => `<div role="tabpanel" id="product-${panel.id}-panel" aria-labelledby="product-${panel.id}-tab" tabindex="0"${index ? ' hidden' : ''}>${panel.content}</div>`).join('')}`;
  }
  function selectProductTab(button) {
    detail.querySelectorAll('[data-product-tab]').forEach(tab => {
      const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      detail.querySelector('#' + tab.getAttribute('aria-controls')).hidden = !active;
    });
  }
  detail.addEventListener("close", () => { document.documentElement.style.overflow = oldOverflow; detailTrigger?.focus(); selectedProduct = null; });
  detail.addEventListener("click", event => {
    if (fullProductPage || event.target !== detail) return;
    const rect = detail.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) detail.close();
  });
  detail.addEventListener("keydown", event => {
    const tab = event.target.closest('[data-product-tab]');
    if (tab) {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const tabs = [...detail.querySelectorAll('[data-product-tab]')];
        const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        selectProductTab(next); next.focus();
      }
      return;
    }
    if (event.target.closest('[data-product-option]')) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); showImage(selectedImage + (event.key === "ArrowRight" ? 1 : -1)); }
  });
  // Reuse an authored checkout slot; never leave an empty fixed overlay over the shop.
  const checkoutSlots = [...document.querySelectorAll("[data-pagosya-checkout]")];
  for (const slot of checkoutSlots) slot.hidden = true;
  const checkoutPage = checkoutSlots[0] || fullCheckoutPage || document.createElement("section");
  // The runtime supplies one order review inside the active checkout surface.
  // Some authored pages also leave a sibling review slot; do not show two payment forms.
  if (fullCheckoutPage) document.querySelectorAll('[data-pagosya-cart][data-checkout-review]').forEach(slot => {
    if (slot !== checkoutPage && !checkoutPage.contains(slot)) {
      slot.hidden = true; slot.inert = true; slot.setAttribute('data-pagosya-redundant-review', '');
    }
  });
  checkoutPage.setAttribute("data-pagosya-checkout", "");
  checkoutPage.hidden = true;
  if (!fullCheckoutPage) document.body.append(checkoutPage);
  const checkoutStyle = document.createElement("style");
  checkoutStyle.textContent = `
    [data-pagosya-checkout][hidden]{display:none!important}
    [data-pagosya-redundant-review]{display:none!important}
    @layer pagosya-commerce {
    [data-pagosya-checkout]:not([hidden]){display:block;position:fixed;inset:0;z-index:2147483000;overflow:auto;overscroll-behavior:contain;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font-family:inherit;padding:clamp(20px,5vw,64px)}
    [data-pagosya-checkout] *{box-sizing:border-box}
    [data-pagosya-checkout] .checkout-page__inner{max-width:1000px;margin:auto}
    [data-pagosya-checkout] .checkout-page__back{display:inline-flex;align-items:center;min-height:44px;padding:8px 0;margin:0 0 32px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-checkout] h1{margin:0 0 16px;font-size:clamp(30px,5vw,52px);line-height:1.1;font-weight:800}
    [data-pagosya-checkout] .checkout-page__intro{max-width:60ch;line-height:1.6;margin:0 0 32px}
    [data-pagosya-checkout] .checkout-page__layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:clamp(24px,5vw,64px)}
    [data-pagosya-checkout] .checkout-page__summary{padding:24px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));border-radius:12px;align-self:start;background:var(--store-surface,var(--brand-surface,transparent))}
    [data-pagosya-checkout] .checkout-page__summary h2{margin:0 0 20px;font-size:22px}
    [data-pagosya-checkout] .order-items{list-style:none;padding:0;margin:0}
    [data-pagosya-checkout] .order-item{display:block;padding:16px 0;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    [data-pagosya-checkout] .order-item>div:first-child{display:flex;justify-content:space-between;gap:16px;line-height:1.5}
    [data-pagosya-checkout] .quantity{display:flex;align-items:center;gap:12px;margin-top:12px}
    [data-pagosya-checkout] .quantity button{width:44px;min-height:44px;background:transparent;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));border-radius:50%;font:inherit;color:inherit;cursor:pointer}
    [data-pagosya-checkout] .order-field{display:grid;gap:8px;margin:20px 0;font:inherit}
    [data-pagosya-checkout] select{width:100%;min-height:44px;padding:8px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:inherit;font:inherit}
    [data-pagosya-checkout] .order-total{display:flex;justify-content:space-between;gap:16px;margin:24px 0;font-size:20px}
    [data-pagosya-checkout] .order-note{font-size:14px;line-height:1.6;color:inherit;opacity:.8}
    [data-pagosya-checkout] .checkout-button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:48px;padding:12px 20px;border:0;border-radius:var(--store-radius,var(--brand-radius,0px));background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,CanvasText))));color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,Canvas)));font:inherit;font-weight:700;cursor:pointer}
    [data-pagosya-checkout] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-checkout] [data-pagosya-status]{margin:24px 0;font-size:15px;line-height:1.6}
    @media(max-width:640px){[data-pagosya-checkout] .checkout-page__layout{grid-template-columns:1fr}[data-pagosya-checkout] .checkout-page__summary{padding:20px}}
  `;
  checkoutStyle.textContent += `
    }
    :where([data-pagosya-checkout-page]):not([hidden]){position:static;inset:auto;z-index:auto;overflow:visible;background:inherit;color:inherit}
  `;
  document.head.append(checkoutStyle);
  // Native dialog owns modal focus, Escape and the backdrop. Authored cart markup
  // is moved into it while open so there is only one editable copy of that cart.
  // A generated dialog cannot serve as a closed dialog inside our cart dialog.
  // Normalize only this runtime-owned slot; preserve the author's other markup.
  document.querySelectorAll('dialog[data-pagosya-cart]').forEach(slot => {
    const container = document.createElement('div');
    for (const attr of [...slot.attributes]) if (!['open', 'aria-modal', 'aria-label', 'aria-labelledby', 'role'].includes(attr.name)) container.setAttribute(attr.name, attr.value);
    container.classList.remove('cart-drawer'); container.hidden = true;
    container.append(...slot.childNodes); slot.replaceWith(container);
  });
  // An empty mount is reserved for the drawer. Preserve deliberately authored
  // inline cart content, but do not append a second empty order below the footer.
  const authoredDrawerTrigger = document.querySelector('[data-cart-open],a[href="#pedido"],a[href="#carrito"],a[href="#cart"]');
  if (authoredDrawerTrigger) document.querySelectorAll('[data-pagosya-cart]:not([data-checkout-review])').forEach(slot => {
    if (!slot.childElementCount && !slot.textContent.trim()) slot.hidden = true;
  });
  const cartDrawer = document.createElement('dialog');
  cartDrawer.className = 'cart-drawer';
  cartDrawer.setAttribute('aria-labelledby', 'cart-drawer-title');
  cartDrawer.innerHTML = '<header class="cart-drawer__header"><h2 id="cart-drawer-title">Tu pedido</h2><button type="button" data-cart-close aria-label="Cerrar pedido">×</button></header><div class="cart-drawer__body"></div><button type="button" class="cart-drawer__continue" data-cart-close>Seguir comprando</button>';
  document.body.append(cartDrawer);
  let drawerSlot, drawerPlaceholder, drawerWasHidden, drawerOverflow, drawerTrigger;
  function openCart(trigger, keyboard = false) {
    if (cartDrawer.open || checkingOut) return;
    if (detail.open) detail.close();
    drawerTrigger = trigger;
    drawerSlot = [...document.querySelectorAll('[data-pagosya-cart]')].find(el => !el.hasAttribute('data-checkout-review')) || document.createElement('div');
    drawerSlot.setAttribute('data-pagosya-cart', '');
    drawerPlaceholder = document.createComment('cart slot');
    if (drawerSlot.isConnected) drawerSlot.replaceWith(drawerPlaceholder);
    drawerWasHidden = drawerSlot.hidden; drawerSlot.hidden = false;
    cartDrawer.querySelector('.cart-drawer__body').append(drawerSlot);
    drawerOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    cartDrawer.dataset.instant = String(keyboard || config.motion === 'off');
    delete addedNotice.dataset.visible;
    cartDrawer.showModal(); renderCart();
    cartDrawer.querySelector('[data-cart-close]').focus();
  }
  function restoreDrawer() {
    if (!drawerSlot) return;
    if (drawerPlaceholder?.isConnected) { drawerSlot.hidden = drawerWasHidden; drawerPlaceholder.replaceWith(drawerSlot); }
    else drawerSlot?.remove();
    document.documentElement.style.overflow = drawerOverflow || '';
    drawerTrigger?.focus({ preventScroll: true }); drawerSlot = null;
  }
  cartDrawer.addEventListener('close', restoreDrawer);
  cartDrawer.addEventListener('click', event => {
    if (event.target.closest('[data-cart-close]')) cartDrawer.close();
    if (event.target === cartDrawer) {
      const rect = cartDrawer.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cartDrawer.close();
    }
  });
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-cart-open],a[href="#pedido"],a[href="#carrito"],a[href="#cart"]')
      || event.target.closest('a,button')?.querySelector('[data-cart-count]')?.closest('a,button');
    if (!trigger) return;
    event.preventDefault(); event.stopImmediatePropagation(); openCart(trigger, event.detail === 0);
  }, true);
  const addedNotice = document.createElement('div');
  addedNotice.className = 'cart-added'; addedNotice.setAttribute('role', 'status'); addedNotice.setAttribute('aria-live', 'polite');
  addedNotice.innerHTML = '<span></span><button type="button" data-cart-open>Ver pedido</button>';
  document.body.append(addedNotice);
  let addedTimer;
  function addedFeedback(product, button, keyboard) {
    if (button.closest('[data-pagosya-cart]')) return;
    addedNotice.dataset.instant = String(keyboard || config.motion === 'off');
    addedNotice.querySelector('span').textContent = `${product.name} añadido a tu pedido.`;
    addedNotice.dataset.visible = 'true';
    clearTimeout(addedTimer);
    addedTimer = setTimeout(() => { if (!addedNotice.contains(document.activeElement)) delete addedNotice.dataset.visible; }, 4000);
    // The confirmation remains visible with reduced motion or motion explicitly off.
    if (!keyboard && config.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const targets = [button, ...document.querySelectorAll('[data-cart-count]')];
      for (const target of targets) if (target.isConnected && target.animate) {
        target.getAnimations().forEach(animation => animation.cancel());
        target.animate([{ transform: 'scale(0.96)', opacity: 0.65 }, { transform: 'scale(1)', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)' });
      }
    }
  }
  const shoppingStyle = document.createElement('style');
  shoppingStyle.textContent = `
    .cart-drawer{box-sizing:border-box;position:fixed;inset:0 0 0 auto;width:min(600px,48vw);max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font:inherit;overflow:auto;overscroll-behavior:contain;transform:translateX(0);transition:transform 250ms var(--ease-drawer,cubic-bezier(.32,.72,0,1)),opacity 200ms var(--ease-out,cubic-bezier(.23,1,.32,1)),display 250ms allow-discrete,overlay 250ms allow-discrete}
    .cart-drawer:not([open]){transform:translateX(100%);opacity:0}
    .cart-drawer::backdrop{background:#0007}
    @starting-style{.cart-drawer[open]{transform:translateX(100%);opacity:0}}
    .cart-drawer__header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 32px;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    .cart-drawer__header h2{font:inherit;font-size:28px;font-weight:700;margin:0}
    .cart-drawer button{font:inherit;cursor:pointer;color:inherit;min-height:44px}
    .cart-drawer__header button{width:44px;border:0;background:transparent;font-size:28px}
    .cart-drawer__body{padding:8px 32px 24px}
    .cart-drawer [data-pagosya-cart]{position:static;inset:auto;width:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;box-shadow:none;background:transparent;color:inherit}
    .cart-drawer .order-items{padding:0;margin:0;list-style:none}
    .cart-drawer .order-item{padding:24px 0;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    .cart-drawer .order-item>div:first-child,.cart-drawer .order-total{display:flex;justify-content:space-between;gap:20px;overflow-wrap:anywhere}
    .cart-drawer .quantity{display:flex;align-items:center;gap:16px;margin-top:16px}
    .cart-drawer .quantity button{width:44px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));background:transparent}
    .cart-drawer .order-total{padding:24px 0;font-size:20px}.cart-drawer .order-empty{padding:40px 0;line-height:1.6}
    .cart-drawer .order-note{font-size:14px;line-height:1.5}
    .cart-drawer .checkout-button{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:52px;padding:16px 20px;border:0;background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,#20211d))));color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,#fff)))}
    .cart-drawer button:disabled{opacity:.5;cursor:default}.cart-drawer__continue{display:block;margin:0 auto 32px;border:0;background:transparent;text-decoration:underline;text-underline-offset:4px}
    .cart-drawer :focus-visible,.cart-added :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    .cart-added{position:fixed;inset:auto 24px 24px auto;z-index:2147483001;display:flex;align-items:center;gap:20px;max-width:min(480px,calc(100vw - 48px));padding:12px 16px;background:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));color:var(--store-background,var(--brand-background,var(--paper,#fff)));font:inherit;box-shadow:0 8px 24px #0002;opacity:0;transform:translateY(12px);visibility:hidden;transition:opacity 200ms var(--ease-out,cubic-bezier(.23,1,.32,1)),transform 200ms var(--ease-out,cubic-bezier(.23,1,.32,1)),visibility 200ms}
    .cart-added[data-visible=true]{opacity:1;transform:translateY(0);visibility:visible}.cart-added span{overflow-wrap:anywhere}.cart-added button{flex-shrink:0;min-height:44px;background:transparent;border:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:4px}
    @media(max-width:700px){.cart-drawer{width:100vw}.cart-drawer__header{padding:20px}.cart-drawer__body{padding:8px 20px 24px}.cart-added{inset:auto 12px 12px;max-width:none;gap:12px}}
    .cart-drawer[data-instant=true],.cart-added[data-instant=true]{transition:none}[data-cart-count]{display:inline-block}
    @media(prefers-reduced-motion:reduce){.cart-drawer,.cart-added{transition:none;transform:none}}
  `;
  shoppingStyle.textContent += `
    [data-pagosya-checkout] .checkout-page__inner{max-width:1200px;min-width:0;container-type:inline-size}
    [data-pagosya-checkout] .checkout-page__summary{padding:0;border:0;border-radius:0;background:transparent}
    [data-pagosya-checkout] .checkout-review{display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,1.35fr);gap:clamp(32px,6vw,96px);align-items:start}
    /* The order review shares cart behavior, but must not inherit an authored
       fixed drawer's geometry. Keep it in the checkout's own content column. */
    [data-pagosya-checkout] [data-pagosya-cart][data-checkout-review]{position:static!important;inset:auto!important;z-index:auto;width:100%!important;min-width:0;max-width:none;height:auto!important;min-height:0;max-height:none;margin:0;padding:0;overflow:visible!important;transform:none;box-shadow:none;border:0;background:transparent;color:inherit;opacity:1;visibility:visible}
    [data-pagosya-checkout] .checkout-review>[data-retention-recovery]{grid-column:1 / -1;width:100%;min-width:0}
    .checkout-review__fields{min-width:0}.checkout-review__summary{min-width:0;border-top:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));padding-top:24px}
    [data-pagosya-checkout] input:not([type=checkbox]):not([type=radio]),[data-pagosya-checkout] textarea{box-sizing:border-box;min-height:48px;width:100%;padding:12px;font:inherit;color:inherit;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    [data-pagosya-checkout] fieldset{min-width:0;margin:24px 0;padding:0;border:0}
    [data-pagosya-checkout] [hidden]{display:none!important}
    [data-pagosya-checkout] button{min-height:44px;font:inherit}
    [data-pagosya-checkout] :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    @media(max-width:700px){[data-pagosya-checkout] .checkout-review{grid-template-columns:1fr;gap:32px}}
    @container(max-width:700px){[data-pagosya-checkout] .checkout-review{grid-template-columns:minmax(0,1fr);gap:32px}}
  `;
  document.head.append(shoppingStyle);
  let checkoutTrigger = null, checkoutPreviousHash = "", checkoutOverflow = "";
  const inertBeforeCheckout = new Map();
  const checkoutAnswers = new Map();
  const rememberCheckout = panel => panel.querySelectorAll('input[name],textarea[name],select[name]').forEach(field => { if (field.name !== 'shippingZoneId') checkoutAnswers.set(field.name, field.value); });
  document.addEventListener('input', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  document.addEventListener('change', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  function showCheckout(payment = false) {
    const mode = payment ? 'payment' : 'review';
    // Opening the review also changes the hash; preserve fields on that second notification.
    if (!checkoutPage.hidden && checkoutPage.dataset.mode === mode) return;
    checkoutPage.dataset.mode = mode;
    if (checkoutPage.hidden && !fullCheckoutPage) {
      checkoutOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      for (const child of document.body.children) if (child !== checkoutPage) { inertBeforeCheckout.set(child, child.inert); child.inert = true; }
    }
    checkoutPage.hidden = false;
    checkoutPage.innerHTML = `<div class="checkout-page__inner">${fullCheckoutPage && !payment ? '<a class="checkout-page__back" href="index.html">Volver a la tienda</a>' : `<button class="checkout-page__back" type="button" data-checkout-back>${payment ? 'Volver al resumen' : 'Volver a la tienda'}</button>`}<div><h1 tabindex="-1">${payment ? 'Pago de prueba' : 'Revisa tu pedido'}</h1><p class="checkout-page__intro">${payment ? 'Puedes completar el recorrido de prueba. No se realizará ningún cobro ni se creará un pedido real.' : 'Revisa tus productos, ajusta las cantidades y elige cómo recibir tu pedido. El pago se completa con pagosYa.'}</p>${preview || config.demo ? '<p class="order-note">Vista previa · Sin cobros</p>' : ''}<p data-pagosya-status role="status" aria-live="polite"></p></div><div class="checkout-page__summary"><div data-pagosya-cart data-checkout-review="${payment ? 'payment' : 'review'}"></div></div></div>`;
    renderCart();
    checkoutPage.querySelector("h1").focus();
    checkoutPage.scrollTop = 0;
  }
  function closeCheckout() {
    if (checkoutPage.hidden) return;
    checkoutPage.hidden = true; checkoutPage.innerHTML = "";
    document.documentElement.style.overflow = checkoutOverflow;
    inertBeforeCheckout.forEach((value, element) => { element.inert = value; }); inertBeforeCheckout.clear();
    checkoutTrigger?.focus();
  }
  function openCheckout(button) {
    if (!cart.size || !ready || checkingOut) return;
    track('checkout_started');
    if (cartDrawer.open) { cartDrawer.close(); restoreDrawer(); }
    if (config.checkoutPage && !fullCheckoutPage) { const link = document.createElement('a'); link.href = pageHref(config.checkoutPage); document.body.append(link); link.click(); link.remove(); return; }
    checkoutTrigger = button; checkoutPreviousHash = location.hash;
    showCheckout();
    location.hash = "checkout";
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === "#checkout") showCheckout();
    else if (location.hash === "#pago-de-prueba" && (preview || config.demo)) showCheckout(true);
    else if (fullCheckoutPage) showCheckout();
    else closeCheckout();
  });
  // Runtime-bound product navigation keeps its item ID even if presentation
  // code later normalizes hrefs. Run before the sandbox's document navigation.
  for (const eventName of ['click', 'auxclick']) window.addEventListener(eventName, event => {
    const link = event.target.closest?.('a[data-product-link]');
    const id = link?.closest('[data-custom-product]')?.dataset.productId;
    if (config.productPage && id && products().some(product => product.id === id)) link.href = pageHref(config.productPage, '?id=' + encodeURIComponent(id));
  }, true);
  function customProductCard(p, image, complex) {
    const template = document.querySelector('template[data-pagosya-product-template]');
    if (!template || !template.content) return null;
    const root = template.content.firstElementChild?.cloneNode(true);
    const field = name => root?.querySelector(`[data-product-field="${name}"]`);
    const detail = root?.querySelector('a[data-product-link]');
    const buy = root?.querySelector('button[data-product-add]');
    if (template.content.children.length !== 1 || !root || !field('name') || !field('price') || !detail || !buy) {
      document.documentElement.dataset.productTemplateInvalid = 'true';
      return null;
    }
    root.classList.add('menu-item');
    root.dataset.customProduct = '';
    root.dataset.productId = p.id;
    const fill = (name, value, className) => {
      const node = field(name);
      if (!node) return;
      node.textContent = value; node.classList.add(className);
      if (name === 'description' || name === 'options') node.hidden = !value;
    };
    const groups = optionGroups(p);
    const plural = { color: 'colores', tamaño: 'tamaños', talla: 'tallas', capacidad: 'capacidades', sabor: 'sabores', peso: 'pesos', presentación: 'presentaciones' };
    fill('options', groups ? groups.map(g => plural[g.name.toLowerCase()] ? `${g.values.length} ${plural[g.name.toLowerCase()]}` : `${g.name}: ${g.values.length}`).join(' · ') : '', 'menu-item__options');
    fill('name', p.name, 'menu-item__name');
    fill('price', money(price(p), p.currency), 'menu-item__price');
    fill('description', p.description && p.description.trim() !== p.name.trim() ? p.description : '', 'menu-item__description');
    const photo = field('image');
    if (photo) {
      if (photo.tagName !== 'IMG') { document.documentElement.dataset.productTemplateInvalid = 'true'; return null; }
      photo.hidden = !image;
      if (image) { photo.src = image; photo.alt = p.name; photo.loading = 'lazy'; photo.style.objectPosition = imagePosition(p, image); }
      else photo.removeAttribute('src');
      photo.classList.add('menu-item__image');
    }
    root.querySelectorAll('a[data-product-link]').forEach(detail => {
      detail.setAttribute('aria-label', `Ver detalle de ${p.name}`);
      // An image-only link with no image should not leave an empty focus target.
      if (!image && detail.querySelector('img') && !detail.textContent.trim() && !detail.querySelector('svg,canvas')) detail.hidden = true;
      if (config.productPage) detail.href = pageHref(config.productPage, '?id=' + encodeURIComponent(p.id));
      else {
        const button = document.createElement('button');
        for (const attr of [...detail.attributes]) if (attr.name !== 'href') button.setAttribute(attr.name, attr.value);
        button.type = 'button'; button.dataset.product = p.id; button.innerHTML = detail.innerHTML;
        detail.replaceWith(button);
      }
    });
    root.toggleAttribute('data-no-image', !image);
    root.querySelectorAll('[data-product-media]').forEach(media => { media.hidden = !image; });
    buy.classList.add('menu-add'); buy.type = 'button';
    buy.dataset.add = p.id; buy.disabled = !ready || limit(p) === 0 || complex;
    buy.setAttribute('aria-label', `${complex ? 'Elegir opciones de' : 'Añadir'} ${p.name}`);
    if (complex && optionGroups(p)) {
      delete buy.dataset.add; buy.dataset.product = p.id; buy.disabled = false;
      buy.textContent = 'Elegir opciones';
    }
    else if (limit(p) === 0) { buy.textContent = 'Agotado'; root.dataset.soldOut = 'true'; }
    else if (complex) {
      buy.textContent = 'Elegir opciones';
      if (!preview && !config.demo) {
        const link = document.createElement('a');
        for (const attr of [...buy.attributes]) if (!['disabled', 'type', 'data-add'].includes(attr.name)) link.setAttribute(attr.name, attr.value);
        link.href = safeUrl(hostedProduct(p.id)); link.textContent = 'Elegir opciones'; buy.replaceWith(link);
      }
    }
    return root.outerHTML;
  }
  function render() {
    delete document.documentElement.dataset.productTemplateInvalid;
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = store.storeName || "Tu tienda"; });
    document.querySelectorAll("[data-pagosya-categories]").forEach((el) => {
      el.hidden = !(store.categories || []).length;
      el.innerHTML = [{ id: "all", name: "Todo" }, ...(store.categories || [])].map((c) => `<button type="button" data-category="${escape(c.id)}" aria-pressed="${category === c.id}">${escape(c.name)}</button>`).join("");
    });
    document.querySelectorAll("[data-pagosya-catalog]").forEach((el) => {
      const selected = products().filter((p) => category === "all" || p.categoryId === category);
      el.innerHTML = selected.length ? selected.map((p) => {
        const image = galleryImages(p)[0];
        const complex = p.variants?.length || p.extras?.length;
        const custom = customProductCard(p, image, complex);
        if (custom) return custom;
        return `<article class="menu-item">${config.productPage ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>` : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`}${image ? `<img class="menu-item__image" src="${escape(image)}" alt="${escape(p.name)}" loading="lazy" />` : ""}<div class="menu-item__copy"><h3>${escape(p.name)}</h3>${p.description && p.description.trim() !== p.name.trim() ? `<p>${escape(p.description)}</p>` : ""}${limit(p) === 0 ? '<span class="sold-out">Agotado</span>' : ""}</div><strong class="menu-item__price">${money(price(p), p.currency)}</strong>${complex ? optionGroups(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Elegir opciones de ${escape(p.name)}">Elegir opciones</button>` : preview || config.demo ? `<button class="menu-add" disabled>Elegir opciones</button>` : `<a class="menu-add" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `<button class="menu-add" type="button" data-add="${escape(p.id)}" aria-label="Añadir ${escape(p.name)}" ${!ready || limit(p) === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}</article>`;
      }).join("") : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
    });
    if (fullProductPage && !preview) {
      const p = products().find(item => item.id === new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id'));
      if (p) {
        const canonical = `${(config.publicSiteUrl || `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}`).replace(/\/$/, '')}/p/${encodeURIComponent(p.id)}`;
        document.title = `${p.name} · ${store.storeName || config.slug}`;
        for (const [selector, attribute, value] of [
          ['link[rel="canonical"]', 'href', canonical], ['meta[property="og:url"]', 'content', canonical],
          ['meta[property="og:title"]', 'content', document.title], ['meta[name="description"]', 'content', p.description || p.name],
          ['meta[property="og:description"]', 'content', p.description || p.name], ['meta[property="og:image"]', 'content', safeUrl(p.imageUrls?.[0])],
        ]) document.querySelector(selector)?.setAttribute(attribute, value);
      }
    }
    if (fullProductPage) openProduct(new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id'));
    else if (selectedProduct && detail.open) {
      if (products().some(p => p.id === selectedProduct.id)) openProduct(selectedProduct.id, detailTrigger);
      else detail.close();
    }
    if (fullCheckoutPage) showCheckout(location.hash === '#pago-de-prueba' && (preview || config.demo));
    renderCart();
    renderContact();
    document.dispatchEvent(new CustomEvent("pagosya:ready", { detail: { store, preview, demo: Boolean(config.demo) } }));
  }
  function renderCart() {
    if (!preview && ready) {
      try {
        const value = JSON.stringify(cartItems());
        const storage = config.demo ? sessionStorage : localStorage;
        if (storage.getItem(cartKey) !== value) storage.setItem(cartKey, value);
      } catch { /* The current page still works when storage is unavailable. */ }
    }
    document.querySelectorAll("[data-pagosya-catalog] [data-add], [data-pagosya-product] [data-add]").forEach((button) => {
      const line = cartLine(button.dataset.add);
      button.disabled = !ready || checkingOut || !line || remaining(line.p, line.variant) <= 0;
    });
    let total = 0, count = 0;
    const rows = [];
    for (const [id, quantity] of cart) {
      const line = cartLine(id);
      if (!line) continue;
      const { p, variant, name, amount } = line;
      total += amount * quantity; count += quantity;
      rows.push(`<li class="order-item"><div><strong>${escape(name)}</strong><span>${money(amount * quantity, p.currency)}</span></div><div class="quantity"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(name)}" ${checkingOut || remaining(p, variant) <= 0 ? "disabled" : ""}>+</button></div></li>`);
    }
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(count); });
    document.querySelectorAll("[data-pagosya-cart]").forEach((el) => {
      const focused = el.contains(document.activeElement) ? document.activeElement : null;
      const focusedAction = focused?.hasAttribute('data-add') ? 'data-add' : focused?.hasAttribute('data-remove') ? 'data-remove' : null;
      const focusedId = focusedAction ? focused.getAttribute(focusedAction) : null;
      const remembered = el.hasAttribute("data-checkout-review") ? [...checkoutAnswers] : [];
      const answers = [...remembered, ...[...el.querySelectorAll('input,textarea')].map(field => [field.name, field.value])];
      const previousLocation = el.querySelector("[name=location]")?.value || checkoutAnswers.get("location");
      const previousMethod = el.querySelector("[name=method]")?.value || checkoutAnswers.get("method");
      delete el.dataset.discountedSubtotal;
      const previousCredit = el.querySelector('[name=creditCode]')?.value || '';
      const previousAddress = el.querySelector('[name=shippingAddress]')?.value || '';
      const review = el.hasAttribute("data-checkout-review");
      // Studio's separate payment-preview calculator currently accepts only
      // simple lines. Keep options and order review interactive without sending
      // unsupported variant carts to that calculator (or any real checkout).
      const previewOptions = preview && review && cartItems().some(item => item.variantId);
      if (review && cart.size && ready) track('checkout_started');
      const payment = el.dataset.checkoutReview === "payment";
      const action = review ? payment ? "data-finish-demo" : "data-pay" : "data-checkout";
      const actionLabel = review ? payment ? "Completar prueba" : preview || config.demo ? "Continuar al pago de prueba" : store.checkoutMode === "whatsapp" ? "Pedir por WhatsApp" : store.checkoutMode === "external" ? "Continuar al contacto" : "Pagar con pagosYa" : "Continuar con mi pedido";
      el.innerHTML = `<ul class="order-items">${rows.join("") || '<li class="order-empty">Tu pedido está vacío.<br>Explora los productos para comenzar.</li>'}</ul>${review && !digitalOnlyCart() && store.locations?.length ? `<label class="order-field">Sucursal<select name="location">${store.locations.map((l) => `<option value="${escape(l.id)}">${escape(l.name)}</option>`).join("")}</select></label><label class="order-field">Entrega<select name="method"></select></label>` : review && !digitalOnlyCart() && store.shippingEnabled ? '<label class="order-field">Entrega<select name="method"></select></label>' : ""}${review && !digitalOnlyCart() && !store.shippingEnabled && store.locations?.length ? '<fieldset data-delivery-address hidden><legend>Entrega a domicilio</legend><label class="order-field">Dirección y referencia<textarea name="shippingAddress" rows="3" maxlength="300" autocomplete="street-address" placeholder="Zona, calle, número y una referencia"></textarea></label><p class="order-note">Podrás compartir tu ubicación actual al completar tus datos en el pago.</p></fieldset>' : ''}${!digitalOnlyCart() && store.shippingEnabled && review ? `<fieldset data-shipping><legend>Envío</legend><label class="order-field">Dirección<input name="shippingAddress" maxlength="300" autocomplete="street-address" value="${escape(previousAddress)}"></label><label class="order-field">País de entrega (código de dos letras)<input name="shippingCountry" maxlength="2" placeholder="BO" autocomplete="country"></label><label class="order-field">Código postal<input name="shippingPostalCode" maxlength="20" autocomplete="postal-code"></label><button type="button" data-shipping-quote>Calcular envío</button><label class="order-field">Opción de envío<select name="shippingZoneId"><option value="">Calcula las opciones disponibles</option></select></label><p data-shipping-status role="status" aria-live="polite"></p></fieldset>` : ''}${review && store.creditsEnabled ? `<label class="order-field">Tarjeta de regalo o saldo<input name="creditCode" maxlength="39" autocomplete="off" spellcheck="false" value="${escape(previousCredit)}"></label><button type="button" data-credit-apply>Aplicar saldo</button><p data-credit-status role="status"></p>` : ''}<div class="order-total"><span>Subtotal</span><strong>${money(total, products()[0]?.currency)}</strong></div><p class="order-note">El total final se confirma en el checkout.</p>${review && (store.bundlesEnabled || store.creditsEnabled) ? '<p data-bundle-quote-status role="status"></p>' : ''}<button class="checkout-button" ${action} type="button" ${!ready || !count || checkingOut || previewOptions ? "disabled" : ""}>${actionLabel}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button>`;
      if (previewOptions) {
        const note = document.createElement('p'); note.className = 'order-note';
        note.textContent = 'Puedes revisar tus opciones aquí. El pago estará disponible en la tienda publicada.';
        el.append(note);
      }
      for (const [name, value] of answers) { const field = [...el.querySelectorAll('input,textarea')].find(field => field.name === name); if (field) field.value = value; }
      if (review) {
        const summary = document.createElement('aside'); summary.className = 'checkout-review__summary';
        summary.innerHTML = '<h2>Tu pedido</h2>';
        for (const child of [...el.children]) if (child.matches('.order-items,.order-total,.order-note')) summary.append(child);
        const fields = document.createElement('section'); fields.className = 'checkout-review__fields';
        fields.innerHTML = `<h2>${digitalOnlyCart() || !(store.locations?.length || store.shippingEnabled) ? 'Continúa al pago' : '¿Cómo quieres recibir tu pedido?'}</h2>`;
        fields.append(...el.children); el.append(summary, fields);
        const feedback = document.createElement('p');
        feedback.setAttribute('data-pagosya-checkout-status', ''); feedback.hidden = true;
        fields.append(feedback);
        el.classList.add('checkout-review');
      }
      const select = el.querySelector("[name=location]");
      if (select && previousLocation && Array.from(select.options).some((o) => o.value === previousLocation)) select.value = previousLocation;
      updateMethods(el, previousMethod);
      const branchInfo = document.createElement('p'); branchInfo.className = 'order-note'; branchInfo.setAttribute('data-branch-address', '');
      el.querySelector('[name=method]')?.closest('label')?.after(branchInfo);
      select?.addEventListener("change", () => { updateMethods(el); updateShipping(el); });
      el.querySelector('[name=method]')?.addEventListener('change', () => { updateShipping(el); track('delivery_selected', el.querySelector('[name=method]')?.value); });
      el.querySelector('[name=shippingZoneId]')?.addEventListener('change', () => void shippingQuote(el));
      el.querySelectorAll('[name=shippingCountry],[name=shippingPostalCode]').forEach(field => field.addEventListener('input', () => updateShipping(el)));
      el.querySelector('[data-credit-apply]')?.addEventListener('click', () => void applyCredit(el));
      el.querySelector('[name=creditCode]')?.addEventListener('input', () => { el.dataset.creditReady = 'false'; el.querySelector('[data-credit-status]').textContent = 'Aplica el código para actualizar el total.'; });
      updateShipping(el);
      if (review && ready && count && store.bundlesEnabled) void bundleQuote(el);
      if (focusedAction) {
        const buttons = [...el.querySelectorAll('button')];
        const replacement = buttons.find(button => button.getAttribute(focusedAction) === focusedId && !button.disabled)
          || buttons.find(button => (button.getAttribute('data-add') === focusedId || button.getAttribute('data-remove') === focusedId) && !button.disabled)
          || buttons.find(button => !button.disabled);
        if (replacement) replacement.focus({preventScroll: true});
        else { el.tabIndex = -1; el.focus({preventScroll: true}); }
      }
    });
    updateOptions();
    updateQuantity();
    document.dispatchEvent(new CustomEvent("pagosya:cart-updated"));
  }
  function renderContact() {
    let slot = document.querySelector('[data-pagosya-contact]');
    if (!store.contactFormEnabled) { if (slot) slot.hidden = true; return; }
    // Only an enabled store setting permits the legacy fallback; new stores default off.
    if (!slot && store.contactFormEnabled === true && !fullProductPage && !fullCheckoutPage && (!window.PAGOSYA_PREVIEW_PAGE || window.PAGOSYA_PREVIEW_PAGE === 'index.html')) {
      slot = document.createElement('section'); slot.setAttribute('data-pagosya-contact', '');
      const footer = document.querySelector('body > footer');
      if (footer) footer.before(slot); else (document.querySelector('main') || document.body).append(slot);
    }
    if (!slot) return;
    slot.hidden = false;
    // Older generated pages may already contain the legacy inline form. Keep
    // the widget idempotent, but replace that old markup once with the
    // viewport-pinned launcher and panel.
    if (slot.querySelector('[data-contact-toggle]')) return;
    slot.innerHTML = `<button type="button" class="pagosya-contact-launcher" data-contact-toggle aria-controls="pagosya-contact-panel" aria-expanded="false" aria-label="Abrir formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 7.4 7.4 0 0 1-3.2-.72L5 19.5l1.22-3.15A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg><span>Contacto</span></button><div class="pagosya-contact-panel" id="pagosya-contact-panel" data-contact-panel hidden><div class="pagosya-contact-heading"><div><h2>${escape(store.contactTitle || 'Conversemos')}</h2><p>${escape(store.contactSubtitle || 'Deja tus datos y tu consulta. El equipo de la tienda te responderá directamente.')}</p></div><button type="button" class="pagosya-contact-close" data-contact-close aria-label="Cerrar formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><form><label>Nombre<input name="name" autocomplete="name" maxlength="120" required></label><label>Correo<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>WhatsApp (opcional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label><label>Tu mensaje<textarea name="message" rows="4" maxlength="600" required></textarea></label><p>Usaremos estos datos para responder a tu consulta.</p><button type="submit">Enviar consulta</button><p role="status" aria-live="polite" data-contact-status></p></form></div>`;
    const toggle = slot.querySelector('[data-contact-toggle]');
    const panel = slot.querySelector('[data-contact-panel]');
    const close = slot.querySelector('[data-contact-close]');
    const setOpen = (open, returnFocus = false) => {
      slot.dataset.contactOpen = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      if (open) requestAnimationFrame(() => panel.querySelector('input, textarea, button[type="submit"]')?.focus());
      else if (returnFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => setOpen(false, true));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && slot.dataset.contactOpen === 'true') setOpen(false, true);
    });
    const form = slot.querySelector('form');
    // Opaque previews intentionally disallow native form navigation.
    if (preview || config.demo) {
      const simulate = event => { event.preventDefault(); if (form.reportValidity()) form.querySelector('[data-contact-status]').textContent = 'Prueba completada. Tu consulta no se envió al comercio.'; };
      form.querySelector('button[type="submit"]').addEventListener('click', simulate);
      form.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') simulate(event); });
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]'); const status = form.querySelector('[data-contact-status]');
      if (button.disabled || !form.reportValidity()) return;
      if (preview || config.demo) { status.textContent = 'Prueba completada. Tu consulta no se envió al comercio.'; return; }
      button.disabled = true; status.textContent = 'Enviando…';
      try {
        const data = new FormData(form);
        const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: [], name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), phone: String(data.get('phone')).trim() || undefined, message: String(data.get('message')).trim() }) });
        const result = await response.json();
        if (!response.ok || !result.submitted) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'No se pudo enviar. Inténtalo otra vez.');
        form.reset(); status.textContent = 'Consulta recibida. El equipo de la tienda te contactará.';
      } catch (error) { status.textContent = error.message || 'No se pudo enviar. Inténtalo otra vez.'; }
      finally { button.disabled = false; }
    });
  }
  const contactStyle = document.createElement('style');
  contactStyle.textContent = `[data-pagosya-contact]{position:fixed;right:24px;bottom:24px;z-index:1000;width:auto;max-width:none;margin:0;padding:0;color:inherit;font:inherit;pointer-events:none}[data-pagosya-contact][hidden]{display:none}[data-pagosya-contact] button{font:inherit;cursor:pointer}[data-pagosya-contact] svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.7}[data-pagosya-contact] .pagosya-contact-launcher{display:grid;place-items:center;width:56px;height:56px;padding:0;border:1px solid currentColor!important;border-radius:14px;background:var(--ink,#20211d)!important;color:var(--paper,#fffaf0)!important;pointer-events:auto}[data-pagosya-contact] .pagosya-contact-launcher span{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[data-pagosya-contact] .pagosya-contact-panel{position:absolute;right:0;bottom:68px;width:min(380px,calc(100vw - 32px));max-height:min(720px,calc(100dvh - 104px));overflow:auto;padding:24px;border:1px solid currentColor!important;border-radius:16px;background:var(--paper,#fffaf0)!important;color:var(--ink,#20211d)!important;pointer-events:auto}[data-pagosya-contact] .pagosya-contact-panel[hidden]{display:none}[data-pagosya-contact] .pagosya-contact-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}[data-pagosya-contact] h2{font:inherit;font-size:clamp(24px,4vw,32px);font-weight:700;margin:0 0 10px}[data-pagosya-contact] p{line-height:1.6}[data-pagosya-contact] .pagosya-contact-heading p{margin:0}[data-pagosya-contact] .pagosya-contact-close{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;padding:0;border:1px solid currentColor;border-radius:50%;background:transparent;color:inherit}[data-pagosya-contact] form{display:grid;gap:16px;margin-top:24px}[data-pagosya-contact] label{display:grid;gap:8px;font-size:15px}[data-pagosya-contact] input,[data-pagosya-contact] textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit}[data-pagosya-contact] form>button[type="submit"]{min-height:48px;padding:12px 24px;background:var(--ink,#20211d);color:var(--paper,#fffaf0);border:1px solid currentColor;font:inherit}[data-pagosya-contact] button:disabled{opacity:.6}[data-pagosya-contact] :focus-visible{outline:3px solid currentColor;outline-offset:4px}[data-contact-status]{min-height:24px;overflow-wrap:anywhere}@media(max-width:560px){[data-pagosya-contact]{right:16px;bottom:16px}[data-pagosya-contact] .pagosya-contact-panel{bottom:68px;width:calc(100vw - 32px);padding:20px}}@media(prefers-reduced-motion:reduce){[data-pagosya-contact] *{transition:none!important;animation:none!important}}`;
  contactStyle.textContent = '@layer pagosya-contact-base {' + contactStyle.textContent + '}';
  document.head.append(contactStyle);
  function digitalOnlyCart() { return cart.size > 0 && [...cart.keys()].every(id => cartLine(id)?.p.fulfillmentType === 'DIGITAL'); }
  function updateMethods(el, selected) {
    const method = el.querySelector("[name=method]");
    if (!method) return;
    const location = store.locations?.find((l) => l.id === el.querySelector("[name=location]")?.value);
    const methods = [((location ? location.pickupEnabled : store.shippingPickupEnabled) && (!store.shippingEnabled || store.shippingPickupEnabled)) && ["pickup", "Recoger en tienda"], (location ? location.deliveryEnabled : store.shippingEnabled) && ["delivery", "Entrega a domicilio"]].filter(Boolean);
    method.innerHTML = methods.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    if (methods.some(([value]) => value === selected)) method.value = selected;
  }
  function updateShipping(panel) {
    const address = panel.querySelector('[data-delivery-address]');
    if (address) address.hidden = panel.querySelector('[name=method]')?.value !== 'delivery';
    const branch = store.locations?.find(location => location.id === panel.querySelector('[name=location]')?.value);
    const info = panel.querySelector('[data-branch-address]');
    if (info) info.textContent = panel.querySelector('[name=method]')?.value === 'pickup' ? branch?.address || '' : '';
    const field = panel.querySelector('[data-shipping]');
    if (field) field.hidden = panel.querySelector('[name=method]')?.value !== 'delivery';
    const rate = panel.querySelector('[name=shippingZoneId]');
    if (rate) rate.value = '';
    if (panel.dataset.discountedSubtotal) panel.querySelector('.order-total strong').textContent = money(Number(panel.dataset.discountedSubtotal), products()[0]?.currency);
    panel.querySelector('.order-total span').textContent = 'Subtotal';

  }
  async function bundleQuote(panel) {
    const status = panel.querySelector('[data-bundle-quote-status]');
    if (!status || preview || config.demo) return;
    status.textContent = 'Comprobando ofertas…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), locationId: panel.querySelector('[name=location]')?.value || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudieron comprobar las ofertas.');
      if (panel.querySelector('[data-bundle-quote-status]') !== status) return;
      panel.dataset.discountedSubtotal = String(quote.subtotal - quote.discountAmount);
      if (!panel.querySelector('[name=shippingZoneId]')?.value) panel.querySelector('.order-total strong').textContent = money(quote.subtotal - quote.discountAmount, quote.currency);
      status.textContent = quote.discountAmount ? `Oferta aplicada: −${money(quote.discountAmount, quote.currency)}.` : 'No hay ofertas aplicables a esta selección.';
    } catch (error) { status.textContent = error.message || 'No se pudieron comprobar las ofertas.'; }
  }
  async function shippingQuote(panel) {
    const field = panel.querySelector('[data-shipping]'); if (!field || !cart.size) return;
    const status = field.querySelector('[data-shipping-status]');
    if (preview || config.demo) { status.textContent = 'Las tarifas reales se calculan en la tienda publicada. Esta vista no crea pedidos.'; return; }
    const button = field.querySelector('[data-shipping-quote]');
    const select = field.querySelector('[name=shippingZoneId]');
    const selected = select.value;
    button.disabled = true; status.textContent = 'Calculando envío…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), fulfillmentMethod: 'delivery', locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: selected || undefined, creditCode: panel.querySelector('[name=creditCode]')?.value.trim() || undefined }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudo calcular el envío.');
      if (panel.querySelector('[name=shippingZoneId]') !== select || select.value !== selected) return;
      panel.dataset.discountedSubtotal = String(quote.subtotal - (quote.discountAmount || 0));
      panel.querySelector('.order-total strong').textContent = money(quote.amount, quote.currency);
      panel.querySelector('.order-total span').textContent = selected ? 'Total' : 'Subtotal';
      select.innerHTML = '<option value="">Elige tu zona y servicio</option>' + quote.shippingOptions.map(option => `<option value="${escape(option.id)}">${escape(option.name)} · ${money(option.amount, option.currency)}</option>`).join('');
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
      status.textContent = !quote.shippingOptions.length ? 'No hay opciones disponibles para este pedido. Contacta al comercio.' : selected ? `Envío: ${money(quote.shippingAmount, quote.currency)}. Total: ${money(quote.amount, quote.currency)}.` : 'Elige la opción que corresponde a tu dirección.';
    } catch (error) { status.textContent = error.message || 'No se pudo calcular el envío.'; select.value = ''; }
    finally { button.disabled = false; }
  }
  async function applyCredit(panel) {
    const status = panel.querySelector('[data-credit-status]');
    if (preview || config.demo) { status.textContent = 'El saldo se valida en la tienda publicada.'; return; }
    const code = panel.querySelector('[name=creditCode]').value.trim();
    const button = panel.querySelector('[data-credit-apply]'); button.disabled = true;
    panel.dataset.creditReady = 'false'; status.textContent = 'Validando saldo…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), creditCode: code || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined, locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: panel.querySelector('[name=shippingZoneId]')?.value || undefined }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudo aplicar el saldo.');
      if (panel.querySelector('[name=creditCode]')?.value.trim() !== code || !button.isConnected) return;
      panel.dataset.creditReady = 'true';
      panel.querySelector('.order-total strong').textContent = money(quote.amount, quote.currency);
      status.textContent = `Saldo aplicado: ${money(quote.creditAmount || 0, quote.currency)}. Restante a pagar: ${money(quote.amount, quote.currency)}.`;
    } catch (error) { status.textContent = error.message || 'No se pudo aplicar el saldo.'; }
    finally { button.disabled = false; }
  }
  function validateDelivery(panel) {
    if (!digitalOnlyCart() && (store.locations?.length || store.shippingEnabled) && !panel?.querySelector('[name=method]')?.value) {
      message('Esta sucursal no tiene un método de entrega disponible.');
      panel?.querySelector('[name=location]')?.focus(); return false;
    }
    const field = panel?.querySelector('[name=shippingAddress]');
    if (!field || panel.querySelector('[name=method]')?.value !== 'delivery' || digitalOnlyCart()) return true;
    const valid = Boolean(field.value.trim());
    field.setCustomValidity(valid ? '' : 'Escribe la dirección y una referencia para la entrega.');
    if (!valid) { field.reportValidity(); field.focus(); }
    field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
    return valid;
  }
  document.addEventListener('pagosya:validate-checkout', event => { if (event.detail) event.detail.valid = validateDelivery(event.detail.panel); });
  async function checkout(button) {
    if (!cart.size || !ready || checkingOut || button.disabled) return;
    const panel = button.closest("[data-pagosya-cart]");
    if (!validateDelivery(panel)) return;
    const locationId = panel.querySelector("[name=location]")?.value;
    const fulfillmentMethod = panel.querySelector("[name=method]")?.value;
    if (fulfillmentMethod) track('delivery_selected', fulfillmentMethod);
    const shippingZoneId = panel.querySelector('[name=shippingZoneId]')?.value;
    const creditCode = panel.querySelector('[name=creditCode]')?.value.trim() || undefined;
    if (creditCode && panel.dataset.creditReady !== 'true') { message('Aplica el saldo antes de continuar.'); return; }
    const shippingAddress = panel.querySelector('[name=shippingAddress]')?.value.trim();
    if (!preview && !config.demo && !digitalOnlyCart() && store.shippingEnabled && fulfillmentMethod === 'delivery' && (!shippingZoneId || !shippingAddress)) { message('Calcula el envío, elige tu zona y escribe la dirección.'); return; }
    if (!digitalOnlyCart() && (store.locations?.length || store.shippingEnabled) && !fulfillmentMethod) { message("Esta sucursal no tiene un método de entrega disponible."); return; }
    if (preview || config.demo) { showCheckout(true); location.hash = "pago-de-prueba"; return; }
    if (store.checkoutMode === "whatsapp") {
      const phone = String(store.contactPhone || "").replace(/\D/g, "");
      if (!phone) { message("El comercio todavía no tiene un número de WhatsApp configurado."); return; }
      const text = [...cart].map(([id, quantity]) => `${quantity} × ${cartLine(id)?.name}`).join("\n");
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, quisiera pedir:\n${text}`)}`;
      if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); return;
    }
    if (store.checkoutMode === "external") {
      const url = safeUrl(store.leadCaptureUrl);
      if (url) { if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); } else message("El comercio todavía no tiene un enlace de contacto configurado.");
      return;
    }
    checkingOut = true; button.disabled = true; button.setAttribute("aria-busy", "true"); message("Preparando tu pedido…");
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/cart-checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ partnerCode: window.PAGOSYA_PRIVACY?.analyticsAllowed(config.slug) ? partnerCode : undefined, creditCode, recoveryToken: window.PAGOSYA_RETENTION_STATE?.token || undefined, ...(fulfillmentMethod === 'delivery' ? { shippingAddress } : {}), ...(store.shippingEnabled ? { fulfillmentMethod, shippingZoneId, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined } : {}), items: checkoutItems(), ...(locationId ? { locationId, fulfillmentMethod } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "No pudimos preparar el pedido.");
      if (hosted) return;
      if (typeof result.clientSecret !== "string" || !result.clientSecret) throw new Error("El checkout no devolvió una sesión válida.");
      const destination = new URL(`/s/${encodeURIComponent(config.slug)}`, config.checkoutOrigin);
      destination.hash = `client_secret=${encodeURIComponent(result.clientSecret)}`;
      window.location.assign(destination.href);
    } catch (error) { checkingOut = false; message(error.message); button.disabled = false; button.removeAttribute("aria-busy"); }
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-product-delivery')) {
      const tab = detail.querySelector('[data-product-tab="delivery"]'); selectProductTab(tab); tab.focus(); return;
    }
    if (button.hasAttribute('data-product-jump')) {
      const groups = optionGroups(selectedProduct), buy = detail.querySelector('.product-detail__buy');
      const missing = groups && groups.findIndex((group, index) => selectedOptions[index] === undefined);
      if (groups && missing >= 0) {
        const fieldset = detail.querySelectorAll('.product-detail__options fieldset')[missing];
        fieldset.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        fieldset.querySelector('[data-product-option]:not(:disabled)')?.focus({ preventScroll: true });
      } else if (buy && !buy.disabled) buy.click();
      return;
    }
    if (button.hasAttribute('data-product-quantity')) {
      selectedQuantity += Number(button.dataset.productQuantity); updateQuantity(); return;
    }
    if (button.hasAttribute('data-product-option')) {
      const index = Number(button.dataset.productOption), groups = optionGroups(selectedProduct);
      if (!groups) return;
      const previous = [...selectedOptions];
      const chosen = [...selectedOptions]; chosen[index] = groups[index].values[Number(button.dataset.optionValue)];
      selectedOptions = completeSelection(selectedProduct, chosen);
      // Never change a later choice silently: say which ones availability replaced.
      const replaced = groups.map((group, i) => i > index && previous[i] !== undefined && previous[i] !== selectedOptions[i] ? `${group.name}: ${selectedOptions[i] ?? 'sin elegir'}` : '').filter(Boolean);
      selectionNote = replaced.length ? `Actualizamos ${replaced.join(', ')} por disponibilidad.` : '';
      updateOptions();
      // An early choice may preview a photo only if every compatible variant agrees.
      const matches = selectedProduct.variants.filter(v => variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value));
      const candidateImages = matches.map(v => safeUrl(v.imageUrl));
      const image = candidateImages.length && candidateImages[0] && candidateImages.every(url => url === candidateImages[0]) ? candidateImages[0] : '';
      showImage(image ? galleryImages(selectedProduct).indexOf(image) : 0);
      return;
    }
    if (button.hasAttribute("data-product-tab")) { selectProductTab(button); return; }
    if (button.hasAttribute("data-product-close")) { detail.close(); return; }
    if (button.hasAttribute("data-product")) { openProduct(button.dataset.product, button); return; }
    if (button.hasAttribute("data-product-image")) { showImage(Number(button.dataset.productImage)); return; }
    if (button.hasAttribute("data-product-prev")) { showImage(selectedImage - 1); return; }
    if (button.hasAttribute("data-product-next")) { showImage(selectedImage + 1); return; }
    if (checkingOut) return;
    if (button.hasAttribute("data-checkout-back")) { location.hash = location.hash === "#pago-de-prueba" ? "checkout" : checkoutPreviousHash; return; }
    if (button.hasAttribute("data-finish-demo") && (preview || config.demo)) {
      if (fullCheckoutPage) showCheckout(); else closeCheckout();
      const completed = () => message("Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.");
      // hashchange can rebuild the review after this click; retain its confirmation.
      if (location.hash !== checkoutPreviousHash) window.addEventListener('hashchange', completed, { once: true });
      location.hash = checkoutPreviousHash; completed(); return;
    }
    if (button.hasAttribute("data-category")) { category = button.dataset.category; render(); }
    if (button.hasAttribute("data-add") && ready) {
      const key = button.dataset.add, line = cartLine(key);
      if (!line) return;
      const { p, variant, name } = line;
      const quantity = cart.get(key) || 0;
      if (remaining(p, variant) <= 0) { message("Ya añadiste la cantidad disponible."); return; }
      track('add_to_cart');
      const units = button.classList.contains('product-detail__buy') ? Math.min(selectedQuantity, remaining(p, variant)) : 1;
      cart.set(key, quantity + units); renderCart(); message(`${name} añadido a tu pedido.`); addedFeedback({ ...p, name }, button, event.detail === 0);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${name} añadido a tu pedido.`;
    }
    if (button.hasAttribute("data-remove")) { const id = button.dataset.remove; const quantity = cart.get(id) || 0; if (quantity > 1) cart.set(id, quantity - 1); else cart.delete(id); renderCart(); message("Pedido actualizado."); }
    if (button.hasAttribute("data-checkout")) openCheckout(button);
    if (button.hasAttribute('data-shipping-quote')) { void shippingQuote(button.closest('[data-pagosya-cart]')); return; }
    if (button.hasAttribute("data-pay")) void checkout(button);
    if (button.hasAttribute("data-retry")) void load();
  });
  async function load() {
    render();
    if (preview || config.demo || hosted) return;
    message("Actualizando disponibilidad…");
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/store`, { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la carta. Intenta de nuevo.");
      const saved = cartItems();
      store = await response.json(); ready = true; category = "all";
      restoreCart(saved);
      render(); message("");
    } catch (error) { ready = false; render(); message(error.message); }
  }
  async function loadCommerceContent() {
    const slots = document.querySelectorAll('[data-pagosya-blog],[data-pagosya-reviews],[data-pagosya-bundles]');
    if (!slots.length && !fullProductPage) return;
    if (preview || config.demo) { slots.forEach(slot => { slot.textContent = 'El contenido publicado del comercio aparecerá aquí en la tienda.'; }); return; }
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content?locale=${encodeURIComponent(document.documentElement.lang || 'es')}`, { credentials: 'omit' });
      if (!response.ok) throw new Error('No se pudo cargar el contenido.');
      const data = await response.json();
      commerceData = data; decorateProductReviews();
      slots.forEach(slot => {
        if (slot.hasAttribute('data-pagosya-blog')) slot.innerHTML = data.articles.map(article => `<article id="articulo-${escape(article.slug)}"><h2>${escape(article.title)}</h2><p>${escape(article.author)} · ${new Date(article.publishedAt).toLocaleDateString('es-BO')}</p><p>${escape(article.excerpt)}</p><p><a data-article-url href="${escape(new URL(config.apiBaseUrl, config.checkoutOrigin).href.replace(/\/$/, ''))}/stores/public/${encodeURIComponent(config.slug)}/pages/${encodeURIComponent(article.locale)}/${encodeURIComponent(article.slug)}">Abrir artículo</a></p><details><summary>Leer aquí</summary>${article.body.split(/\n\s*\n/).map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</details></article>`).join('') || '<p>Todavía no hay artículos publicados.</p>';
        if (slot.hasAttribute('data-pagosya-reviews')) slot.innerHTML = data.reviews.filter(review => !fullProductPage || review.productId === selectedProduct?.id).map(review => `<article><strong>${escape(review.displayName)}</strong><p>${review.rating} de 5 · Compra verificada</p><p>${escape(review.body)}</p></article>`).join('') || '<p>Todavía no hay reseñas publicadas.</p>';
        if (slot.hasAttribute('data-pagosya-bundles')) slot.innerHTML = data.bundles.map(bundle => `<article><h3>${escape(bundle.name)}</h3><p>${bundle.kind === 'BOGO' ? 'Lleva dos; el de menor precio es gratis.' : `${bundle.discountPercent}% de descuento ${bundle.kind === 'FIXED' ? 'al completar el paquete' : 'desde ' + bundle.minimumQuantity + ' unidades'}.`}</p><ul>${bundle.items.map(item => `<li>${escape(products().find(p => p.id === item.productId)?.name || 'Producto del paquete')}${bundle.kind === 'FIXED' ? ' × ' + item.quantity : ''}</li>`).join('')}</ul><p>Añade los productos al carrito. La mejor oferta se aplica automáticamente al pagar; no se acumula con otros códigos.</p></article>`).join('') || '<p>No hay paquetes activos.</p>';
      });
    } catch { slots.forEach(slot => { slot.textContent = 'No pudimos cargar esta sección. Recarga la página para intentar de nuevo.'; }); }
  }
  document.querySelectorAll('[data-pagosya-review-form]').forEach(slot => {
    slot.innerHTML = `<form><h2>Comparte tu experiencia</h2><label class="order-field">Código de seguimiento del pedido<input name="trackingToken" required maxlength="250" autocomplete="off"></label><label class="order-field">Producto<select name="productId">${products().map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')}</select></label><label class="order-field">Nombre público<input name="displayName" required maxlength="80"></label><label class="order-field">Calificación<select name="rating">${[5,4,3,2,1].map(n => `<option value="${n}">${n} de 5</option>`).join('')}</select></label><label class="order-field">Tu reseña<textarea name="body" required minlength="3" maxlength="2000"></textarea></label><p>Tu nombre y reseña podrán publicarse después de la revisión del comercio.</p><button type="submit">Enviar reseña</button><p role="status"></p></form>`;
    slot.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.target; const status = form.querySelector('[role=status]'); const button = form.querySelector('button');
      if (preview || config.demo) { status.textContent = 'Prueba completada. No se envió ninguna reseña.'; return; }
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form)); values.rating = Number(values.rating);
        const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content/reviews`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        const result = await response.json(); if (!response.ok) throw new Error(result.message || 'No se pudo enviar la reseña.');
        status.textContent = 'Reseña recibida. Está pendiente de revisión.'; form.reset();
      } catch (error) { status.textContent = error.message || 'No se pudo enviar la reseña.'; }
      finally { button.disabled = false; }
    });
  });
  void loadCommerceContent();
  void load();
})();
