import "./style.css";
import type { StoreSiteDocument } from "@pagosya/shared-types";
import { batchStatusLabel, validateImageBatch } from "./batch-upload";
import { mountConnectedStudio } from "./connected-studio";

type StudioPage = "home" | "checkout";
type ChangeId = "hero" | "palette" | "products" | "checkout";

interface StudioImage {
  id: string;
  name: string;
  src: string;
  ready: boolean;
  demo?: boolean;
}

interface ChangeItem {
  id: ChangeId;
  label: string;
  detail: string;
  active: boolean;
}

interface StudioState {
  document: Pick<StoreSiteDocument, "version" | "direction">;
  page: StudioPage;
  images: StudioImage[];
  previousImages: StudioImage[] | null;
  batchToken: number;
  rejectedMessage: string;
  selectedChange: ChangeId;
  changes: ChangeItem[];
  approved: boolean;
  published: boolean;
  reviewOpen: boolean;
  assistantBusy: boolean;
  latestCommand: string;
  assistantReply: string;
  toast: string;
}

const demoImages: StudioImage[] = [
  { id: "demo-hero", name: "referencia-hero.png", src: "/demo/hero.png", ready: true, demo: true },
  { id: "demo-gallery-one", name: "detalle-producto.jpg", src: "/demo/gallery-1.jpg", ready: true, demo: true },
  { id: "demo-gallery-two", name: "ambiente-marca.png", src: "/demo/gallery-2.png", ready: true, demo: true },
];

const state: StudioState = {
  document: { version: 1, direction: "merchant-studio-a-plus-c" },
  page: "home",
  images: demoImages.map((image) => ({ ...image })),
  previousImages: null,
  batchToken: 0,
  rejectedMessage: "",
  selectedChange: "hero",
  changes: [
    { id: "hero", label: "Hero", detail: "3 imágenes", active: true },
    { id: "palette", label: "Paleta de marca", detail: "Verde matcha + papel", active: true },
    { id: "products", label: "Productos destacados", detail: "Orden editorial", active: true },
    { id: "checkout", label: "Checkout", detail: "Confianza y entrega", active: true },
  ],
  approved: false,
  published: false,
  reviewOpen: true,
  assistantBusy: false,
  latestCommand: "",
  assistantReply: "",
  toast: "",
};

const mount = document.querySelector<HTMLDivElement>("#app");
if (!mount) throw new Error("Merchant Studio mount point is missing.");
const app: HTMLDivElement = mount;

const iconPaths: Record<string, string> = {
  check: '<path d="m5 12 4 4L19 6"/>',
  upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v4h14v-4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1.4a1.6 1.6 0 0 0 1.1-2.7 1.6 1.6 0 0 1 1.1-2.7H18a3 3 0 0 0 3-3C21 7.3 17 3 12 3Z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7" r=".8"/><circle cx="15" cy="7.5" r=".8"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  cart: '<path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  code: '<path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/>',
  paperclip: '<path d="m8 12 6.7-6.7a3 3 0 0 1 4.3 4.2L10.5 18a5 5 0 0 1-7-7l8-8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v3"/>',
  send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  desktop: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M9 21h6m-3-4v4"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  refresh: '<path d="M20 6v5h-5"/><path d="M18.5 16a8 8 0 1 1 .5-8l1 3"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
};

