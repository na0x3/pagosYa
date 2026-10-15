  async function checkout(button) {
    if (!cart.size || !ready || checkingOut || button.disabled) return;
    analytics('pay_click');
    const panel = button.closest("[data-pagosya-cart]");
    if (!validateDelivery(panel)) return;
    const subscriptionLine = subscriptionLineInCart();
    // Consent is only needed when actually paying: WhatsApp/external flows never carry subscription lines.
    const paying = !preview && !config.demo && store.checkoutMode !== 'whatsapp' && store.checkoutMode !== 'external';
    if (subscriptionLine && paying && !panel.querySelector('[name=subscriptionConsent]')?.checked) { message('Acepta las condiciones de la suscripción para continuar.'); return; }
    const locationId = panel.querySelector("[name=location]")?.value;
    const fulfillmentMethod = panel.querySelector("[name=method]")?.value;
    if (fulfillmentMethod) { track('delivery_selected', fulfillmentMethod); analytics('checkout_step', { step: 'delivery' }, 'step:delivery'); }
    const shippingZoneId = panel.querySelector('[name=shippingZoneId]')?.value;
    const creditCode = panel.querySelector('[name=creditCode]')?.value.trim() || undefined;
    if (creditCode && panel.dataset.creditReady !== 'true') { message('Aplica el saldo antes de continuar.'); return; }
    const shippingAddress = panel.querySelector('[name=shippingAddress]')?.value.trim();
    if (!preview && !config.demo && !digitalOnlyCart() && store.shippingEnabled && fulfillmentMethod === 'delivery' && (!shippingZoneId || (!hosted && !shippingAddress))) { message(hosted ? 'Calcula el envío y elige tu zona.' : 'Calcula el envío, elige tu zona y escribe la dirección.'); return; }
    if (!digitalOnlyCart() && (store.locations?.length || store.shippingEnabled) && !fulfillmentMethod) { message("Esta sucursal no tiene un método de entrega disponible."); return; }
    if (preview || config.demo) { showCheckout(true); location.hash = "pago-de-prueba"; return; }
    if (store.checkoutMode === "whatsapp") {
      const phone = String(store.contactPhone || "").replace(/\D/g, "");
      if (!phone) { message("El comercio todavía no tiene un número de WhatsApp configurado."); return; }
      const text = [...cart].map(([id, quantity]) => `${quantity} × ${cartLine(id)?.name}`).join("\n");
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, quisiera pedir:\n${text}`)}`;
      analytics('whatsapp_click'); flushAnalytics();
      if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); return;
    }
    if (store.checkoutMode === "external") {
      const url = safeUrl(store.leadCaptureUrl);
      if (url) { if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); } else message("El comercio todavía no tiene un enlace de contacto configurado.");
      return;
    }
    checkingOut = true; button.disabled = true; button.setAttribute("aria-busy", "true"); message("Preparando tu pedido…");
    flushAnalytics();
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/cart-checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ partnerCode: window.PAGOSYA_PRIVACY?.analyticsAllowed(config.slug) ? partnerCode : undefined, creditCode, recoveryToken: window.PAGOSYA_RETENTION_STATE?.token || undefined, ...(fulfillmentMethod === 'delivery' ? { shippingAddress, shippingDestination: shippingDestination(panel), shippingDepartment: shippingDepartment(panel) } : {}), ...(store.shippingEnabled ? { fulfillmentMethod, shippingZoneId, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined } : {}), items: checkoutItems(), ...(subscriptionLine ? { subscriptionConsent: true } : {}), ...(locationId ? { locationId, fulfillmentMethod } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "No pudimos preparar el pedido.");
      if (hosted) return;
      if (typeof result.clientSecret !== "string" || !result.clientSecret) throw new Error("El checkout no devolvió una sesión válida.");
      const destination = new URL(`/s/${encodeURIComponent(config.slug)}`, config.checkoutOrigin);
      destination.hash = `client_secret=${encodeURIComponent(result.clientSecret)}`;
      window.location.assign(destination.href);
    } catch (error) { checkingOut = false; message(error.message); button.disabled = false; button.removeAttribute("aria-busy"); }
  }
