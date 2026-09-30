/** What the buyer sees after paying: success with receipt printing, failure, required actions, and international returns. */
import { mountDigitalDownloads } from "../digital-downloads";
import { mountComebackCard, mountComebackPreviewCard } from "../comeback-card";
import { CheckoutSession, simulateRailCallback, fetchSession } from "../api";
import { isNavigableRedirect, rememberReturn, recallReturn } from "../international";
import { postToParent } from "../postmessage";
import { closeSourcePaymentPreview } from "../source-payment-preview";
import { state } from "../state";
import { escapeHtml, formatAmount } from "../ui/html";
import { storeCatalogUrl } from "../storefront/routes";
import { ICON_CLOCK, ICON_ARROW_RIGHT, ICON_PRINTER, ICON_CHECK, ICON_X } from "../ui/icons";
import { app } from "../ui/app";
import { mountConfirmationMotif } from "../checkout-motif";

export function closePendingIntlPopup() {
  state.pendingIntlPopup?.close();
  state.pendingIntlPopup = null;
}

export interface CartLine {
  paymentLinkId: string;
  name: string;
  variantName?: string;
  quantity: number;
  unitAmount: number;
}

// Accepts either a confirmed PaymentIntent or a re-fetched CheckoutSession —
// both carry the same id/amount/currency/metadata shape the receipt needs.
export interface OrderSummary {
  id: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  customerName?: string | null;
  customerEmail?: string | null;
  recipient?: CheckoutRecipient | null;
}

export interface CheckoutRecipient {
  name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
}

export function isStoreCheckout(order: Pick<OrderSummary, "metadata">): boolean {
  return Array.isArray(order.metadata?.cart);
}

export function checkoutRecipientDetails(order: Pick<CheckoutSession, "metadata" | "recipient">): CheckoutRecipient | null {
  if (order.recipient) return order.recipient;
  const value = order.metadata?.debt;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const debt = value as Record<string, unknown>;
  if (typeof debt.customerName !== "string") return null;
  return {
    name: debt.customerName,
    document: typeof debt.customerDocument === "string" ? debt.customerDocument : null,
    email: typeof debt.customerEmail === "string" ? debt.customerEmail : null,
    phone: typeof debt.customerPhone === "string" ? debt.customerPhone : null,
  };
}

// wa.me only accepts digits (with country code, no "+" or separators) —
// strip everything else out of whatever format the merchant typed in.
export function whatsAppLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
}

