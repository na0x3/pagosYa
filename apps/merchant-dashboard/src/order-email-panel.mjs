import { escapeHtml as esc } from "./html.mjs";

/**
 * Correo de confirmación: shows the merchant the email their buyer receives after paying,
 * at phone and desktop width, and mails them a copy. Read-only by design — there is no
 * editing UI, because the template is authored with the rest of the store.
 *
 * The render is dropped into a fully sandboxed iframe (no allow-scripts): it is email HTML
 * built from a store's own authored template, and nothing in it needs to run.
 *
 * deps:
 *   api(path, options)  authenticated dashboard API call (throws Error with .message)
 *   storeId()           active store id
 */
const WIDTHS = [
  ["Teléfono", 390],
  ["Escritorio", 640],
];

export function mountOrderEmailPanel(container, deps) {
  if (!container) return { show() {}, reset() {} };

  const fresh = () => ({ loading: false, loaded: false, html: "", repairs: [], message: "", sending: false });
  let state = fresh();
  let generation = 0;
  let shownFor = null;

  const base = () => `/stores/${encodeURIComponent(deps.storeId())}/source-project/order-email`;

  function render() {
    const frames = state.html
      ? `<div class="order-email-frames">${WIDTHS.map(([label, width]) => `
          <figure class="order-email-frame" style="--order-email-width:${width}px">
            <figcaption>${esc(label)} · ${width}px</figcaption>
            <iframe title="Vista previa del correo a ${esc(label)}" width="${width}" height="640" sandbox="" srcdoc="${esc(state.html)}"></iframe>
          </figure>`).join("")}</div>`
      : "";

    const repairs = state.repairs.length
      ? `<details class="order-email-repairs"><summary>Ajustes que hicimos para que el correo llegue bien (${state.repairs.length})</summary><ul>${state.repairs.map(item => `<li>${esc(item)}</li>`).join("")}</ul></details>`
      : "";

    container.innerHTML = `
      <div class="order-email-panel">
        <div class="editor-section-head">
          <h3>Correo de confirmación</h3>
          <p>El correo que recibe tu cliente después de pagar. Los datos son de ejemplo.</p>
        </div>
        ${state.loading ? '<p class="order-email-status" role="status">Preparando la vista previa…</p>' : ""}
        ${frames}
        ${repairs}
        ${state.loaded && !state.loading ? `<div class="order-email-actions">
          <button type="button" class="ghost" data-order-email-reload>Actualizar</button>
          <button type="button" data-order-email-test ${state.sending ? "disabled" : ""}>${state.sending ? "Enviando…" : "Enviar una prueba"}</button>
        </div>` : ""}
        <p class="order-email-status" role="status"${state.message ? "" : " hidden"}>${esc(state.message)}</p>
      </div>`;

    container.querySelector("[data-order-email-reload]")?.addEventListener("click", () => void load());
    container.querySelector("[data-order-email-test]")?.addEventListener("click", () => void testSend());
  }

  async function load() {
    const mine = ++generation;
    state = { ...state, loading: true, message: "" };
    render();
    try {
      const { html, repairs } = await deps.api(`${base()}/preview`);
      if (mine !== generation) return;
      state = { ...state, loading: false, loaded: true, html: typeof html === "string" ? html : "", repairs: Array.isArray(repairs) ? repairs : [] };
    } catch (error) {
      if (mine !== generation) return;
      state = { ...state, loading: false, loaded: true, html: "", repairs: [], message: error?.message || "No pudimos preparar la vista previa del correo." };
    }
    render();
  }

  async function testSend() {
    state = { ...state, sending: true, message: "" };
    render();
    try {
      await deps.api(`${base()}/test-send`, { method: "POST" });
      state = { ...state, sending: false, message: "Te enviamos una prueba a tu correo." };
    } catch (error) {
      state = { ...state, sending: false, message: error?.message || "No pudimos enviar la prueba." };
    }
    render();
  }

  return {
    show() {
      const storeId = deps.storeId();
      if (!storeId) return;
      // Re-fetched when the merchant switches store, not on every visit to the page.
      if (shownFor === storeId && state.loaded) return;
      shownFor = storeId;
      state = fresh();
      void load();
    },
    reset() {
      generation += 1;
      shownFor = null;
      state = fresh();
      container.innerHTML = "";
    },
  };
}
