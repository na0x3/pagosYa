import { escapeHtml as esc } from "./html.mjs";

/**
 * Inicio › «Tu tienda esta semana» (spec 2026-11-16, la tienda que vende sola): the change the store is trying, the ones it kept and
 * the ones it undid this week, each kept or tried change with «Deshacer», and the «Mejora automática» switch. `summary` is
 * GET v1/stores/:id/selling.
 */
export function renderSellingCard(summary) {
  if (!summary) return "";
  const on = summary.autoImprove !== false;
  const row = (change, label, tone, undo) => `<li class="selling-row is-${tone}"><span class="selling-tag">${label}</span><span class="selling-text">${esc(change.summary || "")}</span>${undo ? `<button type="button" class="ui-button is-quiet" data-selling-undo="${esc(change.id)}">Deshacer</button>` : ""}</li>`;
  const trying = summary.trying ? row({ ...summary.trying, summary: `${summary.trying.summary}${Number.isFinite(summary.trying.daysLeft) ? ` · quedan hasta ${summary.trying.daysLeft} días` : ""}` }, "Probando", "trying", true) : "";
  const kept = (summary.kept || []).slice(0, 4).map((change) => row(change, "Se quedó", "kept", true)).join("");
  const undone = (summary.undone || []).slice(0, 3).map((change) => row(change, "Deshecho", "undone", false)).join("");
  const rows = trying + kept + undone;
  const empty = on
    ? `<p class="selling-empty">Empezamos pronto: tu tienda probará un cambio pequeño a la vez —el más vendido primero, el orden de las secciones, el botón de compra— y solo se queda con lo que vende más.</p>`
    : `<p class="selling-empty">La mejora automática está apagada. Lo que ya se quedó sigue en tu tienda.</p>`;
  return `<header class="selling-head"><div><h2 id="overviewSellingTitle">Tu tienda esta semana</h2><p class="muted">Cambios pequeños que se quedan solo si venden más.</p></div>`
    + `<button type="button" class="selling-switch" role="switch" aria-checked="${on}" data-selling-auto><span class="selling-switch__track" aria-hidden="true"><span></span></span>Mejora automática</button></header>`
    + (rows ? `<ul class="selling-list">${rows}</ul>${on ? "" : empty}` : empty);
}
