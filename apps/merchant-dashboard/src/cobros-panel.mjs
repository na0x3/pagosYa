import { escapeHtml as esc } from "./html.mjs";
import { icon } from "./icons.mjs";
import { uiOption, uiPill, uiStat } from "./ui-kit.mjs";
import {
  PAYMENT_METHOD_LABEL,
  STATE_LABEL,
  buildCobroPayload,
  cobroState,
  cobroTotal,
  dueDateFromInput,
  dueDateFromPreset,
  dueDateInputValue,
  dueLine,
  formatMoney,
  lineProblem,
  longDate,
  parseMoney,
  paymentBadge,
  shortDate,
  timelineEntries,
  validateCobroDraft,
  whatsAppMessage,
  whatsAppShareUrl,
} from "./cobros.mjs";

/**
 * Documentos → Cobros (D1): list, guided create, share, detail with timeline,
 * reminders, "marcar como pagado" and void. Everything interpolated into markup goes through esc().
 *
 * The header (counts, sums, test mode, payments to refund) comes from the server summary, over
 * every cobro; the list is paged ("Cargar más") and each tab is filtered on the server.
 *
 * deps:
 *   api(path, options)  authenticated dashboard API call (throws Error with .status)
 *   storeId()           active store id
 *   store()             active store row ({ name, ... }) or null
 *   signedIn()          whether a merchant session exists
 *   invoicingReady()    whether SIN invoicing is configured (the factura is emitted when paid)
 *   apiBase()           the API base URL ("…/v1"), for the public PDF link
 */
