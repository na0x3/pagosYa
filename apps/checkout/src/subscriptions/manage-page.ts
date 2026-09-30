/** The token-gated page a subscriber reaches from a renewal message to pay, skip, pause, change frequency or cancel. */
import { actOnSubscription, fetchSubscription, type SubscriptionManageView } from "../api";
import { markPrivateStorePage } from "../store-seo";
import { app } from "../ui/app";
import { escapeHtml, formatAmount } from "../ui/html";

const HISTORY_LABEL: Record<string, string> = { PAID: "Pagado", MISSED: "Sin pagar", SKIPPED: "Saltado", DUE: "Pendiente", CANCELED: "Cancelado" };
const day = (iso: string) => new Date(iso).toLocaleDateString("es-BO", { day: "numeric", month: "long" });

export function manageViewHtml(view: SubscriptionManageView, confirmingCancel = false): string {
  const status = view.status === "ACTIVE" ? `Próxima entrega: ${escapeHtml(day(view.nextBillingAt))}` : view.status === "PAUSED" ? "Pausada" : "Cancelada";
  const pay = view.openPayment ? `<a class="primary" href="${escapeHtml(view.openPayment.checkoutUrl)}">Pagar ${escapeHtml(formatAmount(view.openPayment.amount, view.currency))}</a><p class="faint">Vence el ${escapeHtml(day(view.openPayment.dueAt))}</p>` : "";
  const cancel = confirmingCancel
    ? `<p>¿Cancelar tu suscripción? No se cobrará nada más.</p><button type="button" data-action="cancel" data-confirmed="1">Sí, cancelar</button><button type="button" data-keep>No</button>`
    : `<button type="button" class="quiet" data-action="cancel">Cancelar suscripción</button>`;
  const actions = view.status === "ACTIVE"
    ? `<button type="button" data-action="skip">Saltar la próxima</button>
       <label>Frecuencia <select name="cadence">${view.cadenceOptions.map(option => `<option value="${escapeHtml(option.cadence)}" ${option.cadence === view.cadence ? "selected" : ""}>${escapeHtml(option.label)}${option.discountPercent ? ` · −${option.discountPercent}%` : ""}</option>`).join("")}</select></label>
       <button type="button" data-action="change_cadence">Cambiar frecuencia</button>
       <button type="button" data-action="pause">Pausar</button>${cancel}`
    : view.status === "PAUSED" ? `<button type="button" class="primary" data-action="resume">Reanudar</button>${cancel}` : "";
  return `<main class="subscription-manage">
    <h1>Tu suscripción en ${escapeHtml(view.storeName)}</h1>
    <section class="card"><h2>${escapeHtml(view.itemName)}</h2><p>${escapeHtml(formatAmount(view.amount, view.currency))} · ${escapeHtml(view.cadenceLabel)}</p><p>${status}</p>${pay}</section>
    ${actions ? `<section class="card subscription-manage__actions">${actions}</section>` : ""}
    <section class="card"><h2>Historial</h2><ul>${view.history.map(entry => `<li>${escapeHtml(day(entry.periodStart))} · ${escapeHtml(HISTORY_LABEL[entry.status] ?? entry.status)} · ${escapeHtml(formatAmount(entry.amount, view.currency))}</li>`).join("")}</ul></section>
    <p class="faint">No se cobra nada automáticamente.</p>
    <p role="status" data-manage-status></p>
  </main>`;
}

export async function renderSubscriptionManage(token: string): Promise<void> {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page", "debt-collection-page");
  document.body.classList.add("subscription-manage-page");
  document.title = "Tu suscripción — pagosYa";
  markPrivateStorePage();
  let view: SubscriptionManageView;
  let confirmingCancel = false;
  const paint = (status = "") => { app.innerHTML = manageViewHtml(view, confirmingCancel); const line = app.querySelector("[data-manage-status]"); if (line) line.textContent = status; };
  app.innerHTML = `<main class="subscription-manage"><p role="status">Cargando tu suscripción…</p></main>`;
  try { view = await fetchSubscription(token); paint(); }
  catch (error) {
    app.innerHTML = `<main class="subscription-manage"><p role="alert">${escapeHtml((error as Error).message)}</p><button type="button" id="manage-retry">Reintentar</button></main>`;
    app.querySelector("#manage-retry")?.addEventListener("click", () => renderSubscriptionManage(token));
    return;
  }
  app.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    if (button.hasAttribute("data-keep")) { confirmingCancel = false; paint(); return; }
    const action = button.dataset.action;
    if (!action) return;
    if (action === "cancel" && !button.dataset.confirmed) { confirmingCancel = true; paint(); return; }
    button.disabled = true;
    try {
      const cadence = action === "change_cadence" ? (app.querySelector<HTMLSelectElement>("select[name=cadence]")?.value) : undefined;
      view = await actOnSubscription(token, { action, ...(cadence ? { cadence } : {}) });
      confirmingCancel = false;
      paint("Listo, guardamos el cambio.");
    } catch (error) { paint((error as Error).message); }
  });
}
