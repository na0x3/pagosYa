import { escapeHtml as esc } from "./html.mjs";
import { formatMoney } from "./cobros.mjs";
import { REMINDER_LABEL, SOURCE_LABEL, anonymousLine, cartItemsText, cartPerson, mailtoFollowUpUrl, showsReminder, timeAgo, whatsAppFollowUpUrl } from "./abandoned-carts.mjs";

/**
 * Crecer › Carritos abandonados (spec 2026-10-13-abandoned-carts): shoppers who pressed Pagar or saved their cart and
 * did not pay, newest first, each with a WhatsApp and an email link the merchant edits before sending; anonymous
 * sessions only as a count. Read-only: nothing is sent or stored from here. Every interpolated value goes through esc().
 *
 * deps:
 *   api(path, options)   authenticated dashboard API call (throws Error with .status)
 *   storeId(), store()   the active store id and row
 *   signedIn()           whether a merchant session exists
 */
export function mountAbandonedCartsPanel(deps) {
  const root = document.getElementById("abandonedCartsRoot");
  if (!root) return { show() {}, reset() {} };

  const PERIODS = [7, 30];
  let days = 7;
  let data = null;
  let loadedFor = null;
  let loading = false;
  let failure = null;
  let request = 0;

  async function load() {
    if (!deps.storeId() || !deps.signedIn()) { data = null; render(); return; }
    const mine = ++request;
    const store = deps.storeId();
    loading = true; failure = null; render();
    try {
      const answer = await deps.api(`/stores/${encodeURIComponent(store)}/abandoned-carts?days=${days}`);
      if (mine !== request) return;
      // An unexpected body renders as the empty state, never as a broken page.
      data = { anonymousSessions: Number(answer?.anonymousSessions) || 0, carts: Array.isArray(answer?.carts) ? answer.carts : [] };
      loadedFor = store;
    } catch (error) {
      if (mine !== request) return;
      failure = error?.message || "No pudimos cargar los carritos abandonados.";
    } finally {
      if (mine === request) { loading = false; render(); }
    }
  }

  function render() {
    if (!deps.storeId()) {
      root.innerHTML = `<section class="growth-empty"><h3>Elige o crea una tienda</h3><p>Aquí verás quién dejó productos sin pagar en la tienda seleccionada.</p></section>`;
      return;
    }
    if (!data && loading) { root.innerHTML = `<div class="growth-skeleton" aria-busy="true" aria-label="Cargando carritos abandonados"><span></span><span></span></div>`; return; }
    if (!data && failure) { root.innerHTML = `<section class="growth-error" role="alert"><p>${esc(failure)}</p><button type="button" class="primary" data-carts-retry>Reintentar</button></section>`; return; }
    if (!data) { root.innerHTML = ""; return; }
    const storeName = deps.store()?.name || "nuestra tienda";
    root.innerHTML = `
      <div class="carts" ${loading ? 'aria-busy="true"' : ""}>
        <div class="growth-toolbar">
          <div class="growth-period" role="group" aria-label="Periodo">
            ${PERIODS.map((value) => `<button type="button" data-carts-days="${value}" aria-pressed="${value === days}">${value} días</button>`).join("")}
          </div>
          <p class="carts-anonymous">${esc(anonymousLine(data.anonymousSessions))}</p>
        </div>
        ${failure ? `<p class="growth-error" role="alert">${esc(failure)}</p>` : ""}
        ${data.carts.length ? `<ol class="carts-list">${data.carts.map((cart) => row(cart, storeName)).join("")}</ol>` : `<p class="carts-empty">Todavía no hay carritos abandonados con contacto.</p>`}
      </div>`;
  }

  function row(cart, storeName) {
    const whatsapp = whatsAppFollowUpUrl(cart, storeName);
    const mail = mailtoFollowUpUrl(cart, storeName);
    const reminder = REMINDER_LABEL[cart.reminder] ? cart.reminder : "none";
    return `<li class="carts-row">
      <div class="carts-who"><strong>${esc(cartPerson(cart))}</strong><span>${esc(timeAgo(cart.leftAt))}</span></div>
      <p class="carts-items">${esc(cartItemsText(cart.items))} · <strong>${esc(formatMoney(cart.total, cart.currency))}</strong></p>
      <p class="carts-tags"><span class="carts-tag">${esc(SOURCE_LABEL[cart.source] || "")}</span>${showsReminder(cart) ? `<span class="carts-tag is-${esc(reminder)}">${esc(REMINDER_LABEL[reminder])}</span>` : ""}</p>
      ${whatsapp || mail ? `<p class="carts-actions">${whatsapp ? `<a href="${esc(whatsapp)}" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>` : ""}${mail ? `<a href="${esc(mail)}">Escribir por correo</a>` : ""}</p>` : ""}
    </li>`;
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || !root.contains(target)) return;
    if (target.dataset.cartsDays) {
      const next = Number(target.dataset.cartsDays);
      if (next !== days) { days = next; void load(); }
      return;
    }
    if (target.hasAttribute("data-carts-retry")) void load();
  });

  return {
    /** The view became visible: load the active store's list for the chosen period. */
    show() {
      if (loadedFor !== deps.storeId()) data = null;
      void load();
    },
    /** The active store changed. */
    reset() {
      request++;
      data = null; loadedFor = null; failure = null; loading = false;
      if (document.body.dataset.dashboardView === "abandoned-carts") void load();
      else root.innerHTML = "";
    },
  };
}
