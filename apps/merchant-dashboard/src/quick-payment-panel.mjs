import { debtAmountInCents } from "./debt-csv.mjs";

/**
 * Cobro rápido: one-off QR payment and its status polling (moved from dashboard.js 2026-10-15, no behaviour change).
 * create…() only looks things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)                 authenticated dashboard API call
 *   storeId()                          the active store id, read at use time
 *   refreshFinancesInBackground(...)   finances panel: refreshes balances without blocking
 */
export function createQuickPaymentPanel(deps) {
  const { api, refreshFinancesInBackground } = deps;
  let quickPaymentPollTimer = null;
  let quickPaymentPollGeneration = 0;

  function stopQuickPaymentPolling() {
    quickPaymentPollGeneration += 1;
    if (quickPaymentPollTimer) window.clearTimeout(quickPaymentPollTimer);
    quickPaymentPollTimer = null;
  }

  function setQuickPaymentOutcome(status) {
    const statusEl = document.getElementById("quickPaymentResultStatus");
    if (status === "SUCCEEDED") {
      statusEl.textContent = "Pago recibido y registrado correctamente.";
      statusEl.classList.add("success-text");
      refreshFinancesInBackground();
      return true;
    }
    if (["FAILED", "CANCELED"].includes(status)) {
      statusEl.textContent = status === "CANCELED" ? "Este cobro fue cancelado." : "El pago no se completó. Crea un nuevo QR para reintentar.";
      statusEl.classList.remove("success-text");
      return true;
    }
    return false;
  }

  function pollQuickPayment(paymentIntentId) {
    stopQuickPaymentPolling();
    const generation = quickPaymentPollGeneration;
    let attempts = 0;
    const poll = async () => {
      if (generation !== quickPaymentPollGeneration) return;
      attempts += 1;
      try {
        const payment = await api(`/payment_intents/${paymentIntentId}`);
        if (generation !== quickPaymentPollGeneration || setQuickPaymentOutcome(payment.status)) return;
      } catch {
        // A temporary dashboard/network failure does not invalidate the bank
        // QR. Keep the visible QR and try again within the bounded window.
      }
      if (attempts >= 60) {
        document.getElementById("quickPaymentResultStatus").textContent = "El QR sigue visible, pero dejamos de consultar automáticamente. Revisa Pedidos y pagos para confirmar el estado.";
        return;
      }
      quickPaymentPollTimer = window.setTimeout(poll, 2500);
    };
    quickPaymentPollTimer = window.setTimeout(poll, 2500);
  }

  function init() {
    document.getElementById("quickPaymentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!deps.storeId()) return;
      const form = event.currentTarget;
      const submit = document.getElementById("quickPaymentSubmit");
      const formStatus = document.getElementById("quickPaymentFormStatus");
      formStatus.textContent = "";
      try {
        const data = new FormData(form);
        const amount = debtAmountInCents(data.get("amount"));
        const description = String(data.get("description") || "").trim();
        submit.disabled = true;
        submit.textContent = "Generando…";
        stopQuickPaymentPolling();
        const payment = await api(`/stores/${deps.storeId()}/quick-qr-payments`, {
          method: "POST",
          body: JSON.stringify({ amount, ...(description && { description }) }),
        });
        const result = document.getElementById("quickPaymentResult");
        const qr = document.getElementById("quickPaymentQr");
        document.getElementById("quickPaymentResultDescription").textContent = payment.description;
        document.getElementById("quickPaymentResultAmount").textContent = `${(payment.amount / 100).toFixed(2)} ${payment.currency}`;
        document.getElementById("quickPaymentResultStatus").classList.remove("success-text");
        if (payment.qrImageDataUrl) {
          qr.src = payment.qrImageDataUrl;
          qr.hidden = false;
          document.getElementById("quickPaymentResultStatus").textContent = "Esperando que el cliente escanee y confirme el pago…";
        } else {
          qr.removeAttribute("src");
          qr.hidden = true;
          document.getElementById("quickPaymentResultStatus").textContent = "El banco no devolvió una imagen QR. Crea un nuevo cobro o inténtalo nuevamente en unos segundos.";
        }
        result.hidden = false;
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (!setQuickPaymentOutcome(payment.status)) pollQuickPayment(payment.paymentIntentId);
      } catch (error) {
        formStatus.textContent = error.message;
      } finally {
        submit.disabled = false;
        submit.textContent = "Generar QR";
      }
    });

    document.getElementById("quickPaymentNew").addEventListener("click", () => {
      stopQuickPaymentPolling();
      document.getElementById("quickPaymentResult").hidden = true;
      document.getElementById("quickPaymentForm").reset();
      document.getElementById("quickPaymentFormStatus").textContent = "";
      document.getElementById("quickPaymentAmount").focus();
    });
  }

  return { init, stopQuickPaymentPolling };
}
