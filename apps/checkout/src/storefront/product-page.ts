/** A product's own page: gallery, options and extras, stock, and adding to the cart. */
import { productOptionGroups, productOptionKind, optionValueAvailable, productOptionColor, matchingOptionVariant } from "../product-options";
import { cartItemKey, pickedExtrasLabel, pickGroups } from "../cart-state";
import { Store, assetUrl, StoreItem } from "../api";
import { postToParent } from "../postmessage";
import { state } from "../state";
import { storeEditorMode, storePreviewMode } from "../preview-mode";
import { app } from "../ui/app";
import { itemVariants, selectedVariantFor, selectedExtrasFor, optionStock, cart, itemExtras, productStockLimit, productCartQuantity, optionCartQuantity, productConfigurationComplete, selectedProductImageByItem, stockStatus, remainingStock, activeProductDiscount, discountRemainingLabel, discountedProductAmount, selectedOptionsByItem, selectedExtraIdsByItem, extraDisplayAmount, salePriceHtml, selectedUnitAmount, originalSelectedUnitAmount, selectedVariantByItem, saveCart } from "../cart/cart";
import { categoryIdFromLocation, categoryPageUrl, storeCatalogUrl, productPageUrl } from "./routes";
import { productImagePosition } from "./catalog";
import { escapeHtml, initials, formatAmount } from "../ui/html";
import { ICON_ARROW_LEFT, ICON_ARROW_RIGHT, ICON_LOCK, ICON_WHATSAPP, ICON_EXTERNAL } from "../ui/icons";
import { applyStoreTheme } from "./theme";
import { storefrontHeaderHtml, storeAnnouncementHtml, storefrontFooterHtml, bindStoreAnnouncementPlayback } from "./chrome";
import { previewBlueprintButton, bindPreviewBlueprints } from "../preview-editor/blueprints";
import { bindInternalStoreLinks, bindTimedDiscountSchedule } from "./navigation";
import { updateCartBar } from "../cart/cart-bar";
import { bindCartCheckout } from "../cart/cart-review-dialog";


