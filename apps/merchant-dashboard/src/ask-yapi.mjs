import { escapeHtml as esc } from "./html.mjs";

/** Where a hidden form used to be (spec 2026-10-21 A3): one line that opens YAPI with the request written, never sent. */
export const BRAND_REQUEST = "Quiero ajustar los colores y la tipografía de mi tienda: ";

export function askYapiLine({ text, request }) {
  return `<p class="ask-yapi">${esc(text)} <button type="button" class="ask-yapi-link" data-ask-yapi="${esc(request)}">Pídele a YAPI →</button></p>`;
}
