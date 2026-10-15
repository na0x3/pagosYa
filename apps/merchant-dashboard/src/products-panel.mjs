import { escapeHtml as esc } from "./html.mjs";

/**
 * Productos: the payment links list, its search and the edit guide (moved from dashboard.js 2026-10-15, no behaviour
 * change). create…() only looks things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)                 authenticated dashboard API call
 *   errorEl, infoEl                    the dashboard's error and info banners
 *   money(cents)                       formats an amount, honouring the hide-money toggle
 *   syncStoreResourceViews(...)        redraws the screens that list the store's resources
 *   dashboardAssetUrl(path)            absolute URL of a dashboard asset
 *   bulkDiscountStudioEl, bulkDiscountClearAllEl   discounts panel elements
 *   storeId()                          the active store id, read at use time
 *   categories()                       the store's categories, read at use time
 *   paymentLinks() / setPaymentLinks(links)   the active store's payment links
 *   renderBulkDiscountProducts(...)    discounts panel: redraws the bulk discount product list
 *   refreshFinancesInBackground(...)   finances panel: refreshes balances without blocking
 */
export function createProductsPanel(deps) {
  const { api, errorEl, infoEl, money, syncStoreResourceViews, dashboardAssetUrl, bulkDiscountStudioEl, bulkDiscountClearAllEl, renderBulkDiscountProducts, refreshFinancesInBackground } = deps;
  const paymentLinkPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);
  const paymentLinkPageSize = 10;
  const paymentLinkSearchEl = document.getElementById("paymentLinkSearch");
  const paymentLinkSearchClearEl = document.getElementById("paymentLinkSearchClear");
  const paymentLinkSearchSummaryEl = document.getElementById("paymentLinkSearchSummary");

  /** `step` (Crecimiento): open the guide at description, price, photos or stock instead of the first question. */
  function beginPaymentLinkEdit(link, step = null) {
    if (!link) return;
    syncStoreResourceViews("products");
    const guide = document.getElementById("productGuideFrame");
    if (guide.dataset.ready === "true") guide.contentWindow?.postMessage({type:"pagosya:product-guide-edit", storeId: deps.storeId(), product: link, ...(step ? { step } : {})}, location.origin);
    else {
      guide.dataset.pendingProduct = JSON.stringify(link);
      if (step) guide.dataset.pendingStep = step; else delete guide.dataset.pendingStep;
    }
    guide.scrollIntoView({block:"center",behavior:"smooth"});
  }
  function renderPaymentLinkRows(links) {
    deps.setPaymentLinks(links);
    bulkDiscountClearAllEl.disabled = !links.some((product) => product.discountPercent !== null && product.discountPercent !== undefined);
    if (!bulkDiscountStudioEl.hidden) renderBulkDiscountProducts();
    const rowsEl = document.getElementById("paymentLinkRows");
    const searchQuery = normalizeProductSearch(paymentLinkSearchEl.value);
    const matchingLinks = searchQuery
      ? links.filter((link) => {
          const category = deps.categories().find((item) => item.id === link.categoryId);
          return normalizeProductSearch([
            link.name,
            link.description,
            category?.name,
            ...(link.tags || []),
          ].filter(Boolean).join(" ")).includes(searchQuery);
        })
      : links;
    paymentLinkSearchClearEl.hidden = !searchQuery;
    paymentLinkSearchSummaryEl.textContent = searchQuery
      ? `${matchingLinks.length} de ${links.length} ${links.length === 1 ? "producto coincide" : "productos coinciden"} con tu búsqueda.`
      : links.length > paymentLinkPageSize
        ? `${links.length} productos guardados. Los más nuevos aparecen primero; los anteriores continúan en las páginas siguientes.`
        : `${links.length} ${links.length === 1 ? "producto guardado" : "productos guardados"}. Los más nuevos aparecen primero.`;
    const pageTokens = (currentPage, totalPages) => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
      const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      const tokens = [];
      ordered.forEach((page, index) => {
        if (index && page - ordered[index - 1] > 1) tokens.push("gap");
        tokens.push(page);
      });
      return tokens;
    };
    const renderRow = (link) => {
        const cover = link.imageUrls && link.imageUrls[0];
        const thumb = cover ? `<img class="link-thumb" src="${esc(dashboardAssetUrl(cover))}" alt="" style="object-position:${esc(link.imagePositions?.[0] || "50% 50%")}">` : "";
        const swatch = link.color
          ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(link.color)};border:1px solid rgba(0,0,0,.15);margin-right:6px" title="${esc(link.color)}"></span>`
          : "";
        const category = deps.categories().find((c) => c.id === link.categoryId);
        const meta = [];
        if (category) meta.push(esc(category.name));
        if (link.stock !== null && link.stock !== undefined) meta.push(`Stock: ${link.stock}`);
        if (link.variants?.length) {
          meta.push(
            `Opciones: ${link.variants
              .map((variant) => `${esc(variant.name)} (${variant.stock === undefined ? "compartido" : variant.stock === null ? "∞" : variant.stock})`)
              .join(", ")}`,
          );
        }
        if (link.codigoProducto) meta.push(`SKU: ${esc(link.codigoProducto)}`);
        if (link.codigoProductoSin) meta.push("SIN clasificado");
        const discountStartsAt = Date.parse(link.discountStartsAt || "");
        const discountEndsAt = Date.parse(link.discountEndsAt || "");
        const discountActive = Number.isInteger(link.discountPercent) && Date.now() >= discountStartsAt && Date.now() < discountEndsAt;
        if (Number.isInteger(link.discountPercent) && Number.isFinite(discountStartsAt) && Number.isFinite(discountEndsAt)) {
          const discountState = discountActive ? "Activa" : Date.now() < discountStartsAt ? "Programada" : "Finalizada";
          meta.push(`${discountState}: ${link.discountPercent}% hasta ${new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(discountEndsAt))}`);
        }
        const metaLine = meta.length ? `<div class="faint" style="margin-top:2px">${meta.join(" · ")}</div>` : "";
        const tagBadges = (link.tags || []).map((t) => `<span class="tag-badge">${esc(t)}</span>`).join("");
        const prices = (link.variants || []).map((variant) => variant.amount);
        const regularPriceLabel = prices.length
          ? Math.min(...prices) === Math.max(...prices)
            ? money(prices[0])
            : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`
          : money(link.amount);
        const priceLabel = discountActive
          ? `<strong style="color:#be123c">${link.discountPercent}% menos</strong><br><span class="faint"><s>${regularPriceLabel}</s></span>`
          : regularPriceLabel;
        const soldOut = link.variants?.length
          ? link.variants.every((variant) => variant.stock === 0)
          : link.stock === 0;
        const statusLabel = link.status === "ACTIVE" ? "Activo" : link.status === "ARCHIVED" ? "Archivado" : link.status;
        return `<tr data-payment-link-id="${esc(link.id)}">
          <td>${thumb}${swatch}${esc(link.name)}${tagBadges ? `<br>${tagBadges}` : ""}${metaLine}</td>
          <td>${priceLabel}</td>
          <td><div class="product-availability-badges"><span class="badge ${esc(link.status)}">${esc(statusLabel)}</span>${soldOut ? '<span class="badge SOLD_OUT">Agotado</span>' : ""}</div></td>
          <td>
            <div class="product-row-actions">
              ${link.status === "ACTIVE" ? `<button class="ghost edit-link" data-id="${esc(link.id)}">Editar</button>` : ""}
              ${link.status === "ACTIVE" && !soldOut ? `<button class="ghost sold-out-link" data-id="${esc(link.id)}" data-name="${esc(link.name)}">Marcar agotado</button>` : ""}
              ${link.status === "ACTIVE" ? `<button class="ghost archive-link" data-id="${esc(link.id)}">Archivar</button>` : ""}
              ${link.status === "ARCHIVED" ? `<button class="ghost restore-link" data-id="${esc(link.id)}">Restaurar</button>` : ""}
              <button class="ghost delete-link" data-id="${esc(link.id)}" data-name="${esc(link.name)}">Eliminar</button>
            </div>
          </td>
        </tr>`;
    };
    const groups = [
      { status: "ACTIVE", title: "Productos activos", className: "is-active", empty: "No hay productos activos." },
      { status: "ARCHIVED", title: "Productos archivados", className: "is-archived", empty: "No hay productos archivados." },
    ];
    rowsEl.innerHTML = groups.map((group) => {
      const statusLinks = links.filter((link) => link.status === group.status);
      const groupLinks = matchingLinks.filter((link) => link.status === group.status);
      const totalPages = Math.max(1, Math.ceil(groupLinks.length / paymentLinkPageSize));
      const requestedPage = paymentLinkPageByStatus.get(group.status) || 1;
      const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
      paymentLinkPageByStatus.set(group.status, currentPage);
      const start = (currentPage - 1) * paymentLinkPageSize;
      const visibleLinks = groupLinks.slice(start, start + paymentLinkPageSize);
      const summary = groupLinks.length ? `${start + 1}–${Math.min(start + paymentLinkPageSize, groupLinks.length)} de ${groupLinks.length}` : "0 productos";
      const controls = pageTokens(currentPage, totalPages).map((token) => token === "gap"
        ? `<span class="payment-link-page-gap" aria-hidden="true">…</span>`
        : `<button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${token}" ${token === currentPage ? 'aria-current="page"' : ""} aria-label="Página ${token} de ${group.title.toLowerCase()}">${token}</button>`).join("");
      return `<section class="payment-link-group ${group.className}" data-payment-link-status="${group.status}" aria-labelledby="payment-link-${group.status.toLowerCase()}-title">
        <header class="payment-link-group-head">
          <h3 id="payment-link-${group.status.toLowerCase()}-title">${group.title}</h3>
          <span class="payment-link-group-count">${searchQuery ? `${groupLinks.length} de ${statusLinks.length}` : groupLinks.length} ${statusLinks.length === 1 ? "producto" : "productos"}</span>
        </header>
        ${groupLinks.length ? `<div class="payment-link-table-wrap"><table class="payment-link-table">
          <thead><tr><th>Nombre</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${visibleLinks.map(renderRow).join("")}</tbody>
        </table></div>` : group.status === "ACTIVE" && !searchQuery && links.length === 0
          ? '<p class="payment-link-group-empty">Todavía no tienes productos. <button class="ghost" type="button" id="emptyCatalogImport">Importar catálogo</button></p>'
          : `<p class="payment-link-group-empty">${searchQuery ? "No hay productos de este estado que coincidan con tu búsqueda." : group.empty}</p>`}
        <nav class="payment-link-pagination" aria-label="Páginas de ${group.title.toLowerCase()}" ${totalPages <= 1 ? "hidden" : ""}>
          <span class="payment-link-page-summary">${summary}</span>
          <div class="payment-link-page-controls">
            <button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${currentPage - 1}" aria-label="Página anterior" ${currentPage === 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
            ${controls}
            <button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${currentPage + 1}" aria-label="Página siguiente" ${currentPage === totalPages ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
        </nav>
      </section>`;
    }).join("");

    document.getElementById("emptyCatalogImport")?.addEventListener("click", () => {
      document.getElementById("catalogImportDisclosure").open = true;
      const toggle = document.getElementById("inventoryImporterToggle");
      if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      document.getElementById("inventoryImporter").scrollIntoView({ block: "start" });
      document.getElementById("inventoryCsvInput").focus();
    });

    document.querySelectorAll(".payment-link-page-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        paymentLinkPageByStatus.set(btn.dataset.status, Number(btn.dataset.page));
        renderPaymentLinkRows(deps.paymentLinks());
        document.querySelector(`[data-payment-link-status="${btn.dataset.status}"]`)?.scrollIntoView({ block: "nearest" });
      });
    });

    document.querySelectorAll(".archive-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Archivando…";
          const archivedLink = await api(`/stores/${deps.storeId()}/payment_links/${btn.dataset.id}/archive`, { method: "POST" });
          renderPaymentLinkRows(deps.paymentLinks().map((link) => (link.id === archivedLink.id ? archivedLink : link)));
          infoEl.textContent = `Producto "${archivedLink.name}" archivado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Archivar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".sold-out-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const link = deps.paymentLinks().find((item) => item.id === btn.dataset.id);
        if (!link || !confirm(`¿Marcar "${btn.dataset.name}" como agotado? Los clientes lo verán, pero no podrán comprarlo hasta que vuelvas a asignar stock.`)) return;
        const body = link.variants?.length
          ? { variants: link.variants.map((variant) => ({ id: variant.id, name: variant.name, amount: variant.amount, stock: 0 })) }
          : { stock: 0 };
        try {
          btn.disabled = true;
          btn.textContent = "Marcando…";
          const updatedLink = await api(`/stores/${deps.storeId()}/payment_links/${btn.dataset.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          renderPaymentLinkRows(deps.paymentLinks().map((item) => (item.id === updatedLink.id ? updatedLink : item)));
          infoEl.textContent = `Producto "${updatedLink.name}" marcado como agotado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Marcar agotado";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".restore-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Restaurando…";
          const restoredLink = await api(`/stores/${deps.storeId()}/payment_links/${btn.dataset.id}/restore`, { method: "POST" });
          renderPaymentLinkRows(deps.paymentLinks().map((link) => (link.id === restoredLink.id ? restoredLink : link)));
          infoEl.textContent = `Producto "${restoredLink.name}" restaurado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Restaurar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".delete-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar "${btn.dataset.name}"? Esta acción no se puede deshacer.`)) return;
        try {
          btn.disabled = true;
          btn.textContent = "Eliminando…";
          await api(`/stores/${deps.storeId()}/payment_links/${btn.dataset.id}`, { method: "DELETE" });
          renderPaymentLinkRows(deps.paymentLinks().filter((link) => link.id !== btn.dataset.id));
          infoEl.textContent = `Producto "${btn.dataset.name}" eliminado.`;
          refreshFinancesInBackground();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Eliminar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".edit-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        const link = deps.paymentLinks().find((l) => l.id === btn.dataset.id);
        beginPaymentLinkEdit(link);
      });
    });
  }

  function normalizeProductSearch(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .trim();
  }

  function resetPaymentLinkBrowseState() {
    paymentLinkPageByStatus.set("ACTIVE", 1);
    paymentLinkPageByStatus.set("ARCHIVED", 1);
    if (paymentLinkSearchEl) paymentLinkSearchEl.value = "";
  }

  function init() {
    paymentLinkSearchEl.addEventListener("input", () => {
      paymentLinkPageByStatus.set("ACTIVE", 1);
      paymentLinkPageByStatus.set("ARCHIVED", 1);
      renderPaymentLinkRows(deps.paymentLinks());
    });

    paymentLinkSearchClearEl.addEventListener("click", () => {
      resetPaymentLinkBrowseState();
      renderPaymentLinkRows(deps.paymentLinks());
      paymentLinkSearchEl.focus();
    });
  }

  return { init, beginPaymentLinkEdit, renderPaymentLinkRows, normalizeProductSearch, resetPaymentLinkBrowseState };
}