export function renderProductPage(slug: string, store: Store, productId: string): void {
  if (store.items.some(item => item.id === productId)) { state.activeStoreFunnel?.track('product_view'); state.activeStoreAnalytics?.record({ type: 'product_view', productId, path: 'product.html' }); }
  state.activeHeroCleanup?.();
  state.activeHeroCleanup = null;
  state.activeStoreExperienceCleanup?.();
  state.activeStoreExperienceCleanup = null;
  state.activeAnnouncementCleanup?.();
  state.activeAnnouncementCleanup = null;
  state.activePromotionCleanup?.();
  state.activePromotionCleanup = null;
  document.body.classList.remove("promotion-open");
  document.body.classList.remove("category-page");
  document.body.classList.add("product-detail-page");
  applyStoreTheme(slug, store);

  const item = store.items.find((candidate) => candidate.id === productId);
  const returnCategoryId = categoryIdFromLocation();
  const returnCategory = store.categories.find((candidate) => candidate.id === returnCategoryId);
  const catalogUrl = returnCategory ? categoryPageUrl(slug, returnCategory.id) : storeCatalogUrl(slug);
  const visibleStoreName = store.storeName.trim();
  const backToStoreLabel = returnCategory
    ? `Volver a ${returnCategory.name}`
    : visibleStoreName
      ? `Volver a ${visibleStoreName}`
      : "Volver al catálogo";
  if (!item) {
    app.innerHTML = `
      ${storefrontHeaderHtml(slug, store, { current: "catalog", catalogUrl })}
      ${storeAnnouncementHtml(store)}
      <div class="product-page-return">
        <a class="product-back-link store-catalog-link" href="${escapeHtml(catalogUrl)}">${ICON_ARROW_LEFT}<span>${escapeHtml(backToStoreLabel)}</span></a>
      </div>
      <main class="product-not-found">
        <span class="product-not-found-mark">?</span>
        <h1>Este producto ya no está disponible</h1>
        <p>Puede que haya sido retirado o que el enlace haya cambiado.</p>
        <a class="primary store-catalog-link" href="${escapeHtml(catalogUrl)}">Ver todos los productos</a>
      </main>
      ${storefrontFooterHtml(store)}`;
    bindStoreAnnouncementPlayback();
    bindInternalStoreLinks(slug, store);
    updateCartBar(store, store.items[0]?.currency || "BOB");
    bindCartCheckout(slug, store);
    return;
  }

  const variants = itemVariants(item);
  const selectedVariant = selectedVariantFor(item);
  const selectedExtras = selectedExtrasFor(item);
  const selectedStock = optionStock(item, selectedVariant);
  const key = cartItemKey(item.id, selectedVariant?.id, selectedExtras.map((extra) => extra.id));
  const qty = cart.get(key) ?? 0;
  const unavailableRequiredExtra = itemExtras(item).find((extra) => extra.required && !extra.available);
  const productLimit = productStockLimit(item);
  const soldOut = productLimit === 0 || selectedStock === 0 || Boolean(unavailableRequiredExtra);
  const atProductLimit = productLimit !== null && productCartQuantity(item.id) >= productLimit;
  const atOptionLimit = selectedStock !== null && optionCartQuantity(item.id, selectedVariant?.id) >= selectedStock;
  const configurationComplete = productConfigurationComplete(item);
  const images = [...new Set([...item.imageUrls, ...variants.flatMap(variant => variant.imageUrl ? [variant.imageUrl] : [])].map(assetUrl).filter((url): url is string => !!url))];
  const variantImageIndex = selectedVariant?.imageUrl ? images.indexOf(assetUrl(selectedVariant.imageUrl) || '') : 0;
  const rememberedImageIndex = selectedProductImageByItem.get(item.id) ?? Math.max(variantImageIndex, 0);
  const selectedImageIndex = Math.min(Math.max(rememberedImageIndex, 0), Math.max(images.length - 1, 0));
  selectedProductImageByItem.set(item.id, selectedImageIndex);
  const itemCategory = store.categories.find((candidate) => candidate.id === item.categoryId);
  const visibleStock = stockStatus(remainingStock(item, selectedVariant), store.showLowStockToCustomers === true);
  const discountPercent = activeProductDiscount(item);
  const detailSaleBanner = discountPercent === null ? "" : `<aside class="product-detail-sale" aria-label="Oferta por tiempo limitado"><strong>${discountPercent}% de descuento</strong><span data-discount-ends-at="${escapeHtml(item.discountEndsAt || "")}">${escapeHtml(discountRemainingLabel(item))}</span></aside>`;

  const configuredRelatedItems = store.items
    .filter((candidate) => (item.recommendedProductIds ?? []).includes(candidate.id))
    .sort((first, second) => (item.recommendedProductIds ?? []).indexOf(first.id) - (item.recommendedProductIds ?? []).indexOf(second.id))
    .slice(0, 4);
  const fallbackRelatedItems = store.items
    .filter((candidate) => candidate.id !== item.id)
    .sort((first, second) => Number(second.categoryId === item.categoryId) - Number(first.categoryId === item.categoryId))
    .slice(0, 4);
  const relatedItems = storeEditorMode ? configuredRelatedItems : configuredRelatedItems.length ? configuredRelatedItems : fallbackRelatedItems;
  const relatedProductsHtml = relatedItems.length || storeEditorMode
    ? `<section class="product-detail-related" aria-labelledby="product-detail-related-title">
        <div class="product-detail-related-heading">
          <h2 id="product-detail-related-title">${escapeHtml(storeEditorMode ? "Productos recomendados" : itemCategory ? `Más de ${itemCategory.name}` : "Sigue explorando")}</h2>
          <a class="store-catalog-link" href="${escapeHtml(catalogUrl)}">Ver la colección${ICON_ARROW_RIGHT}</a>
        </div>
        <div class="product-detail-related-grid">
          ${relatedItems.map((relatedItem) => {
            const relatedImageUrl = relatedItem.imageUrls.map(assetUrl).find((url): url is string => Boolean(url));
            return `<a class="product-detail-related-item product-page-link" href="${escapeHtml(productPageUrl(slug, relatedItem.id))}" aria-label="Ver ${escapeHtml(relatedItem.name)}">
              <span class="product-detail-related-media">${relatedImageUrl
                ? `<img src="${escapeHtml(relatedImageUrl)}" alt="" loading="lazy" decoding="async" style="object-position:${productImagePosition(relatedItem, 0)}">`
                : `<span aria-hidden="true">${escapeHtml(initials(relatedItem.name))}</span>`}</span>
              <span class="product-detail-related-copy"><strong>${escapeHtml(relatedItem.name)}</strong><span>${formatAmount(discountedProductAmount(relatedItem, relatedItem.amount), relatedItem.currency)}</span></span>
            </a>`;
          }).join("")}
          ${storeEditorMode ? Array.from({ length: Math.max(1, 4 - relatedItems.length) }, () => previewBlueprintButton("recommendation", { label: store.items.length > 1 ? "Agregar recomendado" : "Crea otro producto", copy: store.items.length > 1 ? "Elige desde tu catálogo" : "Después podrás recomendarlo", productId: item.id, compact: true })).join("") : ""}
        </div>
      </section>`
    : "";

  const galleryHtml = images.length
    ? `<div class="product-detail-main-image-wrap">
        <img class="product-detail-main-image" src="${escapeHtml(images[selectedImageIndex])}" alt="${escapeHtml(item.name)}, foto ${selectedImageIndex + 1} de ${images.length}" style="object-position:${productImagePosition(item, selectedImageIndex)}">
        ${images.length > 1 ? `<button type="button" class="product-detail-image-arrow previous" data-image-step="-1" aria-label="Ver foto anterior">${ICON_ARROW_LEFT}</button><button type="button" class="product-detail-image-arrow next" data-image-step="1" aria-label="Ver foto siguiente">${ICON_ARROW_RIGHT}</button>` : ""}
       </div>
       ${
         images.length > 1
           ? `<div class="product-detail-thumbnails" aria-label="Fotos de ${escapeHtml(item.name)}">
              ${images
                .map(
                  (url, index) =>
                    `<button type="button" class="product-detail-thumbnail${index === selectedImageIndex ? " active" : ""}" data-image-index="${index}" aria-label="Ver foto ${index + 1}" aria-pressed="${index === selectedImageIndex}"><img src="${escapeHtml(url)}" alt="" style="object-position:${productImagePosition(item, index)}"></button>`,
                )
                .join("")}
             </div>`
           : ""
       }`
    : `<div class="product-detail-main-image-wrap product-detail-placeholder" aria-label="${escapeHtml(item.name)}"><span>${escapeHtml(initials(item.name))}</span></div>`;

  const optionGroups = productOptionGroups(variants);
  const optionSelection = selectedOptionsByItem.get(item.id) ?? Object.fromEntries((selectedVariant?.options || []).map(option=>[option.name,option.value]));
  const startingVariant = selectedVariant ?? variants
    .filter(variant => optionStock(item, variant) !== 0 && (!optionGroups.length || variant.options?.every(option => !optionSelection[option.name] || optionSelection[option.name] === option.value)))
    .sort((a, b) => a.amount - b.amount)[0];
  const variantsHtml = optionGroups.length ? optionGroups.map((group,groupIndex)=>`<fieldset class="product-detail-variants" data-option-kind="${productOptionKind(group.name)}">
    <legend>${escapeHtml(group.name)} <span class="product-detail-selection">${escapeHtml(optionSelection[group.name] || 'Elige una opción')}</span></legend><div class="product-detail-option-list">
    ${group.values.map((value,valueIndex)=>{
      const selected = optionSelection[group.name] === value;
      const available = optionValueAvailable(variants,optionSelection,group.name,value,variant=>remainingStock(item,variant)!==0);
      const color = productOptionColor(group.name, value);
      return `<button type="button" class="product-detail-option${selected?' active':''}" data-option-group="${groupIndex}" data-option-value="${valueIndex}" aria-pressed="${selected}" ${available || selected ? '' : 'disabled'}>${color ? `<i class="product-detail-color-swatch" style="--option-color:${color}" aria-hidden="true"></i>` : ''}<span>${escapeHtml(value)}</span>${!available?'<small>No disponible</small>':''}</button>`;
    }).join('')}</div></fieldset>`).join('') : variants.length
    ? `<fieldset class="product-detail-variants">
        <legend>Selecciona una versión</legend>
        <div class="product-detail-option-list">
          ${variants
            .map((variant) => {
              const variantStock = optionStock(item, variant);
              const unavailable = variantStock === 0;
              const visibleVariantStock = stockStatus(remainingStock(item, variant), store.showLowStockToCustomers === true);
              return `<button type="button" class="product-detail-option${variant.id === selectedVariant?.id ? " active" : ""}" data-variant-id="${escapeHtml(variant.id)}" aria-pressed="${variant.id === selectedVariant?.id}" ${unavailable ? "disabled" : ""}>
                <span>${escapeHtml(variant.name)}</span>
                <strong>${formatAmount(discountedProductAmount(item, variant.amount), item.currency)}${discountPercent === null ? "" : ` <del>${formatAmount(variant.amount, item.currency)}</del>`}</strong>
                ${visibleVariantStock ? `<small>${visibleVariantStock.label}</small>` : ""}
              </button>`;
            })
            .join("")}
        </div>
       </fieldset>`
    : "";

  const extraGroups = new Map<string, { name: string; extras: StoreItem['extras'] }>();
  itemExtras(item).forEach(extra => {
    const name = extra.groupName?.trim() || 'Complementos';
    const key = name.toLocaleLowerCase('es');
    if (!extraGroups.has(key)) extraGroups.set(key, { name, extras: [] });
    extraGroups.get(key)!.extras.push(extra);
  });
  const selectedExtraIds = selectedExtraIdsByItem.get(item.id) ?? [];
  const extrasHtml = [...extraGroups.values()].map(({ name, extras }) => {
    const pickCount = extras[0].pickCount;
    if (pickCount) {
      const picked = extras.reduce((sum, extra) => sum + selectedExtraIds.filter(id => id === extra.id).length, 0);
      return `<fieldset class="product-detail-extras product-detail-picks"><legend>${escapeHtml(name)} <span class="product-detail-selection product-detail-pick-progress" aria-live="polite">${picked} de ${pickCount}</span></legend>
      <p>Elige ${pickCount}; puedes repetir.</p>
      <div class="product-detail-pick-list">${extras.map(extra => {
        const count = selectedExtraIds.filter(id => id === extra.id).length;
        const photo = assetUrl(extra.imageUrl || null);
        return `<div class="product-detail-pick-row${photo ? ' has-photo' : ''}">${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async">` : ''}<span><strong>${escapeHtml(extra.name)}</strong>${extra.available ? '' : '<small>Agotado</small>'}${extra.amount ? `<small>+${formatAmount(extra.amount, item.currency)} c/u</small>` : ''}</span>
          <div class="qty-stepper product-detail-pick-stepper" aria-label="Cantidad de ${escapeHtml(extra.name)}">
            <button type="button" class="product-detail-pick" data-extra-id="${escapeHtml(extra.id)}" data-pick-step="-1" aria-label="Quitar ${escapeHtml(extra.name)}" ${count ? '' : 'disabled'}>−</button>
            <span class="qty-value product-detail-pick-count" data-extra-id="${escapeHtml(extra.id)}">${count}</span>
            <button type="button" class="product-detail-pick" data-extra-id="${escapeHtml(extra.id)}" data-pick-step="1" aria-label="Agregar ${escapeHtml(extra.name)}" ${extra.available && picked < pickCount ? '' : 'disabled'}>+</button>
          </div></div>`;
      }).join('')}</div></fieldset>`;
    }
    const allowance = extras[0].freeAllowance || 0;
    return `<fieldset class="product-detail-extras"><legend>${escapeHtml(name)}</legend>
      <p>${allowance ? `${allowance} ${allowance === 1 ? 'incluido' : 'incluidos'}; los adicionales tienen el precio indicado.` : 'Elige los complementos para tu producto.'}</p>
      <div class="product-detail-extra-list">${extras.map(extra => {
        const displayAmount = extraDisplayAmount(item, extra, selectedExtras);
        return `<label><input type="checkbox" class="product-detail-extra-toggle" data-extra-id="${escapeHtml(extra.id)}" ${selectedExtras.some(selected => selected.id === extra.id) ? 'checked' : ''} ${extra.available ? '' : 'disabled'}><span><strong>${escapeHtml(extra.name)}</strong>${extra.required ? '<small>Requerido</small>' : ''}${extra.available ? '' : '<small>Agotado</small>'}</span><b>${displayAmount === 0 ? 'Incluido' : `+${formatAmount(displayAmount, item.currency)}`}</b></label>`;
      }).join('')}</div></fieldset>`;
  }).join('');
  const priceHtml = `${variants.length && !selectedVariant ? '<span class="product-detail-from">Desde </span>' : ''}${salePriceHtml(item, selectedUnitAmount(item, startingVariant, selectedExtras), originalSelectedUnitAmount(item, startingVariant, selectedExtras), 'product-detail-price')}`;
  const selectionLabels = [...(selectedVariant?.options?.map(option => option.value) || (selectedVariant ? [selectedVariant.name] : [])), ...(selectedExtras.length ? pickedExtrasLabel(selectedExtras, "\u0000").split("\u0000") : [])];
  const deliveryLocations = (store.locations || []).filter(location => location.pickupEnabled || location.deliveryEnabled);

  app.innerHTML = `
    ${storefrontHeaderHtml(slug, store, { current: "catalog", catalogUrl })}
    ${storeAnnouncementHtml(store)}
    <div class="product-page-return">
      <a class="product-back-link store-catalog-link" href="${escapeHtml(catalogUrl)}">${ICON_ARROW_LEFT}<span>${escapeHtml(backToStoreLabel)}</span></a>
    </div>
    <main class="product-detail-layout">
      <section class="product-detail-gallery" aria-label="Galería del producto">${galleryHtml}</section>
      <section class="product-detail-content product-detail-buy">
        ${itemCategory ? `<div class="product-detail-category">${escapeHtml(itemCategory.name)}</div>` : ""}
        ${detailSaleBanner}
        ${item.tags.length ? `<div class="store-item-tags">${item.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <h1>${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" aria-hidden="true"></span>` : ""}${escapeHtml(item.name)}</h1>
        <div class="product-detail-heading-price" aria-live="polite">${priceHtml}</div>
        ${item.description ? `<p class="product-detail-intro">${escapeHtml(item.description.length > 180 ? item.description.slice(0, 177) + '…' : item.description)}</p>` : ''}
        ${variantsHtml}
        ${optionGroups.length && Object.keys(optionSelection).length ? '<button type="button" class="product-options-clear">Limpiar selección</button>' : ''}
        ${extrasHtml}
        ${!configurationComplete ? `<div class="product-configuration-note" role="status">Selecciona todas las opciones requeridas para continuar.</div>` : ""}
        <div class="product-detail-purchase">
          <div>
            <span class="product-detail-selection-title">${selectionLabels.length ? 'Tu selección' : 'Tu producto'}</span>
            <div class="product-detail-selection-summary">${selectionLabels.length ? selectionLabels.map(label => `<span>${escapeHtml(label)}</span>`).join('') : escapeHtml(item.name)}</div>
            ${unavailableRequiredExtra ? `<div class="product-detail-stock out">${escapeHtml(unavailableRequiredExtra.name)} agotado</div>` : visibleStock ? `<div class="product-detail-stock${visibleStock.exhausted ? " out" : ""}">${visibleStock.label}</div>` : ""}
          </div>
          ${
            soldOut || (qty === 0 && (atProductLimit || atOptionLimit))
              ? `<button type="button" class="primary product-add" disabled>Stock agotado</button>`
              : qty === 0
                ? `<button type="button" class="primary product-add" ${configurationComplete ? "" : "disabled"}>${configurationComplete ? "Agregar al carrito" : "Completa las opciones"}</button>`
                : `<div class="qty-stepper product-detail-stepper" aria-label="Cantidad de ${escapeHtml(item.name)}">
                    <button type="button" class="qty-minus" aria-label="Quitar una unidad de ${escapeHtml(item.name)}">−</button>
                    <span class="qty-value" aria-live="polite">${qty}</span>
                    <button type="button" class="qty-plus" aria-label="Agregar una unidad de ${escapeHtml(item.name)}" ${atProductLimit || atOptionLimit ? "disabled" : ""}>+</button>
                  </div>`
          }
        </div>
      <aside class="product-detail-information" aria-label="Información de ${escapeHtml(item.name)}">
        <details open>
          <summary>El producto<span aria-hidden="true"></span></summary>
          <div class="product-detail-information-copy">${item.description ? `<p class="product-detail-description">${escapeHtml(item.description)}</p>` : `<p>Consulta las opciones disponibles y elige la configuración que prefieras.</p>`}</div>
        </details>
        <details>
          <summary>Detalles<span aria-hidden="true"></span></summary>
          <div class="product-detail-information-copy">${itemCategory ? `<p><strong>Categoría:</strong> ${escapeHtml(itemCategory.name)}</p>` : ""}${item.tags.length ? `<p><strong>Características:</strong> ${escapeHtml(item.tags.join(" · "))}</p>` : ""}<p>El precio y la disponibilidad se actualizan según la versión seleccionada.</p></div>
        </details>
        <details>
          <summary>Entrega y retiro<span aria-hidden="true"></span></summary>
          <div class="product-detail-information-copy">${deliveryLocations.length ? deliveryLocations.map(location => `<p><strong>${escapeHtml(location.name)}</strong>${location.address ? `<br>${escapeHtml(location.address)}` : ''}<br>${[location.pickupEnabled && 'Retiro en tienda', location.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ')}</p>`).join('') : '<p>Las opciones disponibles para tu pedido se muestran antes de completar la compra.</p>'}</div>
        </details>
      </aside>
      </section>
    </main>
    ${relatedProductsHtml}
    <div class="cart-bar product-detail-cart-bar">
      <span class="cart-summary" aria-live="polite"></span>
      <button type="button" class="primary" id="cart-pay">Ver carrito</button>
      <span class="cart-checkout-error" role="alert" hidden></span>
    </div>
    <div class="secure-note product-detail-secure-note">${store.checkoutMode === "payment" ? ICON_LOCK : store.checkoutMode === "whatsapp" ? ICON_WHATSAPP : ICON_EXTERNAL}<span>${store.checkoutMode === "payment" ? "Pago procesado de forma segura por pagosYa" : store.checkoutMode === "whatsapp" ? "El pedido se enviará directamente a WhatsApp" : "Tu correo y selección se enviarán a la tienda"}</span></div>
    ${storefrontFooterHtml(store)}`;

  bindStoreAnnouncementPlayback();
  bindTimedDiscountSchedule(slug, store);
  bindInternalStoreLinks(slug, store);
  app.querySelectorAll<HTMLButtonElement>(".product-detail-thumbnail").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProductImageByItem.set(item.id, Number(button.dataset.imageIndex));
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLButtonElement>(`.product-detail-thumbnail[data-image-index="${button.dataset.imageIndex}"]`)?.focus();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".product-detail-image-arrow").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.imageStep) || 0;
      selectedProductImageByItem.set(item.id, (selectedImageIndex + step + images.length) % images.length);
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLButtonElement>(`.product-detail-image-arrow.${step < 0 ? "previous" : "next"}`)?.focus();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".product-detail-option[data-variant-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedVariantByItem.set(item.id, button.dataset.variantId!);
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLButtonElement>(`.product-detail-option[data-variant-id="${button.dataset.variantId}"]`)?.focus();
    });
  });
  app.querySelector<HTMLButtonElement>('.product-options-clear')?.addEventListener('click',()=>{
    selectedOptionsByItem.delete(item.id); selectedVariantByItem.delete(item.id);
    renderProductPage(slug,store,item.id);
    app.querySelector<HTMLButtonElement>('[data-option-group]:not(:disabled)')?.focus();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-option-group]').forEach(button=>{
    button.addEventListener('click',()=>{
      const group = optionGroups[Number(button.dataset.optionGroup)];
      const value = group.values[Number(button.dataset.optionValue)];
      const selection = {...optionSelection};
      if (selection[group.name]===value) delete selection[group.name]; else selection[group.name]=value;
      selectedOptionsByItem.set(item.id,selection);
      const variant = matchingOptionVariant(variants,selection);
      if (variant && optionStock(item,variant)!==0) {
        selectedVariantByItem.set(item.id,variant.id);
      } else selectedVariantByItem.delete(item.id);
      const photoVariant = variant ?? variants.find(candidate=>candidate.imageUrl && candidate.options?.every(option=>!selection[option.name] || selection[option.name]===option.value));
      if (photoVariant?.imageUrl && Object.keys(selection).length) {
        const photoIndex = images.indexOf(assetUrl(photoVariant.imageUrl || null) || '');
        if (photoIndex>=0) selectedProductImageByItem.set(item.id,photoIndex);
      }
      renderProductPage(slug,store,item.id);
      app.querySelector<HTMLButtonElement>(`[data-option-group="${button.dataset.optionGroup}"][data-option-value="${button.dataset.optionValue}"]`)?.focus();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".product-detail-pick").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = [...(selectedExtraIdsByItem.get(item.id) ?? [])];
      const extraId = button.dataset.extraId!;
      const group = pickGroups(itemExtras(item), selected).find(candidate => candidate.extras.some(extra => extra.id === extraId));
      if (!group) return;
      if (button.dataset.pickStep === "1") { if (group.picked < group.pickCount) selected.push(extraId); }
      else if (selected.includes(extraId)) selected.splice(selected.lastIndexOf(extraId), 1);
      selectedExtraIdsByItem.set(item.id, selected);
      renderProductPage(slug, store, item.id);
      const again = app.querySelector<HTMLButtonElement>(`.product-detail-pick[data-extra-id="${extraId}"][data-pick-step="${button.dataset.pickStep}"]`);
      (again && !again.disabled ? again : app.querySelector<HTMLButtonElement>(".product-add:not(:disabled)") ?? app.querySelector<HTMLElement>(".product-detail-pick-progress"))?.focus();
    });
  });
  app.querySelectorAll<HTMLInputElement>(".product-detail-extra-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = (selectedExtraIdsByItem.get(item.id) ?? []).filter(id => id !== input.dataset.extraId);
      if (input.checked) selected.push(input.dataset.extraId!);
      selectedExtraIdsByItem.set(item.id, selected);
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLInputElement>(`.product-detail-extra-toggle[data-extra-id="${input.dataset.extraId}"]`)?.focus();
    });
  });

  const addOne = () => {
    if (!productConfigurationComplete(item)) return;
    const variant = selectedVariantFor(item);
    if (remainingStock(item, variant) === 0) return;
    const extras = selectedExtrasFor(item);
    const cartKey = cartItemKey(item.id, variant?.id, extras.map((extra) => extra.id));
    const available = optionStock(item, variant);
    if (available !== null && optionCartQuantity(item.id, variant?.id) >= available) return;
    cart.set(cartKey, (cart.get(cartKey) ?? 0) + 1);
    saveCart(store);
    renderProductPage(slug, store, item.id);
    app.querySelector<HTMLButtonElement>(".qty-plus")?.focus();
  };
  app.querySelector<HTMLButtonElement>(".product-add")?.addEventListener("click", addOne);
  app.querySelector<HTMLButtonElement>(".qty-plus")?.addEventListener("click", addOne);
  app.querySelector<HTMLButtonElement>(".qty-minus")?.addEventListener("click", () => {
    const cartKey = cartItemKey(item.id, selectedVariantFor(item)?.id, selectedExtrasFor(item).map((extra) => extra.id));
    const next = (cart.get(cartKey) ?? 0) - 1;
    if (next <= 0) cart.delete(cartKey);
    else cart.set(cartKey, next);
    saveCart(store);
    renderProductPage(slug, store, item.id);
    app.querySelector<HTMLButtonElement>(next > 0 ? ".qty-minus" : ".product-add")?.focus();
  });

  updateCartBar(store, item.currency);
  bindCartCheckout(slug, store);
  bindPreviewBlueprints(store);
  if (storePreviewMode && !state.previewReadyAnnounced) {
    state.previewReadyAnnounced = true;
    postToParent("CHECKOUT_READY", { mode: "store-preview" });
  }
}
