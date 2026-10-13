import { escapeHtml as esc } from "./html.mjs";
import { mountEmailContent } from "./email-content-panel.mjs";

/**
 * Correos y marketing › Correos: the store's one email look, for the two designed confirmations. The
 * merchant designs it (or asks for a bolder version), previews each email at phone and desktop width,
 * edits its wording, undoes a redesign and mails themselves a copy. Previews run in fully closed
 * sandboxes: email HTML never needs to run anything. Below it, the content of the emails
 * (email-content-panel.mjs) lives in its own element, so redrawing the studio never wipes what the
 * merchant is typing there. Opened from the Correos list (email-list-panel.mjs) with `types: false`,
 * it shows the email picked there and draws no switcher of its own, so no email is listed twice.
 */
const WIDTHS = [["Teléfono", 390], ["Escritorio", 640]];
// The announcement, story and note are edited under "Contenido de tus correos", once for every email.
const FIELD_LABELS = { subject: "Asunto", preheader: "Vista previa", headline: "Título", intro: "Introducción", cta: "Botón", signoff: "Despedida",
  recommendTitle: "Título de recomendaciones", helpTitle: "Título de ayuda" };

export function mountEmailStudio(container, deps) {
  if (!container) return { show() {}, reset() {} };
  const fresh = () => ({ status: null, type: "order_confirmation", preview: null, previewFailed: false, fields: [], edits: {}, busy: false, message: "", formMessage: "" });
  let state = fresh();
  let generation = 0;
  let shownFor = null;
  let view = null;
  let content = null;
  const base = () => `/stores/${encodeURIComponent(deps.storeId())}/source-project/emails`;

  function ensureDom() {
    if (view && container.contains(view)) return;
    view = document.createElement("div");
    const contentRoot = document.createElement("div");
    contentRoot.setAttribute("data-email-content-root", "");
    container.replaceChildren(view, contentRoot);
    content = mountEmailContent(contentRoot, { api: deps.api, base, type: () => state.type, assetUrl: deps.assetUrl ?? (path => path), onChange: () => void loadEmail() });
  }

  function statusLine(s) {
    if (s.available === false) return "Tus correos usan el diseño estándar. El diseño propio de tu tienda todavía no está disponible.";
    if (state.busy === "design") return "Diseñando tus correos… puede tardar un par de minutos.";
    if (s.candidate) return "Nuevo diseño listo.";
    if (s.kit === "none") return "Tus correos usan el diseño estándar.";
    if (s.siteChanged) return "Tu sitio cambió.";
    return "Tus correos usan el diseño de tu tienda.";
  }

  function actions(s) {
    if (s.available === false) return "";
    const off = state.busy ? "disabled" : "";
    if (s.candidate) return `<button type="button" class="primary" data-email-accept ${off}>Usar este diseño</button><button type="button" class="ghost" data-email-discard ${off}>Volver al anterior</button>`;
    // Every run states its ceiling before it starts.
    const cost = ` · hasta ${s.maxCredits} créditos`;
    const main = s.kit === "none" ? `Diseñar mis correos${cost}` : s.siteChanged ? `Actualizar correos${cost}` : null;
    return [
      main ? `<button type="button" class="primary" data-email-design ${off}>${esc(main)}</button>` : "",
      s.kit !== "none" ? `<button type="button" class="ghost" data-email-bold ${off}>${esc(`Más llamativo${cost}`)}</button>` : "",
      s.previous ? `<button type="button" class="ghost" data-email-revert ${off}>Volver al anterior</button>` : "",
    ].join("");
  }

  function typeList(s) {
    const types = Array.isArray(s.types) ? s.types : [];
    const groups = [...new Set(types.map(t => t.group))];
    return groups.map(group => `<div class="email-studio-group"><span>${esc(group)}</span>${types.filter(t => t.group === group).map(t =>
      `<button type="button" data-email-type="${esc(t.type)}" aria-pressed="${t.type === state.type}">${esc(t.label)}</button>`).join("")}</div>`).join("");
  }

  /** Without its own switcher the panel is titled with the email it shows. */
  function title(s) {
    if (deps.types !== false) return "Correos";
    return (Array.isArray(s.types) ? s.types : []).find(t => t.type === state.type)?.label ?? "Correos";
  }

  /** Switches the email shown; its preview, wording and the content's per-email switches follow. */
  function select(type) {
    state = { ...state, type, edits: {} };
    content?.render();
    void loadEmail();
  }

  function frames() {
    // A failed preview is reported in the status line below; empty frames would read as a blank email.
    if (state.previewFailed) return "";
    if (!state.preview) return '<p class="email-studio-status" role="status">Preparando la vista previa…</p>';
    return `<div class="email-studio-frames">${WIDTHS.map(([label, width]) => `
      <figure class="email-studio-frame" style="--email-width:${width}px"><figcaption>${esc(label)} · ${width}px</figcaption>
        <iframe title="Vista previa del correo a ${esc(label)}" width="${width}" height="640" sandbox="" srcdoc="${esc(state.preview.html)}"></iframe></figure>`).join("")}</div>`;
  }

  function form() {
    const fields = state.fields.filter(f => Object.hasOwn(FIELD_LABELS, f.field));
    if (!fields.length || state.status?.available === false) return "";
    return `<form class="email-studio-copy" data-copy-form novalidate><h4>Texto de este correo</h4>${fields.map(f => {
      const value = state.edits[f.field] ?? f.value;
      const input = f.field === "intro"
        ? `<textarea data-copy-field="${f.field}" maxlength="${f.max}" rows="3">${esc(value)}</textarea>`
        : `<input data-copy-field="${f.field}" maxlength="${f.max}" value="${esc(value)}">`;
      return `<label data-copy-row="${f.field}"><span>${esc(FIELD_LABELS[f.field])}</span>${input}
        <small><span data-copy-count="${f.field}">${value.length}</span>/${f.max}${f.edited ? ` · Editado por ti · <button type="button" class="link" data-copy-restore="${f.field}">restaurar</button>` : ""}</small></label>`;
    }).join("")}
      <p class="faint">Puedes usar {cliente} y {tienda}. Los montos, fechas y números de orden los pone la plataforma.</p>
      <p class="email-studio-status" role="status"${state.formMessage ? "" : " hidden"}>${esc(state.formMessage)}</p>
      <button type="button" data-copy-save ${state.busy ? "disabled" : ""}>Guardar texto</button></form>`;
  }

  function render() {
    ensureDom();
    const s = state.status;
    if (!s) { view.innerHTML = '<div class="email-studio"><p class="email-studio-status" role="status">Cargando…</p></div>'; return; }
    view.innerHTML = `<div class="email-studio">
      <div class="email-studio-head"><div><h3>${esc(title(s))}</h3><p>${esc(statusLine(s))}</p></div><div class="email-studio-actions">${actions(s)}</div></div>
      ${deps.types === false ? "" : `<div class="email-studio-types">${typeList(s)}</div>`}
      ${frames()}
      ${form()}
      <div class="email-studio-actions"><button type="button" class="ghost" data-email-test ${state.busy ? "disabled" : ""}>Enviar una prueba</button></div>
      <p class="email-studio-status" role="status"${state.message ? "" : " hidden"}>${esc(state.message)}</p>
    </div>`;
    const on = (selector, handler) => view.querySelector(selector)?.addEventListener("click", handler);
    on("[data-email-design]", () => void design("twin"));
    on("[data-email-bold]", () => void design("bold"));
    on("[data-email-accept]", () => void step("candidate/accept", "Usamos el nuevo diseño."));
    on("[data-email-discard]", () => void step("candidate/discard", "Mantuvimos tu diseño anterior."));
    on("[data-email-revert]", () => void step("revert", "Volvimos al diseño anterior."));
    on("[data-email-test]", () => void testSend());
    on("[data-copy-save]", () => void saveCopy());
    // The content's per-email switches follow the selected email.
    view.querySelectorAll("[data-email-type]").forEach(button => button.addEventListener("click", () => select(button.dataset.emailType)));
    view.querySelectorAll("[data-copy-restore]").forEach(button => button.addEventListener("click", () => void restore(button.dataset.copyRestore)));
    view.querySelectorAll("[data-copy-field]").forEach(input => input.addEventListener("input", () => {
      state.edits[input.dataset.copyField] = input.value;
      const count = view.querySelector(`[data-copy-count="${input.dataset.copyField}"]`);
      if (count) count.textContent = String(input.value.length);
    }));
  }

  async function load() {
    const mine = ++generation;
    render();
    try {
      const s = await deps.api(base());
      if (mine !== generation) return;
      state = { ...state, status: s };
      // Without the custom look the content tables are not there either: the panel stays hidden.
      if (s?.available === false) content?.reset(); else void content?.load();
      await loadEmail(mine);
    } catch (error) {
      if (mine !== generation) return;
      state = { ...state, status: { kit: "none", candidate: false, previous: false, siteChanged: false, maxCredits: 0, types: [] }, message: error?.message || "No pudimos cargar tus correos." };
      render();
    }
  }

  async function loadEmail(mine = ++generation) {
    state = { ...state, preview: null, previewFailed: false };
    render();
    const which = state.status?.candidate ? "candidate" : "active";
    try {
      const [preview, copy] = await Promise.all([
        deps.api(`${base()}/preview?type=${encodeURIComponent(state.type)}&which=${which}`),
        deps.api(`${base()}/copy/${encodeURIComponent(state.type)}`),
      ]);
      if (mine !== generation) return;
      state = { ...state, preview, fields: Array.isArray(copy?.fields) ? copy.fields : [], edits: {} };
    } catch (error) {
      if (mine !== generation) return;
      state = { ...state, preview: null, previewFailed: true, message: error?.message || "No pudimos preparar la vista previa." };
    }
    render();
  }

  async function design(mode) {
    state = { ...state, busy: "design", message: "" };
    render();
    try {
      const result = await deps.api(`${base()}/design`, { method: "POST", body: JSON.stringify({ mode }) });
      state = { ...state, busy: false, message: result?.status === "unusable"
        ? "No logramos un diseño que funcione en todos los correos. No se guardó nada; intenta de nuevo."
        : "Listo. Revisa el nuevo diseño." };
    } catch (error) {
      state = { ...state, busy: false, message: error?.message || "No pudimos diseñar tus correos." };
    }
    await load();
  }

  async function step(path, done) {
    state = { ...state, busy: true, message: "" };
    render();
    try { await deps.api(`${base()}/${path}`, { method: "POST" }); state = { ...state, busy: false, message: done }; }
    catch (error) { state = { ...state, busy: false, message: error?.message || "No se pudo completar." }; }
    await load();
  }

  async function saveCopy() {
    const changed = state.fields.filter(f => state.edits[f.field] !== undefined && state.edits[f.field] !== f.value);
    if (!changed.length) { state = { ...state, formMessage: "No hay cambios para guardar." }; render(); return; }
    state = { ...state, busy: true, formMessage: "" };
    render();
    try {
      for (const f of changed) await deps.api(`${base()}/copy/${encodeURIComponent(state.type)}/${f.field}`, { method: "PUT", body: JSON.stringify({ value: state.edits[f.field] }) });
      state = { ...state, busy: false, formMessage: "Texto guardado." };
    } catch (error) {
      state = { ...state, busy: false, formMessage: error?.message || "No pudimos guardar el texto." };
    }
    await loadEmail();
  }

  async function restore(field) {
    try { await deps.api(`${base()}/copy/${encodeURIComponent(state.type)}/${field}`, { method: "DELETE" }); }
    catch (error) { state = { ...state, formMessage: error?.message || "No pudimos restaurar el texto." }; }
    await loadEmail();
  }

  async function testSend() {
    state = { ...state, busy: true, message: "" };
    render();
    try {
      await deps.api(`${base()}/test-send`, { method: "POST", body: JSON.stringify({ type: state.type }) });
      state = { ...state, busy: false, message: "Te enviamos una prueba a tu correo." };
    } catch (error) {
      state = { ...state, busy: false, message: error?.message || "No pudimos enviar la prueba." };
    }
    render();
  }

  return {
    show(type) {
      const storeId = deps.storeId();
      if (!storeId) return;
      // Re-fetched when the merchant switches store, not on every visit to the tab.
      if (shownFor === storeId && state.status) { if (type && type !== state.type) select(type); return; }
      shownFor = storeId;
      state = { ...fresh(), ...(type ? { type } : {}) };
      void load();
    },
    reset() {
      generation += 1;
      shownFor = null;
      state = fresh();
      content?.reset();
      view = null;
      content = null;
      container.innerHTML = "";
    },
  };
}
