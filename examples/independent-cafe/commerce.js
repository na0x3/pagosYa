(() => {
  "use strict";
  const config = window.PAGOSYA_CONFIG || {};
  const preview = window.PAGOSYA_PREVIEW === true;
  let store = config.data || {};
  let ready = Boolean(config.demo || preview);
  let category = "all";
  let checkingOut = false;
  const cart = new Map();
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (amount, currency = "BOB") => new Intl.NumberFormat("es-BO", { style: "currency", currency }).format(amount / 100);
  const products = () => Array.isArray(store.items) ? store.items : [];
  const limit = (p) => Math.max(0, Math.min(99, p.purchaseLimit ?? 99, p.stock ?? 99));
  const price = (p) => {
    const now = Date.now();
    const active = p.discountPercent > 0 && (!p.discountStartsAt || Date.parse(p.discountStartsAt) <= now) && (!p.discountEndsAt || Date.parse(p.discountEndsAt) > now);
    return active ? Math.round(p.amount * (1 - p.discountPercent / 100)) : p.amount;
  };
  const safeUrl = (value) => { try { if (typeof value !== "string" || !value) return ""; if (/^data:image\/(png|jpeg|webp|avif|gif);base64,[a-zA-Z0-9+/=]+$/.test(value)) return value; const u = new URL(value, value.startsWith("assets/") ? document.baseURI : config.apiBaseUrl || location.href); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const hostedProduct = (id) => `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}/p/${encodeURIComponent(id)}`;
  function message(text) { document.querySelectorAll("[data-pagosya-status]").forEach((el) => { el.textContent = text; }); }
  function render() {
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = store.storeName || "Tu tienda"; });
    document.querySelectorAll("[data-pagosya-categories]").forEach((el) => {
      el.innerHTML = [{ id: "all", name: "Todo" }, ...(store.categories || [])].map((c) => `<button type="button" data-category="${escape(c.id)}" aria-pressed="${category === c.id}">${escape(c.name)}</button>`).join("");
    });
    document.querySelectorAll("[data-pagosya-catalog]").forEach((el) => {
      const selected = products().filter((p) => category === "all" || p.categoryId === category);
      el.innerHTML = selected.length ? selected.map((p) => {
        const image = safeUrl(p.imageUrls?.[0]);
        const complex = p.variants?.length || p.extras?.length;
        return `<article class="menu-item">${image ? `<img class="menu-item__image" src="${escape(image)}" alt="" loading="lazy" />` : ""}<div class="menu-item__copy"><h3>${escape(p.name)}</h3>${p.description ? `<p>${escape(p.description)}</p>` : ""}${limit(p) === 0 ? '<span class="sold-out">Agotado</span>' : ""}</div><strong class="menu-item__price">${money(price(p), p.currency)}</strong>${complex ? preview || config.demo ? `<button class="menu-add" disabled>Elegir opciones</button>` : `<a class="menu-add" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `<button class="menu-add" type="button" data-add="${escape(p.id)}" aria-label="Añadir ${escape(p.name)}" ${!ready || limit(p) === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}</article>`;
      }).join("") : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
    });
    renderCart();
    document.dispatchEvent(new CustomEvent("pagosya:ready", { detail: { store, preview, demo: Boolean(config.demo) } }));
  }
  function renderCart() {
    document.querySelectorAll("[data-pagosya-catalog] [data-add]").forEach((button) => {
      const product = products().find((p) => p.id === button.dataset.add);
      button.disabled = !ready || checkingOut || !product || (cart.get(product.id) || 0) >= limit(product);
    });
    let total = 0, count = 0;
    const rows = [];
    for (const [id, quantity] of cart) {
      const p = products().find((p) => p.id === id);
      if (!p) continue;
      total += price(p) * quantity; count += quantity;
      rows.push(`<li class="order-item"><div><strong>${escape(p.name)}</strong><span>${money(price(p) * quantity, p.currency)}</span></div><div class="quantity"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(p.name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(p.name)}" ${quantity >= limit(p) ? "disabled" : ""}>+</button></div></li>`);
    }
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(count); });
    document.querySelectorAll("[data-pagosya-cart]").forEach((el) => {
      const previousLocation = el.querySelector("[name=location]")?.value;
      const previousMethod = el.querySelector("[name=method]")?.value;
      el.innerHTML = `<ul class="order-items">${rows.join("") || '<li class="order-empty">Algo rico está por llegar.<br>Elige de la carta para comenzar.</li>'}</ul>${store.locations?.length ? `<label class="order-field">Sucursal<select name="location">${store.locations.map((l) => `<option value="${escape(l.id)}">${escape(l.name)}</option>`).join("")}</select></label><label class="order-field">Entrega<select name="method"></select></label>` : ""}<div class="order-total"><span>Subtotal</span><strong>${money(total, products()[0]?.currency)}</strong></div><p class="order-note">El total final se confirma en el checkout.</p><button class="checkout-button" data-checkout type="button" ${!ready || !count ? "disabled" : ""}>${config.demo || preview ? "Revisar pedido de prueba" : store.checkoutMode === "whatsapp" ? "Pedir por WhatsApp" : "Continuar con mi pedido"}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button>`;
      const select = el.querySelector("[name=location]");
      if (select && previousLocation && Array.from(select.options).some((o) => o.value === previousLocation)) select.value = previousLocation;
      updateMethods(el, previousMethod);
      select?.addEventListener("change", () => updateMethods(el));
    });
  }
  function updateMethods(el, selected) {
    const method = el.querySelector("[name=method]");
    if (!method) return;
    const location = store.locations?.find((l) => l.id === el.querySelector("[name=location]")?.value);
    const methods = [location?.pickupEnabled && ["pickup", "Recoger en tienda"], location?.deliveryEnabled && ["delivery", "Entrega a domicilio"]].filter(Boolean);
    method.innerHTML = methods.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    if (methods.some(([value]) => value === selected)) method.value = selected;
  }
  async function checkout(button) {
    if (!cart.size || !ready || checkingOut || button.disabled) return;
    if (preview || config.demo) { message("Este es un pedido de demostración. No se realizará ningún cobro."); return; }
    const panel = button.closest("[data-pagosya-cart]");
    const locationId = panel.querySelector("[name=location]")?.value;
    const fulfillmentMethod = panel.querySelector("[name=method]")?.value;
    if (store.locations?.length && !fulfillmentMethod) { message("Esta sucursal no tiene un método de entrega disponible."); return; }
    if (store.checkoutMode === "whatsapp") {
      const phone = String(store.contactPhone || "").replace(/\D/g, "");
      if (!phone) { message("El comercio todavía no tiene un número de WhatsApp configurado."); return; }
      const text = [...cart].map(([id, quantity]) => `${quantity} × ${products().find((p) => p.id === id)?.name}`).join("\n");
      window.location.assign(`https://wa.me/${phone}?text=${encodeURIComponent(`Hola, quisiera pedir:\n${text}`)}`); return;
    }
    if (store.checkoutMode === "external") {
      const url = safeUrl(store.leadCaptureUrl);
      if (url) window.location.assign(url); else message("El comercio todavía no tiene un enlace de contacto configurado.");
      return;
    }
    checkingOut = true; button.disabled = true; button.setAttribute("aria-busy", "true"); message("Preparando tu pedido…");
    try {
      const response = await fetch(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/cart-checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ items: [...cart].map(([paymentLinkId, quantity]) => ({ paymentLinkId, quantity })), ...(locationId ? { locationId, fulfillmentMethod } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "No pudimos preparar el pedido.");
      if (typeof result.clientSecret !== "string" || !result.clientSecret) throw new Error("El checkout no devolvió una sesión válida.");
      const destination = new URL(`/s/${encodeURIComponent(config.slug)}`, config.checkoutOrigin);
      destination.hash = `client_secret=${encodeURIComponent(result.clientSecret)}`;
      window.location.assign(destination.href);
    } catch (error) { checkingOut = false; message(error.message); button.disabled = false; button.removeAttribute("aria-busy"); }
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled || checkingOut) return;
    if (button.hasAttribute("data-category")) { category = button.dataset.category; render(); }
    if (button.hasAttribute("data-add") && ready) {
      const p = products().find((p) => p.id === button.dataset.add);
      if (!p || p.variants?.length || p.extras?.length) return;
      const quantity = cart.get(p.id) || 0;
      if (quantity >= limit(p)) { message("Ya añadiste la cantidad disponible."); return; }
      cart.set(p.id, quantity + 1); renderCart(); message(`${p.name} añadido a tu pedido.`);
    }
    if (button.hasAttribute("data-remove")) { const id = button.dataset.remove; const quantity = cart.get(id) || 0; if (quantity > 1) cart.set(id, quantity - 1); else cart.delete(id); renderCart(); message("Pedido actualizado."); }
    if (button.hasAttribute("data-checkout")) void checkout(button);
    if (button.hasAttribute("data-retry")) void load();
  });
  async function load() {
    render();
    if (preview || config.demo) return;
    message("Actualizando disponibilidad…");
    try {
      const response = await fetch(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/store`, { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la carta. Intenta de nuevo.");
      store = await response.json(); ready = true; category = "all";
      for (const [id, quantity] of cart) { const p = products().find((p) => p.id === id); if (!p || !limit(p)) cart.delete(id); else cart.set(id, Math.min(quantity, limit(p))); }
      render(); message("");
    } catch (error) { ready = false; render(); message(error.message); }
  }
  void load();
})();
