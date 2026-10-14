import { icon } from "./icons.mjs";

/** Ajustes is one page with tabs. General is the dashboard's own; Marca, Envíos y retiro and Dominio web are
 * the Studio's panels, drawn inline in a same-origin frame that grows with its content. The store's emails
 * moved to Correos y marketing › Correos on 2026-10-13. */
export const SETTINGS_TABS = ["general", "brand", "shipping", "domain"];
const STUDIO_SECTIONS = ["brand", "shipping", "domain"];
/** @type {Record<string, string>} */
const TAB_ICONS = { general: "settings", brand: "palette", shipping: "truck", domain: "globe" };

/** @param {string} storeId @param {string} section */
export function settingsEmbedUrl(storeId, section) {
  if (!STUDIO_SECTIONS.includes(section)) throw new Error("Esa sección de Ajustes no existe.");
  return `/studio/?embedded=1&library=settings&inline=1&section=${section}&store=${encodeURIComponent(storeId)}`;
}

/**
 * @param {HTMLElement} root holds the [data-settings-tab] buttons and the [data-settings-panel] panels
 * @param {{ storeId: () => string | null, beforeLoad?: () => void, onShow?: (tab: string) => void }} deps
 */
export function mountSettingsTabs(root, deps) {
  const tabs = /** @type {HTMLElement[]} */ ([...root.querySelectorAll("[data-settings-tab]")]);
  for (const button of tabs) {
    const name = TAB_ICONS[button.dataset.settingsTab || ""];
    if (name && !button.querySelector("svg")) button.insertAdjacentHTML("afterbegin", icon(name, { size: 16 }));
  }
  const frame = /** @type {HTMLIFrameElement | null} */ (root.querySelector("iframe.settings-embed"));
  let current = "general";

  const panelOf = (/** @type {string} */ tab) => STUDIO_SECTIONS.includes(tab) ? "studio" : tab;

  function loadFrame() {
    if (!frame) return;
    const storeId = deps.storeId();
    if (!STUDIO_SECTIONS.includes(current) || !storeId) { frame.removeAttribute("src"); return; }
    const src = settingsEmbedUrl(storeId, current);
    if (frame.getAttribute("src") === src) return;
    deps.beforeLoad?.();
    frame.setAttribute("src", src);
  }

  /** @param {string} tab @param {{ focus?: boolean, notify?: boolean }} [options] */
  function select(tab, { focus = false, notify = true } = {}) {
    if (!SETTINGS_TABS.includes(tab)) return;
    current = tab;
    for (const button of tabs) {
      const active = button.dataset.settingsTab === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    }
    root.querySelectorAll("[data-settings-panel]").forEach(panel => {
      /** @type {HTMLElement} */ (panel).hidden = /** @type {HTMLElement} */ (panel).dataset.settingsPanel !== panelOf(tab);
    });
    loadFrame();
    if (notify) deps.onShow?.(tab);
  }

  for (const button of tabs) {
    button.addEventListener("click", () => select(button.dataset.settingsTab || ""));
    button.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const index = SETTINGS_TABS.indexOf(current);
      select(SETTINGS_TABS[(index + step + SETTINGS_TABS.length) % SETTINGS_TABS.length], { focus: true });
    });
  }

  // Same origin, so the frame's height can follow its document instead of scrolling inside the page.
  frame?.addEventListener("load", () => {
    const doc = frame.contentDocument;
    const Observer = doc?.defaultView?.ResizeObserver;
    if (!doc?.body || typeof Observer !== "function") return;
    // The body, not the document: the document is never shorter than the frame, so a shorter panel could not
    // shrink it. The observer comes from the frame's own window, which reliably reports its own elements.
    const fit = () => { frame.style.height = `${Math.ceil(doc.body.getBoundingClientRect().height)}px`; };
    new Observer(fit).observe(doc.body);
    fit();
  });

  // Drawn on mount, before the page is on screen: nothing is "shown" yet.
  select("general", { notify: false });
  return { select, refresh: loadFrame, current: () => current };
}
