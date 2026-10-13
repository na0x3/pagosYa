import { Store, StoreLocation } from "../api";
import { storeEditorMode } from "../preview-mode";
import { app } from "../ui/app";
import { escapeHtml } from "../ui/html";
import { ICON_MAP_PIN } from "../ui/icons";
import { locationOpeningState, safeStoreMapEmbedUrl } from "./locations";
import type { StoreSiteSectionLookup } from "./store-site-sections";

export function storeLocationHtml(store: Store, locations: StoreLocation[], siteSection: StoreSiteSectionLookup): string {
  const locationCardHtml = (location: StoreLocation, index: number) => {
    const mapUrl = safeStoreMapEmbedUrl(location.mapEmbedUrl);
    const fulfillment = [location.pickupEnabled ? "Retiro" : "", location.deliveryEnabled ? "Entrega" : ""].filter(Boolean).join(" · ");
    const opening = locationOpeningState(location);
    const inlineMapEditor = storeEditorMode ? `<form class="store-location-inline-editor" data-store-location-inline-editor data-location-id="${escapeHtml(location.id)}">
        <label for="store-location-map-${escapeHtml(location.id)}">Insertar mapa aquí</label>
        <textarea id="store-location-map-${escapeHtml(location.id)}" data-store-location-map-input rows="3" spellcheck="false" aria-describedby="store-location-map-help-${escapeHtml(location.id)} store-location-map-status-${escapeHtml(location.id)}" placeholder="Pega el código &lt;iframe&gt; de Google Maps o su URL de inserción">${escapeHtml(mapUrl || "")}</textarea>
        <p id="store-location-map-help-${escapeHtml(location.id)}" class="store-location-inline-help">Google Maps: Compartir → Insertar un mapa → Copiar HTML.</p>
        <div class="store-location-inline-actions">
          <button class="primary" type="submit">${mapUrl ? "Actualizar mapa" : "Insertar mapa"}</button>
          ${mapUrl ? `<button type="button" data-store-location-map-clear>Quitar mapa</button>` : ""}
          <button class="store-location-delete-control" type="button" data-store-location-delete data-location-id="${escapeHtml(location.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>Eliminar ubicación</span></button>
        </div>
        <p id="store-location-map-status-${escapeHtml(location.id)}" class="store-location-inline-status" role="status" aria-live="polite"></p>
      </form>` : "";
    return `<article class="store-location-card${mapUrl ? " has-map" : ""}${storeEditorMode ? " has-editor" : ""}" tabindex="-1">
      <div class="store-location-copy">
        <span class="store-location-number">${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(location.name)}</h3>
        ${location.highlight?.trim() ? `<p class="store-location-highlight"><mark>${escapeHtml(location.highlight.trim())}</mark></p>` : ""}
        ${location.address?.trim() ? `<p class="store-location-address">${ICON_MAP_PIN}<span>${escapeHtml(location.address.trim())}</span></p>` : ""}
        ${location.description?.trim() ? `<p class="store-location-description">${escapeHtml(location.description.trim())}</p>` : ""}
        ${fulfillment ? `<p class="store-location-fulfillment">${escapeHtml(fulfillment)}</p>` : ""}
        <p class="store-location-hours${opening.isOpen ? " is-open" : ""}">${escapeHtml(opening.label)}</p>
        ${mapUrl ? `<a class="store-location-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">${ICON_MAP_PIN}<span>Abrir mapa</span></a>` : ""}
      </div>
      ${mapUrl || storeEditorMode ? `<div class="store-location-map-column">${inlineMapEditor}<div class="store-location-map${mapUrl ? "" : " is-empty"}">${mapUrl ? `<iframe src="${escapeHtml(mapUrl)}" title="${escapeHtml(location.name)} de ${escapeHtml(store.storeName)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allowfullscreen></iframe>` : `<p>El mapa aparecerá aquí.</p>`}</div></div>` : ""}
    </article>`;
  };
  return locations.length
    ? `<section class="store-location-section${locations.length > 1 ? " has-many" : ""}" id="store-location" aria-labelledby="store-location-title">
        <div class="store-location-heading">
          <div><h2 id="store-location-title">${escapeHtml(siteSection("location")?.title || store.locationTitle?.trim() || "Visítanos")}</h2><p>${escapeHtml(siteSection("location")?.body || store.locationSubtitle?.trim() || (locations.length === 1 ? "Encuentra esta tienda y elige cómo recibir tu pedido." : `${locations.length} ubicaciones para retirar o recibir tu pedido.`))}</p></div>
          ${locations.length > 1 ? `<button class="store-locations-toggle" type="button" aria-expanded="false" aria-controls="store-locations-list">Ver ubicaciones <span>${locations.length}</span></button>` : ""}
        </div>
        <div class="store-locations-list${locations.length === 1 ? " is-single" : ""}" id="store-locations-list" ${locations.length > 1 ? "hidden" : ""}>
          ${locations.map(locationCardHtml).join("")}
        </div>
      </section>`
    : "";
}

export function bindStoreLocationsToggle(): void {
  app.querySelector<HTMLButtonElement>(".store-locations-toggle")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const list = app.querySelector<HTMLElement>("#store-locations-list")!;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    button.firstChild!.textContent = expanded ? "Ver ubicaciones " : "Ocultar ubicaciones ";
    list.hidden = expanded;
    if (!expanded) requestAnimationFrame(() => list.querySelector<HTMLElement>(".store-location-card")?.focus?.());
  });
}