// Shared by the success receipt and the failure/cancellation screens — a
// customer who couldn't complete payment needs the same support path as one
// who did, not less of one.
export function contactBlockHtml(prompt: string): string {
  if (!state.linkHeader?.contactPhone && !state.linkHeader?.contactEmail) return "";
  return `<div class="receipt-contact">
      <span>${escapeHtml(prompt)}</span>
      ${state.linkHeader.contactPhone ? `<a href="${escapeHtml(whatsAppLink(state.linkHeader.contactPhone))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      ${state.linkHeader.contactEmail ? `<a href="mailto:${escapeHtml(state.linkHeader.contactEmail)}">${escapeHtml(state.linkHeader.contactEmail)}</a>` : ""}
    </div>`;
}

// The cart is already cleared by the time a customer reaches a payment
// result, so this gives every outcome a fresh route back to the same store.
export function backToStoreHtml(): string {
  if (state.currentDebtSlug) {
    return `<a class="back-to-store" href="/?debt=${encodeURIComponent(state.currentDebtSlug)}">Volver al cobro</a>`;
  }
  if (!state.currentStoreSlug) return "";
  return `<a class="back-to-store" href="${escapeHtml(storeCatalogUrl(state.currentStoreSlug))}">Volver a la tienda</a>`;
}

const reportedPurchases = new Set<string>();
/**
 * The sale, reported through the storefront's PAGOSYA_TRACK when present (every installed
 * extension listens there), else to whichever measurement tag is loaded. They are loaded
 * only when the shopper accepted statistics, so finding none here means "do not track" and
 * the sale is simply not reported — pagosYa's own order record is unaffected.
 * Guarded by order id because a re-render of the success screen is not a second sale.
 */
function reportPurchase(order: OrderSummary) {
  if (reportedPurchases.has(order.id)) return;
  reportedPurchases.add(order.id);
  const runtime = window as unknown as { gtag?: (...args: unknown[]) => void; fbq?: (...args: unknown[]) => void; ttq?: { track?: (...args: unknown[]) => void } };
  const value = order.amount / 100, currency = String(order.currency || "").toUpperCase();
  const track = (window as unknown as { PAGOSYA_TRACK?: (name: string, data: unknown) => void }).PAGOSYA_TRACK;
  // Stores on the extensions framework expose one entry point; every installed pixel listens there.
  if (typeof track === "function") { try { track("purchase", { orderId: order.id, value, currency }); } catch {} return; }
  try { runtime.gtag?.("event", "purchase", { transaction_id: order.id, value, currency }); } catch {}
  try { runtime.fbq?.("track", "Purchase", { value, currency }); } catch {}
  try { runtime.ttq?.track?.("CompletePayment", { value, currency }); } catch {}
}

export function renderSuccess(order: OrderSummary, preview = false) {
  try { sessionStorage.removeItem("pagosya_subscription_checkout"); } catch { /* nothing to clear */ }
  document.body.classList.add("payment-page", "payment-success-page");
  const cart = Array.isArray(order.metadata?.cart) ? order.metadata.cart as CartLine[] : null;
  const storeCheckout = Boolean(cart);
  const subscription = order.metadata?.subscription && typeof order.metadata.subscription === "object" && !Array.isArray(order.metadata.subscription) ? order.metadata.subscription as Record<string, unknown> : null;
  const appointment = order.metadata?.appointment && typeof order.metadata.appointment === "object" && !Array.isArray(order.metadata.appointment) ? order.metadata.appointment as Record<string, unknown> : null;
  const recipientName = order.recipient?.name || order.customerName || (typeof subscription?.customerName === "string" ? subscription.customerName : null);
  const periodValue = typeof subscription?.periodStart === "string" ? subscription.periodStart : typeof appointment?.startsAt === "string" ? appointment.startsAt : null;
  const periodLabel = appointment ? "Fecha de la cita" : subscription ? "Período cubierto" : null;
  const periodText = periodValue ? new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", dateStyle: "long", ...(appointment ? { timeStyle: "short" } : {}) }).format(new Date(periodValue)) : null;

  const linesHtml = cart?.length
    ? cart
        .map(
          (line) => `
        <div class="receipt-line">
          <span>${escapeHtml(line.name)}${line.variantName ? ` · ${escapeHtml(line.variantName)}` : ""} <span class="receipt-qty">x${line.quantity}</span></span>
          <span>${formatAmount(line.unitAmount * line.quantity, order.currency)}</span>
        </div>`,
        )
        .join("")
    : `
      <div class="receipt-line">
        <span>${escapeHtml((order as CheckoutSession).description || state.linkHeader?.description || "Pago")}</span>
        <span>${formatAmount(order.amount, order.currency)}</span>
      </div>`;

  const receiptContentHtml = `
    <header class="receipt-brand">
      <span><img src="/logo-mark.png" alt=""><strong>pagosYa</strong></span>
      <small>${preview ? "Vista previa · Sin cobros" : "Comprobante de pago"}</small>
    </header>
    <div class="receipt-row">
      <span class="muted-label">${storeCheckout ? "N° de orden" : "N° de pago"}</span>
      <code>${escapeHtml(order.id)}</code>
    </div>
    <div class="receipt-items">${linesHtml}</div>
    ${recipientName ? `<div class="receipt-row"><span class="muted-label">Destinatario</span><strong>${escapeHtml(recipientName)}</strong></div>` : ""}
    ${periodLabel && periodText ? `<div class="receipt-row"><span class="muted-label">${periodLabel}</span><strong>${escapeHtml(periodText)}</strong></div>` : ""}
    <div class="receipt-row receipt-subtotal">
      <span>${storeCheckout ? "Subtotal" : "Total"}</span>
      <strong>${formatAmount(order.amount, order.currency)}</strong>
    </div>
    ${order.metadata?.storeCredit ? `<div class="receipt-row"><span>Saldo de tienda aplicado</span><strong>${formatAmount(Number((order.metadata.storeCredit as Record<string, unknown>).amount), order.currency)}</strong></div><div class="receipt-row"><span>Total del pedido</span><strong>${formatAmount(Number((order.metadata.storeCredit as Record<string, unknown>).orderTotal), order.currency)}</strong></div>` : ''}
    ${contactBlockHtml("¿Dudas o necesitas un reembolso?")}
  `;
  const trackingActionHtml = state.activeOrderTrackingToken
    ? `<a class="tracking-success-link receipt-action" href="/track/${encodeURIComponent(state.activeOrderTrackingToken)}">${ICON_CLOCK}<span><strong>Ver estado del pedido</strong><small>Preparación, envío o recojo</small></span>${ICON_ARROW_RIGHT}</a>`
    : "";
  const printActionHtml = `<button class="secondary receipt-download receipt-print receipt-action" type="button">${ICON_PRINTER}<span><strong>Imprimir comprobante</strong><small>Abrir vista de impresión</small></span>${ICON_ARROW_RIGHT}</button>`;
  const machineSummaryHtml = `
    <div class="payment-printer-machine-order">
      <span>${preview ? "Pago de prueba" : storeCheckout ? `${cart?.length ?? 0} ${(cart?.length ?? 0) === 1 ? "producto" : "productos"}` : "Comprobante"}</span>
      <strong>${formatAmount(order.amount, order.currency)}</strong>
    </div>
    <div class="payment-printer-machine-meta">
      <span>${escapeHtml((order as CheckoutSession).branding?.name || state.linkHeader?.storeName || "pagosYa")}</span>
      <code>${escapeHtml(order.id)}</code>
    </div>
  `;

  app.innerHTML = `
    <div class="payment-success-panel">
      <div class="status success">${ICON_CHECK}<span>${preview ? "Prueba completada" : storeCheckout ? "Pedido recibido" : "Pago confirmado"}</span></div>
      <article class="receipt">${receiptContentHtml}</article>
      <div class="payment-success-actions">${trackingActionHtml}${printActionHtml}</div>
      ${preview ? '<p>No se realizó ningún cobro ni se creó un pedido real.</p><button class="secondary" id="preview-back" type="button">Volver al pedido</button>' : backToStoreHtml()}
    </div>
  `;
  mountConfirmationMotif(app.querySelector('.payment-success-panel'));
  app.querySelector('#preview-back')?.addEventListener('click', closeSourcePaymentPreview);
  if (!preview && state.activeOrderTrackingToken) void mountDigitalDownloads(app.querySelector('.payment-success-panel')!, state.activeOrderTrackingToken);
  if (!preview && state.activeOrderTrackingToken) void mountComebackCard(app.querySelector('.payment-success-panel')!, state.activeOrderTrackingToken, order.id);
  const previewComeback = preview ? (order as CheckoutSession).previewComeback : null;
  if (previewComeback) mountComebackPreviewCard(app.querySelector('.payment-success-panel')!, previewComeback, (order as { customerName?: string | null }).customerName);
  app.querySelector<HTMLButtonElement>(".receipt-print")?.addEventListener("click", () => window.print());
  launchPaymentPrinter(order.id, {
    receiptContentHtml,
    machineSummaryHtml,
    subject: storeCheckout ? "pedido" : "comprobante",
    title: preview ? "Prueba completada" : storeCheckout ? "Tu pedido está listo" : "Tu comprobante está listo",
    trackingActionHtml,
    printActionHtml,
  });
  if (!preview) { reportPurchase(order); postToParent("PAYMENT_SUCCEEDED", { paymentIntentId: order.id, status: "succeeded" }); }
}

export const celebratedPaymentIntentIds = new Set<string>();

export function launchPaymentPrinter(
  paymentIntentId: string,
  content: {
    printActionHtml: string;
    receiptContentHtml: string;
    machineSummaryHtml: string;
    subject: "pedido" | "comprobante";
    title: string;
    trackingActionHtml: string;
  },
): void {
  if (celebratedPaymentIntentIds.has(paymentIntentId)) return;
  celebratedPaymentIntentIds.add(paymentIntentId);

  const celebration = document.createElement("div");
  celebration.className = "payment-success-overlay";
  celebration.dataset.stage = "printing";
  celebration.setAttribute("role", "dialog");
  celebration.setAttribute("aria-modal", "true");
  celebration.setAttribute("aria-labelledby", "payment-printer-title");
  celebration.tabIndex = -1;
  celebration.innerHTML = `
    <button class="payment-printer-close" type="button" aria-label="Cerrar comprobante">
      <span aria-hidden="true">×</span>
      <small>Presiona X</small>
    </button>
    <div class="payment-printer-scene">
      <div class="payment-printer-device" aria-hidden="true">
        <div class="payment-printer-machine-header">
          <span class="payment-printer-machine-brand"><img src="/logo-mark.png" alt=""><strong>pagosYa</strong></span>
          <span class="payment-printer-machine-led"><i></i> POS</span>
        </div>
        <div class="payment-printer-machine-screen">
          ${content.machineSummaryHtml}
          <div class="payment-printer-progress">
            <span class="payment-printer-progress-mark" aria-hidden="true"><i></i><i></i><i></i></span>
            <span data-printer-status>Imprimiendo tu ${content.subject}…</span>
          </div>
        </div>
        <span class="payment-printer-slot"></span>
      </div>
      <div class="payment-printer-output" aria-hidden="true">
        <span class="payment-printer-output-shadow"></span>
        <article class="payment-printer-feed">
          <h2>Comprobante</h2>
          ${content.receiptContentHtml}
        </article>
      </div>
      <article class="payment-printer-paper" aria-hidden="true" inert>
        <h1 id="payment-printer-title">${escapeHtml(content.title)}</h1>
        <div class="payment-printer-receipt">${content.receiptContentHtml}</div>
        <div class="payment-printer-actions">${content.trackingActionHtml}${content.printActionHtml}</div>
      </article>
      <p class="payment-printer-dismiss-hint">Cuando termine, presiona <kbd>X</kbd> para cerrar.</p>
    </div>
    <p class="payment-printer-live" data-printer-live role="status" aria-live="polite" aria-atomic="true">Imprimiendo tu ${content.subject}…</p>
  `;

  const receipt = celebration.querySelector<HTMLElement>(".payment-printer-paper")!;
  const feedPaper = celebration.querySelector<HTMLElement>(".payment-printer-feed")!;
  const closeButton = celebration.querySelector<HTMLButtonElement>(".payment-printer-close")!;
  const status = celebration.querySelector<HTMLElement>("[data-printer-status]")!;
  const liveStatus = celebration.querySelector<HTMLElement>("[data-printer-live]")!;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shouldReduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const receiptFinal = "translate(-50%, -50%) translateY(0%) scale(1)";
  const runningAnimations: Animation[] = [];
  let stageTimer: number | null = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (stageTimer !== null) window.clearTimeout(stageTimer);
    runningAnimations.forEach((animation) => animation.cancel());
    document.removeEventListener("keydown", handleKeydown);
    celebration.remove();
    app.removeAttribute("inert");
    document.dispatchEvent(new CustomEvent("pagosya:receipt-closed"));
    if (!document.querySelector(".payment-success-overlay")) {
      document.documentElement.classList.remove("payment-success-overlay-open");
      document.body.classList.remove("payment-success-overlay-open");
    }
    previousFocus?.focus();
  };

  const showReceipt = () => {
    if (finished || celebration.dataset.stage === "receipt") return;
    runningAnimations.forEach((animation) => animation.cancel());
    runningAnimations.length = 0;
    celebration.dataset.stage = "receipt";
    receipt.removeAttribute("aria-hidden");
    receipt.removeAttribute("inert");
    status.textContent = content.title;
    liveStatus.textContent = content.title;
    if (!shouldReduceMotion && typeof receipt.animate === "function") {
      const expand = receipt.animate(
        [
          { opacity: 0, transform: "translate(-50%, -50%) translateY(8px) scale(.96)" },
          { opacity: 1, transform: receiptFinal },
        ],
        { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
      );
      runningAnimations.push(expand);
      void expand.finished.then(() => {
        receipt.style.transform = receiptFinal;
        expand.cancel();
        closeButton.focus();
      }).catch(() => undefined);
    } else {
      receipt.style.transform = receiptFinal;
      closeButton.focus();
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key.toLowerCase() === "x") {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key !== "Tab" || celebration.dataset.stage !== "receipt") return;
    const focusable = Array.from(celebration.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.documentElement.classList.add("payment-success-overlay-open");
  document.body.classList.add("payment-success-overlay-open");
  app.setAttribute("inert", "");
  document.body.appendChild(celebration);
  celebration.focus();
  closeButton.addEventListener("click", finish);
  celebration.addEventListener("click", (event) => {
    if (event.target === celebration && celebration.dataset.stage === "receipt") finish();
  });
  celebration.querySelectorAll<HTMLButtonElement>(".receipt-print").forEach((button) => {
    button.addEventListener("click", () => window.print());
  });
  document.addEventListener("keydown", handleKeydown);

  if (shouldReduceMotion || typeof feedPaper.animate !== "function") {
    stageTimer = window.setTimeout(showReceipt, shouldReduceMotion ? 320 : 2400);
    return;
  }

  const feed = feedPaper.animate(
    [
      { opacity: 0, transform: "translateY(calc(-100% + 2px))", offset: 0 },
      { opacity: 1, transform: "translateY(-91%)", offset: 0.075 },
      { opacity: 1, transform: "translateY(-91%)", offset: 0.105 },
      { opacity: 1, transform: "translateY(-81%)", offset: 0.18 },
      { opacity: 1, transform: "translateY(-81%)", offset: 0.21 },
      { opacity: 1, transform: "translateY(-70%)", offset: 0.285 },
      { opacity: 1, transform: "translateY(-70%)", offset: 0.315 },
      { opacity: 1, transform: "translateY(-58%)", offset: 0.39 },
      { opacity: 1, transform: "translateY(-58%)", offset: 0.42 },
      { opacity: 1, transform: "translateY(-45%)", offset: 0.495 },
      { opacity: 1, transform: "translateY(-45%)", offset: 0.525 },
      { opacity: 1, transform: "translateY(-32%)", offset: 0.6 },
      { opacity: 1, transform: "translateY(-32%)", offset: 0.63 },
      { opacity: 1, transform: "translateY(-20%)", offset: 0.705 },
      { opacity: 1, transform: "translateY(-20%)", offset: 0.735 },
      { opacity: 1, transform: "translateY(-10%)", offset: 0.81 },
      { opacity: 1, transform: "translateY(-10%)", offset: 0.84 },
      { opacity: 1, transform: "translateY(-3%)", offset: 0.915 },
      { opacity: 1, transform: "translateY(-3%)", offset: 0.945 },
      { opacity: 1, transform: "translateY(0%)", offset: 1 },
    ],
    { duration: 2400, easing: "linear", fill: "forwards" },
  );
  runningAnimations.push(feed);
  void feed.finished.then(showReceipt).catch(() => undefined);
  stageTimer = window.setTimeout(showReceipt, 2520);
}

// `prefixed = false` shows the message verbatim, with no "Pago fallido: "
// lead-in — used only for the API's own refusal message (e.g. a merchant
// over its payment limit), which must reach the buyer exactly as sent.
export function renderFailed(paymentIntentId: string, message: string, prefixed = true) {
  const statusText = prefixed ? `Pago fallido: ${escapeHtml(message)}` : escapeHtml(message);
  app.innerHTML = `
    <div class="payment-outcome-panel">
      <div class="status failed">${ICON_X}<span>${statusText}</span></div>
      ${contactBlockHtml("¿Necesitas ayuda?")}
      ${backToStoreHtml()}
    </div>
  `;
  postToParent("PAYMENT_FAILED", { paymentIntentId, error: { message } });
}

export function renderRequiresAction(paymentIntentId: string, clientSecret: string, railId: string, actionRequired: unknown) {
  const action = actionRequired as { type: string; data: Record<string, string> } | undefined;
  // A redirect we can't safely follow (not https, or http outside dev) falls
  // through to the generic waiting block below instead of being navigated to.
  if (action?.type === "redirect" && action.data.redirectUrl && isNavigableRedirect(action.data.redirectUrl, import.meta.env.DEV)) {
    const redirectUrl = action.data.redirectUrl;
    // Embedded (widget iframe): sessionStorage is partitioned by top-level
    // site, so navigating window.top to dLocal and back would never find the
    // remembered client secret, and the merchant page would never get
    // PAYMENT_SUCCEEDED. Reuse the popup submitPayment already opened
    // synchronously (while the click still counted) and point it at the
    // real URL, then poll from inside the iframe, which keeps
    // sessionStorage/postToParent working normally.
    if (window.top !== window.self) {
      if (state.pendingIntlPopup && !state.pendingIntlPopup.closed) {
        const popup = state.pendingIntlPopup;
        state.pendingIntlPopup = null;
        popup.location.href = redirectUrl;
        app.innerHTML = `<div class="payment-outcome-panel payment-action-panel"><div class="status action">${ICON_CLOCK}<span>Completa el pago en la ventana de dLocal. Esta página se actualizará sola.</span></div></div>`;
        void pollInternationalOutcome(clientSecret, paymentIntentId, 10 * 60_000, popup);
        return;
      }
      // No popup (blocked, closed early, or never opened): fall back to the
      // top-navigation path below.
      state.pendingIntlPopup = null;
    }
    rememberReturn(window.sessionStorage, paymentIntentId, clientSecret);
    app.innerHTML = `<div class="payment-outcome-panel payment-action-panel"><div class="status action">${ICON_CLOCK}<span>Te estamos llevando a la página de pago segura…</span></div></div>`;
    try {
      window.top!.location.href = redirectUrl;
    } catch {
      window.location.href = redirectUrl;
    }
    return;
  }
  // The rail returned a non-redirect action (QR/USSD/etc). If submitPayment
  // preemptively opened a popup for this submission expecting a redirect, it
  // isn't needed — close the stray blank tab instead of leaving it open.
  closePendingIntlPopup();
  // Real bank QR (e.g. Baneco) returns a ready-to-scan PNG; the mock rail only has a raw
  // EMV-ish payload string to render as text — support both without the adapter caring.
  const qrImageHtml =
    action?.type === "qr_display" && action.data.qrImageBase64
      ? `<img class="qr-image" alt="Código QR" src="data:image/png;base64,${action.data.qrImageBase64}" />`
      : "";
  const message =
    action?.type === "ussd_prompt"
      ? action.data.message
      : action?.type === "qr_display"
        ? qrImageHtml
          ? "Escanee el código QR con su app bancaria"
          : `Escanee el código QR: ${action.data.qrPayload}`
        : "Esperando confirmación...";

  app.innerHTML = `
    <div class="payment-outcome-panel payment-action-panel">
      <div class="status action">${ICON_CLOCK}<span>${message}</span></div>
      ${qrImageHtml}
      ${import.meta.env.DEV ? `<button class="secondary" id="simulate">[dev] Simular confirmación exitosa</button>` : ""}
    </div>
  `;

  if (import.meta.env.DEV) {
    const simulate = app.querySelector<HTMLButtonElement>("#simulate")!;
    simulate.addEventListener("click", async () => {
      try {
        await simulateRailCallback(railId, paymentIntentId, "succeeded");
        const updated = await fetchSession(clientSecret, state.checkoutPublishableKey);
        renderSuccess(updated);
      } catch (error) {
        simulate.textContent = `[dev] ${error instanceof Error ? error.message : "No se pudo simular"}`;
      }
    });
  }
}

export function paymentPendingNotice(text: string) {
  app.innerHTML = `<div class="payment-outcome-panel"><div class="status action">${ICON_CLOCK}<span>${text}</span></div></div>`;
}

// Shared by the top-level dLocal return page and the embedded (widget
// iframe) popup flow: polls the session until it reaches a terminal status,
// rendering the same success/failure screens either way so the existing
// postToParent calls inside renderSuccess/renderFailed fire in both cases.
// A single failed poll (network blip, transient 5xx) must not end the
// checkout, so fetchSession errors are swallowed and the loop just retries.
// `popup`, when passed (the embedded case), is the dLocal window this poll
// is standing in for — it's closed whenever polling reaches a final state so
// the shopper isn't left with a stray dLocal/return tab open.
export async function pollInternationalOutcome(clientSecret: string, paymentIntentId: string, deadlineMs: number, popup?: Window | null): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const session = await fetchSession(clientSecret, state.checkoutPublishableKey);
      if (session.status === "SUCCEEDED") {
        popup?.close();
        return renderSuccess(session);
      }
      if (session.status === "FAILED" || session.status === "CANCELED") {
        popup?.close();
        return renderFailed(session.id, "El pago no se completó. Puedes intentar con otro método.");
      }
    } catch {
      // Recoverable — keep polling until the deadline instead of stranding
      // the shopper on a "Confirmando tu pago…" screen forever.
    }
    if (Date.now() > deadline) {
      popup?.close();
      paymentPendingNotice("Tu pago está pendiente. Si pagaste con comprobante o transferencia puede tardar; te avisaremos por correo.");
      return;
    }
    paymentPendingNotice("Confirmando tu pago…");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export async function renderInternationalReturn(paymentIntentId: string) {
  document.body.classList.add("payment-page");
  const clientSecret = recallReturn(window.sessionStorage, paymentIntentId);
  if (!clientSecret) {
    paymentPendingNotice("Recibimos tu regreso. Cuando se confirme el pago, te llegará el comprobante por correo.");
    return;
  }
  await pollInternationalOutcome(clientSecret, paymentIntentId, 2 * 60_000);
}
