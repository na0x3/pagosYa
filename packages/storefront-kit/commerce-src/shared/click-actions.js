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
    if (button.hasAttribute('data-box-pick')) {
      const group = boxGroup(selectedProduct), id = button.dataset.boxPick;
      if (!group) return;
      if (Number(button.dataset.step) > 0) { if (selectedPicks.length < group.count) selectedPicks.push(id); }
      else if (selectedPicks.includes(id)) selectedPicks.splice(selectedPicks.lastIndexOf(id), 1);
      updateBox();
      // The clicked control can become disabled (box full, none left); keep keyboard users in the picker.
      const again = detail.querySelector(`[data-box-pick="${CSS.escape(id)}"][data-step="${button.dataset.step}"]`);
      (again && !again.disabled ? again : detail.querySelector('[data-box-add]:not(:disabled)') || detail.querySelector('[data-box-progress]'))?.focus?.();
      return;
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
      const sets = matches.map(variantPhotos);
      const agreed = sets.length && sets.every(set => set.length && JSON.stringify(set) === JSON.stringify(sets[0])) ? sets[0] : [];
      const nextGallery = agreed.length > 1 ? agreed : null;
      const changed = JSON.stringify(nextGallery) !== JSON.stringify(activeGallery);
      activeGallery = nextGallery;
      if (changed) drawGallery(currentGallery());
      if (!activeGallery) showImage(agreed.length === 1 ? currentGallery().indexOf(agreed[0]) : 0);
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
    if (button.hasAttribute("data-bundle-add") && ready) {
      const bundle = (Array.isArray(store.bundles) ? store.bundles : []).find(candidate => candidate.id === button.dataset.bundleAdd), entries = bundleEntries(bundle);
      if (!bundle || !entries.length || entries.some(entry => !entry.p || !simpleProduct(entry.p) || remaining(entry.p) < entry.quantity)) { message("Este paquete ya no está disponible completo."); return; }
      track('add_to_cart', undefined, { value: entries.reduce((sum, entry) => sum + price(entry.p) * entry.quantity, 0), currency: entries[0].p.currency });
      for (const entry of entries) analytics('add_to_cart', { productId: entry.p.id });
      for (const entry of entries) cart.set(lineKey(entry.p.id), (cart.get(lineKey(entry.p.id)) || 0) + entry.quantity);
      renderCart(); message(`${bundle.name} añadido a ${ADDED_TO}.`);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${bundle.name} añadido a ${ADDED_TO}.`;
      return;
    }
    if (button.hasAttribute("data-add") && ready) {
      // The product page's buy button follows the shopper's current choice, not a stale key.
      const choosing = button.classList.contains('product-detail__buy') && selectedProduct && detail.querySelector('[data-subscription-choice]');
      const chosenVariant = choosing && optionGroups(selectedProduct) ? selectedVariant() : undefined;
      const key = choosing && !(optionGroups(selectedProduct) && !chosenVariant) ? lineKey(selectedProduct.id, chosenVariant?.id, selectedCadence()) : button.dataset.add, line = cartLine(key);
      if (!line) return;
      const conflict = cadenceConflict(line.cadence);
      if (conflict) {
        showCadenceConflict(line.cadence); message(conflict);
        if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = conflict;
        return;
      }
      const { p, variant, name } = line;
      const quantity = cart.get(key) || 0;
      if (remaining(p, variant, line.picks) <= 0) { message("Ya añadiste la cantidad disponible."); return; }
      track('add_to_cart', undefined, { value: line.amount, currency: line.p.currency });
      analytics('add_to_cart', { productId: p.id });
      const units = button.classList.contains('product-detail__buy') ? Math.min(selectedQuantity, remaining(p, variant, line.picks)) : 1;
      cart.set(key, quantity + units); renderCart(); message(`${name} añadido a ${ADDED_TO}.`); addedFeedback({ ...p, name }, button, event.detail === 0);
      if (MOTIFS.length) playMotifs(p);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${name} añadido a ${ADDED_TO}.`;
    }
    if (button.hasAttribute("data-remove-line")) { cart.delete(button.dataset.removeLine); renderCart(); message("Pedido actualizado."); return; }
    if (button.hasAttribute("data-remove")) { const id = button.dataset.remove; const quantity = cart.get(id) || 0; if (quantity > 1) cart.set(id, quantity - 1); else cart.delete(id); renderCart(); message("Pedido actualizado."); }
    if (button.hasAttribute("data-checkout")) openCheckout(button);
    if (button.hasAttribute('data-shipping-quote')) { void shippingQuote(button.closest('[data-pagosya-cart]')); return; }
    if (button.hasAttribute("data-pay")) void checkout(button);
    if (button.hasAttribute("data-retry")) void load();
  });
