/** The order tracking page a buyer reaches from their confirmation email. */
import { pickedExtrasLabel } from "../cart-state";
import { mountDigitalDownloads } from "../digital-downloads";
import { mountComebackCard } from "../comeback-card";
import { TrackedOrder, TrackedShipment, API_BASE_URL, assetUrl, fetchTrackedOrder } from "../api";
import { state } from "../state";
import { ICON_CHECK, ICON_MAP_PIN, ICON_ARROW_RIGHT, ICON_LOCK, ICON_X } from "../ui/icons";
import { escapeHtml, initials, formatAmount } from "../ui/html";
import { CONSUMER_DASHBOARD_ORIGIN } from "../checkout/customer-contact";
import { app } from "../ui/app";
import { whatsAppLink } from "../checkout/payment-result";


export const ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Esperando pago",
  PAID: "Pagado",
  PREPARING: "En preparación",
  READY_FOR_PICKUP: "Listo para recoger",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  REQUIRES_PAYMENT_METHOD: "Pendiente",
  REQUIRES_CONFIRMATION: "Por confirmar",
  PROCESSING: "Procesando",
  REQUIRES_ACTION: "Requiere acción",
  SUCCEEDED: "Confirmado",
  FAILED: "Fallido",
  CANCELED: "Cancelado",
};