export function mountCobrosPanel(deps) {
  const root = document.getElementById("cobrosRoot");
  if (!root) return { show() {}, reset() {} };

  const PAGE_SIZE = 30;
  const PRESETS = [
    { id: "0", label: "Hoy", days: 0 },
    { id: "7", label: "7 días", days: 7 },
    { id: "15", label: "15 días", days: 15 },
    { id: "30", label: "30 días", days: 30 },
  ];
  const FILTERS = [
    { id: "all", label: "Todos" },
    { id: "open", label: "Por cobrar" },
    { id: "overdue", label: "Vencidos" },
    { id: "paid", label: "Pagados" },
  ];

  /** Rows of the current tab, newest first; `nextCursor` loads the next page. */
  let documents = [];
  let nextCursor = null;
  let summary = null;
  let loadedFor = null;
  let loading = false;
  let loadingMore = false;
  let loadError = null;
  let filter = "all";
  let catalog = null;
  let draft = null;
  let suggestTimer = null;
  let suggestions = [];
  let activeSuggestion = -1;
  let lastFocus = null;
  /** The cobro the open share or detail sheet is about. */
  let sheetDoc = null;
  let loadGeneration = 0;

  // ── shell ────────────────────────────────────────────────────────────

  const sheet = document.createElement("div");
  sheet.className = "cobro-sheet-layer";
  sheet.hidden = true;
  sheet.innerHTML = `<div class="cobro-sheet-backdrop" data-cobro-close></div>
    <section class="cobro-sheet" data-cobro-sheet role="dialog" aria-modal="true" aria-labelledby="cobroSheetTitle" tabindex="-1"></section>`;
  document.body.appendChild(sheet);
  const panel = sheet.querySelector("[data-cobro-sheet]");

  const toast = document.createElement("p");
  toast.className = "cobros-toast";
  toast.setAttribute("data-cobros-toast", "");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  document.body.appendChild(toast);
  let toastTimer = null;
  function notify(message, tone = "good") {
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function openSheet(html) {
    if (sheet.hidden) lastFocus = document.activeElement;
    panel.innerHTML = html;
    sheet.hidden = false;
    document.body.classList.add("cobro-sheet-open");
    requestAnimationFrame(() => (panel.querySelector("[data-autofocus]") || panel).focus({ preventScroll: true }));
  }
  function closeSheet() {
    if (sheet.hidden) return;
    const createdDraft = draft?.createdId;
    sheet.hidden = true;
    panel.innerHTML = "";
    draft = null;
    sheetDoc = null;
    suggestions = [];
    activeSuggestion = -1;
    document.body.classList.remove("cobro-sheet-open");
    lastFocus?.focus?.({ preventScroll: true });
    // A create that saved a draft but could not freeze it leaves that draft in the list.
    if (createdDraft) void load();
  }

  /** What the merchant typed in the create sheet that closing would lose. */
  function draftIsDirty() {
    if (!draft || draft.createdId) return false;
    const { name, email, phone, document: nit } = draft.customer;
    return [name, email, phone, nit, draft.note].some((value) => String(value || "").trim())
      || draft.items.some((item) => item.description.trim() || String(item.priceText || "").trim());
  }

  /** Close, or ask first when a create draft would be lost. Returns whether the sheet closed. */
  function requestClose() {
    if (sheet.hidden) return true;
    if (panel.querySelector("[data-cobro-discard]")) return false;
    if (!draftIsDirty()) { closeSheet(); return true; }
    const box = document.createElement("div");
    box.className = "cobro-discard";
    box.setAttribute("data-cobro-discard", "");
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "cobroDiscardTitle");
    box.setAttribute("aria-describedby", "cobroDiscardText");
    box.innerHTML = `<div class="cobro-discard-card">
        <h3 id="cobroDiscardTitle">¿Descartar este cobro?</h3>
        <p id="cobroDiscardText">Lo que escribiste se perderá.</p>
        <div class="cobro-discard-actions">
          <button type="button" class="primary" data-cobro-keep>Seguir editando</button>
          <button type="button" class="cobro-secondary is-danger" data-cobro-discard-confirm>Descartar</button>
        </div>
      </div>`;
    panel.appendChild(box);
    box.querySelector("[data-cobro-keep]").focus();
    return false;
  }
  function keepEditing() {
    const box = panel.querySelector("[data-cobro-discard]");
    if (!box) return;
    box.remove();
    (panel.querySelector("#cobroCustomerName") || panel).focus({ preventScroll: true });
  }

  sheet.addEventListener("click", (event) => {
    if (event.target.closest("[data-cobro-keep]")) { keepEditing(); return; }
    if (event.target.closest("[data-cobro-discard-confirm]")) { closeSheet(); return; }
    const close = event.target.closest("[data-cobro-close]");
    // A link that also closes (e.g. to Cumplimiento) must not navigate away while we ask.
    if (close && !requestClose()) event.preventDefault();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || sheet.hidden || event.defaultPrevented) return;
    if (panel.querySelector("[data-cobro-discard]")) keepEditing();
    else requestClose();
  });

  /** Tab stays inside the sheet (and inside the discard question while it is open). */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const scope = panel.querySelector("[data-cobro-discard]") || panel;
    const items = [...scope.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const inside = items.includes(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
  });

  const storePath = (suffix = "") => `/stores/${encodeURIComponent(deps.storeId())}${suffix}`;
  const errorText = (error) => {
    // The dashboard's api() turns every 429 into a generic line; the email cap has its own useful message.
    if (error?.status === 429 && error.serverMessage && !/throttl/i.test(error.serverMessage)) return error.serverMessage;
    return error?.message || "No pudimos completar la acción. Intenta de nuevo.";
  };
  const initials = (name) => {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
  };
  const tokenFrom = (publicUrl) => (publicUrl ? publicUrl.split("/d/")[1]?.split("?")[0] ?? "" : "");
  const pdfUrl = (publicUrl) => `${deps.apiBase().replace(/\/$/, "")}/documents/public/${encodeURIComponent(tokenFrom(publicUrl))}/pdf`;
  const storeName = () => deps.store()?.name || "tu tienda";
  /** Payments are test payments until the merchant is verified (and the store is live). */
  const testMode = () => Boolean(summary?.testMode);
  const todayInput = () => dueDateInputValue(dueDateFromPreset(0));
  const ICON = {
    plus: icon("plus"), close: icon("x"), whatsapp: icon("message-circle"), mail: icon("mail"), link: icon("link"),
    eye: icon("eye"), check: icon("check"), doc: icon("file-text"), bell: icon("bell"), alert: icon("triangle-alert"),
    flask: icon("flask-conical"),
  };

  // ── list ─────────────────────────────────────────────────────────────

  const listPath = (cursor) => `${storePath("/documents")}?kind=INVOICE&limit=${PAGE_SIZE}${filter !== "all" ? `&state=${filter}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const pageCursor = (rows) => (rows.length === PAGE_SIZE ? rows[rows.length - 1].id : null);

  /** The summary and the first page of the current tab. */
  async function load() {
    const storeId = deps.storeId();
    const generation = ++loadGeneration;
    if (!storeId || !deps.signedIn()) { documents = []; summary = null; loadedFor = null; render(); return; }
    loading = true;
    loadError = null;
    render();
    try {
      const [nextSummary, rows] = await Promise.all([deps.api(storePath("/cobros/summary")), deps.api(listPath(null))]);
      if (generation !== loadGeneration || storeId !== deps.storeId()) return;
      summary = nextSummary;
      documents = Array.isArray(rows) ? rows : [];
      nextCursor = pageCursor(documents);
      loadedFor = storeId;
    } catch (error) {
      if (generation !== loadGeneration) return;
      loadError = errorText(error);
      if (summary) notify(loadError, "bad");
    }
    loading = false;
    render();
  }

  /** A tab: its first page, filtered on the server (counts come from the summary). */
  async function loadTab() {
    const storeId = deps.storeId();
    const generation = ++loadGeneration;
    loading = true;
    documents = [];
    nextCursor = null;
    render();
    try {
      const rows = await deps.api(listPath(null));
      if (generation !== loadGeneration || storeId !== deps.storeId()) return;
      documents = Array.isArray(rows) ? rows : [];
      nextCursor = pageCursor(documents);
    } catch (error) {
      if (generation !== loadGeneration) return;
      loadError = errorText(error);
    }
    loading = false;
    render();
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const generation = loadGeneration;
    loadingMore = true;
    render();
    try {
      const rows = await deps.api(listPath(nextCursor));
      if (generation !== loadGeneration) return;
      const page = Array.isArray(rows) ? rows : [];
      const seen = new Set(documents.map((row) => row.id));
      documents = [...documents, ...page.filter((row) => !seen.has(row.id))];
      nextCursor = pageCursor(page);
    } catch (error) {
      notify(errorText(error), "bad");
    } finally {
      loadingMore = false;
    }
    render();
    root.querySelector("[data-cobros-more]")?.focus({ preventScroll: true });
  }

  /** Per-currency figures for one summary box: bolivianos first, other currencies only when present. */
  function amountLines(field) {
    const totals = summary?.totals || [];
    const bob = totals.find((row) => row.currency === "BOB");
    const lines = [`<span>${esc(formatMoney(bob?.[field] || 0, "BOB"))}</span>`];
    for (const row of totals) if (row.currency !== "BOB" && row[field]) lines.push(`<span class="is-extra">+ ${esc(formatMoney(row[field], row.currency))}</span>`);
    return lines.join("");
  }

  function bannerHtml() {
    if (!summary) return "";
    if (summary.merchantStatus === "SUSPENDED") {
      return `<div class="cobros-banner is-bad" role="note" data-cobros-banner>${ICON.alert}<p><strong>Tu cuenta está suspendida.</strong> Tus clientes no pueden pagar cobros por ahora. Escríbenos desde Soporte para resolverlo.</p></div>`;
    }
    if (summary.storeStatus && summary.storeStatus !== "ACTIVE") {
      return `<div class="cobros-banner is-bad" role="note" data-cobros-banner>${ICON.alert}<p><strong>Esta tienda está archivada.</strong> Tus clientes no pueden pagar sus cobros. Reactívala en Mi tienda para volver a cobrar.</p></div>`;
    }
    if (summary.testMode) {
      return `<div class="cobros-banner is-test" role="note" data-cobros-banner>${ICON.flask}<p><strong>Modo de prueba mientras verificamos tu cuenta.</strong> Puedes crear y compartir cobros, pero sus pagos son pagos de prueba: no mueven dinero real ni suman en Cobrado. Cuando te verifiquemos, se cobran de verdad.</p></div>`;
    }
    return "";
  }

  function attentionHtml() {
    const rows = summary?.attention || [];
    if (!rows.length) return "";
    const unique = [...new Map(rows.map((row) => [row.documentId, row])).values()];
    const count = unique.length;
    return `<div class="cobros-attention" role="alert" data-cobros-attention>
      ${ICON.alert}
      <div><p><strong>${count === 1 ? "Tienes 1 pago para revisar" : `Tienes ${count} pagos para revisar`}.</strong> Llegaron con el cobro ya anulado, ya pagado o por otro monto: el dinero entró, así que reembólsalo desde Pagos o arréglalo con tu cliente.</p>
      <div class="cobros-attention-links">${unique.slice(0, 5).map((row) => `<button type="button" class="cobro-secondary" data-cobro-open="${esc(row.documentId)}">${esc(row.numberLabel || "Ver cobro")}${row.amount ? ` · ${esc(formatMoney(row.amount, row.currency || "BOB"))}` : ""}</button>`).join("")}</div></div>
    </div>`;
  }

  function render() {
    if (!deps.storeId()) {
      root.innerHTML = `<div class="cobros-empty" data-cobros-empty><p>Crea o elige una tienda para empezar a cobrar.</p><a class="cobros-link" href="#dashboard-stores" data-dashboard-view-link="stores">Ir a Mi tienda</a></div>`;
      return;
    }
    if (loadError && !summary) {
      root.innerHTML = `<div class="cobros-error" role="alert"><p>${esc(loadError)}</p><button type="button" class="primary" data-cobros-retry>Intentar de nuevo</button></div>`;
      return;
    }
    if (!summary) {
      root.innerHTML = `<div class="cobros-skeleton" aria-busy="true" aria-label="Cargando cobros">${"<span></span>".repeat(3)}</div>`;
      return;
    }
    if (!summary.counts?.all) {
      root.innerHTML = `${bannerHtml()}<div class="cobros-empty" data-cobros-empty>
        <span class="cobros-empty-icon" aria-hidden="true">${ICON.doc}</span>
        <h3>Cobra en un minuto</h3>
        <p>Crea un cobro, compártelo por WhatsApp y recibe el pago con QR o tarjeta.</p>
        <button type="button" class="primary cobros-cta" data-cobro-new data-autofocus>Crear mi primer cobro</button>
      </div>`;
      return;
    }
    const now = new Date();
    const counts = summary.counts;
    const testTotal = (summary.totals || []).filter((row) => row.testCollected);
    const emptyFilter = {
      open: "No tienes cobros pendientes. ¡Todo al día!",
      overdue: "Ningún cobro vencido. Así se hace.",
      paid: "Aún no te pagaron un cobro. Comparte uno por WhatsApp para empezar.",
      all: "Aún no tienes cobros.",
    }[filter];
    const overdueAny = (summary.totals || []).some((row) => row.overdue);
    const list = loading && !documents.length
      ? `<div class="cobros-skeleton" aria-busy="true" aria-label="Cargando cobros">${"<span></span>".repeat(2)}</div>`
      : documents.length
        ? `<ul class="cobros-list">${documents.map((doc) => cardHtml(doc, now)).join("")}</ul>
           ${nextCursor ? `<button type="button" class="cobro-secondary cobros-more" data-cobros-more ${loadingMore ? "disabled" : ""}>${loadingMore ? "Cargando…" : "Cargar más"}</button>` : ""}`
        : `<p class="cobros-filter-empty">${esc(emptyFilter)}</p>`;
    root.innerHTML = `${bannerHtml()}${attentionHtml()}<div class="cobros-head">
        <dl class="ui-stats cobros-summary">
          ${uiStat({ label: "Por cobrar", icon: "hand-coins", value: amountLines("owed") })}
          ${uiStat({ label: "Vencido", icon: "clock-alert", value: amountLines("overdue"), tone: overdueAny ? "warning" : "" })}
          ${uiStat({ label: "Cobrado · 30 días", icon: "circle-check", value: amountLines("collected"), tone: "good" })}
        </dl>
        <button type="button" class="primary cobros-new" data-cobro-new>${ICON.plus}<span>Nuevo cobro</span></button>
      </div>
      ${testTotal.length ? `<p class="cobros-test-note" data-cobros-test-note>${ICON.flask}<span>Pagos de prueba (30 días): ${testTotal.map((row) => esc(formatMoney(row.testCollected, row.currency))).join(" + ")}. No suman en Cobrado.</span></p>` : ""}
      <div class="ui-tabs" role="tablist" aria-label="Filtrar cobros">
        ${FILTERS.map((option) => `<button type="button" role="tab" class="ui-tab" aria-selected="${filter === option.id}" data-cobro-filter="${option.id}">${esc(option.label)}<span>${Number(counts[option.id] || 0)}</span></button>`).join("")}
      </div>
      ${list}`;
  }

  function cardHtml(doc, now) {
    const state = cobroState(doc, now);
    const name = doc.customer?.name || "Sin nombre";
    const badge = paymentBadge(doc);
    const chip = badge?.tone === "test" ? `<span class="cobro-chip is-test">Pago de prueba</span>` : `<span class="cobro-chip is-${state}">${esc(STATE_LABEL[state])}</span>`;
    return `<li><button type="button" class="cobro-card" data-cobro-card data-cobro-id="${esc(doc.id)}">
      <span class="cobro-avatar" aria-hidden="true">${esc(initials(name))}</span>
      <span class="cobro-card-main">
        <strong>${esc(name)}</strong>
        <small>${esc(doc.numberLabel)} · ${esc(dueLine(doc, now))}</small>
        ${badge?.tone === "warning" ? `<span class="cobro-flag" data-cobro-flag>${ICON.alert}${esc(badge.label)}</span>` : ""}
      </span>
      <span class="cobro-card-side">
        <strong>${esc(formatMoney(doc.totalAmount, doc.currency))}</strong>
        ${chip}
      </span>
    </button></li>`;
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-cobro-new]")) { openCreate(); return; }
    if (event.target.closest("[data-cobros-retry]")) { void load(); return; }
    if (event.target.closest("[data-cobros-more]")) { void loadMore(); return; }
    const tab = event.target.closest("[data-cobro-filter]");
    if (tab) {
      if (filter !== tab.dataset.cobroFilter) { filter = tab.dataset.cobroFilter; void loadTab(); }
      root.querySelector(`[data-cobro-filter="${filter}"]`)?.focus();
      return;
    }
    const open = event.target.closest("[data-cobro-open]");
    if (open) { void openDetail(open.dataset.cobroOpen); return; }
    const card = event.target.closest("[data-cobro-card]");
    if (card) void openDetail(card.dataset.cobroId);
  });

  // ── create ───────────────────────────────────────────────────────────

  const blankLine = () => ({ description: "", quantity: 1, unitAmount: null, priceText: "", touched: false });

  function newDraft() {
    return { customer: { name: "", email: "", phone: "", document: "", businessCustomerId: null }, items: [blankLine()], preset: "7", customDate: "", note: "", autoReminders: true, showCatalog: false, catalogQuery: "", problems: [], showLineErrors: false, saving: false, createdId: null };
  }

  function draftDueAt() {
    if (draft.preset === "custom") return dueDateFromInput(draft.customDate);
    const preset = PRESETS.find((option) => option.id === draft.preset);
    return preset ? dueDateFromPreset(preset.days) : null;
  }

  function openCreate() {
    draft = newDraft();
    suggestions = [];
    activeSuggestion = -1;
    openSheet(createHtml());
    void loadCatalog();
  }

  function createHtml() {
    const dueAt = draftDueAt();
    const invoicing = testMode()
      ? `<p class="cobro-sin">${ICON.flask}<span>Mientras verificamos tu cuenta, los pagos de tus cobros son de prueba.</span></p>`
      : deps.invoicingReady()
        ? `<p class="cobro-sin is-ready">${ICON.check}<span>Cuando te paguen, la factura SIN se emite sola.</span></p>`
        : `<p class="cobro-sin">¿Emites factura? Configura la facturación en <a href="#dashboard-compliance" data-cobro-close>Cumplimiento</a> y se emitirá sola al cobrar.</p>`;
    return `<header class="cobro-sheet-head">
        <div><p class="cobro-kicker">Nuevo cobro</p><h2 id="cobroSheetTitle">¿A quién le cobras y cuánto?</h2></div>
        <button type="button" class="cobro-icon-button" data-cobro-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <form class="cobro-form" data-cobro-form novalidate>
        <div class="cobro-sheet-body">
          <fieldset class="cobro-step">
            <legend><span>1</span>Cliente</legend>
            <div class="cobro-customer">
              <label for="cobroCustomerName">Nombre del cliente</label>
              <input id="cobroCustomerName" name="customerName" autocomplete="off" maxlength="120" placeholder="Busca o escribe un nombre" value="${esc(draft.customer.name)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cobroCustomerOptions" data-autofocus>
              <ul class="cobro-suggestions" id="cobroCustomerOptions" role="listbox" aria-label="Clientes sugeridos" hidden></ul>
            </div>
            <div class="cobro-two">
              <div><label for="cobroCustomerPhone">WhatsApp del cliente</label><input id="cobroCustomerPhone" name="customerPhone" type="tel" inputmode="tel" maxlength="40" placeholder="7000 0000" value="${esc(draft.customer.phone)}"></div>
              <div><label for="cobroCustomerEmail">Correo del cliente</label><input id="cobroCustomerEmail" name="customerEmail" type="email" inputmode="email" maxlength="254" placeholder="opcional" value="${esc(draft.customer.email)}"></div>
            </div>
            <div><label for="cobroCustomerDocument">NIT o CI <small>(opcional, para la factura)</small></label><input id="cobroCustomerDocument" name="customerDocument" inputmode="numeric" autocomplete="off" maxlength="24" placeholder="Ej.: 4567890" value="${esc(draft.customer.document)}"></div>
          </fieldset>
          <fieldset class="cobro-step">
            <legend><span>2</span>Qué le cobras</legend>
            <div class="cobro-items" data-cobro-items>${itemsHtml()}</div>
            <div class="cobro-item-actions">
              <button type="button" class="cobro-secondary" data-cobro-add-line>${ICON.plus}Agregar otra línea</button>
              <button type="button" class="cobro-secondary" data-cobro-catalog aria-expanded="${draft.showCatalog}">Desde tu catálogo</button>
            </div>
            <div class="cobro-catalog" data-cobro-catalog-panel ${draft.showCatalog ? "" : "hidden"}>${catalogHtml()}</div>
          </fieldset>
          <fieldset class="cobro-step">
            <legend><span>3</span>Para cuándo</legend>
            <div class="ui-pills" role="radiogroup" aria-label="Vencimiento">
              ${PRESETS.map((option) => uiPill({ group: "duePreset", value: option.id, label: option.label, checked: draft.preset === option.id })).join("")}
              ${uiPill({ group: "duePreset", value: "custom", label: "Otra fecha", checked: draft.preset === "custom" })}
            </div>
            <div class="cobro-custom-date" ${draft.preset === "custom" ? "" : "hidden"}><label for="cobroDueDate">Fecha de vencimiento</label><input id="cobroDueDate" type="date" min="${esc(todayInput())}" value="${esc(draft.customDate)}"></div>
            <p class="cobro-due-hint" data-cobro-due-hint>${dueHint(dueAt)}</p>
          </fieldset>
          <fieldset class="cobro-step">
            <legend><span>4</span>Nota <small>(opcional)</small></legend>
            <label for="cobroNote" class="sr-only">Nota para el cliente</label>
            <textarea id="cobroNote" rows="2" maxlength="1000" placeholder="Ej.: Gracias por tu compra. Transferencias con el número de cobro.">${esc(draft.note)}</textarea>
            ${uiOption({ icon: "bell-ring", attrs: "data-cobro-reminders", checked: draft.autoReminders, title: "Recordatorios automáticos", text: "Por correo al vencer y 3 días después." })}
            ${invoicing}
          </fieldset>
          <div class="cobro-problems" role="alert" data-cobro-problems ${draft.problems.length ? "" : "hidden"}>${draft.problems.map((problem) => `<p>${esc(problem)}</p>`).join("")}</div>
        </div>
        <footer class="cobro-sheet-foot">
          <div class="cobro-total-line"><small>Total</small><strong data-cobro-total>${esc(formatMoney(cobroTotal(draft.items)))}</strong></div>
          <button type="button" class="primary cobro-submit" data-cobro-create ${draft.saving ? "disabled" : ""}>${draft.saving ? "Creando…" : "Crear cobro"}</button>
        </footer>
      </form>`;
  }

  /** The due line under the presets; a past "Otra fecha" says so right away. */
  function dueHint(dueAt) {
    if (!dueAt) return "Elige la fecha";
    if (new Date(dueAt).getTime() < Date.now()) return `<span class="is-error">Esa fecha ya pasó. Elige hoy o una fecha futura.</span>`;
    return `Vence el ${esc(longDate(dueAt))}`;
  }

  function itemsHtml() {
    return draft.items.map((item, index) => {
      const problem = item.touched || draft.showLineErrors ? lineProblem(item) : null;
      const missingPrice = Boolean(problem) && Boolean(item.description.trim());
      const missingDescription = Boolean(problem) && !item.description.trim();
      const describedBy = problem ? ` aria-describedby="cobroLineError${index}"` : "";
      return `<div class="cobro-line${problem ? " has-error" : ""}" data-cobro-line="${index}">
      <div class="cobro-line-desc"><input id="cobroLineDesc${index}" data-field="description" maxlength="500" placeholder="Producto o servicio" value="${esc(item.description)}" aria-label="Descripción de la línea ${index + 1}"${missingDescription ? ` aria-invalid="true"${describedBy}` : ""}></div>
      <div class="cobro-line-qty" role="group" aria-label="Cantidad de la línea ${index + 1}">
        <button type="button" data-cobro-qty="-1" aria-label="Menos">−</button>
        <input data-field="quantity" inputmode="numeric" value="${esc(item.quantity)}" aria-label="Cantidad de la línea ${index + 1}">
        <button type="button" data-cobro-qty="1" aria-label="Más">+</button>
      </div>
      <div class="cobro-line-price"><span aria-hidden="true">Bs</span><input data-field="price" inputmode="decimal" placeholder="0,00" value="${esc(item.priceText)}" aria-label="Precio de la línea ${index + 1}"${missingPrice ? ` aria-invalid="true"${describedBy}` : ""}></div>
      ${draft.items.length > 1 ? `<button type="button" class="cobro-icon-button cobro-line-remove" data-cobro-remove-line aria-label="Quitar la línea ${index + 1}">${ICON.close}</button>` : ""}
      ${problem ? `<p class="cobro-line-error" id="cobroLineError${index}" data-cobro-line-error>${esc(problem)}</p>` : ""}
    </div>`;
    }).join("");
  }

  async function loadCatalog() {
    if (catalog?.storeId === deps.storeId()) return;
    try {
      const rows = await deps.api(storePath("/payment_links"));
      catalog = { storeId: deps.storeId(), rows: (Array.isArray(rows) ? rows : []).filter((row) => row.status !== "ARCHIVED" && Number.isInteger(row.amount) && row.amount > 0) };
    } catch {
      catalog = { storeId: deps.storeId(), rows: [] };
    }
    const target = panel.querySelector("[data-cobro-catalog-panel]");
    if (target && draft) target.innerHTML = catalogHtml();
  }

  function catalogHtml() {
    if (!catalog) return `<p class="cobro-muted">Cargando tu catálogo…</p>`;
    if (!catalog.rows.length) return `<p class="cobro-muted">Aún no tienes productos con precio. Escribe la línea a mano.</p>`;
    const query = (draft?.catalogQuery || "").toLowerCase();
    const rows = catalog.rows.filter((row) => !query || String(row.name).toLowerCase().includes(query)).slice(0, 30);
    return `<label for="cobroCatalogSearch" class="sr-only">Buscar en tu catálogo</label>
      <input id="cobroCatalogSearch" data-cobro-catalog-search placeholder="Buscar producto" value="${esc(draft?.catalogQuery || "")}">
      <ul class="cobro-catalog-list">${rows.map((row) => `<li><button type="button" data-cobro-product="${esc(row.id)}"><span>${esc(row.name)}</span><strong>${esc(formatMoney(row.amount, row.currency))}</strong></button></li>`).join("") || '<li class="cobro-muted">Sin resultados</li>'}</ul>`;
  }

  function refreshTotals() {
    const total = panel.querySelector("[data-cobro-total]");
    // The same rule as the payload: a line without description or price is not charged.
    if (total) total.textContent = formatMoney(cobroTotal(draft.items));
    const hint = panel.querySelector("[data-cobro-due-hint]");
    if (hint) hint.innerHTML = dueHint(draftDueAt());
    refreshProblems();
  }

  /** After a failed "Crear cobro", the list of problems follows the fixes instead of going stale. */
  function refreshProblems() {
    if (!draft?.showLineErrors || draft.problemsFromServer) return;
    const box = panel.querySelector("[data-cobro-problems]");
    if (!box) return;
    const dueAt = draftDueAt();
    draft.problems = validateCobroDraft({ ...draft, dueAt });
    if (!dueAt) draft.problems.push("Elige una fecha de vencimiento.");
    box.hidden = !draft.problems.length;
    box.innerHTML = draft.problems.map((problem) => `<p>${esc(problem)}</p>`).join("");
  }

  function rerenderItems(focusIndex, field) {
    const box = panel.querySelector("[data-cobro-items]");
    if (!box) return;
    box.innerHTML = itemsHtml();
    refreshTotals();
    if (focusIndex !== undefined) box.querySelector(`[data-cobro-line="${focusIndex}"] [data-field="${field || "description"}"]`)?.focus();
  }

  /** One line's inline error, updated in place so typing never loses focus. */
  function refreshLineError(index) {
    const line = panel.querySelector(`[data-cobro-line="${index}"]`);
    const item = draft?.items[index];
    if (!line || !item) return;
    const problem = item.touched || draft.showLineErrors ? lineProblem(item) : null;
    line.classList.toggle("has-error", Boolean(problem));
    let message = line.querySelector("[data-cobro-line-error]");
    const desc = line.querySelector('[data-field="description"]');
    const price = line.querySelector('[data-field="price"]');
    for (const input of [desc, price]) { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); }
    if (!problem) { message?.remove(); return; }
    if (!message) {
      message = document.createElement("p");
      message.className = "cobro-line-error";
      message.id = `cobroLineError${index}`;
      message.setAttribute("data-cobro-line-error", "");
      line.appendChild(message);
    }
    message.textContent = problem;
    const invalid = item.description.trim() ? price : desc;
    invalid.setAttribute("aria-invalid", "true");
    invalid.setAttribute("aria-describedby", message.id);
  }

  function renderSuggestions(open) {
    const list = panel.querySelector("#cobroCustomerOptions");
    const input = panel.querySelector("#cobroCustomerName");
    if (!list || !input) return;
    const show = open && suggestions.length > 0;
    list.hidden = !show;
    input.setAttribute("aria-expanded", String(show));
    if (!show) activeSuggestion = -1;
    list.innerHTML = suggestions.map((row, index) => `<li role="option" id="cobroSuggestion${index}" data-cobro-suggestion="${index}" aria-selected="${index === activeSuggestion}">
      <span class="cobro-avatar" aria-hidden="true">${esc(initials(row.name))}</span>
      <span><strong>${esc(row.name)}</strong><small>${esc([row.phone, row.email].filter(Boolean).join(" · ") || { crm: "Cliente", cobro: "Cobro anterior", buyer: "Compró en tu tienda" }[row.source] || "")}</small></span>
    </li>`).join("");
    syncActiveSuggestion();
  }

  /** Arrow keys move the active option; the input names it (aria-activedescendant). */
  function syncActiveSuggestion() {
    const input = panel.querySelector("#cobroCustomerName");
    const list = panel.querySelector("#cobroCustomerOptions");
    if (!input || !list) return;
    list.querySelectorAll("[data-cobro-suggestion]").forEach((option) => {
      const active = Number(option.dataset.cobroSuggestion) === activeSuggestion;
      option.setAttribute("aria-selected", String(active));
      option.classList.toggle("is-active", active);
      if (active) option.scrollIntoView({ block: "nearest" });
    });
    if (activeSuggestion >= 0 && !list.hidden) input.setAttribute("aria-activedescendant", `cobroSuggestion${activeSuggestion}`);
    else input.removeAttribute("aria-activedescendant");
  }

  // Only the newest request may answer, and a late answer keeps the option the merchant already moved to.
  let suggestionRequest = 0;
  const sameCustomer = (a, b) => a.name === b.name && (a.phone || "") === (b.phone || "") && (a.email || "") === (b.email || "");
  async function fetchSuggestions(query) {
    const request = ++suggestionRequest;
    try {
      const rows = await deps.api(`${storePath("/document-customers")}${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      if (!draft || request !== suggestionRequest) return;
      const active = suggestions[activeSuggestion];
      suggestions = Array.isArray(rows) ? rows : [];
      activeSuggestion = active ? suggestions.findIndex((row) => sameCustomer(row, active)) : -1;
      renderSuggestions(document.activeElement === panel.querySelector("#cobroCustomerName"));
    } catch {
      if (request === suggestionRequest) suggestions = [];
    }
  }

  function pickSuggestion(index) {
    const row = suggestions[index];
    if (!row || !draft) return;
    draft.customer = { name: row.name, email: row.email || "", phone: row.phone || "", document: row.document || "", businessCustomerId: row.businessCustomerId || null };
    panel.querySelector("#cobroCustomerName").value = row.name;
    panel.querySelector("#cobroCustomerPhone").value = draft.customer.phone;
    panel.querySelector("#cobroCustomerEmail").value = draft.customer.email;
    panel.querySelector("#cobroCustomerDocument").value = draft.customer.document;
    suggestions = [];
    renderSuggestions(false);
    panel.querySelector("#cobroLineDesc0")?.focus();
  }

  panel.addEventListener("input", (event) => {
    if (!draft) return;
    const target = event.target;
    if (target.id === "cobroCustomerName") {
      draft.customer.name = target.value;
      draft.customer.businessCustomerId = null;
      activeSuggestion = -1;
      refreshProblems();
      syncActiveSuggestion();
      clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => void fetchSuggestions(target.value.trim()), 180);
      return;
    }
    if (target.id === "cobroCustomerPhone") { draft.customer.phone = target.value; return; }
    if (target.id === "cobroCustomerEmail") { draft.customer.email = target.value; refreshProblems(); return; }
    if (target.id === "cobroCustomerDocument") { draft.customer.document = target.value; return; }
    if (target.id === "cobroNote") { draft.note = target.value; return; }
    if (target.id === "cobroDueDate") { draft.customDate = target.value; refreshTotals(); return; }
    if (target.matches("[data-cobro-catalog-search]")) {
      draft.catalogQuery = target.value;
      const list = panel.querySelector(".cobro-catalog-list");
      const holder = document.createElement("div");
      holder.innerHTML = catalogHtml();
      const fresh = holder.querySelector(".cobro-catalog-list");
      if (list && fresh) list.replaceWith(fresh);
      return;
    }
    const line = target.closest("[data-cobro-line]");
    if (line) {
      const index = Number(line.dataset.cobroLine);
      const item = draft.items[index];
      if (target.dataset.field === "description") item.description = target.value;
      if (target.dataset.field === "quantity") item.quantity = Math.min(100000, Math.max(1, parseInt(target.value, 10) || 1));
      if (target.dataset.field === "price") { item.priceText = target.value; item.unitAmount = parseMoney(target.value); }
      refreshTotals();
      // Once a line shows an error, it updates as the merchant fixes it.
      if (item.touched || draft.showLineErrors) refreshLineError(index);
    }
  });

  panel.addEventListener("focusin", (event) => {
    if (event.target.id === "cobroCustomerName" && draft) {
      if (!suggestions.length) void fetchSuggestions(event.target.value.trim());
      else renderSuggestions(true);
    }
  });
  panel.addEventListener("focusout", (event) => {
    if (event.target.id === "cobroCustomerName") setTimeout(() => {
      if (!panel.contains(document.activeElement) || document.activeElement?.id !== "cobroCustomerName") renderSuggestions(false);
    }, 150);
    // A line is checked once the merchant leaves it, not while typing its first field.
    const line = event.target.closest?.("[data-cobro-line]");
    if (line && draft && !line.contains(event.relatedTarget)) {
      const index = Number(line.dataset.cobroLine);
      const item = draft.items[index];
      if (item && (item.description.trim() || String(item.priceText || "").trim())) {
        item.touched = true;
        refreshLineError(index);
      }
    }
  });
  panel.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target.id === "cobroCustomerName") {
      const list = panel.querySelector("#cobroCustomerOptions");
      const open = list && !list.hidden;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!suggestions.length) return;
        event.preventDefault();
        if (!open) renderSuggestions(true);
        const count = suggestions.length;
        activeSuggestion = event.key === "ArrowDown"
          ? (activeSuggestion + 1) % count
          : activeSuggestion <= 0 ? count - 1 : activeSuggestion - 1;
        syncActiveSuggestion();
        return;
      }
      if (event.key === "Enter") {
        // Only an option the merchant moved to is picked; Enter alone never chooses for them.
        event.preventDefault();
        if (open && activeSuggestion >= 0) pickSuggestion(activeSuggestion);
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault(); // closes the list, not the sheet
        renderSuggestions(false);
        return;
      }
    }
    // Only the "Crear cobro" button creates: Enter in a field never submits the form.
    if (event.key === "Enter" && target.matches("input") && target.closest("[data-cobro-form]")) event.preventDefault();
  });
  panel.addEventListener("mousedown", (event) => {
    // Keep the input focused while choosing, so focusout does not hide the list first.
    if (event.target.closest("[data-cobro-suggestion]")) event.preventDefault();
  });

  panel.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-cobro-auto-reminders]")) { void onRemindersToggle(target); return; }
    if (!draft) return;
    if (target.name === "duePreset") {
      draft.preset = target.value;
      const custom = panel.querySelector(".cobro-custom-date");
      if (custom) custom.hidden = draft.preset !== "custom";
      if (draft.preset === "custom" && !draft.customDate) {
        draft.customDate = dueDateInputValue(dueDateFromPreset(7));
        panel.querySelector("#cobroDueDate").value = draft.customDate;
      }
      refreshTotals();
      return;
    }
    if (target.matches("[data-cobro-reminders]")) draft.autoReminders = target.checked;
    if (target.dataset.field === "price") {
      const line = target.closest("[data-cobro-line]");
      const item = draft.items[Number(line.dataset.cobroLine)];
      if (item.unitAmount) { item.priceText = formatMoney(item.unitAmount).replace(/^Bs\s/, ""); target.value = item.priceText; }
    }
  });

  panel.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-cobro-suggestion]");
    if (suggestion && draft) { pickSuggestion(Number(suggestion.dataset.cobroSuggestion)); return; }
    if (event.target.closest("[data-cobro-create]") && draft) { void createCobro(); return; }
    if (event.target.closest("[data-cobro-add-line]") && draft) {
      draft.items.push(blankLine());
      rerenderItems(draft.items.length - 1);
      return;
    }
    const remove = event.target.closest("[data-cobro-remove-line]");
    if (remove && draft) {
      draft.items.splice(Number(remove.closest("[data-cobro-line]").dataset.cobroLine), 1);
      rerenderItems();
      return;
    }
    const qty = event.target.closest("[data-cobro-qty]");
    if (qty && draft) {
      const index = Number(qty.closest("[data-cobro-line]").dataset.cobroLine);
      const item = draft.items[index];
      item.quantity = Math.min(100000, Math.max(1, (item.quantity || 1) + Number(qty.dataset.cobroQty)));
      qty.parentElement.querySelector('[data-field="quantity"]').value = String(item.quantity);
      refreshTotals();
      return;
    }
    const catalogButton = event.target.closest("[data-cobro-catalog]");
    if (catalogButton && draft) {
      draft.showCatalog = !draft.showCatalog;
      catalogButton.setAttribute("aria-expanded", String(draft.showCatalog));
      const box = panel.querySelector("[data-cobro-catalog-panel]");
      box.hidden = !draft.showCatalog;
      box.innerHTML = catalogHtml();
      if (draft.showCatalog) box.querySelector("input")?.focus();
      return;
    }
    const product = event.target.closest("[data-cobro-product]");
    if (product && draft) {
      const row = catalog?.rows.find((candidate) => candidate.id === product.dataset.cobroProduct);
      if (!row) return;
      const line = { description: String(row.name).slice(0, 500), quantity: 1, unitAmount: row.amount, priceText: formatMoney(row.amount).replace(/^Bs\s/, ""), paymentLinkId: row.id, touched: false };
      const blank = draft.items.findIndex((item) => !item.description.trim() && !item.unitAmount && !String(item.priceText || "").trim());
      if (blank >= 0) draft.items[blank] = line; else draft.items.push(line);
      draft.showCatalog = false;
      panel.querySelector("[data-cobro-catalog-panel]").hidden = true;
      panel.querySelector("[data-cobro-catalog]")?.setAttribute("aria-expanded", "false");
      rerenderItems();
      return;
    }
    const share = event.target.closest("[data-cobro-share-action]");
    if (share) { void onShareAction(share, event); return; }
    const action = event.target.closest("[data-cobro-action]");
    if (action) void onDetailAction(action);
  });

  // Nothing submits the form implicitly; "Crear cobro" is a plain button.
  panel.addEventListener("submit", (event) => event.preventDefault());

  async function createCobro() {
    if (!draft || draft.saving) return;
    const current = draft;
    const input = { ...current, dueAt: draftDueAt() };
    current.showLineErrors = true;
    current.problemsFromServer = false;
    current.problems = validateCobroDraft(input);
    if (!input.dueAt) current.problems.push("Elige una fecha de vencimiento.");
    rerenderItems();
    const problems = panel.querySelector("[data-cobro-problems]");
    problems.hidden = !current.problems.length;
    problems.innerHTML = current.problems.map((problem) => `<p>${esc(problem)}</p>`).join("");
    if (current.problems.length) {
      (panel.querySelector('[aria-invalid="true"]') || problems).scrollIntoView({ block: "nearest" });
      return;
    }
    const submit = panel.querySelector("[data-cobro-create]");
    current.saving = true;
    submit.disabled = true;
    submit.textContent = "Creando…";
    const payload = buildCobroPayload(input);
    try {
      // A retry after "created but not frozen" updates that same draft instead of creating another.
      if (!current.createdId) {
        const created = await deps.api(storePath("/documents"), { method: "POST", body: JSON.stringify(payload) });
        current.createdId = created.id;
      } else {
        const { kind: _kind, ...changes } = payload;
        await deps.api(storePath(`/documents/${encodeURIComponent(current.createdId)}`), { method: "PATCH", body: JSON.stringify(changes) });
      }
      // One tap creates and freezes it: the share options below are then real links.
      const sent = await deps.api(storePath(`/documents/${encodeURIComponent(current.createdId)}/send`), { method: "POST", body: JSON.stringify({ email: false }) });
      if (draft !== current) return;
      draft = null;
      openShare(sent.document, { fresh: true });
      void load();
    } catch (error) {
      if (draft !== current) return;
      current.saving = false;
      current.problemsFromServer = true;
      submit.disabled = false;
      submit.textContent = "Crear cobro";
      problems.hidden = false;
      problems.innerHTML = `<p>${esc(errorText(error))}</p>${current.createdId ? "<p>Tu cobro quedó guardado como borrador: toca Crear cobro para intentar de nuevo.</p>" : ""}`;
    }
  }

  // ── share ────────────────────────────────────────────────────────────

  function shareText(doc, reminder = false) {
    return whatsAppMessage({ customerName: doc.customer?.name ?? null, storeName: storeName(), numberLabel: doc.numberLabel, total: doc.totalAmount, currency: doc.currency, dueAt: doc.dueAt, url: doc.publicUrl, reminder });
  }

  /** "Ver como cliente" is a real link only once its signed preview URL is known: never a counted view. */
  function previewLinkHtml(doc, className) {
    const ready = Boolean(doc.previewUrl);
    return `<a class="${className}" ${ready ? `href="${esc(doc.previewUrl)}"` : 'aria-disabled="true" role="link"'} data-cobro-preview-link target="_blank" rel="noopener">`;
  }

  function openShare(doc, { fresh = false } = {}) {
    sheetDoc = doc;
    const email = doc.customer?.email;
    openSheet(`<header class="cobro-sheet-head">
        <div>${fresh ? `<p class="cobro-success-mark" aria-hidden="true">${ICON.check}</p>` : ""}<h2 id="cobroSheetTitle">${fresh ? `¡Cobro ${esc(doc.numberLabel)} listo!` : `Compartir ${esc(doc.numberLabel)}`}</h2>
          <p class="cobro-sub">${esc(formatMoney(doc.totalAmount, doc.currency))} · ${esc(doc.customer?.name || "Sin nombre")}${doc.dueAt ? ` · vence el ${esc(shortDate(doc.dueAt))}` : ""}</p></div>
        <button type="button" class="cobro-icon-button" data-cobro-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="cobro-sheet-body">
        <p class="cobro-muted">${fresh ? "Elige cómo se lo mandas. Tu cliente lo abre, lo paga con QR o tarjeta y tú lo ves aquí." : "Tu cliente siempre ve la última versión del cobro."}</p>
        <div class="cobro-share">
          <a class="cobro-share-option is-whatsapp" href="${esc(whatsAppShareUrl(doc.customer?.phone, shareText(doc)))}" target="_blank" rel="noopener noreferrer" data-cobro-share-action="whatsapp" data-autofocus>
            <span class="cobro-share-icon">${ICON.whatsapp}</span><span><strong>WhatsApp</strong><small>${doc.customer?.phone ? `Abre el chat con ${esc(doc.customer.phone)}` : "Elige el chat al abrir WhatsApp"}</small></span></a>
          ${email
            ? `<button type="button" class="cobro-share-option" data-cobro-share-action="email"><span class="cobro-share-icon">${ICON.mail}</span><span><strong>Enviar por correo</strong><small>A ${esc(email)}, con el PDF adjunto</small></span></button>`
            : `<div class="cobro-share-option is-form"><span class="cobro-share-icon">${ICON.mail}</span><span><strong>Correo</strong><small>Tu cliente no tiene correo guardado.</small><span class="cobro-inline"><label for="cobroShareEmail" class="sr-only">Correo del cliente</label><input id="cobroShareEmail" type="email" placeholder="correo@cliente.com"><button type="button" class="cobro-secondary" data-cobro-share-action="email-new">Enviar</button></span></span></div>`}
          <button type="button" class="cobro-share-option" data-cobro-share-action="copy"><span class="cobro-share-icon">${ICON.link}</span><span><strong>Copiar enlace</strong><small data-cobro-copy-hint>Pégalo donde quieras: Instagram, Messenger, SMS…</small></span></button>
          ${previewLinkHtml(doc, "cobro-share-option")}<span class="cobro-share-icon">${ICON.eye}</span><span><strong>Ver como cliente</strong><small data-cobro-preview-hint>${doc.previewUrl ? "Abrirlo desde aquí no cuenta como visto" : "Preparando la vista previa…"}</small></span></a>
        </div>
        <p class="cobro-share-status" role="status" aria-live="polite" data-cobro-share-status></p>
      </div>
      <footer class="cobro-sheet-foot"><button type="button" class="primary cobro-submit" data-cobro-close>Listo</button></footer>`);
    panel.dataset.docId = doc.id;
    if (doc.previewUrl) return;
    // The preview link needs a fresh signed token; until it arrives the option stays disabled.
    deps.api(storePath(`/documents/${encodeURIComponent(doc.id)}`)).then((detail) => {
      if (panel.dataset.docId !== doc.id || !detail?.previewUrl) throw new Error("no preview");
      sheetDoc = { ...doc, ...detail };
      const link = panel.querySelector("[data-cobro-preview-link]");
      if (!link) return;
      link.href = detail.previewUrl;
      link.removeAttribute("aria-disabled");
      link.removeAttribute("role");
      const hint = panel.querySelector("[data-cobro-preview-hint]");
      if (hint) hint.textContent = "Abrirlo desde aquí no cuenta como visto";
    }).catch(() => {
      const hint = panel.querySelector("[data-cobro-preview-hint]");
      if (hint && panel.dataset.docId === doc.id) hint.textContent = "No pudimos preparar la vista previa. Ábrela desde el detalle del cobro.";
    });
  }

  async function onShareAction(button, event) {
    const doc = sheetDoc;
    if (!doc || doc.id !== panel.dataset.docId) return;
    const status = panel.querySelector("[data-cobro-share-status]");
    const kind = button.dataset.cobroShareAction;
    const record = (channel) => deps.api(storePath(`/documents/${encodeURIComponent(doc.id)}/shared`), { method: "POST", body: JSON.stringify({ channel }) }).catch(() => {});
    if (kind === "whatsapp") { void record("whatsapp"); status.textContent = "Abrimos WhatsApp con el mensaje listo."; return; }
    if (kind === "copy") {
      event?.preventDefault();
      try {
        await navigator.clipboard.writeText(doc.publicUrl);
        status.textContent = "¡Enlace copiado!";
      } catch {
        window.prompt("Copia el enlace del cobro", doc.publicUrl);
      }
      void record("link");
      return;
    }
    button.disabled = true;
    try {
      let target = doc;
      if (kind === "email-new") {
        const input = panel.querySelector("#cobroShareEmail");
        const email = input.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = "Revisa el correo."; button.disabled = false; input.focus(); return; }
        target = await deps.api(storePath(`/documents/${encodeURIComponent(doc.id)}`), { method: "PATCH", body: JSON.stringify({ customerEmail: email }) });
      }
      const result = await deps.api(storePath(`/documents/${encodeURIComponent(target.id)}/send`), { method: "POST", body: JSON.stringify({ email: true }) });
      sheetDoc = { ...sheetDoc, ...result.document };
      status.textContent = result.emailed ? `Enviado a ${result.document.customer?.email}.` : "No pudimos enviar el correo. Compártelo por WhatsApp o copia el enlace.";
      void load();
    } catch (error) {
      status.textContent = errorText(error);
    } finally {
      button.disabled = false;
    }
  }

  // ── detail ───────────────────────────────────────────────────────────

  async function openDetail(id) {
    const known = documents.find((row) => row.id === id) || (sheetDoc?.id === id ? sheetDoc : null);
    if (sheet.hidden || panel.dataset.docId !== id) {
      openSheet(`<header class="cobro-sheet-head"><div><h2 id="cobroSheetTitle">${esc(known?.numberLabel || "Cobro")}</h2></div><button type="button" class="cobro-icon-button" data-cobro-close aria-label="Cerrar">${ICON.close}</button></header><div class="cobro-sheet-body"><div class="cobros-skeleton" aria-busy="true">${"<span></span>".repeat(2)}</div></div>`);
      panel.dataset.docId = id;
    }
    try {
      const doc = await deps.api(storePath(`/documents/${encodeURIComponent(id)}`));
      if (sheet.hidden || panel.dataset.docId !== id) return;
      sheetDoc = doc;
      const index = documents.findIndex((row) => row.id === doc.id);
      if (index >= 0) { documents[index] = { ...documents[index], ...doc }; render(); }
      openSheet(detailHtml(doc));
      panel.dataset.docId = doc.id;
    } catch (error) {
      const body = panel.querySelector(".cobro-sheet-body");
      if (body) body.innerHTML = `<p class="cobros-error" role="alert">${esc(errorText(error))}</p>`;
    }
  }

  function attentionNote(doc) {
    const payment = doc.payment || {};
    if (payment.afterClose) {
      return `<div class="cobro-alert" role="note" data-cobro-attention-note>${ICON.alert}<div>
        <strong>${doc.status === "VOIDED" ? "Llegó un pago después de anular este cobro." : "Llegó un segundo pago por este cobro."}</strong>
        <p>El dinero sí entró a tu cuenta. Busca el pago en Pagos (mismo monto y fecha que en el historial) y reembólsalo; o, si prefieres conservarlo, avísale a tu cliente y regístralo con un cobro nuevo.</p>
        <a class="cobro-secondary" href="#dashboard-payments" data-dashboard-view-link="payments" data-cobro-close>Ir a Pagos</a></div></div>`;
    }
    if (payment.mismatch) {
      return `<div class="cobro-alert" role="note" data-cobro-attention-note>${ICON.alert}<div>
        <strong>Tu cliente pagó otra versión o un monto distinto.</strong>
        <p>El cobro sigue abierto por el monto actual. Reembolsa ese pago desde Pagos, o si el monto te sirve, usa “Marcar como pagado”.</p>
        <a class="cobro-secondary" href="#dashboard-payments" data-dashboard-view-link="payments" data-cobro-close>Ir a Pagos</a></div></div>`;
    }
    return "";
  }

  function detailHtml(doc) {
    const now = new Date();
    const state = cobroState(doc, now);
    const open = state === "open" || state === "overdue";
    const payment = doc.payment || {};
    const timeline = timelineEntries(doc.events || []).reverse();
    const preview = doc.publicUrl
      ? `${previewLinkHtml(doc, "cobro-secondary")}${ICON.eye}Ver como cliente</a>
         <a class="cobro-secondary" href="${esc(pdfUrl(doc.publicUrl))}" target="_blank" rel="noopener">${ICON.doc}PDF</a>`
      : "";
    const actions = state === "draft"
      ? `<button type="button" class="primary" data-cobro-action="send-draft">Crear enlace y compartir</button>
         <button type="button" class="cobro-secondary is-danger" data-cobro-action="delete">Eliminar borrador</button>`
      : `${open ? `<button type="button" class="primary" data-cobro-action="share">Compartir</button>
           <div class="cobro-remind"><button type="button" class="cobro-secondary" data-cobro-action="remind-menu" aria-expanded="false">${ICON.bell}Recordar</button>
             <div class="cobro-remind-menu" data-cobro-remind-menu hidden>
               <a href="${esc(whatsAppShareUrl(doc.customer?.phone, shareText(doc, true)))}" target="_blank" rel="noopener noreferrer" data-cobro-action="remind-whatsapp">Recordar por WhatsApp</a>
               ${doc.customer?.email ? `<button type="button" data-cobro-action="remind-email">Recordar por correo</button>` : ""}
             </div></div>
           <button type="button" class="cobro-secondary" data-cobro-action="mark-paid-ask" aria-expanded="false">${ICON.check}Marcar como pagado</button>` : ""}
         ${preview}`;
    // The SIN factura is emitted only for a real payment through pagosYa.
    const livePlatformPayment = state === "paid" && !payment.testMode && !payment.manual;
    const paidNote = livePlatformPayment && deps.invoicingReady() ? `<p class="cobro-sin is-ready">${ICON.check}<span>La factura SIN de este pago se emite automáticamente.</span></p>` : "";
    const testNote = state === "paid" && payment.testMode ? `<p class="cobro-sin is-test" data-cobro-test-note>${ICON.flask}<span>Fue un pago de prueba (tu cuenta aún está en verificación): no movió dinero real y no suma en Cobrado.</span></p>` : "";
    const markPaid = open ? `<div class="cobro-mark-paid" data-cobro-mark-paid-box hidden>
        <fieldset><legend>¿Cómo te pagó?</legend>
          <div class="ui-pills">
            ${["cash", "transfer", "other"].map((method, index) => uiPill({ group: "cobroPaidMethod", value: method, label: { cash: "Efectivo", transfer: "Transferencia", other: "Otro" }[method] || method, checked: index === 0 })).join("")}
          </div>
        </fieldset>
        <label for="cobroPaidReference">Nota o referencia <small>(opcional)</small></label>
        <input id="cobroPaidReference" maxlength="200" autocomplete="off" placeholder="Ej.: transferencia BNB 1234">
        <p class="cobro-muted">El cobro queda pagado, los recordatorios se detienen y suma en Cobrado.</p>
        <div class="cobro-mark-paid-actions">
          <button type="button" class="primary" data-cobro-action="mark-paid">Confirmar pago</button>
          <button type="button" class="cobro-secondary" data-cobro-action="mark-paid-cancel">Cancelar</button>
        </div>
      </div>` : "";
    const reminders = open ? uiOption({ icon: "bell-ring", attrs: "data-cobro-auto-reminders", checked: doc.autoReminders, title: "Recordatorios automáticos", text: doc.customer?.email ? "Por correo al vencer y 3 días después." : "Tu cliente no tiene correo para recibirlos." }) : "";
    const chip = payment.testMode && state === "paid" ? `<span class="cobro-chip is-test">Pagado · pago de prueba</span>` : `<span class="cobro-chip is-${state}">${esc(STATE_LABEL[state])}</span>`;
    return `<header class="cobro-sheet-head">
        <div><p class="cobro-kicker">${esc(doc.numberLabel)}</p><h2 id="cobroSheetTitle">${esc(doc.customer?.name || "Sin nombre")}</h2></div>
        <button type="button" class="cobro-icon-button" data-cobro-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="cobro-sheet-body">
        ${attentionNote(doc)}
        <div class="cobro-detail-hero">
          ${chip}
          <strong class="cobro-detail-amount">${esc(formatMoney(doc.totalAmount, doc.currency))}</strong>
          <p class="cobro-muted">${esc(dueLine(doc, now))}${doc.dueAt && state !== "paid" ? ` · ${esc(longDate(doc.dueAt))}` : ""}</p>
          ${doc.title ? `<p class="cobro-detail-title">${esc(doc.title)}</p>` : ""}
        </div>
        <div class="cobro-detail-actions">${actions}</div>
        ${markPaid}
        ${reminders}
        ${paidNote}${testNote}
        <section class="cobro-detail-block" aria-label="Detalle">
          <ul class="cobro-detail-items">${(doc.items || []).map((item) => `<li><span>${esc(item.quantity)}× ${esc(item.description)}</span><strong>${esc(formatMoney(item.amount, doc.currency))}</strong></li>`).join("")}</ul>
          ${doc.discountAmount ? `<p class="cobro-detail-line"><span>Descuento</span><span>− ${esc(formatMoney(doc.discountAmount, doc.currency))}</span></p>` : ""}
          <p class="cobro-detail-line is-total"><span>Total</span><strong>${esc(formatMoney(doc.totalAmount, doc.currency))}</strong></p>
          ${[doc.customer?.phone, doc.customer?.email, doc.customer?.document ? `NIT/CI ${doc.customer.document}` : ""].filter(Boolean).length ? `<p class="cobro-muted">${esc([doc.customer.phone, doc.customer.email, doc.customer.document ? `NIT/CI ${doc.customer.document}` : ""].filter(Boolean).join(" · "))}</p>` : ""}
        </section>
        <section class="cobro-detail-block" aria-labelledby="cobroTimelineTitle">
          <h3 id="cobroTimelineTitle">Historial</h3>
          <ol class="cobro-timeline">${timeline.map((entry) => `<li class="is-${entry.tone}"><span>${esc(entry.label)}</span><time datetime="${esc(entry.at)}">${esc(new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(entry.at)))}</time></li>`).join("") || '<li class="is-neutral"><span>Sin movimientos todavía</span></li>'}</ol>
        </section>
        ${open ? `<div class="cobro-danger" data-cobro-void-box>
          <button type="button" class="cobro-link-button" data-cobro-action="void-ask">Anular cobro</button>
          <div data-cobro-void-confirm hidden><p>¿Anular ${esc(doc.numberLabel)}? Tu cliente verá que ya no está vigente y no podrá pagarlo.</p>
            <button type="button" class="cobro-secondary is-danger" data-cobro-action="void">Sí, anular</button>
            <button type="button" class="cobro-secondary" data-cobro-action="void-cancel">No, mantener</button></div>
        </div>` : ""}
      </div>`;
  }

  async function onRemindersToggle(input) {
    const doc = sheetDoc;
    if (!doc) return;
    const wanted = input.checked;
    input.disabled = true;
    try {
      const updated = await deps.api(storePath(`/documents/${encodeURIComponent(doc.id)}/reminders`), { method: "POST", body: JSON.stringify({ autoReminders: wanted }) });
      sheetDoc = { ...doc, ...updated };
      notify(wanted ? "Recordatorios automáticos encendidos." : "Recordatorios automáticos apagados.");
    } catch (error) {
      input.checked = !wanted;
      notify(errorText(error), "bad");
    } finally {
      input.disabled = false;
    }
  }

  async function onDetailAction(button) {
    const doc = sheetDoc;
    if (!doc || doc.id !== panel.dataset.docId) return;
    const action = button.dataset.cobroAction;
    const path = (suffix = "") => storePath(`/documents/${encodeURIComponent(doc.id)}${suffix}`);
    if (action === "share") { openShare(doc); return; }
    if (action === "remind-menu") {
      const menu = panel.querySelector("[data-cobro-remind-menu]");
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
      return;
    }
    if (action === "remind-whatsapp") {
      void deps.api(path("/remind"), { method: "POST", body: JSON.stringify({ channel: "whatsapp" }) }).catch(() => {});
      notify("Abrimos WhatsApp con el recordatorio listo.");
      return;
    }
    if (action === "mark-paid-ask" || action === "mark-paid-cancel") {
      const box = panel.querySelector("[data-cobro-mark-paid-box]");
      box.hidden = action === "mark-paid-cancel";
      panel.querySelector('[data-cobro-action="mark-paid-ask"]')?.setAttribute("aria-expanded", String(!box.hidden));
      if (!box.hidden) box.querySelector("input:checked")?.focus();
      else panel.querySelector('[data-cobro-action="mark-paid-ask"]')?.focus();
      return;
    }
    if (action === "void-ask") { panel.querySelector("[data-cobro-void-confirm]").hidden = false; button.hidden = true; panel.querySelector('[data-cobro-action="void-cancel"]')?.focus(); return; }
    if (action === "void-cancel") { panel.querySelector("[data-cobro-void-confirm]").hidden = true; const ask = panel.querySelector('[data-cobro-action="void-ask"]'); ask.hidden = false; ask.focus(); return; }
    button.disabled = true;
    try {
      if (action === "remind-email") {
        await deps.api(path("/remind"), { method: "POST", body: JSON.stringify({ channel: "email" }) });
        notify(`Recordatorio enviado a ${doc.customer?.email}.`);
        panel.querySelector("[data-cobro-remind-menu]").hidden = true;
        void openDetail(doc.id);
      } else if (action === "mark-paid") {
        const method = panel.querySelector('input[name="cobroPaidMethod"]:checked')?.value || "cash";
        const reference = panel.querySelector("#cobroPaidReference")?.value.trim();
        await deps.api(path("/mark-paid"), { method: "POST", body: JSON.stringify({ method, ...(reference ? { reference } : {}) }) });
        notify(`${doc.numberLabel} quedó pagado (${PAYMENT_METHOD_LABEL[method]}).`);
        void openDetail(doc.id);
        void load();
      } else if (action === "void") {
        await deps.api(path("/void"), { method: "POST", body: JSON.stringify({}) });
        notify(`${doc.numberLabel} anulado.`);
        void openDetail(doc.id);
        void load();
      } else if (action === "delete") {
        await deps.api(path(), { method: "DELETE" });
        closeSheet();
        notify("Borrador eliminado.");
        void load();
      } else if (action === "send-draft") {
        const sent = await deps.api(path("/send"), { method: "POST", body: JSON.stringify({ email: false }) });
        openShare(sent.document, { fresh: true });
        void load();
      }
    } catch (error) {
      notify(errorText(error), "bad");
    } finally {
      button.disabled = false;
    }
  }

  return {
    /** The view became visible: load the active store's cobros (the summary and the current tab). */
    show() {
      if (loadedFor !== deps.storeId()) { documents = []; summary = null; filter = "all"; }
      render();
      void load();
    },
    /** Open one cobro from another view (e.g. one just created from an accepted proposal): its share sheet or its detail. */
    async open(id, { share = false } = {}) {
      if (!share) { void openDetail(id); return; }
      try {
        openShare(await deps.api(storePath(`/documents/${encodeURIComponent(id)}`)), { fresh: true });
      } catch (error) {
        notify(errorText(error), "bad");
      }
    },
    /** The active store changed. */
    reset() {
      documents = [];
      summary = null;
      nextCursor = null;
      loadedFor = null;
      catalog = null;
      suggestions = [];
      filter = "all";
      closeSheet();
      if (document.body.dataset.dashboardView === "cobros") void load();
    },
  };
}
