import { escapeHtml as esc } from "./html.mjs";

/**
 * Bandeja: the store's customer threads, replies and the email-domain notice (moved from dashboard.js 2026-10-15,
 * no behaviour change). create…() only looks things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)          authenticated dashboard API call
 *   canLeaveMerchantStudio()    false while Studio has unsaved work
 *   selectMarketingTab(tab)     opens a Marketing tab
 *   setDashboardView(view)      switches the dashboard view
 *   storeId()                   the active store id, read at use time
 *   stores()                    the merchant's stores, read at use time
 */
export function createInboxPanel(deps) {
  const { api, canLeaveMerchantStudio, selectMarketingTab, setDashboardView } = deps;
  let inboxThreadId = null;
  let inboxDomainVerified = false;

  // A store can accumulate threads before it ever verifies an email domain:
  // reading is fine, but a reply would be rejected server-side. Disable the
  // form instead of letting the merchant type a reply and hit a Spanish error.
  function setInboxReplyEnabled(enabled, domain) {
    document.getElementById("inboxDomainNotice").hidden = enabled;
    document.getElementById("inboxReplyBody").disabled = !enabled;
    document.getElementById("inboxReplySubmit").disabled = !enabled;
    // El aviso lleva al paso que falta de verdad: conectar el dominio o confirmar sus registros.
    document.getElementById("inboxDomainStep").textContent = domain
      ? `Ya conectaste ${domain.name}: solo falta confirmar sus registros DNS.`
      : "Conecta el dominio desde el que responderás y confirma sus registros DNS.";
    document.getElementById("inboxDomainLink").textContent = domain
      ? `Verificar los registros de ${domain.name} →`
      : "Conectar mi dominio de correo →";
  }

  async function refreshInbox() {
    if (!deps.storeId()) return;
    const storeId = deps.storeId();
    const [threads, workspace] = await Promise.all([
      api(`/stores/${storeId}/inbox`),
      api(`/stores/${storeId}/email-workspace`),
    ]);
    if (storeId !== deps.storeId()) return;
    document.getElementById("inboxScopeLabel").textContent =
      deps.stores().find((store) => store.id === deps.storeId())?.name || "Sin tienda seleccionada";
    inboxDomainVerified = workspace?.domain?.status === "verified";
    setInboxReplyEnabled(inboxDomainVerified, workspace?.domain);
    document.getElementById("inboxThreads").innerHTML = threads.length
      ? threads.map((thread) => `<li><button type="button" data-thread-id="${esc(thread.id)}" class="${thread.unreadForMerchant ? "is-unread" : ""}"><strong>${esc(thread.customerName || thread.customerEmail)}</strong><span>${esc(thread.subject)}</span></button></li>`).join("")
      : `<li class="muted">Todavía no hay conversaciones.</li>`;
  }

  async function openInboxThread(threadId) {
    inboxThreadId = threadId;
    const { messages } = await api(`/stores/${deps.storeId()}/inbox/${threadId}`);
    // Inbound bodies are already plain text; esc() keeps them that way on screen.
    document.getElementById("inboxMessages").innerHTML = messages
      .map((message) => `<article class="inbox-message ${message.direction === "INBOUND" ? "is-from-customer" : "is-from-store"}"><p>${esc(message.body)}</p><time>${esc(new Date(message.createdAt).toLocaleString())}</time></article>`)
      .join("");
  }

  function init() {
    document.getElementById("inboxDomainLink").addEventListener("click", (event) => {
      event.preventDefault();
      if (!canLeaveMerchantStudio()) return;
      selectMarketingTab("domain");
      history.pushState(null, "", "#dashboard-marketing");
      setDashboardView("marketing");
    });

    document.getElementById("inboxThreads").addEventListener("click", (event) => {
      const button = event.target.closest("[data-thread-id]");
      if (button) void openInboxThread(button.dataset.threadId);
    });

    document.getElementById("inboxReplyForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!inboxDomainVerified || !inboxThreadId) return;
      const field = document.getElementById("inboxReplyBody");
      await api(`/stores/${deps.storeId()}/inbox/${inboxThreadId}/reply`, {
        method: "POST", body: JSON.stringify({ body: field.value }),
      });
      field.value = "";
      await openInboxThread(inboxThreadId);
    });
  }

  return { init, refreshInbox };
}