export function trackingDate(value: string): string {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const SHIPMENT_LABELS: Record<string, string> = {
  BOOKING: "Preparando el envío",
  BOOKED: "Guía generada",
  PICKED_UP: "Recogido por el courier",
  IN_TRANSIT: "En camino",
  DELIVERED: "Entregado",
  FAILED: "Estamos resolviendo un problema con el envío",
  CANCELED: "Envío cancelado",
  RETURNED: "Devuelto",
};

// escapeHtml (textContent → innerHTML) leaves quotes alone; attribute values need them encoded too.
const escapeAttr = (value: string) => escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function shipmentMarkup(shipment: TrackedShipment | null | undefined): string {
  if (!shipment) return "";
  const link = shipment.trackingUrl && /^https:\/\//.test(shipment.trackingUrl)
    ? `<a href="${escapeAttr(shipment.trackingUrl)}" target="_blank" rel="noopener noreferrer">Rastrear en ${escapeHtml(shipment.carrierName)}</a>`
    : "";
  return `<section class="tracking-shipment" aria-label="Envío"><h2>Envío con ${escapeHtml(shipment.carrierName)}</h2>
    <p><strong>${escapeHtml(SHIPMENT_LABELS[shipment.status] ?? shipment.status)}</strong>${shipment.trackingNumber ? ` · Nº ${escapeHtml(shipment.trackingNumber)}` : ""}</p>${link}
    <ol>${shipment.events.map((e) => `<li><time datetime="${escapeAttr(e.occurredAt)}">${escapeHtml(new Date(e.occurredAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" }))}</time> ${escapeHtml(e.description ?? SHIPMENT_LABELS[e.status] ?? e.status)}</li>`).join("")}</ol></section>`;
}

export function trackingStatusClass(status: string): string {
  if (["SUCCEEDED", "PAID", "DELIVERED"].includes(status)) return "is-good";
  if (["FAILED", "CANCELED", "REFUNDED"].includes(status)) return "is-bad";
  return "is-active";
}

export function trackingTimelineHtml(order: TrackedOrder): string {
  const rankByStatus: Record<string, number> = {
    AWAITING_PAYMENT: 0,
    PAID: 0,
    PREPARING: 1,
    READY_FOR_PICKUP: 2,
    SHIPPED: 2,
    DELIVERED: 3,
  };
  const fallbackRank = order.statusEvents.reduce((rank, event) => Math.max(rank, rankByStatus[event.status] ?? -1), -1);
  const rank = rankByStatus[order.status] ?? fallbackRank;
  const pickup = order.status === "READY_FOR_PICKUP" || order.statusEvents.some((event) => event.status === "READY_FOR_PICKUP");
  const stages = [
    { label: order.paymentStatus === "SUCCEEDED" ? "Pago confirmado" : "Esperando pago", statuses: ["AWAITING_PAYMENT", "PAID"] },
    { label: "En preparación", statuses: ["PREPARING"] },
    { label: pickup ? "Listo para recoger" : "En camino", statuses: pickup ? ["READY_FOR_PICKUP"] : ["SHIPPED"] },
    { label: "Entregado", statuses: ["DELIVERED"] },
  ];
  return `<ol class="tracking-timeline" aria-label="Progreso del pedido">
    ${stages.map((stage, index) => {
      const event = [...order.statusEvents].reverse().find((candidate) => stage.statuses.includes(candidate.status));
      const current = index === rank && !["CANCELED", "REFUNDED"].includes(order.status);
      const done = index < rank || order.status === "DELIVERED" || (index === 0 && order.paymentStatus === "SUCCEEDED");
      return `<li class="${done ? "is-done" : ""} ${current ? "is-current" : ""}"${current ? ' aria-current="step"' : ""}>
        <span class="tracking-step-mark">${done ? ICON_CHECK : `<span>${index + 1}</span>`}</span>
        <span class="tracking-step-copy"><strong>${stage.label}</strong><small>${event ? trackingDate(event.createdAt) : current ? "Estado actual" : "Pendiente"}</small></span>
      </li>`;
    }).join("")}
  </ol>`;
}

export function trackingStatusRegionHtml(order: TrackedOrder): string {
  const statusMessages: Record<string, string> = {
    AWAITING_PAYMENT: "Estamos esperando la confirmación del pago.",
    PAID: "La tienda recibió tu pedido y pronto comenzará a prepararlo.",
    PREPARING: "La tienda está preparando tu pedido.",
    READY_FOR_PICKUP: "Tu pedido está listo. Puedes coordinar el recojo con la tienda.",
    SHIPPED: "Tu pedido salió de la tienda y está en camino.",
    DELIVERED: "Tu pedido fue marcado como entregado.",
    CANCELED: "La tienda marcó este pedido como cancelado.",
    REFUNDED: "El pago de este pedido fue reembolsado.",
  };
  const estimate = order.delivery?.estimatedAt
    ? `<p class="tracking-estimate"><strong>Entrega estimada:</strong> ${trackingDate(order.delivery.estimatedAt)}</p>`
    : "";
  return `<div class="tracking-status-head">
      <div>
        <h1>${escapeHtml(ORDER_STATUS_LABELS[order.status] ?? order.status)}</h1>
      </div>
      <div class="tracking-badges">
        <span class="tracking-badge ${trackingStatusClass(order.paymentStatus)}">Pago · ${escapeHtml(PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus)}</span>
        <span class="tracking-badge ${trackingStatusClass(order.status)}">Pedido · ${escapeHtml(ORDER_STATUS_LABELS[order.status] ?? order.status)}</span>
      </div>
    </div>
    <p class="tracking-status-message">${escapeHtml(statusMessages[order.status] ?? "La tienda actualizó tu pedido.")}</p>
    ${estimate}
    <p class="tracking-updated">Actualizado ${trackingDate(order.updatedAt)}</p>`;
}

export function trackingClaimUrl(token: string): string {
  const url = new URL(CONSUMER_DASHBOARD_ORIGIN);
  url.searchParams.set("claim", token);
  return url.toString();
}

export function trackedReviewHtml(order: TrackedOrder, token: string): string {
  if (order.status !== "DELIVERED" || !order.store?.slug) return "";
  const products = Array.isArray(order.items)
    ? order.items.filter((item) => typeof item.paymentLinkId === "string").filter((item, index, list) => list.findIndex((candidate) => candidate.paymentLinkId === item.paymentLinkId) === index)
    : [];
  if (!products.length) return "";
  return `<section class="tracking-review-section" aria-labelledby="tracking-review-title" data-review-section>
    <h2 id="tracking-review-title" tabindex="-1">¿Cómo fue tu compra?</h2>
    <p>Tu pedido ya fue entregado. Comparte una opinión honesta sobre cada producto; quedará pendiente de moderación antes de publicarse.</p>
    <div class="tracking-review-list">${products.map((item) => `<form class="tracking-review-form" data-review-form data-product-id="${escapeHtml(item.paymentLinkId!)}">
      <h3>${escapeHtml(item.name)}</h3>
      <label>Tu nombre público<input name="displayName" maxlength="80" required autocomplete="name"></label>
      <label>Calificación<select name="rating" required><option value="5">5 — Excelente</option><option value="4">4 — Muy buena</option><option value="3">3 — Buena</option><option value="2">2 — Regular</option><option value="1">1 — Mala</option></select></label>
      <label>Tu reseña<textarea name="body" rows="4" minlength="3" maxlength="2000" required placeholder="¿Qué te pareció?"></textarea></label>
      <button type="submit" class="tracking-review-submit">Enviar reseña</button>
      <p class="tracking-review-status" role="status" aria-live="polite"></p>
    </form>`).join("")}</div>
  </section>`;
}

export function bindTrackedReviewForms(order: TrackedOrder, token: string): void {
  const slug = order.store?.slug;
  if (!slug) return;
  app.querySelectorAll<HTMLFormElement>("[data-review-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
      const status = form.querySelector<HTMLElement>(".tracking-review-status");
      const values = new FormData(form);
      if (!button || !status) return;
      button.disabled = true;
      status.textContent = "Enviando tu reseña…";
      try {
        const response = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/content/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          body: JSON.stringify({
            trackingToken: token,
            productId: form.dataset.productId,
            displayName: String(values.get("displayName") || ""),
            rating: Number(values.get("rating")),
            body: String(values.get("body") || ""),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "No pudimos enviar la reseña.");
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("input,select,textarea,button").forEach((control) => { control.disabled = true; });
        status.textContent = "Gracias. Tu reseña quedó pendiente de moderación.";
      } catch (error) {
        button.disabled = false;
        status.textContent = error instanceof Error ? error.message : "No pudimos enviar la reseña.";
      }
    });
  });
}

export function trackedOrderHtml(order: TrackedOrder, token: string): string {
  const logo = assetUrl(order.store?.logoUrl ?? null);
  const storeUrl = order.store?.slug ? `/s/${encodeURIComponent(order.store.slug)}` : null;
  const items = Array.isArray(order.items) ? order.items : [];
  const reviewSection = trackedReviewHtml(order, token);
  const contact = order.store?.contactPhone || order.store?.contactEmail
    ? `<div class="tracking-support"><span>¿Necesitas ayuda con el pedido?</span><div>
        ${order.store.contactPhone ? `<a href="${escapeHtml(whatsAppLink(order.store.contactPhone))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        ${order.store.contactEmail ? `<a href="mailto:${escapeHtml(order.store.contactEmail)}">Correo</a>` : ""}
      </div></div>`
    : "";
  return `<main class="tracking-shell">
    <header class="tracking-brand">
      ${storeUrl ? `<a href="${escapeHtml(storeUrl)}" class="tracking-store-link">` : "<div class=\"tracking-store-link\">"}
        <span class="tracking-store-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="">` : escapeHtml(initials(order.storeName))}</span>
        <span><small>Pedido de</small><strong>${escapeHtml(order.storeName)}</strong></span>
      ${storeUrl ? "</a>" : "</div>"}
      <div class="tracking-reference"><small>N° de pedido</small><strong>${escapeHtml(order.reference)}</strong></div>
    </header>
    <section class="tracking-status-card" id="tracking-status-region" aria-live="polite">${trackingStatusRegionHtml(order)}</section>
    <section class="tracking-progress-section">
      <h2>Progreso</h2>
      <div id="tracking-timeline">${trackingTimelineHtml(order)}</div>
    </section>
    ${shipmentMarkup(order.shipment)}
    <section class="tracking-order-section">
      <div class="tracking-section-head"><h2>Tu pedido</h2><strong>${formatAmount(order.amount, order.currency)}</strong></div>
      ${order.fulfillment ? `<p class="tracking-fulfillment">${ICON_MAP_PIN}<span><strong>${order.fulfillment.method === "delivery" ? "Entrega desde" : "Retiro en"} ${escapeHtml(order.fulfillment.locationName)}</strong>${order.fulfillment.readyAt ? `<small>Disponible desde ${escapeHtml(new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", dateStyle: "full", timeStyle: "short" }).format(new Date(order.fulfillment.readyAt)))}</small>` : ""}</span></p>` : ""}
      <div class="tracking-items">${items.map((item) => `<div class="tracking-item"><span class="tracking-item-quantity">${item.quantity || 1}×</span><span><strong>${escapeHtml(item.name)}</strong>${item.variantName ? `<small>${escapeHtml(item.variantName)}</small>` : ""}${item.extras?.length ? `<small>${escapeHtml(pickedExtrasLabel(item.extras))}</small>` : ""}</span><strong>${formatAmount((item.unitAmount || 0) * (item.quantity || 1), order.currency)}</strong></div>`).join("") || '<p class="tracking-empty">El comercio no compartió el detalle de productos.</p>'}</div>
      ${contact}
    </section>
    ${reviewSection}
    <section class="tracking-account-cta">
      <div><h2>Guárdalo en Mi pagosYa</h2><p>Ingresa con el mismo correo que usaste al pagar para reunir este pedido con tus próximas compras.</p></div>
      <a href="${escapeHtml(trackingClaimUrl(token))}">Agregar a mi cuenta${ICON_ARROW_RIGHT}</a>
    </section>
    <p class="tracking-security">${ICON_LOCK}<span>Este enlace privado permite consultar el pedido. No lo compartas públicamente.</span></p>
  </main>`;
}

export async function renderOrderTracking(token: string): Promise<void> {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page", "debt-collection-page");
  document.body.classList.add("order-tracking-page");
  document.title = "Seguimiento de pedido — pagosYa";
  app.innerHTML = `<main class="tracking-shell tracking-loading" aria-busy="true"><div class="tracking-loading-mark"><img src="/logo-mark.png" alt=""><span>Cargando el estado de tu pedido…</span></div></main>`;
  let lastStatus = "";

  const load = async (initial: boolean) => {
    try {
      const order = await fetchTrackedOrder(token);
      if (initial || !document.getElementById("tracking-status-region")) {
        app.innerHTML = trackedOrderHtml(order, token);
        bindTrackedReviewForms(order, token);
        if (new URLSearchParams(window.location.search).get("review") === "1") {
          const reviewSection = app.querySelector<HTMLElement>("[data-review-section]");
          reviewSection?.scrollIntoView({ block: "start" });
          reviewSection?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
        }
      } else {
        const statusRegion = document.getElementById("tracking-status-region")!;
        statusRegion.innerHTML = trackingStatusRegionHtml(order);
        document.getElementById("tracking-timeline")!.innerHTML = trackingTimelineHtml(order);
        if (lastStatus && lastStatus !== order.status) {
          statusRegion.classList.remove("is-updated");
          void statusRegion.offsetWidth;
          statusRegion.classList.add("is-updated");
          statusRegion.addEventListener("animationend", () => statusRegion.classList.remove("is-updated"), { once: true });
        }
      }
      if (initial || lastStatus !== order.status) void mountDigitalDownloads(app, token);
      if (initial || lastStatus !== order.status) void mountComebackCard(app, token);
      lastStatus = order.status;
    } catch (error) {
      if (!initial) return;
      app.innerHTML = `<main class="tracking-shell tracking-error"><div class="status failed">${ICON_X}<span>${escapeHtml((error as Error).message)}</span></div><p>Revisa que hayas abierto el enlace completo que recibiste después de pagar.</p><button type="button" class="secondary" id="tracking-retry">Intentar de nuevo</button></main>`;
      app.querySelector<HTMLButtonElement>("#tracking-retry")?.addEventListener("click", () => renderOrderTracking(token));
    }
  };

  await load(true);
  if (state.orderTrackingPoll !== null) window.clearInterval(state.orderTrackingPoll);
  if (state.orderTrackingVisibilityHandler) document.removeEventListener("visibilitychange", state.orderTrackingVisibilityHandler);
  if (document.getElementById("tracking-status-region")) {
    state.orderTrackingPoll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 20_000);
    state.orderTrackingVisibilityHandler = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", state.orderTrackingVisibilityHandler);
  }
}
