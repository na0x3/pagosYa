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
  // Published stores: personal fields are typed in pagosYa's secure form outside the design, never in this frame.
  function secureFields(root, names, note) {
    if (!hosted || !root) return;
    let removed = false;
    for (const name of names) root.querySelectorAll(`[name="${name}"]`).forEach(field => { (field.closest('label') || field).remove(); removed = true; });
    if (names.includes('creditCode')) root.querySelectorAll('[data-credit-apply],[data-credit-status]').forEach(el => el.remove());
    if (removed && !root.querySelector('.pagosya-secure-note')) (root.querySelector('.order-total') || root.querySelector('[type=submit]'))?.insertAdjacentHTML('beforebegin', `<p class="pagosya-secure-note">${escape(note)}</p>`);
  }
  // Platform uploads have width-limited WebP copies (?w=); embedded or authored images do not.
  const RESPONSIVE_WIDTHS = [320, 480, 640, 960, 1280, 1600];
  const responsiveSrcset = (url) => /\/v1\/uploads\/[0-9a-f-]{36}\.(?:png|jpe?g|webp)$/i.test(String(url || "")) ? RESPONSIVE_WIDTHS.map((width) => `${url}?w=${width} ${width}w`).join(", ") : "";
  const responsiveAttrs = (url, sizes) => { const set = responsiveSrcset(url); return set ? ` srcset="${escape(set)}" sizes="${escape(sizes)}"` : ""; };
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
  const lineKey = (id, variantId, cadence) => cadence ? JSON.stringify([id, variantId || '', null, cadence]) : variantId ? JSON.stringify([id, variantId]) : id;
  /* Subscriptions are offered only where checkout can record consent and create them: online payment. */
  const subscriptionsAvailable = () => store?.subscriptionsEnabled === true && store?.checkoutMode === 'payment';
