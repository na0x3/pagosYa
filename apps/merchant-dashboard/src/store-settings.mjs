// Store settings the live checkout reads: identity, how an order ends, support
// contact, pickup/delivery locations with their stock, and link buttons.
// Everything saves straight to the store (PATCH /stores/:id, PUT /links).

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MAX_LOGO_BYTES = 8_000_000;
const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

/** Shopper policies the storefront shows beside purchasing; plain text, written by the merchant. */
const POLICY_FIELDS = /** @type {const} */ ([
  ["returns", "Cambios y devoluciones", "Ej.: Aceptamos cambios dentro de 7 días con la etiqueta puesta…"],
  ["delivery", "Envíos y entregas", "Ej.: Entregamos en La Paz y El Alto en 24 a 48 horas…"],
  ["privacy", "Privacidad", "Qué datos pides al cliente y para qué los usas"],
  ["terms", "Términos y condiciones", "Condiciones de venta de tu negocio"],
]);

/** @typedef {{ day: number, open: string, close: string, closed: boolean }} OpeningHours */
/** @typedef {{ id: string, name: string, address: string, mapEmbedUrl: string, highlight: string, description: string, pickupEnabled: boolean, deliveryEnabled: boolean, openingHours: OpeningHours[], inventory: Record<string, number | null | undefined> }} EditableLocation */
/** @typedef {{ label: string, url: string }} StoreLink */
/** @typedef {{ id: string, name: string, status?: string, stock?: number | null, locationStocks?: Record<string, number | null> }} Product */
/** @typedef {{ id: string, name?: string, tagline?: string | null, logoUrl?: string | null, checkoutMode?: string, contactPhone?: string | null, contactEmail?: string | null, showLowStockToCustomers?: boolean, publicVisibility?: boolean, policies?: Record<string, string>, links?: StoreLink[], locations?: any[], locationMapUrl?: string | null, locationHighlight?: string | null, locationDescription?: string | null }} Store */

/** @type {Record<string, string>} */
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** @param {unknown} value */
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
/** @param {unknown} error */
const messageOf = (error) => error instanceof Error ? error.message : String(error);

/** @param {unknown} value */
export function hasUsableWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

/**
 * Accepts a pasted <iframe> or its src; returns the embed URL or null.
 * @param {unknown} value
 */
export function normalizedMapUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iframeSource = raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  return String(iframeSource || raw).replace(/&amp;/gi, "&").trim();
}

/** @param {string | null} value */
export function isSupportedMapUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    const google = /^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/.test(host) && url.pathname.startsWith("/maps/embed");
    const openStreetMap = (host === "openstreetmap.org" || host === "www.openstreetmap.org") && url.pathname === "/export/embed.html";
    return google || openStreetMap;
  } catch {
    return false;
  }
}

/** @returns {OpeningHours[]} */
const defaultHours = () => DAYS.map((_, day) => ({ day, open: "09:00", close: "18:00", closed: day === 0 }));

/**
 * @param {Store} store
 * @returns {EditableLocation[]}
 */
function locationsFromStore(store) {
  if (Array.isArray(store.locations) && store.locations.length) {
    return store.locations.map((location) => ({
      id: location.id,
      name: location.name || "Ubicación",
      address: location.address || "",
      mapEmbedUrl: location.mapEmbedUrl || "",
      highlight: location.highlight || "",
      description: location.description || "",
      pickupEnabled: location.pickupEnabled === true,
      deliveryEnabled: location.deliveryEnabled === true,
      openingHours: Array.isArray(location.openingHours) && location.openingHours.length ? location.openingHours.map((/** @type {OpeningHours} */ hours) => ({ ...hours })) : defaultHours(),
      inventory: Object.fromEntries((location.inventory || []).map((/** @type {{ paymentLinkId: string, stock: number | null }} */ entry) => [entry.paymentLinkId, entry.stock])),
    }));
  }
  // Stores from before multi-location kept a single map on the store itself.
  if (store.locationMapUrl || store.locationHighlight || store.locationDescription) {
    return [{
      id: "location-principal", name: "Ubicación principal", address: "",
      mapEmbedUrl: store.locationMapUrl || "", highlight: store.locationHighlight || "", description: store.locationDescription || "",
      pickupEnabled: true, deliveryEnabled: false, openingHours: defaultHours(), inventory: {},
    }];
  }
  return [];
}

