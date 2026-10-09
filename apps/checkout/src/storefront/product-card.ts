/** A product card in the catalog grid. */
import { cartItemKey, pickGroups } from "../cart-state";
import { StoreItem, assetUrl } from "../api";
import { state } from "../state";
import { itemVariants, selectedVariantFor, selectedExtrasFor, cart, optionStock, itemExtras, productStockLimit, productCartQuantity, optionCartQuantity, productConfigurationComplete, activeProductDiscount, discountRemainingLabel, stockStatus, remainingStock, discountedProductAmount, extrasCourtesyCopy, extraDisplayAmount, salePriceHtml, selectedUnitAmount, originalSelectedUnitAmount } from "../cart/cart";
import { productPageUrl } from "./routes";
import { escapeHtml, initials, formatAmount } from "../ui/html";
import { productImagePosition } from "./catalog";
import { ICON_ARROW_LEFT, ICON_ARROW_RIGHT } from "../ui/icons";


export function renderProductCard(
  slug: string,
  item: StoreItem,
  index: number,
  showLowStock: boolean,
  presentation: { featured?: boolean; showDescription?: boolean } = {},
): string {
  const variants = itemVariants(item);
  const selectedVariant = selectedVariantFor(item);
  const selectedExtras = selectedExtrasFor(item);
  const key = cartItemKey(item.id, selectedVariant?.id, selectedExtras.map((extra) => extra.id));
  const qty = cart.get(key) ?? 0;
  const images = item.imageUrls.map(assetUrl).filter((u): u is string => !!u);
  const selectedStock = optionStock(item, selectedVariant);
  const unavailableRequiredExtra = itemExtras(item).find((extra) => extra.required && !extra.available);
  const productLimit = productStockLimit(item);
  const soldOut = productLimit === 0 || selectedStock === 0 || Boolean(unavailableRequiredExtra);
  const atProductLimit = productLimit !== null && productCartQuantity(item.id) >= productLimit;
  const atOptionLimit = selectedStock !== null && optionCartQuantity(item.id, selectedVariant?.id) >= selectedStock;
  const configurationComplete = productConfigurationComplete(item);
  const atStockLimit = atProductLimit || atOptionLimit || !configurationComplete;
  // Staggered on first paint only (see hasStoreAnimatedIn) — capped so a
  // long catalog doesn't leave the last cards waiting a visible beat to
  // appear.
  const staggerStyle = state.hasStoreAnimatedIn ? "" : ` style="--stagger-delay: ${Math.min(index * 45, 360)}ms"`;
  const detailUrl = productPageUrl(slug, item.id);
  const discountPercent = activeProductDiscount(item);
  const saleBadgeHtml = discountPercent === null ? "" : `<div class="product-sale-badge" role="status" aria-label="${discountPercent}% de descuento activo"><strong>${discountPercent}% OFF</strong><span data-discount-ends-at="${escapeHtml(item.discountEndsAt || "")}">${escapeHtml(discountRemainingLabel(item))}</span></div>`;

  const galleryHtml = images.length
    ? `
      <div class="store-item-gallery">
        <a class="store-item-image-link product-page-link" href="${escapeHtml(detailUrl)}" aria-label="Ver ${escapeHtml(item.name)}">
          <img class="store-item-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(item.name)}" style="object-position:${productImagePosition(item, 0)}" />
        </a>
        ${
          images.length > 1
            ? `<button type="button" class="product-gallery-arrow previous" data-gallery-step="-1" aria-label="Ver foto anterior">${ICON_ARROW_LEFT}</button>
               <button type="button" class="product-gallery-arrow next" data-gallery-step="1" aria-label="Ver foto siguiente">${ICON_ARROW_RIGHT}</button>
               <div class="gallery-thumbs">
                ${images.map((url, i) => `<button type="button" class="gallery-thumb-btn ${i === 0 ? "active" : ""}" data-src="${escapeHtml(url)}" data-position="${productImagePosition(item, i)}" aria-label="Foto ${i + 1}"></button>`).join("")}
              </div>`
            : ""
        }
      </div>`
    : `<a class="store-item-image store-item-image-link placeholder product-page-link" href="${escapeHtml(detailUrl)}" aria-label="Ver ${escapeHtml(item.name)}"><span>${escapeHtml(initials(item.name))}</span></a>`;

  const tagsHtml = item.tags.length
    ? `<div class="store-item-tags">${item.tags.map((t) => `<span class="tag-badge">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";

  const visibleStock = stockStatus(remainingStock(item, selectedVariant), showLowStock);
  const stockNote = unavailableRequiredExtra
    ? `<div class="stock-note out">${escapeHtml(unavailableRequiredExtra.name)} agotado</div>`
    : visibleStock
    ? `<div class="stock-note${visibleStock.exhausted ? " out" : ""}">${visibleStock.label}</div>`
    : "";

  const variantsHtml = variants.length
    ? `<div class="store-item-option">
        <label for="variant-${escapeHtml(item.id)}">Selecciona una versión</label>
        <select id="variant-${escapeHtml(item.id)}" class="variant-select" aria-label="Opción para ${escapeHtml(item.name)}">
          <option value="" ${selectedVariant ? "" : "selected"}>Elige tamaño, sabor o presentación</option>
          ${variants
            .map(
              (variant) =>
                `<option value="${escapeHtml(variant.id)}" ${variant.id === selectedVariant?.id ? "selected" : ""} ${optionStock(item, variant) === 0 ? "disabled" : ""}>${escapeHtml(variant.name)} - ${formatAmount(discountedProductAmount(item, variant.amount), item.currency)}${discountPercent === null ? "" : ` (antes ${formatAmount(variant.amount, item.currency)})`}${stockStatus(remainingStock(item, variant), showLowStock) ? `, ${stockStatus(remainingStock(item, variant), showLowStock)!.label}` : ""}</option>`,
            )
            .join("")}
        </select>
      </div>`
    : "";

  const courtesyCopy = extrasCourtesyCopy(item);
  const toggleExtras = itemExtras(item).filter((extra) => !extra.pickCount);
  const pickLinksHtml = pickGroups(itemExtras(item), []).map((group) => `<a class="store-item-pick-link product-page-link" href="${escapeHtml(detailUrl)}">Elige ${group.pickCount} en ${escapeHtml(group.name)}</a>`).join("");
  const extrasHtml = pickLinksHtml + (toggleExtras.length
    ? `<fieldset class="store-item-extras"><legend>Personaliza${courtesyCopy ? ` · ${escapeHtml(courtesyCopy)}` : ""}</legend>${toggleExtras.map((extra) => { const displayAmount = extraDisplayAmount(item, extra, selectedExtras); return `<label><input type="checkbox" class="extra-toggle" data-extra-id="${escapeHtml(extra.id)}" ${selectedExtras.some((selected) => selected.id === extra.id) ? "checked" : ""} ${extra.available ? "" : "disabled"}><span>${escapeHtml(extra.name)}${extra.required ? ` <small>Requerido</small>` : ""}${extra.available ? "" : ` <small>Agotado</small>`}</span><strong>${displayAmount === 0 ? "Incluido" : `+${formatAmount(displayAmount, item.currency)}`}</strong></label>`; }).join("")}</fieldset>`
    : "");

  return `
    <div class="store-item ${soldOut ? "sold-out" : ""}${discountPercent === null ? "" : " has-sale"}${presentation.featured ? " is-site-featured" : ""}" data-id="${item.id}"${staggerStyle}>
      ${saleBadgeHtml}
      ${galleryHtml}
      <div class="store-item-info">
        ${presentation.featured ? `<span class="site-featured-label">Selección destacada</span>` : ""}
        ${tagsHtml}
        <a class="store-item-name product-page-link" href="${escapeHtml(detailUrl)}">${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" title="${escapeHtml(item.color)}"></span>` : ""}${escapeHtml(item.name)}</a>
        ${presentation.showDescription !== false && item.description ? `<div class="store-item-description">${escapeHtml(item.description)}</div>` : ""}
        ${variantsHtml}
        ${extrasHtml}
        ${!configurationComplete ? `<div class="product-configuration-note">Completa las opciones requeridas para agregar.</div>` : ""}
        <div class="store-item-price">${salePriceHtml(item, selectedUnitAmount(item, selectedVariant, selectedExtras), originalSelectedUnitAmount(item, selectedVariant, selectedExtras), "store-item-current-price")}${stockNote}</div>
      </div>
      ${
        item.fulfillmentType === "MEMBERSHIP"
          ? `<a class="primary product-page-link" href="${escapeHtml(detailUrl)}">Hacerme miembro</a>`
          : soldOut
          ? ""
          : `<div class="qty-stepper">
              <button type="button" class="qty-minus" aria-label="Quitar una unidad de ${escapeHtml(item.name)}" ${qty === 0 ? "disabled" : ""}>−</button>
              <span class="qty-value">${qty}</span>
              <button type="button" class="qty-plus" aria-label="Agregar una unidad de ${escapeHtml(item.name)}" ${atStockLimit ? "disabled" : ""}>+</button>
            </div>`
      }
    </div>`;
}
