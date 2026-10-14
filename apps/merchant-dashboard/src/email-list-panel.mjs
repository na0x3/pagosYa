import { escapeHtml as esc } from "./html.mjs";
import { uiSwitch } from "./ui-kit.mjs";
import { mountEmailStudio } from "./email-studio-panel.mjs";
import { EMAIL_HELP, STORE_ONLY_VARIABLES, emailListGroups, normalizeOverview, sampleText, templateDraftError, templateSaveBody } from "./email-list.mjs";

const LEAVE = "Hay cambios sin guardar. ¿Descartarlos?";

/**
 * Correos y marketing › Correos (2026-10-13): every email the store sends, once, each with its switch.
 * The two confirmations open the designed editor (email-studio-panel.mjs, with "Contenido de tus
 * correos" below it); a plain-text email opens the editor that used to be the Studio's Plantillas tab.
 * The list and both editors are separate elements, so redrawing the list never wipes what the merchant
 * is typing in an editor.
 */
export function mountEmailList(container, deps) {
  if (!container) return { show() {}, reset() {} };
  const fresh = () => ({ overview: null, selected: "order_confirmation", draft: null, dirty: false, busy: false, message: "", failed: false });
  let state = fresh();
  let generation = 0;
  let shownFor = null;
  let designedFor = null;
  let list = null, editor = null, designed = null, studio = null;
  const base = () => `/stores/${encodeURIComponent(deps.storeId())}/email-workspace`;
  const ask = (message) => (deps.confirm ? deps.confirm(message) : true);
  const rows = () => emailListGroups(state.overview?.templates).flatMap(group => group.rows);
  const selectedRow = () => rows().find(row => row.id === state.selected) ?? rows()[0];

  function ensureDom() {
    if (list && container.contains(list)) return;
    list = document.createElement("div");
    list.className = "email-list";
    editor = document.createElement("div");
    editor.setAttribute("data-email-text-root", "");
    designed = document.createElement("div");
    designed.setAttribute("data-email-designed-root", "");
    container.replaceChildren(list, editor, designed);
    studio = mountEmailStudio(designed, { api: deps.api, storeId: deps.storeId, assetUrl: deps.assetUrl, types: false });
    designedFor = null;
  }

  function canLeave() {
    return !state.busy && (!state.dirty || ask(LEAVE));
  }

  function render() {
    ensureDom();
    renderList();
    renderEditor();
  }

  function renderList() {
    const current = selectedRow()?.id;
    const note = state.message ? `<p class="email-list-status" role="${state.failed ? "alert" : "status"}">${esc(state.message)}</p>` : "";
    const loading = state.overview ? "" : '<p class="email-list-status" role="status">Cargando tus correos…</p>';
    list.innerHTML = note + loading + emailListGroups(state.overview?.templates).map(group => `<section class="email-list-group" aria-labelledby="email-group-${group.key}">
      <h3 id="email-group-${group.key}">${esc(group.title)}</h3>
      <ul>${group.rows.map(row => `<li class="email-list-row">
        <button type="button" class="email-list-open" data-email-row="${esc(row.id)}" aria-pressed="${row.id === current}"><strong>${esc(row.label)}</strong><small>${esc(row.trigger)}${row.id === "RECOVERY" && row.delayHours ? ` · ${row.delayHours} h` : ""}</small></button>
        ${row.designed
          ? '<span class="email-list-state">Siempre activo</span>'
          : uiSwitch({ label: !row.supported ? "Por conectar" : row.enabled ? "Activo" : "Desactivado", attrs: `data-email-switch="${esc(row.id)}" aria-label="Enviar ${esc(row.label)}"`, checked: row.enabled, disabled: !row.supported || state.busy })}
      </li>`).join("")}</ul></section>`).join("");
    list.querySelectorAll("[data-email-row]").forEach(button => button.addEventListener("click", () => select(button.dataset.emailRow)));
    list.querySelectorAll("[data-email-switch]").forEach(box => box.addEventListener("change", () => void toggle(box)));
  }

  function renderEditor() {
    const row = selectedRow();
    const isDesigned = !row || Boolean(row.designed);
    editor.hidden = isDesigned;
    designed.hidden = !isDesigned;
    if (isDesigned) {
      editor.replaceChildren();
      const type = row?.id ?? "order_confirmation", key = `${deps.storeId()}:${type}`;
      // The designed editor loads its own preview: told once per store and email, not on every list redraw.
      if (designedFor !== key) { designedFor = key; studio.show(type); }
      return;
    }
    state.draft ??= { enabled: row.enabled, subject: row.subject, body: row.body, recoveryHours: row.delayHours || 24 };
    const draft = state.draft, off = state.busy ? "disabled" : "";
    editor.innerHTML = `<form class="email-text-editor" data-email-text-form="${esc(row.id)}" novalidate>
      <header><h3>${esc(row.label)}</h3><p>${esc(row.trigger)}</p></header>
      ${EMAIL_HELP[row.id] ? `<p class="faint">${esc(EMAIL_HELP[row.id])}</p>` : ""}
      ${uiSwitch({ label: "Activar este correo", attrs: `name="enabled" ${row.supported ? off : "disabled"}`, checked: draft.enabled })}
      ${row.supported ? "" : `<p class="faint">${esc(row.trigger)}. Puedes preparar el mensaje; el envío aún no está disponible.</p>`}
      ${row.id === "RECOVERY" ? `<label>Horas de espera<input type="number" name="recoveryHours" min="1" max="168" step="1" required value="${esc(draft.recoveryHours)}" ${off}></label>` : ""}
      <label>Asunto<input name="subject" maxlength="160" required value="${esc(draft.subject)}" ${off}></label>
      <label>Mensaje<textarea name="body" rows="7" maxlength="5000" required ${off}>${esc(draft.body)}</textarea></label>
      <p class="faint">Variables: {{store}}${STORE_ONLY_VARIABLES.includes(row.id) ? "" : " · {{customer}} · {{order}} · {{amount}}"}. Los enlaces necesarios se conservan en los correos de recuperación y reseñas.</p>
      <div class="email-studio-actions"><button type="submit" class="primary" ${off}>Guardar correo</button><button type="button" class="ghost" data-email-sample>Vista previa</button></div>
      <article class="email-text-sample" data-email-sample-out hidden></article>
    </form>`;
    const form = editor.querySelector("form");
    const track = () => { state.draft = readDraft(form); state.dirty = true; };
    form.addEventListener("input", track);
    form.addEventListener("change", track);
    form.addEventListener("submit", event => { event.preventDefault(); void save(row); });
    editor.querySelector("[data-email-sample]").addEventListener("click", () => {
      const sample = readDraft(form), store = state.overview?.storeName || "tu tienda", out = editor.querySelector("[data-email-sample-out]");
      out.innerHTML = `<small>Ejemplo · no se enviará</small><h4>${esc(sampleText(sample.subject, store))}</h4><p>${esc(sampleText(sample.body, store))}</p>`;
      out.hidden = false;
    });
  }

  function readDraft(form) {
    const field = (name) => form.elements.namedItem(name);
    return { enabled: Boolean(field("enabled")?.checked), subject: field("subject")?.value ?? "", body: field("body")?.value ?? "", recoveryHours: field("recoveryHours")?.value ?? state.draft?.recoveryHours ?? 24 };
  }

  function select(id) {
    if (id === selectedRow()?.id || !canLeave()) return;
    state = { ...state, selected: id, draft: null, dirty: false, message: "", failed: false };
    render();
  }

  async function toggle(box) {
    const row = rows().find(item => item.id === box.dataset.emailSwitch);
    // A switch saves the stored wording. Unsaved text open for this same email would be reloaded away
    // by that save, so the merchant decides first; declining puts the switch back.
    if (!row || (row.id === selectedRow()?.id && !canLeave())) { box.checked = !box.checked; return; }
    const stored = { enabled: box.checked, subject: row.subject, body: row.body, recoveryHours: row.delayHours || 24 };
    await run(templateSaveBody(row, stored, state.overview?.revision ?? 0), row, `${row.label}: ${box.checked ? "activado" : "desactivado"}.`, row.id === selectedRow()?.id);
  }

  async function save(row) {
    const problem = templateDraftError(row, state.draft);
    if (problem) { state = { ...state, message: problem, failed: true }; render(); return; }
    await run(templateSaveBody(row, state.draft, state.overview?.revision ?? 0), row, "Correo guardado.", true);
  }

  /**
   * One save at a time. On success the list re-reads the workspace; on failure what the merchant typed
   * stays, and a conflict refreshes the revision underneath the draft, as the Studio's Plantillas did.
   */
  async function run(payload, row, done, clearDraft) {
    if (state.busy) return;
    const mine = generation;
    state = { ...state, busy: true, message: "Guardando…", failed: false };
    render();
    try {
      await deps.api(`${base()}/templates/${encodeURIComponent(row.id)}`, { method: "PUT", body: JSON.stringify(payload) });
    } catch (error) {
      let message = error?.message || "No se pudo completar. Tus datos siguen aquí.";
      if (error?.status === 409) {
        try {
          const overview = normalizeOverview(await deps.api(base()));
          if (mine !== generation) return;
          state = { ...state, overview };
          message += " Se actualizó la versión guardada y conservamos tu borrador. Revisa tus cambios antes de volver a guardar.";
        } catch {
          message += " No se pudo cargar la versión actual. Inténtalo cuando se restablezca la conexión.";
        }
      }
      if (mine !== generation) return;
      state = { ...state, busy: false, message, failed: true };
      render();
      return;
    }
    let overview = state.overview;
    // The save went through; if the list cannot be re-read now, it is on the next visit.
    try { overview = normalizeOverview(await deps.api(base())); } catch { /* keep the last list */ }
    if (mine !== generation) return;
    state = { ...state, overview, busy: false, message: done, failed: false, ...(clearDraft ? { draft: null, dirty: false } : {}) };
    render();
  }

  async function load() {
    const mine = ++generation;
    render();
    let overview, message = "", failed = false;
    try { overview = normalizeOverview(await deps.api(base())); }
    catch (error) { overview = normalizeOverview(null); message = error?.message || "No pudimos cargar tus correos."; failed = true; }
    if (mine !== generation) return;
    state = { ...state, overview, message, failed };
    render();
  }

  return {
    show() {
      const storeId = deps.storeId();
      if (!storeId) return;
      // Re-fetched when the merchant switches store, not on every visit to the tab.
      if (shownFor === storeId && state.overview) return;
      shownFor = storeId;
      state = fresh();
      void load();
    },
    reset() {
      generation += 1;
      shownFor = null;
      designedFor = null;
      state = fresh();
      studio?.reset();
      list = editor = designed = studio = null;
      container.innerHTML = "";
    },
  };
}