const TEMPLATE = `<form class="store-settings-form" novalidate>
  <p class="muted store-settings-intro">Datos que usan el cobro, los pedidos y el seguimiento. Los cambios se aplican al guardar.</p>
  <section class="store-editor-section" aria-labelledby="storeSettingsIdentityTitle">
    <div class="editor-section-head"><h3 id="storeSettingsIdentityTitle">Identidad</h3><p>Aparece en el cobro, los comprobantes y el seguimiento del pedido.</p></div>
    <div><label for="storeNameInput">Nombre</label><input id="storeNameInput" name="name" maxlength="80" required></div>
    <div><label for="storeTaglineInput">Descripción corta (opcional)</label><input id="storeTaglineInput" name="tagline" maxlength="160" placeholder="Ropa urbana hecha en Bolivia"></div>
    <div class="store-settings-logo">
      <div><label for="storeLogoInput">Logo (opcional)</label><input id="storeLogoInput" type="file" accept="image/png,image/jpeg,image/webp"></div>
      <img class="image-preview" data-logo-preview src="${EMPTY_IMAGE}" alt="Vista previa del logo" hidden>
      <button type="button" class="ghost" data-logo-remove hidden>Quitar logo</button>
    </div>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsCheckoutTitle">
    <div class="editor-section-head"><h3 id="storeSettingsCheckoutTitle">Cómo termina el pedido</h3><p>Elige si cobras aquí o si solo conectas al cliente con tu canal comercial.</p></div>
    <fieldset class="visual-conversion store-conversion-settings">
      <legend>Modo de conversión</legend>
      <div class="visual-conversion-options">
        <label class="visual-conversion-option"><input type="radio" name="storeCheckoutMode" value="payment" checked><span><strong>Cobrar con pagosYa</strong><small>Carrito, checkout y comprobante. Al activarlo pediremos KYC y NIT.</small></span></label>
        <div class="visual-conversion-choice">
          <label class="visual-conversion-option"><input type="radio" name="storeCheckoutMode" value="whatsapp"><span><strong>Recibir por WhatsApp</strong><small>El cliente revisa el carrito y te envía el detalle como mensaje.</small></span></label>
          <div class="visual-whatsapp-phone" data-whatsapp hidden>
            <label for="storeContactPhoneInput">Número que recibirá los pedidos</label>
            <input id="storeContactPhoneInput" name="contactPhone" type="tel" maxlength="40" placeholder="+591 71234567" aria-describedby="storeWhatsappPhoneHelp">
            <span class="faint" id="storeWhatsappPhoneHelp">Incluye el código de país.</span>
          </div>
        </div>
        <label class="visual-conversion-option"><input type="radio" name="storeCheckoutMode" value="external"><span><strong>Captar interesados</strong><small>El cliente elige productos y deja únicamente su Gmail o correo al finalizar.</small></span></label>
      </div>
      <p class="store-conversion-note" data-payment-requirement></p>
      <p class="faint" data-lead-help hidden>El correo se enviará a tu correo de soporte; si no configuraste uno, usaremos el correo de tu cuenta pagosYa.</p>
      <label class="checkbox-row store-cart-recommendations" for="storePublicVisibility">
        <input type="checkbox" id="storePublicVisibility">
        <span><strong>Tienda visible al público</strong><small>Cuando está apagado, tu tienda no aparece en buscadores ni en el directorio y su enlace muestra que no está disponible. Publicar un diseño desde YAPI también la hace visible.</small></span>
      </label>
      <label class="checkbox-row store-cart-recommendations" for="storeShowLowStock">
        <input type="checkbox" id="storeShowLowStock">
        <span><strong>Mostrar avisos de pocas unidades</strong><small>Permite que el cliente vea mensajes como “Solo quedan 3”. Si está apagado, el inventario permanece privado y solo se muestra “Agotado”.</small></span>
      </label>
    </fieldset>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsContactTitle">
    <div class="editor-section-head"><h3 id="storeSettingsContactTitle">Contacto</h3><p>Se muestra al cliente en el comprobante y el seguimiento.</p></div>
    <div><label for="storeContactEmailInput">Correo de soporte (opcional)</label><input id="storeContactEmailInput" name="contactEmail" type="email" placeholder="soporte@mitienda.bo"></div>
    <div class="full">
      <label>Enlaces de la tienda (opcional)</label>
      <p class="faint" style="margin:0 0 8px">Agrega Instagram, TikTok, WhatsApp, un catálogo u otro destino útil.</p>
      <div data-links></div>
      <button type="button" class="ghost" data-link-add>+ Agregar enlace</button>
    </div>
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsPoliciesTitle">
    <div class="editor-section-head"><h3 id="storeSettingsPoliciesTitle">Políticas para tus clientes</h3><p>Aparecen junto al botón de compra, en el carrito y al pie de tu tienda. Escríbelas con tus condiciones reales; YAPI no las inventa.</p></div>
    ${POLICY_FIELDS.map(([key, label, hint]) => `<div class="full"><label for="storePolicy-${key}">${label} (opcional)</label><textarea id="storePolicy-${key}" data-policy="${key}" rows="4" maxlength="6000" placeholder="${hint}"></textarea></div>`).join("")}
  </section>
  <section class="store-editor-section" aria-labelledby="storeSettingsLocationsTitle">
    <div class="editor-section-head"><h3 id="storeSettingsLocationsTitle">Ubicaciones e inventario</h3><p>Agrega sucursales, define si permiten retiro o entrega y reparte el stock real de cada producto.</p></div>
    <div class="full store-locations-editor">
      <div id="storeLocationsList"></div>
      <button class="ghost" id="storeLocationAdd" type="button">Agregar ubicación</button>
      <p class="faint" style="margin:9px 0 0">El stock de todas las ubicaciones se convierte en el stock total del producto. “Sin límite” mantiene inventario ilimitado en esa sucursal.</p>
    </div>
  </section>
  <p class="store-settings-error" role="alert" data-error hidden></p>
  <div class="store-settings-actions"><button class="primary" type="submit" id="storeSettingsSave">Guardar cambios</button><span class="faint" role="status" data-status></span></div>
</form>`;

