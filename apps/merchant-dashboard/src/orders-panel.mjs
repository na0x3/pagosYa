import { escapeHtml as esc } from "./html.mjs";

/**
 * Pedidos: the orders table, its filters and the CSV/PDF downloads (moved from dashboard.js 2026-10-15, no behaviour
 * change). create…() only looks things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   apiBaseEl                      login form input holding the API base
 *   errorEl, infoEl                the dashboard's error and info banners
 *   money(cents)                   formats an amount, honouring the hide-money toggle
 *   refresh()                      reloads the dashboard data
 *   storeId()                      the active store id, read at use time
 *   stores()                       the merchant's stores, read at use time
 *   payments()                     the loaded payments, read at use time
 *   finances()                     the loaded finances, read at use time
 *   sessionToken()                 the merchant's session token, read at use time
 */
export function createOrdersPanel(deps) {
  const { api, apiBaseEl, errorEl, infoEl, money, refresh } = deps;
  let paymentStatusFilter = "active";
  let orderSearch = "";
  let paymentPage = 1;
  const PAYMENT_PAGE_SIZE = 20;

  let renderShipmentPanel = null;

  // "active" hides REQUIRES_PAYMENT_METHOD specifically — a customer who
  // never even chose how to pay isn't a real payment attempt, and on a busy
  // store these dwarf real payments in the raw list. "Todos" still shows
  // them for anyone who wants the full picture.
  const PENDING_STATUSES = ["REQUIRES_PAYMENT_METHOD", "REQUIRES_CONFIRMATION", "PROCESSING"];
  const ENDED_STATUSES = ["CANCELED", "FAILED"];

  function filteredPayments() {
    const normalizedSearch = orderSearch.trim().toLocaleLowerCase("es");
    const matchingSearch = normalizedSearch
      // p.orderId is the id the buyer has: it is what the confirmation email
      // and the tracking link show, not the pi_ id.
      ? deps.payments().filter((p) => [p.id, p.orderId, p.customerName, p.customerEmail, p.customerPhone, p.description]
          .some((value) => String(value || "").toLocaleLowerCase("es").includes(normalizedSearch)))
      : deps.payments();
    if (paymentStatusFilter === "all") return matchingSearch;
    if (paymentStatusFilter === "active") return matchingSearch.filter((p) => p.status !== "REQUIRES_PAYMENT_METHOD");
    if (paymentStatusFilter === "pending") return matchingSearch.filter((p) => PENDING_STATUSES.includes(p.status));
    if (paymentStatusFilter === "ended") return matchingSearch.filter((p) => ENDED_STATUSES.includes(p.status));
    return matchingSearch.filter((p) => p.status === paymentStatusFilter);
  }

  const ORDER_STATUS_LABELS = {
    LEAD_RECEIVED: "Interesado recibido",
    SUCCEEDED: "Pago exitoso",
    REQUIRES_ACTION: "Necesita acción",
    REQUIRES_PAYMENT_METHOD: "Sin método de pago",
    REQUIRES_CONFIRMATION: "Por confirmar",
    PROCESSING: "Procesando",
    CANCELED: "Cancelado",
    FAILED: "Fallido",
    PAID: "Pagado · por preparar",
    PREPARING: "En preparación",
    READY_FOR_PICKUP: "Listo para recoger",
    SHIPPED: "Enviado",
    DELIVERED: "Entregado",
    REFUNDED: "Reembolsado",
  };

  const FULFILLMENT_NEXT = {
    PAID: ["PREPARING", "READY_FOR_PICKUP", "SHIPPED", "CANCELED", "REFUNDED"],
    PREPARING: ["READY_FOR_PICKUP", "SHIPPED", "CANCELED"],
    READY_FOR_PICKUP: ["DELIVERED", "CANCELED"],
    SHIPPED: ["DELIVERED", "CANCELED"],
    DELIVERED: ["REFUNDED"],
  };

  function orderItemsLabel(order) {
    if (!Array.isArray(order.items) || order.items.length === 0) return order.description || "Sin detalle de productos";
    return order.items.map((item) => {
      const name = item.name || item.label || "Producto";
      const option = item.variantName ? ` (${item.variantName})` : "";
      return `${name}${option} × ${item.quantity || 1}`;
    }).join(" · ");
  }

  function emptyPaymentRowHtml() {
    if (deps.payments().length === 0) return `<tr><td colspan="6" class="muted">Todavía no hay pedidos ni interesados.</td></tr>`;
    const incomplete = paymentStatusFilter === "active"
      ? deps.payments().filter((payment) => payment.status === "REQUIRES_PAYMENT_METHOD").length
      : 0;
    if (!incomplete) return `<tr><td colspan="6" class="muted">No encontramos pedidos con estos filtros.</td></tr>`;
    const count = incomplete === 1 ? "1 pedido quedó" : `${incomplete} pedidos quedaron`;
    return `<tr><td colspan="6" class="muted">Ningún pago completado todavía. ${count} sin llegar a elegir método de pago. <button type="button" class="ghost" id="showAllPayments">Ver todos</button></td></tr>`;
  }

  function renderPaymentRows() {
    const selectedStore = deps.stores().find((store) => store.id === deps.storeId());
    document.getElementById("paymentScopeLabel").textContent = selectedStore?.name || "Toda la cuenta";
    const filtered = filteredPayments();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAYMENT_PAGE_SIZE));
    paymentPage = Math.min(paymentPage, pageCount);
    const start = (paymentPage - 1) * PAYMENT_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAYMENT_PAGE_SIZE);
    document.getElementById("downloadOrdersCsv").disabled = filtered.length === 0;
    document.getElementById("downloadOrdersPdf").disabled = filtered.length === 0;
    document.getElementById("downloadSalesCsv").disabled = !(deps.finances()?.paymentCount > 0);

    document.getElementById("paymentRows").innerHTML = pageRows
      .map(
        (p) => `<tr>
          <td><div class="buyer-summary"><strong>${p.kind === "LEAD" ? "Interesado" : "Pago"}</strong><code>${esc(p.id)}</code>${p.storeName ? `<span>${esc(p.storeName)}</span>` : ""}</div></td>
          <td><div class="buyer-summary"><strong>${esc(p.customerName || "Sin nombre")}</strong><span>${esc(p.customerEmail || "Sin correo")}</span><span>${esc(p.customerPhone || "Sin teléfono")}</span></div></td>
          <td>${money(p.amount)}</td>
          <td><span class="badge ${esc(p.status)}">${esc(ORDER_STATUS_LABELS[p.status] || p.status)}</span>${p.paymentMethodType ? `<div class="faint" style="margin-top:4px">${esc(p.paymentMethodType)}</div>` : ""}</td>
          <td>${esc(new Date(p.createdAt).toLocaleString())}</td>
          <td><details class="order-detail"><summary>Ver datos</summary><div class="order-detail-card"><strong>${esc(orderItemsLabel(p))}</strong>${p.description ? `<span>${esc(p.description)}</span>` : ""}${p.fulfillmentStatus ? `<span>Entrega: <b>${esc(ORDER_STATUS_LABELS[p.fulfillmentStatus] || p.fulfillmentStatus)}</b></span>` : ""}${p.deliveryRequested ? `<span><b>Entrega solicitada</b>${p.deliveryAddress ? ` · ${esc(p.deliveryAddress)}` : ""}</span>` : ""}<div class="order-contact-links">${p.customerEmail ? `<a href="mailto:${encodeURIComponent(p.customerEmail)}">Enviar correo</a>` : ""}${p.customerPhone ? `<a href="tel:${esc(String(p.customerPhone).replace(/[^+\d]/g, ""))}">Llamar</a>` : ""}${Number.isFinite(p.customerLatitude) && Number.isFinite(p.customerLongitude) ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${p.customerLatitude},${p.customerLongitude}`)}" target="_blank" rel="noopener noreferrer">Abrir ubicación</a>` : ""}</div>${p.orderId && (FULFILLMENT_NEXT[p.fulfillmentStatus] || []).length ? `<label class="faint">Actualizar entrega<select class="fulfillment-select" data-order-id="${esc(p.orderId)}" style="margin-top:6px"><option value="">Selecciona…</option>${FULFILLMENT_NEXT[p.fulfillmentStatus].map((status) => `<option value="${status}">${esc(ORDER_STATUS_LABELS[status] || status)}</option>`).join("")}</select></label>` : ""}${p.orderId ? `<div data-shipment-panel data-order-id="${esc(p.orderId)}"></div>` : ""}<code>ID: ${esc(p.id)}</code></div></details></td>
        </tr>`,
      )
      .join("") || emptyPaymentRowHtml();

    // "Con actividad" hides checkouts that never reached a payment method. With
    // no completed payment yet that leaves a blank table, which reads as "nothing
    // ever arrived" rather than "your buyers are dropping off before paying".
    document.getElementById("showAllPayments")?.addEventListener("click", () => {
      const select = document.getElementById("paymentStatusFilter");
      select.value = "all";
      select.dispatchEvent(new Event("change"));
    });

    document.getElementById("paymentPager").innerHTML =
      filtered.length === 0
        ? ""
        : `<button type="button" class="ghost" id="paymentPrev" ${paymentPage <= 1 ? "disabled" : ""}>&larr; Anterior</button>
           <span>Página ${paymentPage} de ${pageCount} (${filtered.length} pedidos)</span>
           <button type="button" class="ghost" id="paymentNext" ${paymentPage >= pageCount ? "disabled" : ""}>Siguiente &rarr;</button>`;

    document.getElementById("paymentPrev")?.addEventListener("click", () => {
      paymentPage--;
      renderPaymentRows();
    });
    document.getElementById("paymentNext")?.addEventListener("click", () => {
      paymentPage++;
      renderPaymentRows();
    });
    document.querySelectorAll(".fulfillment-select").forEach((select) => {
      select.addEventListener("change", async () => {
        if (!select.value) return;
        select.disabled = true;
        try {
          await api(`/orders/${encodeURIComponent(select.dataset.orderId)}/fulfillment`, {
            method: "PATCH",
            body: JSON.stringify({ status: select.value }),
          });
          infoEl.textContent = "Estado de entrega actualizado.";
          await refresh();
        } catch (error) {
          errorEl.textContent = "Error actualizando la entrega: " + error.message;
          select.disabled = false;
        }
      });
    });
    document.querySelectorAll(".order-detail").forEach((d) => {
      d.addEventListener("toggle", async () => {
        const box = d.querySelector("[data-shipment-panel]");
        if (d.open && box && !box.dataset.loaded) {
          box.dataset.loaded = "1";
          try {
            if (!renderShipmentPanel) {
              ({ renderShipmentPanel } = await import('/src/shipment-panel.mjs'));
            }
            await renderShipmentPanel(box, api, box.dataset.orderId);
          } catch (e) {
            box.textContent = e.message;
          }
        }
      });
    });
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function safeFilename(value) {
    const valueOrDefault = value || "documento";
    return String(valueOrDefault)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function downloadPdf(path, filename, button) {
    const response = await fetch(`${apiBaseEl.value.replace(/\/$/, "")}${path}`, {
      headers: { authorization: "Bearer " + deps.sessionToken() },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error((body && body.message) || "No se pudo generar el PDF.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    if (button?.isConnected) {
      button.textContent = "PDF descargado";
      window.setTimeout(() => {
        if (button?.isConnected) button.textContent = "Descargar";
      }, 1400);
    }
  }

  function downloadOrdersCsv(rows, filename, includeTotal = false) {
    const headers = ["Tipo", "ID", "Tienda", "Fecha", "Estado", "Nombre", "Correo", "Teléfono", "Productos", "Monto", "Moneda", "Método"];
    const data = rows.map((order) => [
      order.kind === "LEAD" ? "Interesado" : "Pago",
      order.id,
      order.storeName || "Sin tienda",
      new Date(order.createdAt).toISOString(),
      ORDER_STATUS_LABELS[order.status] || order.status,
      order.customerName || "",
      order.customerEmail || "",
      order.customerPhone || "",
      orderItemsLabel(order),
      (Number(order.amount || 0) / 100).toFixed(2),
      order.currency || "BOB",
      order.paymentMethodType || "",
    ]);
    if (includeTotal) {
      data.push(["TOTAL", "", "", "", "", "", "", "", "", (rows.reduce((sum, order) => sum + Number(order.amount || 0), 0) / 100).toFixed(2), rows[0]?.currency || "BOB", ""]);
    }
    const csv = "\ufeff" + [headers, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** refresh() starts the orders table on its first page again. */
  function resetPaymentPage() { paymentPage = 1; }

  function init() {
    document.getElementById("paymentStatusFilter").addEventListener("change", (e) => {
      paymentStatusFilter = e.target.value;
      paymentPage = 1;
      renderPaymentRows();
    });

    document.getElementById("orderSearch").addEventListener("input", (e) => {
      orderSearch = e.target.value;
      paymentPage = 1;
      renderPaymentRows();
    });

    document.getElementById("downloadOrdersCsv").addEventListener("click", () => {
      const rows = filteredPayments();
      if (!rows.length) return;
      downloadOrdersCsv(rows, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`);
    });

    document.getElementById("downloadOrdersPdf").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando PDF…";
      try {
        const selectedStore = deps.stores().find((candidate) => candidate.id === deps.storeId());
        const datePart = new Date().toISOString().slice(0, 10);
        const query = new URLSearchParams({ export: "true" });
        if (deps.storeId()) query.set("storeId", deps.storeId());
        if (orderSearch.trim()) query.set("search", orderSearch.trim());
        if (paymentStatusFilter && paymentStatusFilter !== "all") query.set("status", paymentStatusFilter);
        await downloadPdf(`/merchants/orders.pdf?${query.toString()}`, `pedidos-${safeFilename(selectedStore?.slug || selectedStore?.name || "tienda")}-${datePart}.pdf`, button);
        infoEl.textContent = "PDF de pagos preparado.";
        button.textContent = original;
      } catch (error) {
        button.disabled = false;
        errorEl.textContent = "Error al descargar el PDF: " + error.message;
        button.textContent = original;
      } finally {
        button.disabled = false;
        if (button.textContent !== "PDF descargado") button.textContent = original;
      }
    });

    document.getElementById("downloadSalesCsv").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando CSV…";
      try {
        const query = deps.storeId()
          ? `?storeId=${encodeURIComponent(deps.storeId())}&export=true`
          : "?export=true";
        const allOrders = await api(`/merchants/orders${query}`);
        const rows = allOrders.filter((order) => order.kind === "PAYMENT" && order.status === "SUCCEEDED");
        if (!rows.length) throw new Error("Todavía no hay ventas exitosas para descargar.");
        const store = deps.stores().find((candidate) => candidate.id === deps.storeId());
        const slug = String(store?.slug || "negocio").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
        downloadOrdersCsv(rows, `ventas-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, true);
        infoEl.textContent = `CSV preparado con ${rows.length} ${rows.length === 1 ? "venta" : "ventas"}.`;
      } catch (err) {
        errorEl.textContent = "Error: " + err.message;
      } finally {
        button.textContent = originalText;
        renderPaymentRows();
      }
    });

    document.getElementById("downloadPayoutsPdf").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando PDF…";
      try {
        const datePart = new Date().toISOString().slice(0, 10);
        await downloadPdf(`/merchants/payouts.pdf`, `desembolsos-${datePart}.pdf`, button);
        infoEl.textContent = "Estado de desembolsos en PDF preparado.";
        button.textContent = originalText;
      } catch (error) {
        errorEl.textContent = "Error al descargar el PDF: " + error.message;
        button.textContent = originalText;
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("downloadFinancePdf").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando PDF…";
      try {
        const datePart = new Date().toISOString().slice(0, 10);
        const query = deps.storeId() ? `?storeId=${encodeURIComponent(deps.storeId())}` : "";
        await downloadPdf(
          `/merchants/finances.pdf${query}`,
          `finanzas-${safeFilename(deps.storeId() ? (deps.stores().find((store) => store.id === deps.storeId())?.name || "tienda") : "negocio")}-${datePart}.pdf`,
          button,
        );
        infoEl.textContent = "Resumen financiero en PDF preparado.";
        button.textContent = originalText;
      } catch (error) {
        errorEl.textContent = "Error al descargar el PDF: " + error.message;
        button.textContent = originalText;
      } finally {
        button.disabled = false;
      }
    });
  }

  return { init, renderPaymentRows, resetPaymentPage };
}
