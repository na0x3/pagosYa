import { escapeHtml as esc } from "./html.mjs";
import {
  STATE_LABEL,
  buildCobroPayload,
  cobroCounts,
  cobroState,
  cobroSummary,
  dueDateFromInput,
  dueDateFromPreset,
  dueDateInputValue,
  dueLine,
  filterCobros,
  formatMoney,
  longDate,
  parseMoney,
  shortDate,
  timelineEntries,
  validateCobroDraft,
  whatsAppMessage,
  whatsAppShareUrl,
} from "./cobros.mjs";

/**
 * Documentos → Cobros (D1): list, guided create, share, detail with timeline,
 * reminders and void. Everything interpolated into markup goes through esc().
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

  let documents = [];
  let loadedFor = null;
  let loading = false;
  let filter = "all";
  let catalog = null;
  let draft = null;
  let suggestTimer = null;
  let suggestions = [];
  let lastFocus = null;

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
    sheet.hidden = true;
    panel.innerHTML = "";
    draft = null;
    document.body.classList.remove("cobro-sheet-open");
    lastFocus?.focus?.({ preventScroll: true });
  }
  sheet.addEventListener("click", (event) => { if (event.target.closest("[data-cobro-close]")) closeSheet(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !sheet.hidden) closeSheet(); });

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
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z"/><path d="M9 9.5c.3 2 2 3.8 4.2 4.5l1.1-1.1 1.7.8-.4 1.4c-3.3.3-6.8-3.1-6.6-6.4l1.4-.4.8 1.7z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  };

  // ── list ─────────────────────────────────────────────────────────────

  async function load() {
    const storeId = deps.storeId();
    if (!storeId || !deps.signedIn()) { documents = []; loadedFor = null; render(); return; }
    loading = true;
    render();
    try {
      const rows = await deps.api(`${storePath("/documents")}?kind=INVOICE`);
      if (storeId !== deps.storeId()) return;
      documents = Array.isArray(rows) ? rows : [];
      loadedFor = storeId;
    } catch (error) {
      root.innerHTML = `<div class="cobros-error" role="alert"><p>${esc(errorText(error))}</p><button type="button" class="primary" data-cobros-retry>Intentar de nuevo</button></div>`;
      loading = false;
      return;
    }
    loading = false;
    render();
  }

  function render() {
    if (!deps.storeId()) {
      root.innerHTML = `<div class="cobros-empty" data-cobros-empty><p>Crea o elige una tienda para empezar a cobrar.</p><a class="cobros-link" href="#dashboard-stores" data-dashboard-view-link="stores">Ir a Mi tienda</a></div>`;
      return;
    }
    if (loading && !documents.length) {
      root.innerHTML = `<div class="cobros-skeleton" aria-busy="true" aria-label="Cargando cobros">${"<span></span>".repeat(3)}</div>`;
      return;
    }
    if (!documents.length) {
      root.innerHTML = `<div class="cobros-empty" data-cobros-empty>
        <span class="cobros-empty-icon" aria-hidden="true">${ICON.doc}</span>
        <h3>Cobra en un minuto</h3>
        <p>Crea un cobro, compártelo por WhatsApp y recibe el pago con QR o tarjeta.</p>
        <button type="button" class="primary cobros-cta" data-cobro-new data-autofocus>Crear mi primer cobro</button>
      </div>`;
      return;
    }
    const now = new Date();
    const counts = cobroCounts(documents, now);
    const summary = cobroSummary(documents, now);
    const rows = filterCobros(documents, filter, now);
    const emptyFilter = {
      open: "No tienes cobros pendientes. ¡Todo al día!",
      overdue: "Ningún cobro vencido. Así se hace.",
      paid: "Aún no te pagaron un cobro. Comparte uno por WhatsApp para empezar.",
      all: "",
    }[filter];
    root.innerHTML = `<div class="cobros-head">
        <dl class="cobros-summary">
          <div><dt>Por cobrar</dt><dd>${esc(formatMoney(summary.owed))}</dd></div>
          <div class="${summary.overdue ? "is-warning" : ""}"><dt>Vencido</dt><dd>${esc(formatMoney(summary.overdue))}</dd></div>
          <div class="is-good"><dt>Cobrado · 30 días</dt><dd>${esc(formatMoney(summary.collected))}</dd></div>
        </dl>
        <button type="button" class="primary cobros-new" data-cobro-new>${ICON.plus}<span>Nuevo cobro</span></button>
      </div>
      <div class="cobros-filters" role="tablist" aria-label="Filtrar cobros">
        ${FILTERS.map((option) => `<button type="button" role="tab" aria-selected="${filter === option.id}" data-cobro-filter="${option.id}">${esc(option.label)}<span>${counts[option.id]}</span></button>`).join("")}
      </div>
      ${rows.length ? `<ul class="cobros-list">${rows.map((doc) => cardHtml(doc, now)).join("")}</ul>` : `<p class="cobros-filter-empty">${esc(emptyFilter)}</p>`}`;
  }

  function cardHtml(doc, now) {
    const state = cobroState(doc, now);
    const name = doc.customer?.name || "Sin nombre";
    return `<li><button type="button" class="cobro-card" data-cobro-card data-cobro-id="${esc(doc.id)}">
      <span class="cobro-avatar" aria-hidden="true">${esc(initials(name))}</span>
      <span class="cobro-card-main">
        <strong>${esc(name)}</strong>
        <small>${esc(doc.numberLabel)} · ${esc(dueLine(doc, now))}</small>
      </span>
      <span class="cobro-card-side">
        <strong>${esc(formatMoney(doc.totalAmount, doc.currency))}</strong>
        <span class="cobro-chip is-${state}">${esc(STATE_LABEL[state])}</span>
      </span>
    </button></li>`;
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-cobro-new]")) { openCreate(); return; }
    if (event.target.closest("[data-cobros-retry]")) { void load(); return; }
    const tab = event.target.closest("[data-cobro-filter]");
    if (tab) { filter = tab.dataset.cobroFilter; render(); root.querySelector(`[data-cobro-filter="${filter}"]`)?.focus(); return; }
    const card = event.target.closest("[data-cobro-card]");
    if (card) void openDetail(card.dataset.cobroId);
  });

  // ── create ───────────────────────────────────────────────────────────

  function newDraft() {
    return { customer: { name: "", email: "", phone: "", businessCustomerId: null }, items: [{ description: "", quantity: 1, unitAmount: null, priceText: "" }], preset: "7", customDate: "", note: "", autoReminders: true, showCatalog: false, catalogQuery: "", problems: [], saving: false };
  }

  function draftDueAt() {
    if (draft.preset === "custom") return dueDateFromInput(draft.customDate);
    const preset = PRESETS.find((option) => option.id === draft.preset);
    return preset ? dueDateFromPreset(preset.days) : null;
  }

  function draftTotal() {
    return draft.items.reduce((sum, item) => sum + (item.unitAmount || 0) * (item.quantity || 1), 0);
  }

  function openCreate() {
    draft = newDraft();
    openSheet(createHtml());
    void loadCatalog();
  }

  function createHtml() {
    const dueAt = draftDueAt();
    const invoicing = deps.invoicingReady()
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
            <div class="cobro-presets" role="radiogroup" aria-label="Vencimiento">
              ${PRESETS.map((option) => `<label class="cobro-preset"><input type="radio" name="duePreset" value="${option.id}" ${draft.preset === option.id ? "checked" : ""}><span>${esc(option.label)}</span></label>`).join("")}
              <label class="cobro-preset"><input type="radio" name="duePreset" value="custom" ${draft.preset === "custom" ? "checked" : ""}><span>Otra fecha</span></label>
            </div>
            <div class="cobro-custom-date" ${draft.preset === "custom" ? "" : "hidden"}><label for="cobroDueDate">Fecha de vencimiento</label><input id="cobroDueDate" type="date" value="${esc(draft.customDate)}"></div>
            <p class="cobro-due-hint" data-cobro-due-hint>${dueAt ? `Vence el ${esc(longDate(dueAt))}` : "Elige la fecha"}</p>
          </fieldset>
          <fieldset class="cobro-step">
            <legend><span>4</span>Nota <small>(opcional)</small></legend>
            <label for="cobroNote" class="sr-only">Nota para el cliente</label>
            <textarea id="cobroNote" rows="2" maxlength="1000" placeholder="Ej.: Gracias por tu compra. Transferencias con el número de cobro.">${esc(draft.note)}</textarea>
            <label class="cobro-toggle"><input type="checkbox" data-cobro-reminders ${draft.autoReminders ? "checked" : ""}><span><strong>Recordatorios automáticos</strong><small>Le avisamos por correo el día que vence y 3 días después si aún no pagó.</small></span></label>
            ${invoicing}
          </fieldset>
          <div class="cobro-problems" role="alert" data-cobro-problems ${draft.problems.length ? "" : "hidden"}>${draft.problems.map((problem) => `<p>${esc(problem)}</p>`).join("")}</div>
        </div>
        <footer class="cobro-sheet-foot">
          <div class="cobro-total-line"><small>Total</small><strong data-cobro-total>${esc(formatMoney(draftTotal()))}</strong></div>
          <button type="submit" class="primary cobro-submit" ${draft.saving ? "disabled" : ""}>${draft.saving ? "Creando…" : "Crear cobro"}</button>
        </footer>
      </form>`;
  }

  function itemsHtml() {
    return draft.items.map((item, index) => `<div class="cobro-line" data-cobro-line="${index}">
      <div class="cobro-line-desc"><label for="cobroLineDesc${index}" class="sr-only">Descripción de la línea ${index + 1}</label><input id="cobroLineDesc${index}" data-field="description" maxlength="500" placeholder="Producto o servicio" value="${esc(item.description)}" aria-label="Descripción de la línea ${index + 1}"></div>
      <div class="cobro-line-qty" role="group" aria-label="Cantidad de la línea ${index + 1}">
        <button type="button" data-cobro-qty="-1" aria-label="Menos">−</button>
        <input data-field="quantity" inputmode="numeric" value="${esc(item.quantity)}" aria-label="Cantidad de la línea ${index + 1}">
        <button type="button" data-cobro-qty="1" aria-label="Más">+</button>
      </div>
      <div class="cobro-line-price"><span aria-hidden="true">Bs</span><input data-field="price" inputmode="decimal" placeholder="0,00" value="${esc(item.priceText)}" aria-label="Precio de la línea ${index + 1}"></div>
      ${draft.items.length > 1 ? `<button type="button" class="cobro-icon-button cobro-line-remove" data-cobro-remove-line aria-label="Quitar la línea ${index + 1}">${ICON.close}</button>` : ""}
    </div>`).join("");
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
    if (total) total.textContent = formatMoney(draftTotal());
    const hint = panel.querySelector("[data-cobro-due-hint]");
    const dueAt = draftDueAt();
    if (hint) hint.textContent = dueAt ? `Vence el ${longDate(dueAt)}` : "Elige la fecha";
  }

  function rerenderItems(focusIndex, field) {
    const box = panel.querySelector("[data-cobro-items]");
    if (!box) return;
    box.innerHTML = itemsHtml();
    refreshTotals();
    if (focusIndex !== undefined) box.querySelector(`[data-cobro-line="${focusIndex}"] [data-field="${field || "description"}"]`)?.focus();
  }

  function renderSuggestions(open) {
    const list = panel.querySelector("#cobroCustomerOptions");
    const input = panel.querySelector("#cobroCustomerName");
    if (!list || !input) return;
    const show = open && suggestions.length > 0;
    list.hidden = !show;
    input.setAttribute("aria-expanded", String(show));
    list.innerHTML = suggestions.map((row, index) => `<li role="option" id="cobroSuggestion${index}" data-cobro-suggestion="${index}" aria-selected="false">
      <span class="cobro-avatar" aria-hidden="true">${esc(initials(row.name))}</span>
      <span><strong>${esc(row.name)}</strong><small>${esc([row.phone, row.email].filter(Boolean).join(" · ") || { crm: "Cliente", cobro: "Cobro anterior", buyer: "Compró en tu tienda" }[row.source] || "")}</small></span>
    </li>`).join("");
  }

  async function fetchSuggestions(query) {
    try {
      const rows = await deps.api(`${storePath("/document-customers")}${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      if (!draft) return;
      suggestions = Array.isArray(rows) ? rows : [];
      renderSuggestions(document.activeElement === panel.querySelector("#cobroCustomerName"));
    } catch {
      suggestions = [];
    }
  }

  function pickSuggestion(index) {
    const row = suggestions[index];
    if (!row || !draft) return;
    draft.customer = { name: row.name, email: row.email || "", phone: row.phone || "", businessCustomerId: row.businessCustomerId || null };
    panel.querySelector("#cobroCustomerName").value = row.name;
    panel.querySelector("#cobroCustomerPhone").value = draft.customer.phone;
    panel.querySelector("#cobroCustomerEmail").value = draft.customer.email;
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
      clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => void fetchSuggestions(target.value.trim()), 180);
      return;
    }
    if (target.id === "cobroCustomerPhone") { draft.customer.phone = target.value; return; }
    if (target.id === "cobroCustomerEmail") { draft.customer.email = target.value; return; }
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
      const item = draft.items[Number(line.dataset.cobroLine)];
      if (target.dataset.field === "description") item.description = target.value;
      if (target.dataset.field === "quantity") item.quantity = Math.min(100000, Math.max(1, parseInt(target.value, 10) || 1));
      if (target.dataset.field === "price") { item.priceText = target.value; item.unitAmount = parseMoney(target.value); }
      refreshTotals();
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
  });
  panel.addEventListener("keydown", (event) => {
    if (event.target.id !== "cobroCustomerName" || !suggestions.length) return;
    if (event.key === "Enter") { event.preventDefault(); pickSuggestion(0); }
  });
  panel.addEventListener("mousedown", (event) => {
    // Keep the input focused while choosing, so focusout does not hide the list first.
    if (event.target.closest("[data-cobro-suggestion]")) event.preventDefault();
  });

  panel.addEventListener("change", (event) => {
    if (!draft) return;
    const target = event.target;
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
    if (event.target.closest("[data-cobro-add-line]") && draft) {
      draft.items.push({ description: "", quantity: 1, unitAmount: null, priceText: "" });
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
      const line = { description: String(row.name).slice(0, 500), quantity: 1, unitAmount: row.amount, priceText: formatMoney(row.amount).replace(/^Bs\s/, ""), paymentLinkId: row.id };
      const blank = draft.items.findIndex((item) => !item.description.trim() && !item.unitAmount);
      if (blank >= 0) draft.items[blank] = line; else draft.items.push(line);
      draft.showCatalog = false;
      panel.querySelector("[data-cobro-catalog-panel]").hidden = true;
      panel.querySelector("[data-cobro-catalog]")?.setAttribute("aria-expanded", "false");
      rerenderItems();
      return;
    }
    const share = event.target.closest("[data-cobro-share-action]");
    if (share) { void onShareAction(share); return; }
    const action = event.target.closest("[data-cobro-action]");
    if (action) void onDetailAction(action);
  });

  panel.addEventListener("submit", async (event) => {
    if (!event.target.matches("[data-cobro-form]") || !draft) return;
    event.preventDefault();
    const input = { ...draft, dueAt: draftDueAt() };
    draft.problems = validateCobroDraft(input);
    if (!input.dueAt) draft.problems.push("Elige una fecha de vencimiento.");
    const problems = panel.querySelector("[data-cobro-problems]");
    problems.hidden = !draft.problems.length;
    problems.innerHTML = draft.problems.map((problem) => `<p>${esc(problem)}</p>`).join("");
    if (draft.problems.length) { problems.scrollIntoView({ block: "nearest" }); return; }
    const submit = panel.querySelector(".cobro-submit");
    submit.disabled = true;
    submit.textContent = "Creando…";
    try {
      const created = await deps.api(storePath("/documents"), { method: "POST", body: JSON.stringify(buildCobroPayload(input)) });
      // One tap creates and freezes it: the share options below are then real links.
      const sent = await deps.api(storePath(`/documents/${encodeURIComponent(created.id)}/send`), { method: "POST", body: JSON.stringify({ email: false }) });
      upsert(sent.document);
      draft = null;
      openShare(sent.document, { fresh: true });
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Crear cobro";
      problems.hidden = false;
      problems.innerHTML = `<p>${esc(errorText(error))}</p>`;
    }
  });

  function upsert(doc) {
    const index = documents.findIndex((row) => row.id === doc.id);
    if (index >= 0) documents[index] = { ...documents[index], ...doc };
    else documents.unshift(doc);
    render();
  }

  // ── share ────────────────────────────────────────────────────────────

  function shareText(doc, reminder = false) {
    return whatsAppMessage({ customerName: doc.customer?.name ?? null, storeName: storeName(), numberLabel: doc.numberLabel, total: doc.totalAmount, currency: doc.currency, dueAt: doc.dueAt, url: doc.publicUrl, reminder });
  }

  function openShare(doc, { fresh = false } = {}) {
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
          <a class="cobro-share-option" href="${esc(doc.publicUrl)}" data-cobro-preview-link target="_blank" rel="noopener"><span class="cobro-share-icon">${ICON.eye}</span><span><strong>Ver como cliente</strong><small>Abrirlo desde aquí no cuenta como visto</small></span></a>
        </div>
        <p class="cobro-share-status" role="status" aria-live="polite" data-cobro-share-status></p>
      </div>
      <footer class="cobro-sheet-foot"><button type="button" class="primary cobro-submit" data-cobro-close>Listo</button></footer>`);
    panel.dataset.docId = doc.id;
    // The preview link needs a fresh signed token; until it arrives the plain link opens the page.
    deps.api(storePath(`/documents/${encodeURIComponent(doc.id)}`)).then((detail) => {
      const link = panel.querySelector("[data-cobro-preview-link]");
      if (link && detail?.previewUrl && panel.dataset.docId === doc.id) link.href = detail.previewUrl;
    }).catch(() => {});
  }

  async function onShareAction(button) {
    const doc = documents.find((row) => row.id === panel.dataset.docId);
    if (!doc) return;
    const status = panel.querySelector("[data-cobro-share-status]");
    const kind = button.dataset.cobroShareAction;
    const record = (channel) => deps.api(storePath(`/documents/${encodeURIComponent(doc.id)}/shared`), { method: "POST", body: JSON.stringify({ channel }) }).catch(() => {});
    if (kind === "whatsapp") { void record("whatsapp"); status.textContent = "Abrimos WhatsApp con el mensaje listo."; return; }
    if (kind === "copy") {
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
      upsert(result.document);
      status.textContent = result.emailed ? `Enviado a ${result.document.customer?.email}.` : "No pudimos enviar el correo. Compártelo por WhatsApp o copia el enlace.";
    } catch (error) {
      status.textContent = errorText(error);
    } finally {
      button.disabled = false;
    }
  }

  // ── detail ───────────────────────────────────────────────────────────

  async function openDetail(id) {
    const summary = documents.find((row) => row.id === id);
    openSheet(`<header class="cobro-sheet-head"><div><h2 id="cobroSheetTitle">${esc(summary?.numberLabel || "Cobro")}</h2></div><button type="button" class="cobro-icon-button" data-cobro-close aria-label="Cerrar">${ICON.close}</button></header><div class="cobro-sheet-body"><div class="cobros-skeleton" aria-busy="true">${"<span></span>".repeat(2)}</div></div>`);
    try {
      const doc = await deps.api(storePath(`/documents/${encodeURIComponent(id)}`));
      if (sheet.hidden) return;
      upsert(doc);
      openSheet(detailHtml(doc));
      panel.dataset.docId = doc.id;
    } catch (error) {
      panel.querySelector(".cobro-sheet-body").innerHTML = `<p class="cobros-error" role="alert">${esc(errorText(error))}</p>`;
    }
  }

  function detailHtml(doc) {
    const now = new Date();
    const state = cobroState(doc, now);
    const open = state === "open" || state === "overdue";
    const timeline = timelineEntries(doc.events || []).reverse();
    const actions = state === "draft"
      ? `<button type="button" class="primary" data-cobro-action="send-draft">Crear enlace y compartir</button>
         <button type="button" class="cobro-secondary is-danger" data-cobro-action="delete">Eliminar borrador</button>`
      : `${open ? `<button type="button" class="primary" data-cobro-action="share">Compartir</button>
           <div class="cobro-remind"><button type="button" class="cobro-secondary" data-cobro-action="remind-menu" aria-expanded="false">${ICON.bell}Recordar</button>
             <div class="cobro-remind-menu" data-cobro-remind-menu hidden>
               <a href="${esc(whatsAppShareUrl(doc.customer?.phone, shareText(doc, true)))}" target="_blank" rel="noopener noreferrer" data-cobro-action="remind-whatsapp">Recordar por WhatsApp</a>
               ${doc.customer?.email ? `<button type="button" data-cobro-action="remind-email">Recordar por correo</button>` : ""}
             </div></div>` : ""}
         ${doc.publicUrl ? `<a class="cobro-secondary" href="${esc(doc.previewUrl || doc.publicUrl)}" target="_blank" rel="noopener">${ICON.eye}Ver como cliente</a>
         <a class="cobro-secondary" href="${esc(pdfUrl(doc.publicUrl))}" target="_blank" rel="noopener">${ICON.doc}PDF</a>` : ""}`;
    const paidNote = state === "paid" && deps.invoicingReady() ? `<p class="cobro-sin is-ready">${ICON.check}<span>La factura SIN de este pago se emite automáticamente.</span></p>` : "";
    const testPayment = (doc.events || []).some((event) => event.type === "paid" && event.data?.livemode === false);
    return `<header class="cobro-sheet-head">
        <div><p class="cobro-kicker">${esc(doc.numberLabel)}</p><h2 id="cobroSheetTitle">${esc(doc.customer?.name || "Sin nombre")}</h2></div>
        <button type="button" class="cobro-icon-button" data-cobro-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="cobro-sheet-body">
        <div class="cobro-detail-hero">
          <span class="cobro-chip is-${state}">${esc(STATE_LABEL[state])}${testPayment ? " · prueba" : ""}</span>
          <strong class="cobro-detail-amount">${esc(formatMoney(doc.totalAmount, doc.currency))}</strong>
          <p class="cobro-muted">${esc(dueLine(doc, now))}${doc.dueAt && state !== "paid" ? ` · ${esc(longDate(doc.dueAt))}` : ""}</p>
          ${doc.title ? `<p class="cobro-detail-title">${esc(doc.title)}</p>` : ""}
        </div>
        <div class="cobro-detail-actions">${actions}</div>
        ${paidNote}
        <section class="cobro-detail-block" aria-label="Detalle">
          <ul class="cobro-detail-items">${(doc.items || []).map((item) => `<li><span>${esc(item.quantity)}× ${esc(item.description)}</span><strong>${esc(formatMoney(item.amount, doc.currency))}</strong></li>`).join("")}</ul>
          ${doc.discountAmount ? `<p class="cobro-detail-line"><span>Descuento</span><span>− ${esc(formatMoney(doc.discountAmount, doc.currency))}</span></p>` : ""}
          <p class="cobro-detail-line is-total"><span>Total</span><strong>${esc(formatMoney(doc.totalAmount, doc.currency))}</strong></p>
          ${[doc.customer?.phone, doc.customer?.email].filter(Boolean).length ? `<p class="cobro-muted">${esc([doc.customer.phone, doc.customer.email].filter(Boolean).join(" · "))}</p>` : ""}
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

  async function onDetailAction(button) {
    const doc = documents.find((row) => row.id === panel.dataset.docId);
    if (!doc) return;
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
    if (action === "void-ask") { panel.querySelector("[data-cobro-void-confirm]").hidden = false; button.hidden = true; return; }
    if (action === "void-cancel") { panel.querySelector("[data-cobro-void-confirm]").hidden = true; panel.querySelector('[data-cobro-action="void-ask"]').hidden = false; return; }
    button.disabled = true;
    try {
      if (action === "remind-email") {
        await deps.api(path("/remind"), { method: "POST", body: JSON.stringify({ channel: "email" }) });
        notify(`Recordatorio enviado a ${doc.customer?.email}.`);
        panel.querySelector("[data-cobro-remind-menu]").hidden = true;
        void openDetail(doc.id);
      } else if (action === "void") {
        await deps.api(path("/void"), { method: "POST", body: JSON.stringify({}) });
        notify(`${doc.numberLabel} anulado.`);
        void openDetail(doc.id);
      } else if (action === "delete") {
        await deps.api(path(), { method: "DELETE" });
        documents = documents.filter((row) => row.id !== doc.id);
        closeSheet();
        render();
        notify("Borrador eliminado.");
      } else if (action === "send-draft") {
        const sent = await deps.api(path("/send"), { method: "POST", body: JSON.stringify({ email: false }) });
        upsert(sent.document);
        openShare(sent.document, { fresh: true });
      }
    } catch (error) {
      notify(errorText(error), "bad");
    } finally {
      button.disabled = false;
    }
  }

  return {
    /** The view became visible: load the active store's cobros (once per store, then refresh quietly). */
    show() {
      if (loadedFor !== deps.storeId()) { documents = []; void load(); } else { render(); void load(); }
    },
    /** The active store changed. */
    reset() {
      documents = [];
      loadedFor = null;
      catalog = null;
      suggestions = [];
      filter = "all";
      closeSheet();
      if (document.body.dataset.dashboardView === "cobros") void load();
    },
  };
}
