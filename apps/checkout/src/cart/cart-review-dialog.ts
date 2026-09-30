/** The cart review dialog: line items, fulfillment choice, promo code, and continuing to payment. */
import { pickedExtrasLabel, parseCartItemKey, cartItemKey } from "../cart-state";
import { refreshStoreSeo } from "../store-seo";
import { privacy } from "../privacy";
import { mountCartQuote } from "../cart-quote";
import { readDestinationDraft } from "../shipping-destination";
import { Store, assetUrl, quotePromoCode, submitStoreLead, checkoutCart, API_BASE_URL } from "../api";
import { state } from "../state";
import { storePreviewMode, storeEditorMode } from "../preview-mode";
import { app } from "../ui/app";
import { activePromoForStore, cartTotal, promoDiscountAmount, optionStock, productStockLimit, productCartQuantity, optionCartQuantity, stockStatus, remainingStock, itemVariants, itemExtras, cartCount, saveCart, cart } from "./cart";
import { storefrontRouteFromLocation } from "../storefront/routes";
import { locationCanFulfillCart, locationOpeningState } from "../storefront/locations";
import { escapeHtml, initials, formatAmount } from "../ui/html";
import { ICON_X, ICON_EXTERNAL, ICON_LOCK, ICON_WHATSAPP, ICON_CHECK } from "../ui/icons";
import { loadLeadEmail, saveLeadEmail, customerContact } from "../checkout/customer-contact";
import { enterPaymentFlow } from "../checkout/payment-form";
import { suppressStoreViewForMerchant } from "../storefront/merchant-views";
import { cartLineEntries, cartRecommendationEntries, cartFulfillmentState, cartModeNote, cartActionLabel } from "./cart-review";
import { renderStoreRoute, navigateWithinStore } from "../storefront/navigation";
import { updateCartBar } from "./cart-bar";
import { cadenceLabel, subscriptionConsentText, subscriptionPriceText, subscriptionRecurringAmount } from "./subscription-choice";


