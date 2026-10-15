import { escapeHtml as esc } from "./html.mjs";
import { uiSwitch } from "./ui-kit.mjs";

/**
 * Descuentos: promo codes and the bulk discount studio (moved from dashboard.js 2026-10-15, no behaviour change).
 * create…() only looks things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   errorEl, infoEl                the dashboard's error and info banners
 *   setButtonBusy(button, busy)    disables a button while it works
 *   money(cents)                   formats an amount, honouring the hide-money toggle
 *   storeId()                      the active store id, read at use time
 *   stores()                       the merchant's stores, read at use time
 *   paymentLinks()                 the active store's payment links, read at use time
 *   renderPaymentLinkRows(...)     products panel: redraws the products list
 *   normalizeProductSearch(...)    products panel: normalises a search string
 */
export function createDiscountsPanel(deps) {
  const { api, errorEl, infoEl, setButtonBusy, money, renderPaymentLinkRows, normalizeProductSearch } = deps;
  let lastPromoCodes = [];
  const promoCodeFormEl = document.getElementById("promoCodeForm");
  const promoCodeTypeEl = document.getElementById("promoCodeType");
  const promoCodeValueEl = document.getElementById("promoCodeValue");
  const promoCodeValueLabelEl = document.getElementById("promoCodeValueLabel");
  const promoCodeStatusEl = document.getElementById("promoCodeStatus");
  const promoCodeListEl = document.getElementById("promoCodeList");
  const promoCodeCountEl = document.getElementById("promoCodeCount");

  const bulkDiscountStudioEl = document.getElementById("bulkDiscountStudio");
  const bulkDiscountClearAllEl = document.getElementById("bulkDiscountClearAll");
  const bulkDiscountProductSearchEl = document.getElementById("bulkDiscountProductSearch");
  const bulkDiscountProductListEl = document.getElementById("bulkDiscountProductList");
  const bulkDiscountSelectionCountEl = document.getElementById("bulkDiscountSelectionCount");
  const bulkDiscountSelectAllEl = document.getElementById("bulkDiscountSelectAll");
  const bulkDiscountPercentEl = document.getElementById("bulkDiscountPercent");
  const bulkDiscountStartDateEl = document.getElementById("bulkDiscountStartDate");
  const bulkDiscountStartTimeEl = document.getElementById("bulkDiscountStartTime");
  const bulkDiscountEndDateEl = document.getElementById("bulkDiscountEndDate");
  const bulkDiscountEndTimeEl = document.getElementById("bulkDiscountEndTime");
  const bulkDiscountPreviewEl = document.getElementById("bulkDiscountPreview");
  const bulkDiscountSubmitEl = document.getElementById("bulkDiscountSubmit");
  const selectedBulkDiscountProductIds = new Set();

  function localDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  }

  function localTimeInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function promoCodeDiscountLabel(code) {
    return code.discountType === "PERCENT"
      ? `${code.discountValue}% de descuento`
      : `${money(code.discountValue)} de descuento`;
  }

  function renderPromoCodes(codes) {
    lastPromoCodes = Array.isArray(codes) ? codes : [];
    promoCodeCountEl.textContent = `${lastPromoCodes.length} ${lastPromoCodes.length === 1 ? "código" : "códigos"}`;
    if (!lastPromoCodes.length) {
      promoCodeListEl.innerHTML = '<p class="promo-code-empty">Todavía no creaste códigos. El primero quedará activo apenas lo guardes.</p>';
      return;
    }
    promoCodeListEl.innerHTML = lastPromoCodes.map((code) => `<article class="promo-code-row${code.isActive ? "" : " is-disabled"}" data-promo-code-id="${esc(code.id)}">
      <div class="promo-code-identity"><strong>${esc(code.code)}</strong><span>${code.isActive ? "Activo y listo para compartir" : "Desactivado"}</span>${code.showInEmails ? '<span class="promo-code-email">Se muestra en tus correos</span>' : ""}</div>
      <div class="promo-code-value"><strong>${esc(promoCodeDiscountLabel(code))}</strong><span>Creado ${new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(new Date(code.createdAt))}</span></div>
      <div class="promo-code-actions">
        <button class="ghost" type="button" data-promo-copy="${esc(code.code)}" aria-label="Copiar código ${esc(code.code)}">Copiar</button>
        <button class="ghost" type="button" data-promo-share="${esc(code.code)}" aria-label="Compartir código ${esc(code.code)}">Compartir</button>
        <button class="ghost" type="button" data-promo-toggle="${esc(code.id)}" data-active="${code.isActive}" aria-label="${code.isActive ? "Desactivar" : "Activar"} código ${esc(code.code)}">${code.isActive ? "Desactivar" : "Activar"}</button>
        ${uiSwitch({ label: "Mostrar en correos", attrs: `data-promo-email="${esc(code.id)}"`, checked: code.showInEmails })}
      </div>
    </article>`).join("");
  }

  function bulkDiscountDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null;
    const date = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function visibleBulkDiscountProducts() {
    const query = normalizeProductSearch(bulkDiscountProductSearchEl.value);
    return deps.paymentLinks().filter((link) =>
      link.status === "ACTIVE" && (!query || normalizeProductSearch(link.name).includes(query)),
    );
  }

  function renderBulkDiscountProducts() {
    const activeIds = new Set(deps.paymentLinks().filter((link) => link.status === "ACTIVE").map((link) => link.id));
    [...selectedBulkDiscountProductIds].forEach((id) => {
      if (!activeIds.has(id)) selectedBulkDiscountProductIds.delete(id);
    });
    const products = visibleBulkDiscountProducts();
    bulkDiscountProductListEl.innerHTML = products.length
      ? products.map((link) => `<label class="bulk-discount-product">
          <input type="checkbox" value="${esc(link.id)}" ${selectedBulkDiscountProductIds.has(link.id) ? "checked" : ""}>
          <span>${esc(link.name)}</span>
          <small>${money(link.amount)}</small>
        </label>`).join("")
      : `<p class="payment-link-group-empty">No hay productos activos que coincidan.</p>`;
    const selectedCount = selectedBulkDiscountProductIds.size;
    bulkDiscountSelectionCountEl.textContent = `${selectedCount} ${selectedCount === 1 ? "producto seleccionado" : "productos seleccionados"}`;
    const allVisibleSelected = products.length > 0 && products.every((product) => selectedBulkDiscountProductIds.has(product.id));
    bulkDiscountSelectAllEl.textContent = allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles";
    bulkDiscountSubmitEl.disabled = selectedCount === 0;
  }

  function updateBulkDiscountPreview() {
    const percent = Number(bulkDiscountPercentEl.value);
    const start = bulkDiscountDateTime(bulkDiscountStartDateEl.value, bulkDiscountStartTimeEl.value);
    const end = bulkDiscountDateTime(bulkDiscountEndDateEl.value, bulkDiscountEndTimeEl.value);
    if (!Number.isInteger(percent) || !start || !end) {
      bulkDiscountPreviewEl.textContent = "Completa el porcentaje y las fechas para revisar la campaña.";
      return;
    }
    const formatter = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" });
    bulkDiscountPreviewEl.textContent = `${percent}% menos desde ${formatter.format(start)} hasta ${formatter.format(end)}. El precio normal vuelve automáticamente al terminar.`;
  }

  function seedBulkDiscountDates() {
    const start = new Date();
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const today = localDateInputValue(new Date());
    bulkDiscountStartDateEl.min = today;
    bulkDiscountEndDateEl.min = today;
    bulkDiscountStartDateEl.value = localDateInputValue(start);
    bulkDiscountStartTimeEl.value = localTimeInputValue(start);
    bulkDiscountEndDateEl.value = localDateInputValue(end);
    bulkDiscountEndTimeEl.value = localTimeInputValue(end);
    updateBulkDiscountPreview();
  }

  function closeBulkDiscountStudio() {
    bulkDiscountStudioEl.hidden = true;
    document.getElementById("bulkDiscountOpen").setAttribute("aria-expanded", "false");
  }

  function init() {
    promoCodeTypeEl.addEventListener("change", () => {
      const percent = promoCodeTypeEl.value === "PERCENT";
      promoCodeValueLabelEl.textContent = percent ? "Descuento (%)" : "Descuento fijo (Bs)";
      promoCodeValueEl.max = percent ? "99" : "1000000";
      promoCodeValueEl.step = percent ? "1" : "0.01";
      promoCodeValueEl.value = percent ? "10" : "10.00";
    });

    promoCodeFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!deps.storeId()) return;
      promoCodeStatusEl.textContent = "";
      promoCodeStatusEl.classList.remove("is-success");
      const data = new FormData(promoCodeFormEl);
      const discountType = String(data.get("discountType"));
      const enteredValue = Number(data.get("discountValue"));
      const discountValue = discountType === "FIXED" ? Math.round(enteredValue * 100) : enteredValue;
      const submit = document.getElementById("promoCodeSubmit");
      setButtonBusy(submit, true, "Creando…");
      try {
        const created = await api(`/stores/${deps.storeId()}/promo-codes`, {
          method: "POST",
          body: JSON.stringify({ code: String(data.get("code") || "").trim().toUpperCase(), discountType, discountValue }),
        });
        renderPromoCodes([created, ...lastPromoCodes]);
        promoCodeFormEl.reset();
        promoCodeTypeEl.dispatchEvent(new Event("change"));
        promoCodeStatusEl.textContent = `Código ${created.code} creado y activo.`;
        promoCodeStatusEl.classList.add("is-success");
      } catch (error) {
        promoCodeStatusEl.textContent = error.message;
        promoCodeStatusEl.classList.remove("is-success");
      } finally {
        setButtonBusy(submit, false, "Crear código");
      }
    });

    // A code reaches the store's emails only when the merchant marks it; private codes stay private.
    promoCodeListEl.addEventListener("change", async (event) => {
      const box = event.target.closest("[data-promo-email]");
      if (!box || !deps.storeId()) return;
      box.disabled = true;
      try {
        const updated = await api(`/stores/${deps.storeId()}/promo-codes/${box.dataset.promoEmail}`, {
          method: "PATCH",
          body: JSON.stringify({ showInEmails: box.checked }),
        });
        renderPromoCodes(lastPromoCodes.map((code) => code.id === updated.id ? updated : code));
        promoCodeStatusEl.textContent = updated.showInEmails ? `Código ${updated.code} se mostrará en tus correos.` : `Código ${updated.code} ya no se muestra en tus correos.`;
        promoCodeStatusEl.classList.add("is-success");
        requestAnimationFrame(() => promoCodeListEl.querySelector(`[data-promo-email="${CSS.escape(updated.id)}"]`)?.focus());
      } catch (error) {
        box.checked = !box.checked;
        box.disabled = false;
        promoCodeStatusEl.textContent = error.message;
        promoCodeStatusEl.classList.remove("is-success");
      }
    });

    promoCodeListEl.addEventListener("click", async (event) => {
      const copyButton = event.target.closest("[data-promo-copy]");
      const shareButton = event.target.closest("[data-promo-share]");
      const toggleButton = event.target.closest("[data-promo-toggle]");
      if (copyButton) {
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(copyButton.dataset.promoCopy);
          copyButton.textContent = "Copiado";
          promoCodeStatusEl.textContent = `Código ${copyButton.dataset.promoCopy} copiado.`;
          promoCodeStatusEl.classList.add("is-success");
          window.setTimeout(() => { copyButton.textContent = "Copiar"; }, 1200);
        } catch {
          promoCodeStatusEl.textContent = `No pudimos copiar ${copyButton.dataset.promoCopy}. Selecciona el código y cópialo manualmente.`;
          promoCodeStatusEl.classList.remove("is-success");
        }
        return;
      }
      if (shareButton) {
        const store = deps.stores().find((entry) => entry.id === deps.storeId());
        const code = shareButton.dataset.promoShare;
        const url = document.getElementById("currentStoreLink").value;
        const text = `Usa el código ${code} en ${store?.name || "mi tienda"}.`;
        try {
          if (navigator.share) {
            await navigator.share({ title: `Promoción de ${store?.name || "la tienda"}`, text, url });
            promoCodeStatusEl.textContent = `Código ${code} compartido.`;
            promoCodeStatusEl.classList.add("is-success");
          } else {
            if (!navigator.clipboard?.writeText) throw new Error("Share unavailable");
            await navigator.clipboard.writeText(`${text} ${url}`);
            promoCodeStatusEl.textContent = `Mensaje con el código ${code} copiado para compartir.`;
            promoCodeStatusEl.classList.add("is-success");
          }
        } catch (error) {
          if (error?.name !== "AbortError") {
            promoCodeStatusEl.textContent = `No pudimos compartir ${code}. Inténtalo de nuevo.`;
            promoCodeStatusEl.classList.remove("is-success");
          }
        }
        return;
      }
      if (!toggleButton || !deps.storeId()) return;
      const isActive = toggleButton.dataset.active !== "true";
      toggleButton.disabled = true;
      try {
        const updated = await api(`/stores/${deps.storeId()}/promo-codes/${toggleButton.dataset.promoToggle}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive }),
        });
        renderPromoCodes(lastPromoCodes.map((code) => code.id === updated.id ? updated : code));
        promoCodeStatusEl.textContent = `Código ${updated.code} ${updated.isActive ? "activado" : "desactivado"}.`;
        promoCodeStatusEl.classList.add("is-success");
        requestAnimationFrame(() => promoCodeListEl.querySelector(`[data-promo-toggle="${CSS.escape(updated.id)}"]`)?.focus());
      } catch (error) {
        promoCodeStatusEl.textContent = error.message;
        promoCodeStatusEl.classList.remove("is-success");
        toggleButton.disabled = false;
      }
    });

    document.getElementById("bulkDiscountOpen").addEventListener("click", () => {
      seedBulkDiscountDates();
      renderBulkDiscountProducts();
      bulkDiscountStudioEl.hidden = false;
      document.getElementById("bulkDiscountOpen").setAttribute("aria-expanded", "true");
      bulkDiscountStudioEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      bulkDiscountProductSearchEl.focus({ preventScroll: true });
    });

    bulkDiscountClearAllEl.addEventListener("click", async () => {
      const discountedProducts = deps.paymentLinks().filter((product) => product.discountPercent !== null && product.discountPercent !== undefined);
      if (!discountedProducts.length) return;
      const confirmed = confirm(`¿Quitar los descuentos de ${discountedProducts.length} ${discountedProducts.length === 1 ? "producto" : "productos"}? Los clientes volverán a ver el precio normal inmediatamente.`);
      if (!confirmed) return;
      errorEl.textContent = "";
      setButtonBusy(bulkDiscountClearAllEl, true, "Quitando…");
      try {
        const result = await api(`/stores/${deps.storeId()}/payment_links/discount`, { method: "DELETE" });
        selectedBulkDiscountProductIds.clear();
        renderPaymentLinkRows(deps.paymentLinks().map((product) => ({
          ...product,
          discountPercent: null,
          discountStartsAt: null,
          discountEndsAt: null,
        })));
        closeBulkDiscountStudio();
        infoEl.textContent = result.count === 1
          ? "Se quitó el descuento de 1 producto."
          : `Se quitaron los descuentos de ${result.count} productos.`;
      } catch (error) {
        errorEl.textContent = "Error: " + error.message;
      } finally {
        setButtonBusy(bulkDiscountClearAllEl, false, "Quitar todos los descuentos");
        bulkDiscountClearAllEl.disabled = !deps.paymentLinks().some((product) => product.discountPercent !== null && product.discountPercent !== undefined);
      }
    });

    document.getElementById("bulkDiscountClose").addEventListener("click", closeBulkDiscountStudio);

    document.getElementById("bulkDiscountCancel").addEventListener("click", closeBulkDiscountStudio);

    bulkDiscountProductSearchEl.addEventListener("input", renderBulkDiscountProducts);

    bulkDiscountProductListEl.addEventListener("change", (event) => {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (!checkbox) return;
      if (checkbox.checked && selectedBulkDiscountProductIds.size >= 100) {
        checkbox.checked = false;
        errorEl.textContent = "Error: puedes programar hasta 100 productos por campaña";
        return;
      }
      if (checkbox.checked) selectedBulkDiscountProductIds.add(checkbox.value);
      else selectedBulkDiscountProductIds.delete(checkbox.value);
      renderBulkDiscountProducts();
    });

    bulkDiscountSelectAllEl.addEventListener("click", () => {
      const products = visibleBulkDiscountProducts();
      const allSelected = products.length > 0 && products.every((product) => selectedBulkDiscountProductIds.has(product.id));
      if (allSelected) products.forEach((product) => selectedBulkDiscountProductIds.delete(product.id));
      else products.slice(0, Math.max(0, 100 - selectedBulkDiscountProductIds.size)).forEach((product) => selectedBulkDiscountProductIds.add(product.id));
      renderBulkDiscountProducts();
    });

    [bulkDiscountPercentEl, bulkDiscountStartDateEl, bulkDiscountStartTimeEl, bulkDiscountEndDateEl, bulkDiscountEndTimeEl].forEach((input) => {
      input.addEventListener("input", () => {
        if (input === bulkDiscountStartDateEl) bulkDiscountEndDateEl.min = bulkDiscountStartDateEl.value || localDateInputValue(new Date());
        updateBulkDiscountPreview();
      });
    });

    document.getElementById("bulkDiscountForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const productIds = [...selectedBulkDiscountProductIds];
      const discountPercent = Number(bulkDiscountPercentEl.value);
      const start = bulkDiscountDateTime(bulkDiscountStartDateEl.value, bulkDiscountStartTimeEl.value);
      const end = bulkDiscountDateTime(bulkDiscountEndDateEl.value, bulkDiscountEndTimeEl.value);
      if (!productIds.length) {
        errorEl.textContent = "Error: selecciona por lo menos un producto";
        bulkDiscountProductSearchEl.focus();
        return;
      }
      if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 99) {
        errorEl.textContent = "Error: el descuento debe estar entre 1% y 99%";
        bulkDiscountPercentEl.focus();
        return;
      }
      if (!start || !end || start.getTime() < Date.now() - 60_000) {
        errorEl.textContent = "Error: el descuento no puede comenzar en el pasado";
        bulkDiscountStartDateEl.focus();
        return;
      }
      if (end <= start) {
        errorEl.textContent = "Error: el descuento debe terminar después de comenzar";
        bulkDiscountEndDateEl.focus();
        return;
      }
      errorEl.textContent = "";
      setButtonBusy(bulkDiscountSubmitEl, true, "Programando…");
      try {
        const updatedProducts = await api(`/stores/${deps.storeId()}/payment_links/discount`, {
          method: "PATCH",
          body: JSON.stringify({
            productIds,
            discountPercent,
            discountStartsAt: start.toISOString(),
            discountEndsAt: end.toISOString(),
          }),
        });
        const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
        selectedBulkDiscountProductIds.clear();
        renderPaymentLinkRows(deps.paymentLinks().map((product) => updatedById.get(product.id) || product));
        closeBulkDiscountStudio();
        infoEl.textContent = `Descuento del ${discountPercent}% programado para ${productIds.length} ${productIds.length === 1 ? "producto" : "productos"}.`;
      } catch (error) {
        errorEl.textContent = "Error: " + error.message;
      } finally {
        setButtonBusy(bulkDiscountSubmitEl, false, "Programar campaña");
      }
    });
  }

  return { init, bulkDiscountStudioEl, bulkDiscountClearAllEl, renderPromoCodes, renderBulkDiscountProducts };
}
