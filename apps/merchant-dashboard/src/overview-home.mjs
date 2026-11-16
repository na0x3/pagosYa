import { escapeHtml as esc } from "./html.mjs";
import { TAREAS } from "./tareas.mjs";

/** Inicio › the current store at a glance (calm dashboard 2026-11-16): its picture, live or draft, «Editar con YAPI», «Ver tienda». */
export function renderStoreCard({ store, state, url } = {}) {
  if (!store) return "";
  const revision = Number(store.sourceProject?.revision || store.publishedSourceRevision || 0);
  const label = { published: "Publicada", draft: "Borrador", archived: "Archivada" }[state] || "Borrador";
  const shot = revision ? `<img class="overview-store-shot" data-thumbnail-store="${esc(store.id)}" data-thumbnail-revision="${revision}" alt="Vista de ${esc(store.name)}">` : "";
  return `<div class="overview-store-media">${shot}</div><div class="overview-store-body"><p class="overview-store-kicker">Tu tienda</p><h2>${esc(store.name)}</h2>`
    + `<p><span class="overview-store-status is-${esc(state || "draft")}">${label}</span></p><div class="overview-store-actions">`
    + `<button type="button" class="ui-button overview-store-primary" data-overview-open="workspace">Editar con YAPI</button>`
    + (state === "published" && url ? `<a class="ui-button is-quiet" href="${esc(url)}" target="_blank" rel="noopener">Ver tienda ↗</a>` : "")
    + `</div></div>`;
}

/** Three of YAPI's jobs as a calm strip; each opens Tienda › Tareas. */
export function renderSuggestions() {
  const picks = ["review", "cutouts", "emails"].map((id) => TAREAS.find((tarea) => tarea.id === id)).filter(Boolean);
  return `<div class="suggest-head"><h2>YAPI puede hacer</h2><button type="button" class="ui-button is-quiet" data-overview-open="tasks">Ver todas las tareas</button></div><ul class="suggest-list">`
    + picks.map((tarea) => `<li class="suggest-card"><button type="button" data-overview-open="tasks"><span class="suggest-art" style="background:${/data-bg="([^"]+)"/.exec(tarea.picture)?.[1] || "#f4f4f5"}">${tarea.picture}</span><span><strong>${esc(tarea.name)}</strong><small>${esc(tarea.minutes)} · ${esc(tarea.credits)}</small></span></button></li>`).join("")
    + `</ul>`;
}