/**
 * @param {HTMLElement} root
 * @param {{ api: (path: string, init?: RequestInit) => Promise<any>, uploadFile: (file: File) => Promise<string>,
 *   assetUrl: (url: string) => string, hasInvoicing: () => boolean,
 *   onSaved: (store: any, change: { enabledPayments: boolean }) => void }} deps
 */
export function mountStoreSettings(root, deps) {
  root.innerHTML = TEMPLATE;
  const form = /** @type {HTMLFormElement} */ (root.querySelector("form"));
  /** @param {string} selector @returns {any} */
  const $ = (selector) => root.querySelector(selector);
  const nameInput = $("#storeNameInput"), taglineInput = $("#storeTaglineInput"), phoneInput = $("#storeContactPhoneInput");
  const emailInput = $("#storeContactEmailInput"), lowStockInput = $("#storeShowLowStock"), logoInput = $("#storeLogoInput");
  const visibilityInput = /** @type {HTMLInputElement} */ ($("#storePublicVisibility"));
  const policyInput = (/** @type {string} */ key) => /** @type {HTMLTextAreaElement} */ ($(`#storePolicy-${key}`));
  const logoPreview = $("[data-logo-preview]"), logoRemove = $("[data-logo-remove]");
  const locationsList = $("#storeLocationsList"), linksHost = $("[data-links]");
  const errorEl = $("[data-error]"), statusEl = $("[data-status]"), saveButton = $("#storeSettingsSave");
  /** @type {Store | null} */
  let store = null;
  /** @type {Product[]} */
  let products = [];
  /** @type {EditableLocation[]} */
  let locations = [];
  /** @type {StoreLink[]} */
  let links = [];
  /** @type {string | null} */
  let logoUrl = null;
  let locationsEdited = false, busy = false, dirty = false;

  const mode = () => /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="storeCheckoutMode"]:checked'))?.value || "payment";
  const activeProducts = () => products.filter((product) => product.status !== "ARCHIVED");
  /** @param {string} message */
  const showError = (message) => { errorEl.textContent = message; errorEl.hidden = !message; };

  function syncMode() {
    const current = mode();
    $("[data-whatsapp]").hidden = current !== "whatsapp";
    phoneInput.required = current === "whatsapp";
    $("[data-lead-help]").hidden = current !== "external";
    $("[data-payment-requirement]").textContent = current === "payment"
      ? deps.hasInvoicing() ? "Pagos integrados activos. Tu NIT y CUIS ya están configurados." : "Al guardar, abriremos Facturación para pedir KYC y NIT antes de aceptar pagos."
      : current === "whatsapp"
        ? "No se crea un cobro ni se solicita NIT. El pedido llegará al número indicado justo arriba."
        : "No se crea un cobro ni se solicita NIT. pagosYa enviará por correo los datos y el carrito del interesado.";
  }

  function renderLogo() {
    logoPreview.hidden = !logoUrl;
    logoPreview.src = logoUrl ? deps.assetUrl(logoUrl) : EMPTY_IMAGE;
    logoRemove.hidden = !logoUrl;
  }

  function renderLinks() {
    linksHost.innerHTML = links.map((link, i) => `<div class="store-link-editor-row" data-index="${i}">
      <input class="link-label" aria-label="Texto del enlace ${i + 1}" placeholder="Texto (ej. Instagram)" maxlength="40" value="${escapeHtml(link.label)}">
      <input class="link-url" type="url" aria-label="URL del enlace ${i + 1}" placeholder="https://instagram.com/mitienda" maxlength="500" value="${escapeHtml(link.url)}">
      <button type="button" class="ghost link-remove" aria-label="Quitar enlace ${i + 1}">×</button></div>`).join("");
  }

  function renderLocations() {
    if (!locations.length) {
      locationsList.innerHTML = '<p class="faint" style="margin:0">Todavía no agregaste ubicaciones. La tienda seguirá usando su inventario general.</p>';
      return;
    }
    const items = activeProducts();
    locationsList.innerHTML = locations.map((location, index) => {
      const id = escapeHtml(location.id);
      const hours = (location.openingHours || defaultHours()).map((entry) => `<div class="store-location-hours-row"><span>${DAYS[entry.day]}</span><input type="time" data-location-hours-day="${entry.day}" data-location-hours-field="open" value="${escapeHtml(entry.open)}" ${entry.closed ? "disabled" : ""} aria-label="Apertura ${DAYS[entry.day]}"><input type="time" data-location-hours-day="${entry.day}" data-location-hours-field="close" value="${escapeHtml(entry.close)}" ${entry.closed ? "disabled" : ""} aria-label="Cierre ${DAYS[entry.day]}"><label><input type="checkbox" data-location-hours-day="${entry.day}" data-location-hours-field="closed" ${entry.closed ? "checked" : ""}> Cerrado</label></div>`).join("");
      const stock = items.length ? items.map((product) => {
        const value = location.inventory?.[product.id];
        const unlimited = value === null;
        return `<div class="store-location-stock-row"><strong>${escapeHtml(product.name)}</strong><input type="number" min="0" max="999999" step="1" data-location-stock="${escapeHtml(product.id)}" value="${unlimited ? "" : Number(value) || 0}" ${unlimited ? "disabled" : ""} aria-label="Stock de ${escapeHtml(product.name)} en ${escapeHtml(location.name || `ubicación ${index + 1}`)}"><label><input type="checkbox" data-location-unlimited="${escapeHtml(product.id)}" ${unlimited ? "checked" : ""}> Sin límite</label></div>`;
      }).join("") : '<p class="faint" style="margin:0">Agrega productos para repartir su stock.</p>';
      return `<article class="store-location-editor-card" data-location-id="${id}">
      <div class="store-location-editor-head"><strong>Ubicación ${index + 1}</strong><button class="ghost store-location-remove" type="button">Quitar</button></div>
      <div class="store-location-editor-grid">
        <div><label for="store-location-${id}-name">Nombre</label><input id="store-location-${id}-name" data-location-field="name" maxlength="80" value="${escapeHtml(location.name)}" placeholder="Sucursal Centro"></div>
        <div><label for="store-location-${id}-address">Dirección o referencia</label><input id="store-location-${id}-address" data-location-field="address" maxlength="240" value="${escapeHtml(location.address)}" placeholder="Av. Arce 1234, Sopocachi"></div>
        <div class="full"><label for="store-location-${id}-map">Mapa para insertar (opcional)</label><textarea id="store-location-${id}-map" data-location-field="mapEmbedUrl" rows="3" maxlength="2400" spellcheck="false" aria-describedby="locationMapHelp-${id} locationMapError-${id}" aria-errormessage="locationMapError-${id}" placeholder="Pega el código &lt;iframe&gt; de Google Maps o su URL de inserción">${escapeHtml(location.mapEmbedUrl)}</textarea><p class="faint" id="locationMapHelp-${id}" style="margin:7px 0 0">Google Maps: Compartir → Insertar un mapa → Copiar HTML. También aceptamos OpenStreetMap.</p><p class="field-validation-error" id="locationMapError-${id}" role="alert" hidden></p></div>
        <div class="full"><label for="store-location-${id}-highlight">Texto destacado (opcional)</label><input id="store-location-${id}-highlight" data-location-field="highlight" maxlength="140" value="${escapeHtml(location.highlight)}" placeholder="A media cuadra de la plaza principal"></div>
        <div class="full"><label for="store-location-${id}-description">Descripción (opcional)</label><textarea id="store-location-${id}-description" data-location-field="description" rows="3" maxlength="600" placeholder="Horarios, estacionamiento y acceso.">${escapeHtml(location.description)}</textarea></div>
        <div class="full store-location-capabilities">
          <span class="checkbox-row"><input id="store-location-${id}-pickup" type="checkbox" data-location-field="pickupEnabled" ${location.pickupEnabled ? "checked" : ""}><label for="store-location-${id}-pickup" style="margin:0">Permite retiro</label></span>
          <span class="checkbox-row"><input id="store-location-${id}-delivery" type="checkbox" data-location-field="deliveryEnabled" ${location.deliveryEnabled ? "checked" : ""}><label for="store-location-${id}-delivery" style="margin:0">Permite entrega desde aquí</label></span>
        </div>
        <div class="store-location-hours-editor"><h5>Horario de atención</h5>${hours}</div>
        <div class="store-location-inventory"><h5>Stock en esta ubicación</h5><p class="faint">El cliente solo podrá elegirla si alcanza para todo su carrito.</p><div class="store-location-stock-list">${stock}</div></div>
      </div>
    </article>`;
    }).join("");
  }

  /** Products added after a location existed have no row yet: use their saved per-location stock. */
  function seedInventory() {
    locations.forEach((location) => {
      location.inventory ||= {};
      activeProducts().forEach((product) => {
        if (Object.prototype.hasOwnProperty.call(location.inventory, product.id)) return;
        location.inventory[product.id] = product.locationStocks && Object.prototype.hasOwnProperty.call(product.locationStocks, location.id)
          ? product.locationStocks[location.id]
          : locations.length === 1 ? product.stock : 0;
      });
    });
  }

  /** The API rebuilds every product's stock from these rows, so every active product is listed. */
  function serializedLocations() {
    return locations.map((location) => ({
      id: location.id,
      name: String(location.name || "").trim(),
      address: String(location.address || "").trim() || null,
      mapEmbedUrl: normalizedMapUrl(location.mapEmbedUrl),
      highlight: String(location.highlight || "").trim() || null,
      description: String(location.description || "").trim() || null,
      pickupEnabled: location.pickupEnabled === true,
      deliveryEnabled: location.deliveryEnabled === true,
      openingHours: (location.openingHours || defaultHours()).map((hours) => ({ day: hours.day, open: hours.open, close: hours.close, closed: hours.closed === true })),
      inventory: activeProducts().map((product) => ({
        paymentLinkId: product.id,
        stock: location.inventory?.[product.id] === null ? null : Math.max(0, Number(location.inventory?.[product.id]) || 0),
      })),
    }));
  }

  /** Returns an error message and focuses the field, or "" when the form can be saved. */
  function validate() {
    if (!nameInput.value.trim()) { nameInput.focus(); return "Escribe el nombre de la tienda."; }
    if (mode() === "whatsapp" && !hasUsableWhatsAppPhone(phoneInput.value)) { phoneInput.focus(); return "Escribe un número de WhatsApp válido, con 7 a 15 dígitos."; }
    if (emailInput.value && !emailInput.checkValidity()) { emailInput.focus(); return "Escribe un correo de soporte válido."; }
    for (const [index, link] of links.entries()) {
      if (!link.label.trim() || !/^https?:\/\/\S+$/i.test(link.url.trim())) {
        linksHost.querySelectorAll(".store-link-editor-row")[index]?.querySelector(link.label.trim() ? ".link-url" : ".link-label")?.focus();
        return `Completa el texto y una URL que empiece con https:// en el enlace ${index + 1}.`;
      }
    }
    for (const location of serializedLocations()) {
      const card = locationsList.querySelector(`[data-location-id="${CSS.escape(location.id)}"]`);
      if (!location.name) { card?.querySelector('[data-location-field="name"]')?.focus(); return "Escribe un nombre para cada ubicación."; }
      if (!location.pickupEnabled && !location.deliveryEnabled) { card?.querySelector('[data-location-field="pickupEnabled"]')?.focus(); return `${location.name} debe permitir retiro, entrega o ambas opciones.`; }
      const invalidHours = location.openingHours.find((hours) => !hours.closed && hours.open >= hours.close);
      if (invalidHours) {
        card?.querySelector(`[data-location-hours-day="${invalidHours.day}"][data-location-hours-field="close"]`)?.focus();
        return `En ${location.name}, la hora de cierre del ${DAYS[invalidHours.day].toLowerCase()} debe ser posterior a la apertura.`;
      }
      if (!isSupportedMapUrl(location.mapEmbedUrl)) {
        const message = "Pega el código de inserción de Google Maps u OpenStreetMap; los enlaces comunes y otros sitios no se pueden incrustar.";
        const mapInput = card?.querySelector('[data-location-field="mapEmbedUrl"]');
        const inline = card?.querySelector(".field-validation-error");
        mapInput?.setAttribute("aria-invalid", "true");
        if (inline) { inline.textContent = message; inline.hidden = false; }
        mapInput?.focus();
        return message;
      }
    }
    return "";
  }

  form.addEventListener("change", (/** @type {any} */ event) => { if (event.target.name === "storeCheckoutMode") syncMode(); });
  // Any edit, including list buttons below, marks the form so a background refresh keeps it.
  for (const type of ["input", "change", "click"]) form.addEventListener(type, (/** @type {any} */ event) => {
    if (type !== "click" || event.target.closest("[data-link-add], .link-remove, #storeLocationAdd, .store-location-remove, [data-logo-remove]")) dirty = true;
  });

  logoInput.addEventListener("change", async () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) { showError("El logo no puede pesar más de 8MB."); logoInput.value = ""; return; }
    statusEl.textContent = "Subiendo logo…";
    try {
      logoUrl = await deps.uploadFile(file);
      renderLogo();
      statusEl.textContent = "Logo listo. Guarda para aplicarlo.";
    } catch (error) {
      statusEl.textContent = "";
      showError(`Error subiendo el logo: ${messageOf(error)}`);
    }
    logoInput.value = "";
  });
  logoRemove.addEventListener("click", () => { logoUrl = null; renderLogo(); });

  $("[data-link-add]").addEventListener("click", () => {
    links.push({ label: "", url: "" });
    renderLinks();
    linksHost.querySelector(".store-link-editor-row:last-child .link-label")?.focus();
  });
  linksHost.addEventListener("input", (/** @type {any} */ event) => {
    const row = event.target.closest("[data-index]");
    if (!row) return;
    const link = links[Number(row.dataset.index)];
    if (event.target.classList.contains("link-label")) link.label = event.target.value;
    if (event.target.classList.contains("link-url")) link.url = event.target.value;
  });
  linksHost.addEventListener("click", (/** @type {any} */ event) => {
    const row = event.target.closest(".link-remove") && event.target.closest("[data-index]");
    if (!row) return;
    links.splice(Number(row.dataset.index), 1);
    renderLinks();
  });

  $("#storeLocationAdd").addEventListener("click", () => {
    locationsEdited = true;
    locations.push({
      id: `location-${Date.now().toString(36)}`,
      name: `Ubicación ${locations.length + 1}`, address: "", mapEmbedUrl: "", highlight: "", description: "",
      pickupEnabled: true, deliveryEnabled: false, openingHours: defaultHours(),
      // The first location starts with the product's current stock so adding it changes nothing.
      inventory: Object.fromEntries(activeProducts().map((product) => [product.id, locations.length === 0 ? product.stock : 0])),
    });
    renderLocations();
  });
  locationsList.addEventListener("click", (/** @type {any} */ event) => {
    const card = event.target.closest(".store-location-remove") && event.target.closest("[data-location-id]");
    if (!card) return;
    locationsEdited = true;
    locations = locations.filter((location) => location.id !== card.dataset.locationId);
    renderLocations();
  });
  locationsList.addEventListener("input", (/** @type {any} */ event) => {
    const card = event.target.closest("[data-location-id]");
    const location = locations.find((entry) => entry.id === card?.dataset.locationId);
    if (!location) return;
    locationsEdited = true;
    const target = event.target;
    if (target.dataset.locationField) {
      /** @type {any} */ (location)[target.dataset.locationField] = target.type === "checkbox" ? target.checked : target.value;
      if (target.dataset.locationField === "mapEmbedUrl") {
        target.removeAttribute("aria-invalid");
        const inline = card.querySelector(".field-validation-error");
        inline.hidden = true;
        inline.textContent = "";
      }
    }
    if (target.dataset.locationHoursDay) {
      const hours = location.openingHours.find((entry) => entry.day === Number(target.dataset.locationHoursDay));
      if (hours) {
        const field = target.dataset.locationHoursField;
        /** @type {any} */ (hours)[field] = field === "closed" ? target.checked : target.value;
        if (field === "closed") renderLocations();
      }
    }
    if (target.dataset.locationStock) location.inventory[target.dataset.locationStock] = Math.max(0, Number(target.value) || 0);
  });
  locationsList.addEventListener("change", (/** @type {any} */ event) => {
    const card = event.target.closest("[data-location-id]");
    const location = locations.find((entry) => entry.id === card?.dataset.locationId);
    if (!location || !event.target.dataset.locationUnlimited) return;
    locationsEdited = true;
    location.inventory[event.target.dataset.locationUnlimited] = event.target.checked ? null : 0;
    renderLocations();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !store) return;
    showError("");
    const problem = validate();
    if (problem) { showError(problem); return; }
    const savedStore = store, previousMode = store.checkoutMode || "payment", nextMode = mode();
    const patch = {
      name: nameInput.value.trim(),
      tagline: taglineInput.value.trim() || null,
      logoUrl,
      checkoutMode: nextMode,
      contactPhone: phoneInput.value.trim() || null,
      contactEmail: emailInput.value.trim() || null,
      showLowStockToCustomers: lowStockInput.checked,
      publicVisibility: visibilityInput.checked,
      policies: Object.fromEntries(POLICY_FIELDS.map(([key]) => [key, policyInput(key).value.trim() || null])),
      ...(nextMode !== "external" && { leadCaptureUrl: null }),
      ...(locationsEdited && { locations: serializedLocations() }),
    };
    busy = true; saveButton.disabled = true; statusEl.textContent = "Guardando…";
    try {
      const updated = await deps.api(`/stores/${encodeURIComponent(savedStore.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      const savedLinks = await deps.api(`/stores/${encodeURIComponent(savedStore.id)}/links`, { method: "PUT", body: JSON.stringify({ links: links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })) }) });
      locationsEdited = false; dirty = false;
      statusEl.textContent = "Cambios guardados.";
      deps.onSaved({ ...updated, links: savedLinks }, { enabledPayments: previousMode !== "payment" && nextMode === "payment" });
    } catch (error) {
      statusEl.textContent = "";
      showError(`No se pudieron guardar los cambios: ${messageOf(error)}`);
    } finally {
      busy = false; saveButton.disabled = false;
    }
  });

  return {
    /**
     * Loads a store into the form. Unsaved edits of the same store are kept.
     * @param {Store | null} nextStore
     * @param {Product[]} [nextProducts]
     */
    setStore(nextStore, nextProducts = []) {
      products = nextProducts;
      if (!nextStore) { store = null; form.hidden = true; return; }
      form.hidden = false;
      if ((busy || dirty) && store?.id === nextStore.id) { seedInventory(); return; }
      store = nextStore;
      nameInput.value = store.name || "";
      taglineInput.value = store.tagline || "";
      phoneInput.value = store.contactPhone || "";
      emailInput.value = store.contactEmail || "";
      lowStockInput.checked = store.showLowStockToCustomers === true;
      visibilityInput.checked = store.publicVisibility === true;
      for (const [key] of POLICY_FIELDS) policyInput(key).value = store.policies?.[key] || "";
      const checkoutMode = ["payment", "whatsapp", "external"].includes(store.checkoutMode || "") ? store.checkoutMode : "payment";
      /** @type {HTMLInputElement} */ (form.querySelector(`input[name="storeCheckoutMode"][value="${checkoutMode}"]`)).checked = true;
      logoUrl = store.logoUrl || null;
      links = (store.links || []).map((link) => ({ label: link.label, url: link.url }));
      locations = locationsFromStore(store);
      seedInventory();
      locationsEdited = false; dirty = false;
      showError(""); statusEl.textContent = "";
      syncMode(); renderLogo(); renderLinks(); renderLocations();
    },
    refreshRequirement: syncMode,
  };
}
