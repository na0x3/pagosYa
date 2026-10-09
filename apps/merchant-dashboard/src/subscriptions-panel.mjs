import { escapeHtml as esc } from "./html.mjs";
import { CADENCES, CADENCE_LABEL, STATUS_LABEL, STATUS_TONE, MEMBER_STATUS_FILTERS, MEMBER_STATE_TONE, formatMoney, memberFigures, offersPayload, subscriberWhatsAppUrl, summaryFigures, validateGraceDays, validateOffers } from "./subscriptions.mjs";

/**
 * Suscripciones: subscribers (key figures, filters, table, row actions) and a Configuración tab
 * (store switch + per-product frequencies and discounts). Spec 2026-09-28 §4.
 * Everything interpolated into markup goes through esc(); confirmations are inline rows, never window.confirm.
 *
 * deps:
 *   api(path, options)  authenticated dashboard API call (throws Error with .message)
 *   storeId()           active store id
 *   signedIn()          whether a merchant session exists
 *   products()          loaded catalog rows [{ id, name, fulfillmentType }]
 */
export function mountSubscriptionsPanel(deps) {
  const root = document.getElementById("subscriptionsRoot");
  if (!root) return { show() {}, reset() {} };

  const STATUS_FILTERS = [["", "Todas"], ["ACTIVE", "Activa"], ["PAUSED", "Pausada"], ["PENDING", "Pago pendiente"], ["CANCELED", "Cancelada"]];
  const fresh = () => ({ tab: "subscribers", loading: false, summary: null, items: [], nextCursor: null, filters: { status: "", productId: "", q: "" }, memberItems: [], memberCursor: null, memberFilters: { status: "", productId: "", q: "" }, offers: new Map(), editing: null, confirming: null, message: "" });
  let state = fresh();
  let generation = 0;
  let offersGeneration = 0;
  let searchTimer;

  const storePath = (suffix = "") => `/stores/${encodeURIComponent(deps.storeId())}${suffix}`;
  const base = (suffix = "") => storePath(`/subscriptions${suffix}`);
  const productName = (id) => deps.products().find((product) => product.id === id)?.name || "este producto";
  const eligibleProducts = () => deps.products().filter((product) => product.fulfillmentType !== "DIGITAL" && product.fulfillmentType !== "MEMBERSHIP");
  const failure = (error, fallback) => { state.message = error?.message || fallback; render(); };

  async function loadSubscribers(append = false) {
    const mine = ++generation;
    const params = new URLSearchParams(Object.entries({ ...state.filters, ...(append && state.nextCursor ? { cursor: state.nextCursor } : {}) }).filter(([, value]) => value));
    const [summary, page] = await Promise.all([append && state.summary ? state.summary : deps.api(base("/summary")), deps.api(base(params.toString() ? `?${params}` : ""))]);
    if (mine !== generation) return;
    state = { ...state, loading: false, summary, items: append ? [...state.items, ...page.items] : page.items, nextCursor: page.nextCursor };
    render();
  }

  async function loadOffers() {
    const mine = ++offersGeneration;
    const rows = eligibleProducts();
    const results = await Promise.all(rows.map((product) => deps.api(storePath(`/payment_links/${encodeURIComponent(product.id)}/subscriptions`)).catch(() => [])));
    if (mine !== offersGeneration) return;
    state.offers = new Map(rows.map((product, index) => [product.id, results[index]]));
    render();
  }

  async function loadMembers(append = false) {
    const mine = ++generation;
    const params = new URLSearchParams(Object.entries({ kind: "membership", ...state.memberFilters, ...(append && state.memberCursor ? { cursor: state.memberCursor } : {}) }).filter(([, value]) => value));
    const [summary, page] = await Promise.all([append && state.summary ? state.summary : deps.api(base("/summary")), deps.api(base(`?${params}`))]);
    if (mine !== generation) return;
    state = { ...state, loading: false, summary, memberItems: append ? [...state.memberItems, ...page.items] : page.items, memberCursor: page.nextCursor };
    render();
  }
  const membershipProducts = () => deps.products().filter((product) => product.fulfillmentType === "MEMBERSHIP");

  function render() {
    const active = document.activeElement;
    const focusName = root.contains(active) ? active.name || null : null;
    const searchField = focusName === "q" || focusName === "memberQ";
    const caret = searchField ? active.selectionStart : null;
    root.innerHTML = `${headHtml()}${state.tab === "settings" ? settingsHtml() : state.tab === "members" ? membersHtml() : subscribersHtml()}${state.message ? `<p class="subs-status" role="status">${esc(state.message)}</p>` : `<p class="subs-status" role="status" hidden></p>`}`;
    if (searchField) {
      const input = root.querySelector(`[name="${focusName}"]`);
      input?.focus();
      if (input && caret !== null) input.setSelectionRange(caret, caret);
    }
  }

  function headHtml() {
    const tab = (id, label) => `<button type="button" role="tab" aria-selected="${state.tab === id}" data-tab="${id}">${label}</button>`;
    return `<header class="subs-head"><p>Clientes que reciben tus productos cada semana, quincena o mes, y tus miembros.</p>
      <div class="subs-tabs" role="tablist" aria-label="Suscripciones">${tab("subscribers", "Suscriptores")}${tab("members", "Miembros")}${tab("settings", "Configuración")}</div></header>`;
  }

  function confirmRow(text, yesAttrs, yesLabel) {
    return `<div class="subs-confirm" role="alertdialog" aria-label="Confirmar"><p>${esc(text)}</p>
      <div><button type="button" class="primary" ${yesAttrs}>${esc(yesLabel)}</button><button type="button" class="subs-quiet" data-confirm-no>No</button></div></div>`;
  }

  function subscribersHtml() {
    const { summary, items } = state;
    if (!summary) return `<div class="subs-card subs-empty"><p>${state.loading ? "Cargando suscripciones…" : "Elige una tienda para ver sus suscripciones."}</p></div>`;
    if (!summary.enabled && !items.length) {
      return `<div class="subs-card subs-empty"><h3>Aún no ofreces suscripciones</h3>
        <p>Activa las suscripciones y elige qué productos se pueden recibir cada semana, quincena o mes. Antes de cada entrega, tu cliente recibe un enlace para pagar.</p>
        <button type="button" class="primary" data-go-settings>Activar en Configuración</button></div>`;
    }
    const figures = summaryFigures(summary).map((figure) => `<div><dt>${esc(figure.label)}</dt><dd>${esc(figure.value)}</dd></div>`).join("");
    const statusOptions = STATUS_FILTERS.map(([value, label]) => `<option value="${value}" ${state.filters.status === value ? "selected" : ""}>${label}</option>`).join("");
    const productOptions = `<option value="">Todos los productos</option>${eligibleProducts().map((product) => `<option value="${esc(product.id)}" ${state.filters.productId === product.id ? "selected" : ""}>${esc(product.name)}</option>`).join("")}`;
    const reprice = state.filters.productId
      ? state.confirming === "reprice"
        ? confirmRow(`Los suscriptores de ${productName(state.filters.productId)} pagarán el precio actual desde dentro de 7 días. Les avisaremos por correo.`, "data-reprice", "Sí, aplicar")
        : `<button type="button" class="subs-quiet" data-reprice>Aplicar precio actual</button>`
      : "";
    const table = items.length
      ? `<div class="subs-table-wrap"><table class="subs-table"><thead><tr><th>Cliente</th><th>Producto</th><th>Frecuencia</th><th>Próxima renovación</th><th>Último pago</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${items.map(rowHtml).join("")}</tbody></table></div>`
      : `<p class="subs-card subs-empty">No hay suscripciones con estos filtros.</p>`;
    return `<dl class="subs-figures">${figures}</dl>
      <div class="subs-filters">
        <label><span class="sr-only">Estado</span><select name="status">${statusOptions}</select></label>
        <label><span class="sr-only">Producto</span><select name="productId">${productOptions}</select></label>
        <label><span class="sr-only">Buscar</span><input type="search" name="q" placeholder="Buscar por nombre o correo" value="${esc(state.filters.q)}" autocomplete="off"></label>
        ${state.confirming === "reprice" ? "" : reprice}
      </div>
      ${state.confirming === "reprice" ? reprice : ""}
      ${table}
      ${state.nextCursor ? `<button type="button" class="subs-quiet subs-more" data-more>Cargar más</button>` : ""}`;
  }

  function rowHtml(row) {
    const id = esc(row.id);
    const status = row.displayStatus;
    const buttons = [];
    if (status === "ACTIVE" || status === "PENDING_PAYMENT") buttons.push(`<button type="button" class="subs-quiet" data-act="skip" data-id="${id}">Saltar entrega</button>`);
    if (status === "ACTIVE" || status === "PENDING_PAYMENT") buttons.push(`<button type="button" class="subs-quiet" data-act="pause" data-id="${id}">Pausar</button>`);
    if (status === "PAUSED") buttons.push(`<button type="button" class="subs-quiet" data-act="resume" data-id="${id}">Reanudar</button>`);
    if (status === "PENDING_PAYMENT") {
      buttons.push(`<button type="button" class="subs-quiet" data-resend="${id}">Reenviar enlace</button>`);
      buttons.push(`<button type="button" class="subs-quiet" data-whatsapp="${id}">WhatsApp</button>`);
    }
    if (status !== "CANCELED") buttons.push(`<button type="button" class="subs-quiet is-danger" data-act="cancel" data-id="${id}">Cancelar</button>`);
    const confirm = state.confirming === row.id
      ? `<tr class="subs-confirm-row"><td colspan="7">${confirmRow(`¿Cancelar la suscripción de ${row.customerName}? No se cobrará nada más.`, `data-act="cancel" data-confirmed data-id="${id}"`, "Sí, cancelar")}</td></tr>`
      : "";
    const paid = row.lastPaidAt ? new Date(row.lastPaidAt).toLocaleDateString("es-BO") : "—";
    return `<tr>
      <td><strong>${esc(row.customerName)}</strong><small>${esc(row.customerEmail)}</small></td>
      <td>${esc(row.itemName)}<small>${esc(formatMoney(row.amount, row.currency))}</small></td>
      <td>${esc(row.cadence ? CADENCE_LABEL[row.cadence] : row.cadenceLabel)}</td>
      <td>${status === "CANCELED" ? "—" : esc(new Date(row.nextBillingAt).toLocaleDateString("es-BO"))}</td>
      <td>${esc(paid)}</td>
      <td><span class="pill pill--${esc(STATUS_TONE[status] || "muted")}">${esc(STATUS_LABEL[status] || status)}</span>${row.livemode ? "" : ` <span class="pill pill--muted">Prueba</span>`}</td>
      <td class="subs-actions">${buttons.join("")}</td></tr>${confirm}`;
  }

  function membersHtml() {
    const { summary, memberItems } = state;
    if (!summary) return `<div class="subs-card subs-empty"><p>${state.loading ? "Cargando miembros…" : "Elige una tienda para ver sus miembros."}</p></div>`;
    if (!membershipProducts().length && !memberItems.length) {
      return `<div class="subs-card subs-empty"><h3>Aún no vendes membresías</h3><p>Crea un producto de tipo Membresía con sus períodos y precios. Tus clientes se unen con «Hacerme miembro» y reciben un enlace para pagar cada renovación.</p></div>`;
    }
    const figures = memberFigures(summary).map((figure) => `<div><dt>${esc(figure.label)}</dt><dd>${esc(figure.value)}</dd></div>`).join("");
    const statusOptions = MEMBER_STATUS_FILTERS.map(([value, label]) => `<option value="${value}" ${state.memberFilters.status === value ? "selected" : ""}>${label}</option>`).join("");
    const productOptions = `<option value="">Todas las membresías</option>${membershipProducts().map((product) => `<option value="${esc(product.id)}" ${state.memberFilters.productId === product.id ? "selected" : ""}>${esc(product.name)}</option>`).join("")}`;
    const table = memberItems.length
      ? `<div class="subs-table-wrap"><table class="subs-table"><thead><tr><th>Miembro</th><th>Membresía</th><th>Período</th><th>Activa hasta</th><th>Último pago</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${memberItems.map(memberRowHtml).join("")}</tbody></table></div>`
      : `<p class="subs-card subs-empty">No hay miembros con estos filtros.</p>`;
    return `<dl class="subs-figures">${figures}</dl>
      <div class="subs-filters">
        <label><span class="sr-only">Estado</span><select name="memberStatus">${statusOptions}</select></label>
        <label><span class="sr-only">Membresía</span><select name="memberProductId">${productOptions}</select></label>
        <label><span class="sr-only">Buscar</span><input type="search" name="memberQ" placeholder="Buscar por nombre o correo" value="${esc(state.memberFilters.q)}" autocomplete="off"></label>
      </div>
      ${table}
      ${state.memberCursor ? `<button type="button" class="subs-quiet subs-more" data-more-members>Cargar más</button>` : ""}`;
  }

  function memberRowHtml(row) {
    const id = esc(row.id);
    const buttons = [];
    if (row.displayStatus === "PENDING_PAYMENT") buttons.push(`<button type="button" class="subs-quiet" data-resend="${id}">Reenviar enlace</button>`);
    if (row.status === "ACTIVE") buttons.push(`<button type="button" class="subs-quiet is-danger" data-act="cancel" data-id="${id}">Cancelar</button>`);
    const confirm = state.confirming === row.id
      ? `<tr class="subs-confirm-row"><td colspan="7">${confirmRow(`¿Cancelar la membresía de ${row.customerName}? No habrá más renovaciones; su acceso sigue hasta la fecha pagada.`, `data-act="cancel" data-confirmed data-id="${id}"`, "Sí, cancelar")}</td></tr>`
      : "";
    const until = row.accessUntil ? new Date(row.accessUntil).toLocaleDateString("es-BO") : "—";
    const paid = row.lastPaidAt ? new Date(row.lastPaidAt).toLocaleDateString("es-BO") : "—";
    return `<tr>
      <td><strong>${esc(row.customerName)}</strong><small>${esc(row.customerEmail)}</small></td>
      <td>${esc(row.itemName)}<small>${esc(formatMoney(row.amount, row.currency))}</small></td>
      <td>${esc(row.periodLabel)}</td>
      <td>${esc(until)}</td>
      <td>${esc(paid)}</td>
      <td><span class="pill pill--${esc(MEMBER_STATE_TONE[row.membershipState] || "muted")}">${esc(row.membershipStateLabel)}</span>${row.livemode ? "" : ` <span class="pill pill--muted">Prueba</span>`}</td>
      <td class="subs-actions">${buttons.join("")}</td></tr>${confirm}`;
  }

  function settingsHtml() {
    const summary = state.summary;
    const enabled = Boolean(summary?.enabled);
    const switchConfirm = state.confirming === "switch"
      ? confirmRow(`${summary?.active ?? 0} suscriptores seguirán recibiendo sus renovaciones. Puedes cancelarlas desde Suscripciones.`, "data-confirm-switch-off", "Sí, desactivar")
      : "";
    const rows = deps.products().map((product) => {
      if (product.fulfillmentType === "MEMBERSHIP") return `<tr class="is-disabled"><td>${esc(product.name)}</td><td><small>Membresía: se renueva por período</small></td><td></td></tr>`;
      if (product.fulfillmentType === "DIGITAL") return `<tr class="is-disabled"><td>${esc(product.name)}</td><td><small>No disponible para productos digitales</small></td><td></td></tr>`;
      const offers = state.offers.get(product.id) || [];
      const chips = offers.length
        ? offers.map((offer) => `<span class="subs-chip">${esc(CADENCE_LABEL[offer.cadence] || offer.cadence)} −${esc(offer.discountPercent)}%</span>`).join("")
        : `<small>Sin frecuencias</small>`;
      const editing = state.editing === product.id;
      const form = editing ? `<tr class="subs-edit-row"><td colspan="3">${offerFormHtml(offers)}</td></tr>` : "";
      return `<tr><td>${esc(product.name)}</td><td>${chips}</td><td><button type="button" class="subs-quiet" data-edit="${esc(product.id)}" ${editing ? "disabled" : ""}>Editar</button></td></tr>${form}`;
    }).join("");
    return `<section class="subs-card subs-switch">
        <label><input type="checkbox" data-switch ${enabled ? "checked" : ""}> <span>Ofrecer suscripciones en mi tienda</span></label>
        <p>Tus clientes reciben un enlace de pago antes de cada entrega. No se cobra automáticamente.</p>
        ${switchConfirm}
      </section>
      <section class="subs-card">
        <h3>Frecuencias por producto</h3>
        ${rows ? `<div class="subs-table-wrap"><table class="subs-table"><thead><tr><th>Producto</th><th>Frecuencias</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p>Aún no tienes productos.</p>`}
      </section>
      <section class="subs-card">
        <h3>Membresías</h3>
        <label>Días de gracia para renovar <input type="number" name="graceDays" min="0" max="30" step="1" value="${esc(summary?.membershipGraceDays ?? 7)}"></label>
        <p>Si un miembro no paga su renovación, sigue activo estos días. Después, su membresía vence.</p>
        <button type="button" class="primary" data-save-grace>Guardar</button>
      </section>`;
  }

  function offerFormHtml(offers) {
    const line = CADENCES.map((cadence) => {
      const saved = offers.find((offer) => offer.cadence === cadence);
      return `<div class="subs-offer-row"><label><input type="checkbox" name="offer-${cadence}" ${saved ? "checked" : ""}> ${CADENCE_LABEL[cadence]}</label>
        <label>Descuento <input type="number" name="discount-${cadence}" min="0" max="99" step="1" value="${saved ? esc(saved.discountPercent) : 0}"> %</label></div>`;
    }).join("");
    return `<div class="subs-offer-form">${line}<div class="subs-offer-actions"><button type="button" class="primary" data-save-offers>Guardar</button><button type="button" class="subs-quiet" data-cancel-edit>Cancelar</button></div></div>`;
  }

  async function setEnabled(enabled) {
    const result = await deps.api(base("/settings"), { method: "PUT", body: JSON.stringify({ enabled, membershipGraceDays: state.summary?.membershipGraceDays ?? 7 }) });
    state.summary = { ...(state.summary || { active: 0, monthlyRecurring: 0, currency: "BOB", renewalsThisWeek: 0, renewalPayRate: null }), enabled: result.enabled, membershipGraceDays: result.membershipGraceDays };
    state.confirming = null;
    state.message = enabled
      ? "Tu tienda ya ofrece suscripciones."
      : result.activeSubscribers ? `${result.activeSubscribers} suscriptores seguirán recibiendo sus renovaciones. Puedes cancelarlas desde Suscripciones.` : "Desactivamos las suscripciones.";
    render();
  }

  root.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    try {
      if (target.dataset.tab) {
        state.tab = target.dataset.tab; state.message = ""; state.confirming = null; state.editing = null;
        render();
        if (state.tab === "settings") await loadOffers();
        if (state.tab === "members") await loadMembers();
        return;
      }
      if (target.hasAttribute("data-go-settings")) { state.tab = "settings"; state.message = ""; render(); await loadOffers(); return; }
      if (target.hasAttribute("data-confirm-no")) { state.confirming = null; render(); return; }
      if (target.dataset.act) {
        const { act, id } = target.dataset;
        if (act === "cancel" && !target.hasAttribute("data-confirmed")) { state.confirming = id; state.message = ""; render(); return; }
        state.confirming = null;
        await deps.api(base(`/${encodeURIComponent(id)}`), { method: "PATCH", body: JSON.stringify({ action: act }) });
        state.message = "Listo.";
        await (state.tab === "members" ? loadMembers() : loadSubscribers());
        return;
      }
      if (target.dataset.resend || target.dataset.whatsapp) {
        const id = target.dataset.resend || target.dataset.whatsapp;
        const result = await deps.api(base(`/${encodeURIComponent(id)}/resend`), { method: "POST" });
        if (target.dataset.whatsapp) {
          const row = state.items.find((item) => item.id === id);
          const url = subscriberWhatsAppUrl(row?.customerPhone, result.whatsappText);
          if (url) { window.open(url, "_blank", "noopener"); state.message = ""; } else state.message = "Este cliente no tiene un teléfono válido.";
        } else state.message = result.sent ? "Enviamos el enlace por correo." : "No pudimos enviar el correo; copia el enlace desde WhatsApp.";
        render();
        return;
      }
      if (target.hasAttribute("data-reprice")) {
        if (state.confirming !== "reprice") { state.confirming = "reprice"; state.message = ""; render(); return; }
        state.confirming = null;
        const result = await deps.api(base(`/products/${encodeURIComponent(state.filters.productId)}/reprice`), { method: "POST" });
        state.message = `Avisamos a ${result.affected} suscriptores. El nuevo precio aplica desde el ${new Date(result.effectiveFrom).toLocaleDateString("es-BO")}.`;
        render();
        return;
      }
      if (target.hasAttribute("data-more-members")) { await loadMembers(true); return; }
      if (target.hasAttribute("data-save-grace")) {
        const value = root.querySelector('[name="graceDays"]').value;
        const problem = validateGraceDays(value);
        if (problem) { state.message = problem; render(); return; }
        const result = await deps.api(base("/settings"), { method: "PUT", body: JSON.stringify({ enabled: Boolean(state.summary?.enabled), membershipGraceDays: Number(value) }) });
        state.summary = { ...state.summary, membershipGraceDays: result.membershipGraceDays };
        state.message = "Guardamos los días de gracia.";
        render();
        return;
      }
      if (target.hasAttribute("data-more")) { await loadSubscribers(true); return; }
      if (target.hasAttribute("data-confirm-switch-off")) { await setEnabled(false); return; }
      if (target.dataset.edit) { state.editing = target.dataset.edit; state.message = ""; render(); return; }
      if (target.hasAttribute("data-cancel-edit")) { state.editing = null; render(); return; }
      if (target.hasAttribute("data-save-offers")) {
        const productId = state.editing;
        const rows = CADENCES.map((cadence) => ({ cadence, checked: root.querySelector(`[name="offer-${cadence}"]`).checked, discountPercent: Number(root.querySelector(`[name="discount-${cadence}"]`).value) }));
        const saved = (state.offers.get(productId) || []).map((offer) => offer.cadence);
        const { upsert, remove } = offersPayload(rows, saved);
        // Removing every frequency is allowed when some were saved; an empty form on a product with none is not.
        const problem = upsert.length ? validateOffers(upsert) : remove.length ? null : validateOffers(upsert);
        if (problem) { state.message = problem; render(); return; }
        const path = storePath(`/payment_links/${encodeURIComponent(productId)}/subscriptions`);
        if (upsert.length) await deps.api(path, { method: "PATCH", body: JSON.stringify({ options: upsert }) });
        if (remove.length) await deps.api(path, { method: "DELETE", body: JSON.stringify({ cadences: remove }) });
        state.editing = null;
        state.message = "Guardamos las frecuencias.";
        await loadOffers();
      }
    } catch (error) { failure(error, "No pudimos completar la acción."); }
  });

  root.addEventListener("change", async (event) => {
    const input = event.target;
    try {
      if (input.matches("[data-switch]")) {
        if (!input.checked && state.summary?.active && state.confirming !== "switch") { state.confirming = "switch"; state.message = ""; render(); return; }
        await setEnabled(input.checked);
        return;
      }
      if (input.name === "memberStatus" || input.name === "memberProductId") {
        state.memberFilters[input.name === "memberStatus" ? "status" : "productId"] = input.value;
        state.confirming = null;
        await loadMembers();
      }
      if (input.name === "status" || input.name === "productId") {
        state.filters[input.name] = input.value;
        state.confirming = null;
        await loadSubscribers();
      }
    } catch (error) { failure(error, "No pudimos guardar el cambio."); }
  });

  root.addEventListener("input", (event) => {
    if (event.target.name === "memberQ") {
      clearTimeout(searchTimer);
      const value = event.target.value.trim();
      searchTimer = setTimeout(() => { state.memberFilters.q = value; void loadMembers().catch((error) => failure(error, "No pudimos buscar.")); }, 300);
      return;
    }
    if (event.target.name !== "q") return;
    clearTimeout(searchTimer);
    const value = event.target.value.trim();
    searchTimer = setTimeout(() => { state.filters.q = value; void loadSubscribers().catch((error) => failure(error, "No pudimos buscar.")); }, 300);
  });

  return {
    show() {
      if (!deps.signedIn()) return;
      state.loading = true;
      render();
      const loading = state.tab === "settings" ? Promise.all([loadSubscribers(), loadOffers()]) : state.tab === "members" ? loadMembers() : loadSubscribers();
      void loading.catch((error) => { state.loading = false; failure(error, "No pudimos cargar las suscripciones."); });
    },
    reset() {
      generation += 1;
      offersGeneration += 1;
      clearTimeout(searchTimer);
      state = fresh();
      root.innerHTML = "";
    },
  };
}
