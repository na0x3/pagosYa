  function renderCart() {
    if (hosted && ready) notifyHostedCart();
    else if (!preview && ready) {
      try {
        const value = JSON.stringify(cartItems());
        const storage = config.demo ? sessionStorage : localStorage;
        if (storage.getItem(cartKey) !== value) storage.setItem(cartKey, value);
      } catch { /* The current page still works when storage is unavailable. */ }
    }
    document.querySelectorAll("[data-pagosya-catalog] [data-add], [data-pagosya-product] [data-add]").forEach((button) => {
      const line = cartLine(button.dataset.add);
      button.disabled = !ready || checkingOut || !line || remaining(line.p, line.variant, line.picks) <= 0;
    });
    let total = 0, count = 0, savings = 0;
    const rows = [];
    const shellRows = [];
    const packLines = [];
    const lineViews = [];
    for (const [id, quantity] of cart) {
      const line = cartLine(id);
      if (!line) continue;
      const { p, variant, name, amount } = line;
      total += amount * quantity; count += quantity;
      packLines.push({ p, amount, quantity, cadence: line.cadence });
      // Each line shows its photo, chosen option, unit price and any active discount.
      const image = safeUrl(variant?.imageUrl) || galleryImages(p)[0];
      const option = [variant ? variant.name : line.extras ? pickLabel(line.extras) : '', line.cadence ? `Suscripción · ${CADENCE_TEXT[line.cadence]}` : ''].filter(Boolean).join(' · ');
      const listUnit = (variant ? variant.amount : p.amount) + (line.extras || []).reduce((sum, e) => sum + e.amount, 0);
      const saved = listUnit > amount ? (listUnit - amount) * quantity : 0;
      savings += saved;
      const laterUnit = line.cadence ? subscriptionRecurringPrice(p, variant, line.cadence) : amount;
      const later = laterUnit !== amount ? `hoy, luego ${money(laterUnit, p.currency)} / ${CADENCE_TEXT[line.cadence]}` : '';
      const unitCopy = quantity > 1 || saved || later ? `<p class="order-item__unit">${money(amount, p.currency)} ${later || 'c/u'}${saved ? ` <s>${money(listUnit, p.currency)}</s>` : ''}</p>` : '';
      const few = Number.isInteger(p.stock) && p.stock > 0 && p.stock <= 5 ? `<p class="order-item__stock">${p.stock === 1 ? 'Última unidad' : `Últimas ${p.stock} unidades`}</p>` : '';
      rows.push(`<li class="order-item" data-part="cart-line"${image ? ' data-has-image' : ''}>${image ? `<img class="order-item__photo" data-part="cart-line-media" src="${escape(image)}"${responsiveAttrs(image, "72px")} alt="" loading="lazy" style="object-position:${escape(imagePosition(p, image))}" />` : ''}<div class="order-item__body"><div class="order-item__head"><strong>${escape(p.name)}</strong><span>${money(amount * quantity, p.currency)}</span></div>${option ? `<p class="order-item__option">${escape(option)}</p>` : ''}${unitCopy}${few}<div class="quantity"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(name)}" ${checkingOut || remaining(p, variant, line.picks) <= 0 ? "disabled" : ""}>+</button></div></div></li>`);
      lineViews.push({ id, p, name, amount, quantity, image, option,
        unit: quantity > 1 || saved || later ? `${money(amount, p.currency)} ${later || 'c/u'}${saved ? ` · antes ${money(listUnit, p.currency)}` : ''}` : '',
        stock: Number.isInteger(p.stock) && p.stock > 0 && p.stock <= 5 ? (p.stock === 1 ? 'Última unidad' : `Últimas ${p.stock} unidades`) : '' });
      const view = lineViews[lineViews.length - 1];
      shellRows.push(shellLineMarkup({ id, p, name, amount, quantity, image, option, unit: view.unit, stock: view.stock, canAdd: !checkingOut && remaining(p, variant, line.picks) > 0 }));
    }
    // Showcase commerce: a pack the shopper picked shows its saving here, as the checkout will price it.
    const packSaving = cartPackSaving(packLines);
    savings += packSaving; total -= packSaving;
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(count);
      if (!CONTROLS) return;
      // The badge hides at zero (controls.css); the plain label around it reads «Carrito, 1 producto» / «…, 2 productos».
      el.toggleAttribute('data-empty', count === 0);
      const unit = el.parentElement?.querySelector('[data-ctl-unit]');
      if (unit) unit.textContent = count === 1 ? ' producto' : ' productos';
    });
    document.querySelectorAll("[data-pagosya-cart]").forEach((el) => {
      const focused = el.contains(document.activeElement) ? document.activeElement : null;
      const focusedAction = focused?.hasAttribute('data-add') ? 'data-add' : focused?.hasAttribute('data-remove') ? 'data-remove' : focused?.hasAttribute('data-remove-line') ? 'data-remove-line' : null;
      const focusedId = focusedAction ? focused.getAttribute(focusedAction) : null;
      const remembered = el.hasAttribute("data-checkout-review") ? [...checkoutAnswers] : [];
      const answers = [...remembered, ...[...el.querySelectorAll('input:not([type=checkbox]),textarea')].map(field => [field.name, field.value])];
      const previousLocation = el.querySelector("[name=location]")?.value || checkoutAnswers.get("location");
      const previousMethod = el.querySelector("[name=method]")?.value || checkoutAnswers.get("method");
      delete el.dataset.discountedSubtotal;
      const previousCredit = el.querySelector('[name=creditCode]')?.value || '';
      const previousAddress = el.querySelector('[name=shippingAddress]')?.value || '';
      const consentChecked = el.querySelector('[name=subscriptionConsent]')?.checked === true;
      const review = el.hasAttribute("data-checkout-review");
      // Studio's separate payment-preview calculator currently accepts only
      // simple lines. Keep options and order review interactive without sending
      // unsupported variant carts to that calculator (or any real checkout).
      const previewOptions = preview && review && cartItems().some(item => item.variantId || item.extraIds);
      if (review && cart.size && ready) { track('checkout_started'); analytics('checkout_step', { step: 'review' }, 'step:review'); }
      const mode = review ? (["payment", "done"].includes(el.dataset.checkoutReview) ? el.dataset.checkoutReview : "review") : null;
      const payment = mode === "payment", done = mode === "done";
      const action = review ? done ? "data-shell-close" : payment ? "data-finish-demo" : "data-pay" : "data-checkout";
      const actionLabel = review ? done ? "Volver a la tienda" : payment ? "Completar prueba" : preview || config.demo ? "Continuar al pago de prueba" : store.checkoutMode === "whatsapp" ? "Pedir por WhatsApp" : store.checkoutMode === "external" ? "Continuar al contacto" : "Pagar con pagosYa" : "Continuar con mi pedido";
      el.innerHTML = `<ul class="${review ? "pya-co__lines order-items" : "order-items"}">${(review ? shellRows : rows).join("") || '<li class="order-empty">Tu pedido está vacío.<br>Explora los productos para comenzar.</li>'}</ul>${cartSuggestionsMarkup()}${review && !digitalOnlyCart() && store.locations?.length ? `<label class="order-field">Sucursal<select name="location">${store.locations.map((l) => `<option value="${escape(l.id)}">${escape(l.name)}</option>`).join("")}</select></label><label class="order-field">Entrega<select name="method"></select></label>` : review && !digitalOnlyCart() && store.shippingEnabled ? '<label class="order-field">Entrega<select name="method"></select></label>' : ""}${review && !digitalOnlyCart() && !store.shippingEnabled && store.locations?.length ? '<fieldset data-delivery-address hidden><legend>Entrega a domicilio</legend><label class="order-field">Dirección y referencia<textarea name="shippingAddress" rows="3" maxlength="300" autocomplete="street-address" placeholder="Zona, calle, número y una referencia"></textarea></label><p class="order-note">Podrás compartir tu ubicación actual al completar tus datos en el pago.</p></fieldset>' : ''}${!digitalOnlyCart() && store.shippingEnabled && review ? `<fieldset data-shipping><legend>Envío</legend>${store.shippingCarriersEnabled ? `${hosted ? departmentMarkup(checkoutAnswers) : destinationMarkup(checkoutAnswers)}<input type="hidden" name="shippingAddress" value="${escape(previousAddress)}">` : `<label class="order-field">Dirección<input name="shippingAddress" maxlength="300" autocomplete="street-address" value="${escape(previousAddress)}"></label>`}<label class="order-field">País de entrega (código de dos letras)<input name="shippingCountry" maxlength="2" placeholder="BO" autocomplete="country"></label><label class="order-field">Código postal<input name="shippingPostalCode" maxlength="20" autocomplete="postal-code"></label><button type="button" data-shipping-quote>Calcular envío</button><label class="order-field">Opción de envío<select name="shippingZoneId"><option value="">Calcula las opciones disponibles</option></select></label><p data-shipping-status role="status" aria-live="polite"></p></fieldset>` : ''}${review && store.creditsEnabled ? `<label class="order-field"><span class="pya-co__label">Tarjeta de regalo o saldo</span><input name="creditCode" maxlength="39" autocomplete="off" spellcheck="false" placeholder="Tarjeta de regalo o saldo" value="${escape(previousCredit)}"></label><button type="button" data-credit-apply>Aplicar saldo</button><p data-credit-status role="status"></p>` : ''}${savings > 0 ? `<div class="order-savings"><span>Ahorras</span><strong>${money(savings, products()[0]?.currency)}</strong></div>` : ''}<div class="order-total"><span>Subtotal</span><strong>${money(total, products()[0]?.currency)}</strong></div><p class="order-note">${review ? 'El total final se confirma al pagar.' : 'El total final se confirma en el checkout.'}</p>${review && (store.bundlesEnabled || store.creditsEnabled) ? '<p data-bundle-quote-status role="status"></p>' : ''}${review && !payment && subscriptionLineInCart() ? `<label class="commerce-consent"><input type="checkbox" name="subscriptionConsent"${consentChecked ? ' checked' : ''}> ${escape(consentText(subscriptionLineInCart().cadence))}</label>` : ''}${review ? `<button class="pya-co__pay" ${action} type="button" ${!done && (!ready || !count || checkingOut || previewOptions) ? "disabled" : ""}>${actionLabel}${done ? "" : `<span class="pya-co__pay-total" aria-hidden="true"></span>`}</button>` : `<button class="checkout-button" ${action} type="button" ${!ready || !count || checkingOut || previewOptions ? "disabled" : ""}>${actionLabel}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button>`}`;
      const lineTemplate = cartLineTemplate();
      if (lineTemplate && !review) applyLineTemplate(el, lineViews, lineTemplate);
      const panelTemplate = review ? null : cartTemplate();
      if (panelTemplate) applyCartTemplate(el, !count, panelTemplate);
      if (!count && PACK_MOTIFS.length && !review) placeEmptyMotif(el);
      if (hosted) secureFields(el, ['shippingAddress', 'creditCode'], 'Tu dirección y tu saldo se piden en el formulario seguro de pagosYa al continuar.');
      if (previewOptions) {
        const note = document.createElement('p'); note.className = 'order-note';
        note.textContent = 'Puedes revisar tus opciones aquí. El pago estará disponible en la tienda publicada.';
        el.append(note);
      }
      for (const [name, value] of answers) { const field = [...el.querySelectorAll('input,textarea')].find(field => field.name === name); if (field) field.value = value; }
      if (review) shapeShellReview(el, { mode, count, photo: checkoutPhoto(lineViews.find(view => view.image)?.image) });
      const select = el.querySelector("[name=location]");
      if (select && previousLocation && Array.from(select.options).some((o) => o.value === previousLocation)) select.value = previousLocation;
      updateMethods(el, previousMethod);
      if (review) mirrorChoices(el);
      const branchInfo = document.createElement('p'); branchInfo.className = 'order-note'; branchInfo.setAttribute('data-branch-address', '');
      el.querySelector('[name=method]')?.closest('label')?.after(branchInfo);
      select?.addEventListener("change", () => { updateMethods(el); if (review) mirrorChoices(el); updateShipping(el); });
      el.querySelector('[name=method]')?.addEventListener('change', () => { updateShipping(el); track('delivery_selected', el.querySelector('[name=method]')?.value); analytics('checkout_step', { step: 'delivery' }, 'step:delivery'); if (el.querySelector('[name=method]')?.value === 'delivery') void mountDestinationMap(el); });
      el.querySelector('[name=shippingZoneId]')?.addEventListener('change', () => void shippingQuote(el));
      // Re-quote only with a complete destination; a partial one would be rejected by the API.
      el.querySelector('[name=destDepartment]')?.addEventListener('change', () => { if (hosted) checkoutAnswers.set('destDepartment', el.querySelector('[name=destDepartment]').value); if (!shippingDestination(el) && !(hosted && shippingDepartment(el))) return; const rate = el.querySelector('[name=shippingZoneId]'); if (rate) rate.value = ''; void shippingQuote(el); });
      el.querySelectorAll('[name=shippingCountry],[name=shippingPostalCode]').forEach(field => field.addEventListener('input', () => updateShipping(el)));
      el.querySelector('[data-credit-apply]')?.addEventListener('click', () => void applyCredit(el));
      el.querySelector('[name=creditCode]')?.addEventListener('input', () => { el.dataset.creditReady = 'false'; el.querySelector('[data-credit-status]').textContent = 'Aplica el código para actualizar el total.'; });
      updateShipping(el);
      if (el.querySelector('[name=method]')?.value === 'delivery') void mountDestinationMap(el);
      if (review && ready && count && store.bundlesEnabled) void bundleQuote(el);
      if (review) syncShellTotals(el);
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
    updateBox();
    updateQuantity();
    // Totals and pay buttons were just re-rendered (and add buttons re-enabled): measure them again.
    guardContrastNow();
    queueReadableText();
    document.dispatchEvent(new CustomEvent("pagosya:cart-updated"));
  }
