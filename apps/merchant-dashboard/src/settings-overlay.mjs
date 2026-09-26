/** Ajustes sections the Studio renders with its own panels (spec 2026-09-26 templates/settings/MCP, part 2). */
export const SETTINGS_SECTIONS = ["brand", "shipping", "domain"];

/** @param {string} storeId @param {string} section */
export function settingsOverlayUrl(storeId, section) {
  if (!SETTINGS_SECTIONS.includes(section)) throw new Error("Esa sección de Ajustes no existe.");
  return `/studio/?embedded=1&library=settings&section=${section}&store=${encodeURIComponent(storeId)}`;
}

/** Opens the panel over the whole dashboard; the frame goes away when the Studio says the panel closed.
 * @param {string} storeId @param {string} section */
export function openSettingsOverlay(storeId, section) {
  document.querySelector("iframe.settings-overlay")?.remove();
  const frame = document.createElement("iframe");
  frame.className = "settings-overlay";
  frame.title = "Ajustes";
  frame.src = settingsOverlayUrl(storeId, section);
  const onMessage = (/** @type {MessageEvent} */ event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "pagosya:settings-closed") return;
    window.removeEventListener("message", onMessage);
    frame.remove();
  };
  window.addEventListener("message", onMessage);
  document.body.append(frame);
  return frame;
}