export function renderCartReviewDialog(dialog: HTMLDialogElement, slug: string, store: Store): void {
  const previousAddress = dialog.querySelector<HTMLInputElement>("[data-address]")?.value || "";
  const previousDestination = readDestinationDraft(dialog);
  const currency = store.items[0]?.currency || "BOB";
  const pricedLines = cartLineEntries(store);
  const freeOrder = store.checkoutMode === "payment" && pricedLines.length > 0 && pricedLines.every((line) => line.unitAmount * line.quantity === 0);
  // A fully free cart goes through the contact/lead path, which creates no subscription: its lines are one-time.
  const lines = freeOrder ? pricedLines.map((line) => ({ ...line, cadence: undefined })) : pricedLines;
  const promo = activePromoForStore(store);
  const subtotal = cartTotal(store.items);
  const promoDiscount = promoDiscountAmount(store);
  const checkoutTotal = subtotal - promoDiscount;
  const contactCheckout = store.checkoutMode === "external" || freeOrder;
  const emailOnlyLeadCheckout = store.checkoutMode === "external";
  const recommendations = cartRecommendationEntries(store);
  const fulfillment = cartFulfillmentState(store, lines);
  const subscriptionCadence = lines.find((line) => line.cadence)?.cadence;
  const fulfillmentHtml = fulfillment.locations.length ? `<section class="cart-fulfillment" aria-labelledby="cart-fulfillment-title">
    <div class="cart-fulfillment-head"><h3 id="cart-fulfillment-title">¿Cómo recibirás tu pedido?</h3><p>Solo mostramos ubicaciones con stock para todo tu carrito.</p></div>
    <div class="cart-fulfillment-methods" role="radiogroup" aria-label="Modalidad de entrega">
      ${fulfillment.locations.some((location) => location.pickupEnabled) ? `<label><input type="radio" name="fulfillmentMethod" value="pickup" ${fulfillment.method === "pickup" ? "checked" : ""}><span>Retiro</span></label>` : ""}
      ${fulfillment.locations.some((location) => location.deliveryEnabled) ? `<label><input type="radio" name="fulfillmentMethod" value="delivery" ${fulfillment.method === "delivery" ? "checked" : ""}><span>Entrega</span></label>` : ""}
    </div>
    <div class="cart-fulfillment-locations" role="radiogroup" aria-label="Ubicación que preparará el pedido">
      ${fulfillment.locations.map((location) => {
        const supportsMethod = fulfillment.method === "pickup" ? location.pickupEnabled : location.deliveryEnabled;
        const hasStock = locationCanFulfillCart(location, lines);
        const opening = locationOpeningState(location);
        const disabled = !supportsMethod || !hasStock;
        return `<label class="cart-fulfillment-location${disabled ? " is-unavailable" : ""}">
          <input type="radio" name="fulfillmentLocation" value="${escapeHtml(location.id)}" ${location.id === state.selectedFulfillmentLocationId ? "checked" : ""} ${disabled ? "disabled" : ""}>
          <span><strong>${escapeHtml(location.name)}</strong>${location.address ? `<small>${escapeHtml(location.address)}</small>` : ""}<small>${!supportsMethod ? `No ofrece ${fulfillment.method === "delivery" ? "entrega" : "retiro"}` : !hasStock ? "Sin stock suficiente para este carrito" : opening.label}</small></span>
        </label>`;
      }).join("")}
    </div>
    ${fulfillment.available.length ? "" : '<p class="cart-fulfillment-empty" role="alert">Ninguna ubicación puede preparar todo el carrito con esta modalidad. Prueba la otra opción o ajusta cantidades.</p>'}
  </section>` : "";
  dialog.innerHTML = `
    <div class="cart-review-shell">
      <header class="cart-review-head">
        <div><h2 id="cart-review-title">Mi carrito</h2><p>${escapeHtml(cartModeNote(store, freeOrder))}</p></div>
        <button type="button" class="cart-review-close" aria-label="Cerrar carrito">${ICON_X}</button>
      </header>
      <div class="cart-review-scroll" data-retention-cart-host>
        <div class="cart-review-lines">
          ${lines.map(({ key, product, variant, extras, quantity, unitAmount, cadence }) => {
            const image = assetUrl(product.imageUrls[0] || null);
            const available = optionStock(product, variant);
            const productLimit = productStockLimit(product);
            const atProductLimit = productLimit !== null && productCartQuantity(product.id) >= productLimit;
            const atOptionLimit = available !== null && optionCartQuantity(product.id, variant?.id) >= available;
            const visibleStock = stockStatus(remainingStock(product, variant), store.showLowStockToCustomers === true);
            return `<article class="cart-review-line" data-cart-key="${escapeHtml(key)}">
              ${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span class="cart-review-placeholder" aria-hidden="true">${escapeHtml(initials(product.name))}</span>`}
              <div class="cart-review-line-copy"><strong>${escapeHtml(product.name)}</strong>${variant ? `<span>${escapeHtml(variant.name)}</span>` : ""}${extras.length ? `<span class="cart-line-extras">${escapeHtml(pickedExtrasLabel(extras))}</span>` : ""}<small>${cadence && subscriptionRecurringAmount(product, variant, extras, cadence) !== unitAmount ? escapeHtml(subscriptionPriceText(unitAmount, subscriptionRecurringAmount(product, variant, extras, cadence), product.currency, cadence)) : `${formatAmount(unitAmount, product.currency)} c/u`}</small>${cadence ? `<small class="cart-line-subscription">${escapeHtml(cadenceLabel(cadence).replace(/^./, (letter) => letter.toUpperCase()))} · puedes cancelar cuando quieras</small>` : ""}${visibleStock ? `<small class="cart-line-stock${visibleStock.exhausted ? " out" : ""}">${visibleStock.label}</small>` : ""}</div>
              <div class="cart-review-quantity" aria-label="Cantidad de ${escapeHtml(product.name)}">
                <button type="button" data-cart-change="-1" aria-label="Quitar una unidad">−</button><span>${quantity}</span><button type="button" data-cart-change="1" aria-label="Agregar una unidad" ${atProductLimit || atOptionLimit ? "disabled" : ""}>+</button>
              </div>
              <strong class="cart-review-line-total">${formatAmount(unitAmount * quantity, product.currency)}</strong>
              <button type="button" class="cart-review-remove" aria-label="Quitar ${escapeHtml(product.name)} del carrito">Quitar</button>
            </article>`;
          }).join("")}
        </div>
        ${store.checkoutMode === "payment" && !contactCheckout ? `<form class="promo-code-form" id="promo-code-form">
          <div><label for="promo-code-input">Código promocional</label><span>${promo ? `Aplicado: ${escapeHtml(promo.code)}` : "¿Tienes un código? Escríbelo aquí."}</span></div>
          <div class="promo-code-entry">
            <input id="promo-code-input" name="promoCode" value="${escapeHtml(promo?.code || "")}" maxlength="32" autocomplete="off" autocapitalize="characters" placeholder="VERANO20" ${promo ? "readonly" : "required"}>
            ${promo ? `<button class="promo-code-remove" type="button">Quitar</button>` : `<button type="submit">Aplicar</button>`}
          </div>
          <p class="promo-code-status${promo ? " is-applied" : ""}" role="status" aria-live="polite">${promo ? `${promo.discountType === "PERCENT" ? `${promo.discountValue}%` : formatAmount(promo.discountValue, currency)} de descuento` : ""}</p>
        </form>` : ""}
        ${recommendations.length ? `<section class="cart-recommendations" aria-labelledby="cart-recommendations-title">
          <div class="cart-recommendations-head"><h3 id="cart-recommendations-title">Súmale algo más</h3><span>Seleccionado para tu pedido</span></div>
          <div class="cart-recommendations-rail">
            ${recommendations.map(({ product, image, imagePosition }) => {
              const needsConfiguration = itemVariants(product).length > 0 || itemExtras(product).length > 0;
              return `<button class="cart-recommendation" type="button" data-recommend-product="${escapeHtml(product.id)}" data-needs-configuration="${needsConfiguration}" aria-label="${needsConfiguration ? "Elegir opciones para" : "Agregar"} ${escapeHtml(product.name)}">
              <img src="${escapeHtml(image)}" alt="" style="object-position:${imagePosition}">
            </button>`;
            }).join("")}
          </div>
        </section>` : ""}
        ${fulfillmentHtml}
        ${store.checkoutMode === "payment" && !contactCheckout && (store.shippingEnabled || store.bundlesEnabled || store.creditsEnabled) ? '<section class="cart-fulfillment" data-cart-quote></section>' : ""}
        ${contactCheckout ? `<form class="lead-capture-form" id="store-lead-form">
          <div class="lead-capture-heading"><h3>${emailOnlyLeadCheckout ? "¿Cuál es tu Gmail o correo?" : "¿Cómo te contactamos?"}</h3><p>${emailOnlyLeadCheckout ? "La tienda recibirá este correo junto con tu selección. No se realizará ningún cobro." : `La tienda recibirá tus datos y el detalle de los productos que elegiste. ${freeOrder ? "El total es Bs 0 y no se abrirá una pantalla de pago." : "No se realizará ningún cobro."}`}</p></div>
          <div class="lead-capture-grid">
            ${emailOnlyLeadCheckout ? "" : `<div class="field"><label for="lead-name">Nombre completo</label><input id="lead-name" name="name" autocomplete="name" maxlength="120" required></div>`}
            <div class="field${emailOnlyLeadCheckout ? " lead-capture-message" : ""}"><label for="lead-email">Gmail o correo electrónico</label><input id="lead-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="tu@gmail.com" value="${escapeHtml(loadLeadEmail(store.storeId))}" required></div>
            ${emailOnlyLeadCheckout ? "" : `<div class="field"><label for="lead-phone">WhatsApp</label><input id="lead-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" placeholder="+591 71234567" required></div><div class="field lead-capture-message"><label for="lead-message">Mensaje (opcional)</label><textarea id="lead-message" name="message" maxlength="600" rows="3" placeholder="Consulta, ciudad o mejor horario para contactarte"></textarea></div>`}
          </div>
        </form>` : ""}
      </div>
      <footer class="cart-review-footer">
        ${subscriptionCadence && store.checkoutMode === "payment" && !contactCheckout ? `<label class="subscription-consent"><input type="checkbox" name="subscriptionConsent"> <span>${escapeHtml(subscriptionConsentText(subscriptionCadence))}</span></label>` : ""}
        ${promo ? `<div class="cart-review-subtotal"><span>Subtotal</span><span>${formatAmount(subtotal, currency)}</span></div><div class="cart-review-discount"><span>Código ${escapeHtml(promo.code)}</span><strong>−${formatAmount(promoDiscount, currency)}</strong></div>` : ""}
        <div class="cart-review-total"><span>${cartCount()} ${cartCount() === 1 ? "producto" : "productos"}</span><strong>${formatAmount(checkoutTotal, currency)}</strong></div>
        <p>${freeOrder ? `${ICON_EXTERNAL}<span>Pedido gratis: pagosYa enviará la selección a la tienda</span>` : store.checkoutMode === "payment" ? `${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span>` : store.checkoutMode === "whatsapp" ? `${ICON_WHATSAPP}<span>No se realizará ningún cobro en pagosYa</span>` : `${ICON_EXTERNAL}<span>pagosYa enviará tu correo y selección a la tienda</span>`}</p>
        <button type="${contactCheckout ? "submit" : "button"}" ${contactCheckout ? 'form="store-lead-form"' : ""} class="primary" id="cart-confirm" ${(fulfillment.locations.length && !fulfillment.selectedLocation) || (subscriptionCadence && store.checkoutMode === "payment" && !contactCheckout) ? "disabled" : ""}>${escapeHtml(cartActionLabel(store, freeOrder))}</button>
        <span class="cart-checkout-error" role="alert" hidden></span>
      </footer>
    </div>`;

  (window as any).PAGOSYA_RETENTION_REFRESH?.();
  const quoteRoot = dialog.querySelector<HTMLElement>('[data-cart-quote]');
  const quotedFulfillment = quoteRoot ? mountCartQuote(quoteRoot, {
    slug, items: lines.map(line => ({ paymentLinkId: line.product.id, variantId: line.variant?.id, extraIds: line.extras.map(extra => extra.id), quantity: line.quantity, ...(line.cadence ? { subscriptionCadence: line.cadence } : {}) })),
    credits: store.creditsEnabled, promoCode: promo?.code, shipping: store.shippingEnabled === true && !lines.every(line => line.product.fulfillmentType === 'DIGITAL'), pickup: store.shippingPickupEnabled !== false,
    fulfillment: fulfillment.selectedLocation && fulfillment.method ? { locationId: fulfillment.selectedLocation.id, fulfillmentMethod: fulfillment.method } : undefined,
    address: previousAddress, carriers: store.shippingCarriersEnabled === true, destination: previousDestination, money: formatAmount,
    onQuote: quote => { const total = dialog.querySelector('.cart-review-total strong'); if (total) total.textContent = formatAmount(quote.amount, quote.currency); },
  }) : undefined;
  dialog.querySelector<HTMLButtonElement>(".cart-review-close")?.addEventListener("click", () => dialog.close());
  dialog.querySelector<HTMLFormElement>("#promo-code-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>("#promo-code-input")!;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = form.querySelector<HTMLElement>(".promo-code-status")!;
    const code = input.value.trim().toUpperCase();
    button.disabled = true;
    button.textContent = "Validando…";
    status.textContent = "";
    try {
      const quote = await quotePromoCode(slug, code);
      state.appliedPromo = { storeId: store.storeId, ...quote };
      renderCartReviewDialog(dialog, slug, store);
      requestAnimationFrame(() => dialog.querySelector<HTMLButtonElement>(".promo-code-remove")?.focus());
    } catch (error) {
      button.disabled = false;
      button.textContent = "Aplicar";
      status.textContent = (error as Error).message;
      input.focus();
      input.select();
    }
  });
  dialog.querySelector<HTMLButtonElement>(".promo-code-remove")?.addEventListener("click", () => {
    state.appliedPromo = null;
    renderCartReviewDialog(dialog, slug, store);
    requestAnimationFrame(() => dialog.querySelector<HTMLInputElement>("#promo-code-input")?.focus());
  });
  dialog.querySelectorAll<HTMLInputElement>('input[name="fulfillmentMethod"]').forEach((input) => input.addEventListener("change", () => {
    state.selectedFulfillmentMethod = input.value as "pickup" | "delivery";
    state.selectedFulfillmentLocationId = null;
    renderCartReviewDialog(dialog, slug, store);
  }));
  dialog.querySelectorAll<HTMLInputElement>('input[name="fulfillmentLocation"]').forEach((input) => input.addEventListener("change", () => {
    state.selectedFulfillmentLocationId = input.value;
    renderCartReviewDialog(dialog, slug, store);
  }));
  dialog.querySelectorAll<HTMLElement>(".cart-review-line").forEach((row) => {
    const key = row.dataset.cartKey!;
    const rerender = () => {
      saveCart(store);
      if (cartCount() === 0) {
        dialog.close();
        renderStoreRoute(slug, store, { focusPromotion: false });
      } else renderCartReviewDialog(dialog, slug, store);
    };
    row.querySelector<HTMLButtonElement>(".cart-review-remove")?.addEventListener("click", () => { cart.delete(key); rerender(); });
    row.querySelectorAll<HTMLButtonElement>("[data-cart-change]").forEach((button) => button.addEventListener("click", () => {
      const change = Number(button.dataset.cartChange);
      if (change > 0) {
        const { paymentLinkId, variantId } = parseCartItemKey(key);
        const product = store.items.find((item) => item.id === paymentLinkId);
        const variant = product && itemVariants(product).find((candidate) => candidate.id === variantId);
        if (!product || remainingStock(product, variant) === 0) return;
      }
      const next = (cart.get(key) ?? 0) + change;
      if (next <= 0) cart.delete(key);
      else cart.set(key, next);
      rerender();
    }));
  });

  dialog.querySelectorAll<HTMLButtonElement>("[data-recommend-product]").forEach((button) => button.addEventListener("click", () => {
    const product = store.items.find((item) => item.id === button.dataset.recommendProduct);
    if (!product) return;
    if (button.dataset.needsConfiguration === "true") {
      dialog.close();
      navigateWithinStore(slug, store, product.id);
      return;
    }
    if (remainingStock(product, undefined) === 0) return;
    const key = cartItemKey(product.id);
    cart.set(key, (cart.get(key) ?? 0) + 1);
    saveCart(store);
    renderCartReviewDialog(dialog, slug, store);
  }));

  if (contactCheckout) {
    dialog.querySelector<HTMLFormElement>("#store-lead-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const confirmButton = dialog.querySelector<HTMLButtonElement>("#cart-confirm")!;
      const checkoutError = dialog.querySelector<HTMLElement>(".cart-checkout-error")!;
      const formData = new FormData(form);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const phone = String(formData.get("phone") || "").trim();
      if (!emailOnlyLeadCheckout && phone.replace(/\D/g, "").length < 7) {
        checkoutError.textContent = "Escribe un número de WhatsApp válido, con al menos 7 dígitos.";
        checkoutError.hidden = false;
        form.querySelector<HTMLInputElement>("#lead-phone")?.focus();
        return;
      }
      checkoutError.hidden = true;
      confirmButton.disabled = true;
      confirmButton.setAttribute("aria-busy", "true");
      confirmButton.textContent = "Enviando tus datos…";
      try {
        const items = [...cart.entries()].map(([key, quantity]) => {
          const selected = parseCartItemKey(key);
          return { paymentLinkId: selected.paymentLinkId, ...(selected.variantId ? { variantId: selected.variantId } : {}), ...(selected.extraIds.length ? { extraIds: selected.extraIds } : {}), quantity };
        });
        const selectedFulfillment = fulfillment.selectedLocation && fulfillment.method
          ? { locationId: fulfillment.selectedLocation.id, fulfillmentMethod: fulfillment.method }
          : undefined;
        const contact = {
          email,
          ...(String(formData.get("name") || "").trim() ? { name: String(formData.get("name")).trim() } : {}),
          ...(phone ? { phone } : {}),
          ...(String(formData.get("message") || "").trim() ? { message: String(formData.get("message")).trim() } : {}),
        };
        if (selectedFulfillment) await submitStoreLead(slug, contact, items, selectedFulfillment);
        else await submitStoreLead(slug, contact, items);
        saveLeadEmail(store.storeId, email);
        cart.clear();
        saveCart(store);
        dialog.innerHTML = `<div class="lead-capture-success"><div class="status success">${ICON_CHECK}<span>Solicitud enviada</span></div><h2>La tienda ya recibió tu solicitud</h2><p>Enviamos tu correo y los productos seleccionados. La tienda podrá responderte por email.</p><button type="button" class="primary" id="lead-success-close">Cerrar</button></div>`;
        dialog.querySelector<HTMLButtonElement>("#lead-success-close")?.addEventListener("click", () => dialog.close());
        dialog.querySelector<HTMLButtonElement>("#lead-success-close")?.focus();
      } catch (err) {
        confirmButton.disabled = false;
        confirmButton.removeAttribute("aria-busy");
        confirmButton.textContent = cartActionLabel(store, freeOrder);
        checkoutError.textContent = `No pudimos enviar tus datos: ${(err as Error).message}. Intenta nuevamente.`;
        checkoutError.hidden = false;
      }
    });
    return;
  }

  const consentBox = dialog.querySelector<HTMLInputElement>('input[name="subscriptionConsent"]');
  consentBox?.addEventListener("change", () => {
    const confirm = dialog.querySelector<HTMLButtonElement>("#cart-confirm");
    if (confirm) confirm.disabled = !consentBox.checked || Boolean(fulfillment.locations.length && !fulfillment.selectedLocation);
  });

  dialog.querySelector<HTMLButtonElement>("#cart-confirm")?.addEventListener("click", async () => {
    const confirmButton = dialog.querySelector<HTMLButtonElement>("#cart-confirm")!;
    const checkoutError = dialog.querySelector<HTMLElement>(".cart-checkout-error")!;
    checkoutError.hidden = true;
    checkoutError.textContent = "";
    state.activeStoreAnalytics?.record({ type: 'pay_click' });
    if (fulfillment.locations.length && (!fulfillment.selectedLocation || !fulfillment.method)) {
      checkoutError.textContent = "Elige una ubicación con stock para continuar.";
      checkoutError.hidden = false;
      return;
    }
    if (store.checkoutMode === "whatsapp") {
      const phone = (store.contactPhone || "").replace(/\D/g, "");
      if (phone.length < 7 || phone.length > 15) {
        checkoutError.textContent = "Esta tienda todavía no configuró un número de WhatsApp válido.";
        checkoutError.hidden = false;
        return;
      }
      const messageLines = cartLineEntries(store).map(({ product, variant, extras, quantity, unitAmount }) =>
        `• ${product.name}${variant ? ` (${variant.name})` : ""}${extras.length ? ` + ${pickedExtrasLabel(extras, ", ")}` : ""} x${quantity} - ${formatAmount(unitAmount * quantity, product.currency)}`,
      );
      const destination = store.storeName.trim() ? ` en ${store.storeName.trim()}` : "";
      const fulfillmentLines = fulfillment.selectedLocation && fulfillment.method
        ? ["", `${fulfillment.method === "delivery" ? "Entrega desde" : "Retiro en"}: ${fulfillment.selectedLocation.name}`]
        : [];
      const message = [`Hola, quiero hacer este pedido${destination}:`, "", ...messageLines, ...fulfillmentLines, "", `Total: ${formatAmount(cartTotal(store.items), currency)}`].join("\n");
      state.activeStoreAnalytics?.record({ type: 'whatsapp_click' }); state.activeStoreAnalytics?.flush();
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      return;
    }
    confirmButton.disabled = true;
    confirmButton.setAttribute("aria-busy", "true");
    confirmButton.textContent = "Abriendo pago…";
    try {
      const items = [...cart.entries()].map(([key, quantity]) => {
        const selected = parseCartItemKey(key);
        return { paymentLinkId: selected.paymentLinkId, ...(selected.variantId ? { variantId: selected.variantId } : {}), ...(selected.extraIds.length ? { extraIds: selected.extraIds } : {}), ...(selected.cadence ? { subscriptionCadence: selected.cadence } : {}), quantity };
      });
      const activePromo = activePromoForStore(store);
      const selectedFulfillment = quotedFulfillment ? quotedFulfillment() : fulfillment.selectedLocation && fulfillment.method
        ? { locationId: fulfillment.selectedLocation.id, fulfillmentMethod: fulfillment.method }
        : undefined;
      if (selectedFulfillment?.fulfillmentMethod) { state.activeStoreFunnel?.track('delivery_selected', selectedFulfillment.fulfillmentMethod); state.activeStoreAnalytics?.record({ type: 'checkout_step', step: 'delivery' }); }
      const result = await (subscriptionCadence
        ? checkoutCart(slug, items, activePromo?.code, selectedFulfillment, state.activeStoreFunnel?.token(), true)
        : checkoutCart(slug, items, activePromo?.code, selectedFulfillment, state.activeStoreFunnel?.token()));
      customerContact.deliveryRequested = result.fulfillmentMethod === "delivery";
      state.activeOrderTrackingToken = result.trackingToken;
      state.linkHeader = { storeName: result.storeName, description: result.cartDescription, contactPhone: result.contactPhone, contactEmail: result.contactEmail };
      if (subscriptionCadence) { try { sessionStorage.setItem("pagosya_subscription_checkout", "1"); } catch { /* the hint is optional */ } }
      cart.clear();
      saveCart(store);
      dialog.close();
      state.activeStoreAnalytics?.record({ type: 'checkout_step', step: 'payment' }); state.activeStoreAnalytics?.flush();
      await enterPaymentFlow(result.clientSecret);
    } catch (err) {
      confirmButton.disabled = false;
      confirmButton.removeAttribute("aria-busy");
      confirmButton.textContent = cartActionLabel(store);
      checkoutError.textContent = `No se pudo abrir el pago: ${(err as Error).message}. Intenta nuevamente.`;
      checkoutError.hidden = false;
    }
  });
}

export function openCartReview(slug: string, store: Store, options: { preview?: boolean; allowEmpty?: boolean } = {}): void {
  if (cartCount() === 0 && !options.allowEmpty) return;
  if (!options.preview) { state.activeStoreFunnel?.track('checkout_started'); state.activeStoreAnalytics?.record({ type: 'checkout_step', step: 'review' }); }
  document.querySelector(".cart-review-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "cart-review-dialog";
  dialog.setAttribute("aria-labelledby", "cart-review-title");
  document.body.append(dialog);
  if (typeof dialog.close !== "function") {
    dialog.close = () => {
      dialog.removeAttribute("open");
      dialog.dispatchEvent(new Event("close"));
    };
  }
  renderCartReviewDialog(dialog, slug, store);
  dialog.addEventListener("close", () => {
    dialog.remove();
    updateCartBar(store, store.items[0]?.currency || "BOB");
  }, { once: true });
  if (options.preview) {
    dialog.classList.add("is-preview-open");
    dialog.setAttribute("open", "");
  } else {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLButtonElement>(".cart-review-close")?.focus();
  }
}

export function bindCartCheckout(slug: string, store: Store): void {
  if (!storePreviewMode) void refreshStoreSeo(slug, storefrontRouteFromLocation().productId || undefined);
  privacy.mount(slug, { preview: storeEditorMode || suppressStoreViewForMerchant(slug) });
  const retentionWindow = window as any;
  const currentRoot = app.firstElementChild;
  void retentionWindow.PAGOSYA_RETENTION_MOUNT?.({
    slug, apiBaseUrl: API_BASE_URL, preview: storeEditorMode || suppressStoreViewForMerchant(slug),
    isCurrent: () => app.firstElementChild === currentRoot,
    getCart: () => cartLineEntries(store).map(line => ({ paymentLinkId: line.product.id, variantId: line.variant?.id, extraIds: line.extras.map(extra => extra.id), quantity: line.quantity })),
    restoreCart: (items: Array<{ paymentLinkId: string; variantId?: string; extraIds?: string[]; quantity: number }>) => {
      cart.clear();
      for (const item of items) {
        const product = store.items.find(p => p.id === item.paymentLinkId);
        if (!product || (item.variantId && !product.variants.some(v => v.id === item.variantId))) continue;
        const quantity = Math.min(item.quantity, productStockLimit(product) ?? 99);
        if (quantity > 0) cart.set(cartItemKey(item.paymentLinkId, item.variantId, item.extraIds), quantity);
      }
      saveCart(store); updateCartBar(store, store.items[0]?.currency || 'BOB');
    },
  });
  app.querySelectorAll<HTMLButtonElement>("#cart-pay, .store-header-cart").forEach((button) => {
    button.addEventListener("click", () => openCartReview(slug, store));
  });
}