function icon(name: keyof typeof iconPaths, label = ""): string {
  const aria = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${aria}>${iconPaths[name]}</svg>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function currentBatchReady(): number {
  return state.images.filter((image) => image.ready).length;
}

function activeChanges(): ChangeItem[] {
  return state.changes.filter((change) => change.active);
}

function changeIcon(change: ChangeId): string {
  if (change === "palette") return icon("palette");
  if (change === "products") return icon("star");
  if (change === "checkout") return icon("cart");
  return icon("image");
}

function renderBatch(): string {
  const ready = currentBatchReady();
  const status = batchStatusLabel(ready, state.images.length);
  const complete = ready === state.images.length && state.images.length > 0;
  const slotLabel = state.images.length === 1 ? "La casilla está vinculada" : `Las ${state.images.length} casillas están vinculadas`;
  return `
    <section class="batch-card ${complete ? "is-complete" : "is-loading"}" data-drop-zone aria-label="Lote de imágenes adjuntas">
      <div class="batch-card__header">
        <span>${icon("paperclip")} <strong>${state.images.length} imágenes</strong><span class="batch-size"> · un solo lote</span></span>
        <span class="batch-state ${complete ? "is-ready" : ""}">${complete ? icon("check") : ""}${escapeHtml(status)}</span>
      </div>
      <div class="batch-thumbs">
        ${state.images.map((image, index) => `
          <figure class="batch-thumb ${image.ready ? "is-ready" : "is-pending"}">
            ${image.ready
              ? `<img src="${image.src}" alt="Imagen ${index + 1}: ${escapeHtml(image.name)}" />`
              : `<span class="batch-thumb__loading" aria-label="Cargando imagen ${index + 1}">${index + 1}</span>`}
            <figcaption>${image.ready ? icon("check") : index + 1}</figcaption>
          </figure>
        `).join("")}
      </div>
      <div class="batch-card__footer">
        <span>${complete ? slotLabel : "Cada archivo conserva su propia casilla"}</span>
        <button class="text-button" type="button" data-action="open-upload">Reemplazar lote</button>
      </div>
      ${state.rejectedMessage ? `<p class="inline-error" role="alert">${escapeHtml(state.rejectedMessage)}</p>` : ""}
    </section>
  `;
}

function renderSelectedEvidence(change: ChangeItem): string {
  if (change.id === "checkout") {
    return `<div class="selected-evidence selected-evidence--approval" data-selected-evidence>${renderApproval()}</div>`;
  }

  const evidence: Record<Exclude<ChangeId, "checkout">, { target: string; before: string; after: string; details: string[] }> = {
    hero: {
      target: "Hero seleccionado en Inicio",
      before: "Galería anterior",
      after: `${currentBatchReady()} imágenes vinculadas`,
      details: ["Orden conservado", "Encuadre editorial", "Texto alternativo pendiente de API"],
    },
    palette: {
      target: "Tokens de tema de la tienda",
      before: "Neutro genérico",
      after: "Matcha + papel cálido",
      details: ["Fondo #F8F0DE", "Acción #173E24", "Contraste revisado"],
    },
    products: {
      target: "Colección destacada",
      before: "Cuadrícula uniforme",
      after: "Composición editorial",
      details: ["2 productos visibles", "Precios preservados", "Orden reversible"],
    },
  };
  const item = evidence[change.id];
  return `
    <section class="selected-evidence" data-selected-evidence aria-label="Evidencia para ${escapeHtml(change.label)}">
      <div class="evidence-heading"><span>${icon("eye")} OBJETIVO VISIBLE</span><strong>${escapeHtml(item.target)}</strong></div>
      <div class="evidence-compare"><span><small>ANTES</small>${escapeHtml(item.before)}</span><b>→</b><span><small>DESPUÉS</small>${escapeHtml(item.after)}</span></div>
      <div class="evidence-details">${item.details.map((detail) => {
        const pending = detail.toLowerCase().includes("pendiente");
        return `<span class="${pending ? "is-pending" : ""}">${icon(pending ? "refresh" : "check")} ${escapeHtml(detail)}</span>`;
      }).join("")}</div>
    </section>
  `;
}

function renderChangeSet(): string {
  return `
    <section class="change-set" aria-labelledby="changes-title">
      <div class="section-heading">
        <div>
          <span class="eyebrow">BORRADOR DE YAPI</span>
          <h2 id="changes-title">Cambios preparados</h2>
        </div>
        <span class="change-count">${activeChanges().length} activos</span>
      </div>
      <div class="change-list">
        ${state.changes.map((change) => `
          <div class="change-row-wrap">
            <div class="change-row ${state.selectedChange === change.id ? "is-selected" : ""}">
              <button class="change-row__main" type="button" data-action="select-change" data-change-id="${change.id}" aria-pressed="${state.selectedChange === change.id}">
                <span class="change-icon">${changeIcon(change.id)}</span>
                <span><strong>${escapeHtml(change.label)}</strong><small>${escapeHtml(change.detail)}</small></span>
              </button>
              <label class="switch" aria-label="${change.active ? "Excluir" : "Incluir"} ${escapeHtml(change.label)}">
                <input type="checkbox" data-change-toggle="${change.id}" ${change.active ? "checked" : ""} />
                <span></span>
              </label>
            </div>
            ${state.selectedChange === change.id ? renderSelectedEvidence(change) : ""}
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderApproval(): string {
  const checkoutActive = state.changes.find((change) => change.id === "checkout")?.active;
  if (!checkoutActive) {
    return `<div class="approval-note is-safe">${icon("check")}<span>No hay cambios sensibles pendientes.</span></div>`;
  }
  return `
    <section class="approval-card ${state.approved ? "is-approved" : ""}">
      <div class="approval-card__copy">
        <span class="approval-icon">${state.approved ? icon("check") : icon("alert")}</span>
        <div>
          <strong>${state.approved ? "Checkout aprobado" : "Revisión necesaria"}</strong>
          <p>${state.approved ? "YAPI puede incluir esta selección al publicar." : "El checkout afecta la conversión. Revísalo antes de publicar."}</p>
        </div>
      </div>
      <div class="approval-actions">
        <button class="button button--secondary" type="button" data-action="show-checkout">${icon("eye")} Ver diferencia</button>
        <button class="button button--primary" type="button" data-action="approve">${state.approved ? icon("check") + " Aprobado" : "Aprobar selección"}</button>
      </div>
      <span class="revert-note">${icon("refresh")} YAPI podrá revertir este cambio</span>
    </section>
  `;
}

function renderConversation(): string {
  return `
    <div class="agent-stream">
      <article class="message message--user">
        <div class="message-meta"><span class="avatar">TÚ</span><strong>Tú</strong><time>ahora</time></div>
        <p>Actualiza el hero con estas tres imágenes y mantén todo coherente con mi marca.</p>
        ${renderBatch()}
      </article>
      <article class="agent-note" aria-live="polite">
        <div class="agent-note__meta"><span class="yapi-dot"></span><strong>YAPI</strong><span>${state.assistantBusy ? "trabajando" : "listo"}</span></div>
        ${state.assistantBusy
          ? `<div class="thinking"><i></i><i></i><i></i><span>Revisando la tienda y preparando una vista segura…</span></div>`
          : `<p>${state.assistantReply
              ? escapeHtml(state.assistantReply)
              : "Preparé el hero, la paleta, los productos y una mejora separada para checkout. Puedes activar, revisar o excluir cada cambio."}</p>`}
      </article>
      ${state.latestCommand ? `
        <article class="message message--followup">
          <div class="message-meta"><span class="avatar">TÚ</span><strong>Tú</strong><time>ahora</time></div>
          <p>${escapeHtml(state.latestCommand)}</p>
        </article>
      ` : ""}
      ${renderChangeSet()}
    </div>
  `;
}

function renderComposer(): string {
  return `
    <div class="composer-wrap">
      <div class="suggestions" aria-label="Sugerencias">
        <button type="button" data-suggestion="Haz el hero más editorial">Hero más editorial</button>
        <button type="button" data-suggestion="Optimiza el texto del botón de pago">Optimizar checkout</button>
      </div>
      <form class="composer" data-composer>
        <label for="agent-command" class="sr-only">Indicación para YAPI</label>
        <textarea id="agent-command" name="command" rows="2" placeholder="Describe qué quieres cambiar…"></textarea>
        <div class="composer__tools">
          <div>
            <button class="icon-button" type="button" data-action="open-upload" aria-label="Adjuntar hasta tres imágenes">${icon("paperclip")}</button>
            <button class="tool-button" type="button" data-action="visual-edit">${icon("eye")} Edición visual</button>
            <span class="model-label">YAPI Studio</span>
          </div>
          <div>
            <button class="icon-button" type="button" aria-label="Dictado disponible próximamente" title="Disponible en la integración de voz" disabled>${icon("mic")}</button>
            <button class="send-button" type="submit" aria-label="Enviar a YAPI">${icon("send")}</button>
          </div>
        </div>
      </form>
      <input class="sr-only" type="file" accept="image/*" multiple data-image-input aria-label="Seleccionar hasta tres imágenes" />
    </div>
  `;
}

function renderAgentPanel(): string {
  return `
    <aside class="agent-panel" aria-label="Conversación con YAPI">
      <header class="agent-header">
        <div><span class="agent-wordmark">YAPI</span><span class="online"><i></i> En línea</span></div>
        <div>
          <button class="icon-button" type="button" aria-label="Historial de tareas">${icon("history")}</button>
          <button class="icon-button" type="button" data-action="new-task" aria-label="Nueva tarea">${icon("plus")}</button>
        </div>
      </header>
      ${renderConversation()}
      ${renderComposer()}
    </aside>
  `;
}

function previewImage(index: number): StudioImage {
  return state.images[index] ?? demoImages[index] ?? demoImages[0];
}

function renderHomePreview(): string {
  const hero = previewImage(0);
  const secondary = previewImage(1);
  const tertiary = previewImage(2);
  return `
    <div class="storefront storefront--home">
      <header class="store-nav">
        <a class="store-brand" href="#" aria-label="Savia inicio">SAVIA<small>ritual diario</small></a>
        <nav aria-label="Navegación de la tienda">
          <a href="#coleccion">Colección</a><a href="#origen">Origen</a><a href="#rituales">Rituales</a>
        </nav>
        <div class="store-actions"><button aria-label="Buscar">⌕</button><button aria-label="Ver carrito">${icon("cart")}<b>2</b></button></div>
      </header>
      <section class="editable-section hero-showcase" aria-label="Hero seleccionado">
        <span class="selection-label">Hero · 3 imágenes</span>
        <div class="hero-copy">
          <span class="store-kicker">MATCHA DE ORIGEN · BOLIVIA</span>
          <h1>Tu pausa,<br />mejor hecha.</h1>
          <p>Matcha ceremonial y mezclas precisas para convertir cinco minutos en un ritual propio.</p>
          <a href="#coleccion">Descubrir la colección <span>↗</span></a>
        </div>
        <figure class="hero-primary ${hero.ready ? "" : "is-loading"}">${hero.ready ? `<img src="${hero.src}" alt="Bebida de matcha de la colección Savia" />` : ""}</figure>
        <div class="hero-secondary">
          <figure class="${secondary.ready ? "" : "is-loading"}">${secondary.ready ? `<img src="${secondary.src}" alt="Detalle editorial de producto" />` : ""}</figure>
          <figure class="${tertiary.ready ? "" : "is-loading"}">${tertiary.ready ? `<img src="${tertiary.src}" alt="Ambiente visual de la marca" />` : ""}</figure>
        </div>
        <div class="selection-tools" aria-label="Herramientas de la sección">
          <button title="Mover arriba · disponible al conectar el documento" disabled>↑</button><button title="Mover abajo · disponible al conectar el documento" disabled>↓</button><button title="Editar con YAPI · usa el panel izquierdo" disabled>Y</button><button title="Ocultar · disponible al conectar el documento" disabled>◌</button>
        </div>
      </section>
      <section class="collection-strip" id="coleccion">
        <div><span class="store-kicker">COLECCIÓN 01</span><h2>Una fórmula para cada ritmo.</h2></div>
        <article><img src="/demo/product.jpg" alt="Matcha ceremonial" /><div><strong>Matcha ceremonial</strong><span>Bs 118</span></div></article>
        <article><img src="/demo/gallery-2.png" alt="Mezcla de matcha y pistacho" /><div><strong>Matcha + pistacho</strong><span>Bs 42</span></div></article>
        <a href="#">Ver todos →</a>
      </section>
    </div>
  `;
}

function renderCheckoutPreview(): string {
  return `
    <div class="storefront storefront--checkout">
      <header class="store-nav checkout-nav">
        <a class="store-brand" href="#">SAVIA<small>ritual diario</small></a>
        <nav aria-label="Navegación de la tienda"><a href="#">Tienda</a><a href="#">Rituales</a><a href="#">Origen</a></nav>
        <span class="secure-label">${icon("lock")} Compra segura</span>
      </header>
      <div class="checkout-body">
        <div class="checkout-heading"><span class="store-kicker">PASO 3 DE 4</span><h1>Checkout</h1><p>Información → Envío → <strong>Pago</strong> → Confirmación</p></div>
        <section class="checkout-form" aria-label="Datos del pedido">
          <div class="checkout-field"><strong>Contacto</strong><span>sofia@example.com</span></div>
          <strong>Método de entrega</strong>
          <label class="delivery-option is-selected"><i></i><span><b>Envío estándar</b><small>Entrega en 2 a 4 días hábiles</small></span><em>Gratis</em></label>
          <label class="delivery-option"><i></i><span><b>Envío exprés</b><small>Entrega en 24 a 48 horas hábiles</small></span><em>Bs 25</em></label>
          <strong>Dirección de entrega</strong>
          <div class="checkout-field"><span>Av. San Martín 1234</span></div>
          <div class="checkout-field checkout-field--split"><span>Santa Cruz de la Sierra</span><span>Bolivia</span></div>
        </section>
        <aside class="order-summary">
          <h2>Tu pedido</h2>
          <div class="order-product"><img src="/demo/product.jpg" alt="Matcha ceremonial" /><span><b>Matcha ceremonial</b><small>30 g · Cantidad 1</small></span><em>Bs 250</em></div>
          <dl><div><dt>Subtotal</dt><dd>Bs 250</dd></div><div><dt>Envío</dt><dd>Gratis</dd></div><div><dt>Impuestos</dt><dd>Bs 28</dd></div><div class="total"><dt>Total</dt><dd>Bs 278</dd></div></dl>
        </aside>
        <section class="payment-card editable-section" aria-label="Bloque de pago editado por YAPI">
          <span class="selection-label">Editando con YAPI</span>
          <h2>Pago seguro</h2><p>Todos los pagos están protegidos y encriptados.</p>
          <label class="payment-option"><i></i><span>Tarjeta de crédito o débito</span><b>VISA · MC</b></label>
          <label class="payment-option"><i></i><span>QR bancario</span><b>BOB</b></label>
          <button>Pagar Bs 278</button>
          <span class="protected">${icon("lock")} Tus datos están protegidos</span>
          <div class="trust-row"><span>${icon("truck")}<b>Entrega segura</b><small>2–4 días hábiles</small></span><span>${icon("refresh")}<b>Devoluciones</b><small>30 días</small></span><span>${icon("shield")}<b>Pago protegido</b><small>Cifrado SSL</small></span></div>
        </section>
      </div>
    </div>
  `;
}

function renderReviewTray(): string {
  if (state.page !== "checkout" || !state.reviewOpen) return "";
  return `
    <section class="review-tray" aria-label="Comparación antes y después">
      <header><div><span class="eyebrow">REVISIÓN SEGURA</span><strong>Antes / Después</strong></div><button class="icon-button" type="button" data-action="close-review" aria-label="Ocultar comparación">${icon("close")}</button></header>
      <div class="review-grid">
        <div class="review-fragment"><span>ANTES</span><strong>Pago seguro</strong><p>Tus datos están protegidos.</p><div class="mini-payment">Tarjeta de crédito <b>VISA · MC</b></div></div>
        <div class="review-fragment review-fragment--after"><span>DESPUÉS</span><strong>Pago seguro</strong><p>Todos los pagos están protegidos y encriptados.</p><div class="mini-trust">${icon("truck")} Entrega segura ${icon("refresh")} Devoluciones ${icon("shield")} Pago protegido</div></div>
        <div class="diff-list"><span>${icon("check")} Título actualizado</span><span>${icon("check")} 3 sellos añadidos</span><span>${icon("check")} Entrega aclarada</span></div>
      </div>
    </section>
  `;
}

function renderCanvas(): string {
  return `
    <main class="canvas-panel" aria-label="Vista previa editable">
      <header class="canvas-toolbar">
        <div class="viewport-controls" aria-label="Tamaño de vista">
          <button class="is-active" type="button" aria-label="Vista de escritorio">${icon("desktop")}</button>
          <button type="button" aria-label="Vista móvil disponible próximamente" title="Disponible en la siguiente integración" disabled>${icon("mobile")}</button>
          <span>90%</span>
        </div>
        <div class="history-controls"><button type="button" data-action="undo" aria-label="Deshacer">${icon("undo")}</button><button type="button" aria-label="Rehacer disponible próximamente" title="Disponible cuando el historial sea persistente" disabled>${icon("redo")}</button></div>
        <div class="page-control">
          <label for="page-select">Página</label>
          <select id="page-select" data-page-select><option value="home" ${state.page === "home" ? "selected" : ""}>Inicio</option><option value="checkout" ${state.page === "checkout" ? "selected" : ""}>Checkout</option></select>
        </div>
        <span class="canvas-state">${state.published ? icon("check") + " Publicado" : "Vista previa en vivo"}</span>
      </header>
      <div class="preview-frame ${state.page === "checkout" ? "is-checkout" : ""}">
        ${state.page === "home" ? renderHomePreview() : renderCheckoutPreview()}
      </div>
      ${renderReviewTray()}
      <footer class="canvas-status"><span>${icon("check")} ${currentBatchReady()} imágenes vinculadas</span><span>Sin errores</span><span>${state.approved ? "Checkout aprobado" : "Checkout requiere aprobación"}</span></footer>
    </main>
  `;
}

function renderTopbar(): string {
  const changeCount = activeChanges().length;
  const checkoutActive = state.changes.find((change) => change.id === "checkout")?.active;
  const canPublish = !checkoutActive || state.approved;
  return `
    <header class="topbar">
      <a class="product-mark" href="#" aria-label="pagosYa Merchant Studio"><img src="/logo-mark.png" alt="" /><span>pagosYa</span><i></i><strong>Merchant Studio</strong></a>
      <div class="save-state">${icon("check")} ${state.published ? "Publicado" : "Borrador guardado"}</div>
      <div class="mode-switch" aria-label="Modo de editor"><button class="is-active" type="button">${icon("eye")} Vista</button><button type="button" title="Disponible cuando el documento esté conectado" disabled>${icon("code")} Código</button></div>
      <div class="top-actions">
        <button class="button button--ghost" type="button" data-action="discard">Descartar</button>
        <button class="button button--publish ${canPublish ? "" : "needs-review"}" type="button" data-action="publish">Publicar ${changeCount} cambios</button>
      </div>
    </header>
  `;
}

function render(): void {
  app.innerHTML = `
    <div class="studio-shell">
      ${renderTopbar()}
      <div class="studio-workspace">${renderAgentPanel()}${renderCanvas()}</div>
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
  bindEvents();
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Resultado de archivo inválido"));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function acceptImageFiles(files: File[]): Promise<void> {
  const batch = validateImageBatch(files);
  if (!batch.accepted.length) {
    state.rejectedMessage = "Selecciona archivos de imagen de hasta 10 MB.";
    showToast(state.rejectedMessage);
    return;
  }

  const token = ++state.batchToken;
  state.previousImages = state.images.map((image) => ({ ...image }));
  state.images = batch.accepted.map(({ id, file }) => ({ id, name: file.name, src: "", ready: false }));
  state.rejectedMessage = batch.rejected.length
    ? `${batch.rejected.length} archivo${batch.rejected.length === 1 ? "" : "s"} no se incluyeron. El máximo es 3 imágenes de 10 MB.`
    : "";
  state.page = "home";
  state.selectedChange = "hero";
  state.approved = false;
  state.published = false;
  render();

  await Promise.all(batch.accepted.map(async ({ file }, index) => {
    try {
      const src = await readFile(file as File);
      if (state.batchToken !== token || !state.images[index]) return;
      state.images[index] = { ...state.images[index], src, ready: true };
      render();
    } catch {
      if (state.batchToken !== token || !state.images[index]) return;
      state.images[index] = { ...state.images[index], name: `${state.images[index].name} · error` };
      state.rejectedMessage = "Una imagen no pudo abrirse. Las demás conservaron su casilla.";
      render();
    }
  }));

  if (state.batchToken === token && currentBatchReady() === state.images.length) {
    showToast(`${state.images.length} de ${state.images.length} imágenes listas en un solo lote.`);
  }
}

function showToast(message: string): void {
  state.toast = message;
  render();
  window.setTimeout(() => {
    if (state.toast !== message) return;
    state.toast = "";
    render();
  }, 2600);
}

function setSelectedChange(id: ChangeId): void {
  state.selectedChange = id;
  if (id === "checkout") {
    state.page = "checkout";
    state.reviewOpen = true;
  } else if (id === "hero" || id === "palette" || id === "products") {
    state.page = "home";
  }
  render();
  revealSelectedEvidence();
}

function revealSelectedEvidence(): void {
  const evidence = document.querySelector<HTMLElement>("[data-selected-evidence]");
  const stream = evidence?.closest<HTMLElement>(".agent-stream");
  if (!evidence || !stream) return;
  const evidenceRect = evidence.getBoundingClientRect();
  const streamRect = stream.getBoundingClientRect();
  const centeredOffset = evidenceRect.top - streamRect.top - Math.max(12, (stream.clientHeight - evidenceRect.height) / 2);
  stream.scrollTop += centeredOffset;
}

function handleAction(action: string, element: HTMLElement): void {
  if (action === "open-upload") {
    document.querySelector<HTMLInputElement>("[data-image-input]")?.click();
    return;
  }
  if (action === "select-change") {
    const id = element.dataset.changeId as ChangeId | undefined;
    if (id) setSelectedChange(id);
    return;
  }
  if (action === "show-checkout") {
    state.page = "checkout";
    state.selectedChange = "checkout";
    state.reviewOpen = true;
    render();
    revealSelectedEvidence();
    return;
  }
  if (action === "approve") {
    state.approved = true;
    state.page = "checkout";
    state.selectedChange = "checkout";
    state.reviewOpen = true;
    showToast("Selección aprobada. Ya puedes publicar.");
    return;
  }
  if (action === "publish") {
    const checkoutActive = state.changes.find((change) => change.id === "checkout")?.active;
    if (checkoutActive && !state.approved) {
      state.page = "checkout";
      state.selectedChange = "checkout";
      state.reviewOpen = true;
      showToast("Revisa y aprueba el cambio de checkout antes de publicar.");
      revealSelectedEvidence();
      return;
    }
    state.published = true;
    showToast(`${activeChanges().length} cambios publicados.`);
    return;
  }
  if (action === "undo") {
    if (!state.previousImages) {
      showToast("No hay un lote anterior para restaurar.");
      return;
    }
    const current = state.images;
    state.images = state.previousImages;
    state.previousImages = current;
    state.batchToken += 1;
    showToast("Lote de imágenes restaurado.");
    return;
  }
  if (action === "discard" || action === "new-task") {
    state.images = demoImages.map((image) => ({ ...image }));
    state.previousImages = null;
    state.batchToken += 1;
    state.rejectedMessage = "";
    state.approved = false;
    state.published = false;
    state.latestCommand = "";
    state.assistantReply = "";
    state.page = "home";
    state.selectedChange = "hero";
    showToast(action === "discard" ? "Borrador restaurado." : "Nueva tarea lista.");
    return;
  }
  if (action === "close-review") {
    state.reviewOpen = false;
    render();
    return;
  }
  if (action === "visual-edit") {
    showToast("Selecciona una sección en la vista previa para editarla con YAPI.");
  }
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action ?? "", element));
  });

  document.querySelector<HTMLInputElement>("[data-image-input]")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void acceptImageFiles(files);
  });

  document.querySelectorAll<HTMLInputElement>("[data-change-toggle]").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const id = toggle.dataset.changeToggle as ChangeId;
      const change = state.changes.find((item) => item.id === id);
      if (!change) return;
      change.active = toggle.checked;
      if (id === "checkout") state.approved = false;
      state.published = false;
      render();
    });
  });

  document.querySelector<HTMLSelectElement>("[data-page-select]")?.addEventListener("change", (event) => {
    state.page = (event.currentTarget as HTMLSelectElement).value as StudioPage;
    if (state.page === "checkout") {
      state.selectedChange = "checkout";
      state.reviewOpen = true;
    }
    render();
    if (state.page === "checkout") revealSelectedEvidence();
  });

  const dropZone = document.querySelector<HTMLElement>("[data-drop-zone]");
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    void acceptImageFiles(Array.from(event.dataTransfer?.files ?? []));
  });

  document.querySelectorAll<HTMLButtonElement>("[data-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = document.querySelector<HTMLTextAreaElement>("#agent-command");
      if (!textarea) return;
      textarea.value = button.dataset.suggestion ?? "";
      textarea.focus();
    });
  });

  document.querySelector<HTMLFormElement>("[data-composer]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const command = String(formData.get("command") ?? "").trim();
    if (!command) {
      document.querySelector<HTMLTextAreaElement>("#agent-command")?.focus();
      return;
    }
    state.latestCommand = command;
    state.assistantBusy = true;
    state.assistantReply = "";
    render();
    window.setTimeout(() => {
      state.assistantBusy = false;
      state.assistantReply = "Entendido. Añadí la solicitud al borrador y mantuve checkout separado para que puedas revisar su impacto antes de publicar.";
      state.published = false;
      render();
    }, 900);
  });
}

const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";
if (demoMode) render();
else void mountConnectedStudio(app);
