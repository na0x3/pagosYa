import { escapeHtml as esc } from "./html.mjs";
import { icon } from "./icons.mjs";
import { uiChoice, uiPill, uiStat } from "./ui-kit.mjs";
import { dueDateFromPreset, dueDateInputValue, dueDateFromInput, formatMoney, longDate, whatsAppShareUrl } from "./cobros.mjs";
import {
  BOLIVIA_CITIES,
  CONFIRM_AMOUNT_MARKER,
  CONTRACT_EXAMPLES,
  CONTRACT_STATE_LABEL,
  CONTRACT_TYPES,
  NOTARY_NOTICE,
  confirmAmount,
  contractPayload,
  contractPending,
  contractState,
  contractTimeline,
  draftPayload,
  editorFromDocument,
  moveClause,
  pendingSummary,
  signingLine,
  whatsAppContractMessage,
} from "./contracts.mjs";

/**
 * Documentos → Contratos (D3): first-run guide, a guided composer (type → parties → what
 * was agreed → who signs first), YAPI drafts the clauses (never the parties or invented
 * amounts), a clause editor with autosave, the merchant's signature, share, and the detail
 * with the signing progress. Everything interpolated into markup goes through esc().
 *
 * The sheet reuses the Propuestas sheet styles (same design system); contract-only parts
 * live in contracts.css.
 *
 * deps:
 *   api(path, options)  authenticated dashboard API call (throws Error with .status)
 *   storeId()           active store id
 *   store()             active store row ({ name, ... }) or null
 *   signedIn()          whether a merchant session exists
 *   apiBase()           the API base URL ("…/v1"), for the public PDF link
 */
export function mountContractsPanel(deps) {
  const root = document.getElementById("contractsRoot");
  if (!root) return { show() {}, reset() {}, startFromProposal() {} };

  const FILTERS = [
    { id: "all", label: "Todos" },
    { id: "open", label: "Por firmar" },
    { id: "signed", label: "Firmados" },
    { id: "draft", label: "Borradores" },
    { id: "closed", label: "Cerrados" },
  ];
  const DEADLINES = [{ id: "15", label: "15 días", days: 15 }, { id: "30", label: "30 días", days: 30 }, { id: "60", label: "60 días", days: 60 }];
  const GENERATING = ["Ordenando lo que acordaron…", "Redactando el objeto y las obligaciones…", "Escribiendo precio y plazo sin inventar montos…", "Agregando jurisdicción boliviana…", "Revisando la redacción…"];

  let documents = [];
  let summary = null;
  let loadedFor = null;
  let loading = false;
  let loadError = null;
  let filter = "all";
  let loadGeneration = 0;
  let lastFocus = null;
  /** composer | editor | sign | share | detail */
  let mode = null;
  let composer = null;
  let editor = null;
  let signer = null;
  let sheetDoc = null;
  let saveTimer = null;
  let generatingTimer = null;

  // ── shell ────────────────────────────────────────────────────────────

  const layer = document.createElement("div");
  layer.className = "proposal-sheet-layer contract-sheet-layer";
  layer.hidden = true;
  layer.innerHTML = `<div class="proposal-sheet-backdrop" data-contract-close></div>
    <section class="proposal-sheet contract-sheet" data-contract-sheet role="dialog" aria-modal="true" aria-labelledby="contractSheetTitle" tabindex="-1"></section>`;
  document.body.appendChild(layer);
  const panel = layer.querySelector("[data-contract-sheet]");

  const toast = document.createElement("p");
  toast.className = "proposals-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  document.body.appendChild(toast);
  let toastTimer = null;
  function notify(message, tone = "good") {
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function openSheet(html, nextMode, { wide = false } = {}) {
    if (layer.hidden) lastFocus = document.activeElement;
    mode = nextMode;
    panel.classList.toggle("is-wide", wide);
    panel.innerHTML = html;
    layer.hidden = false;
    document.body.classList.add("proposal-sheet-open");
    requestAnimationFrame(() => (panel.querySelector("[data-autofocus]") || panel).focus({ preventScroll: true }));
  }
  async function closeSheet() {
    if (layer.hidden) return;
    const hadEditor = Boolean(editor);
    if (editor) await flushSave();
    clearInterval(generatingTimer);
    layer.hidden = true;
    panel.innerHTML = "";
    mode = null;
    composer = null;
    editor = null;
    signer = null;
    sheetDoc = null;
    document.body.classList.remove("proposal-sheet-open");
    lastFocus?.focus?.({ preventScroll: true });
    if (hadEditor) void load();
  }
  layer.addEventListener("click", (event) => {
    if (event.target.closest("[data-contract-close]")) void closeSheet();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || layer.hidden || event.defaultPrevented) return;
    if (mode === "composer" && composer?.generating) return;
    if (mode === "sign" && signer?.busy) return;
    void closeSheet();
  });
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("input")) event.preventDefault();
    if (event.key !== "Tab") return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const inside = items.includes(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
  });

  const storePath = (suffix = "") => `/stores/${encodeURIComponent(deps.storeId())}${suffix}`;
  const docPath = (id, suffix = "") => storePath(`/documents/${encodeURIComponent(id)}${suffix}`);
  const contractPath = (id, suffix = "") => storePath(`/contracts/${encodeURIComponent(id)}${suffix}`);
  const errorText = (error) => {
    if (error?.status === 429 && error.serverMessage && !/throttl/i.test(error.serverMessage)) return error.serverMessage;
    return error?.message || "No pudimos completar la acción. Intenta de nuevo.";
  };
  const storeName = () => deps.store()?.name || "tu tienda";
  const initials = (name) => {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
  };
  const tokenFrom = (publicUrl) => (publicUrl ? publicUrl.split("/d/")[1]?.split("?")[0] ?? "" : "");
  const pdfUrl = (publicUrl, download = false) => `${deps.apiBase().replace(/\/$/, "")}/documents/public/${encodeURIComponent(tokenFrom(publicUrl))}/pdf${download ? "?download=1" : ""}`;
  const dateTime = (iso) => new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(iso));
  const typeInfo = (id) => CONTRACT_TYPES.find((type) => type.id === id) || CONTRACT_TYPES[CONTRACT_TYPES.length - 1];
  const ICON = {
    pen: icon("pen-line"), spark: icon("sparkles"), close: icon("x"), plus: icon("plus"), up: icon("chevron-up"),
    down: icon("chevron-down"), trash: icon("trash-2"), whatsapp: icon("message-circle"), mail: icon("mail"),
    link: icon("link"), eye: icon("eye"), check: icon("check"), doc: icon("file-text"), alert: icon("triangle-alert"),
    scale: icon("scale"), lock: icon("lock"), clock: icon("clock"),
  };
  /** @type {Record<string, string>} Lucide name per contract type. */
  const TYPE_ICON_NAME = { servicios: "wrench", compraventa: "shopping-cart", alquiler: "key-round", confidencialidad: "lock", personalizado: "pen-line" };
  const TYPE_ICON = Object.fromEntries(Object.entries(TYPE_ICON_NAME).map(([type, name]) => [type, icon(name)]));
  const noticeHtml = (extra = "") => `<p class="contract-legal-notice" data-contract-notary-notice role="note">${ICON.scale}<span><strong>Firma electrónica simple.</strong> ${esc(NOTARY_NOTICE)}${extra ? ` ${esc(extra)}` : ""}</span></p>`;

  // ── list ─────────────────────────────────────────────────────────────

  const listPath = () => `${storePath("/documents")}?kind=CONTRACT&limit=100${filter !== "all" ? `&state=${filter}` : ""}`;

  async function load() {
    const storeId = deps.storeId();
    const generation = ++loadGeneration;
    if (!storeId || !deps.signedIn()) { documents = []; summary = null; loadedFor = null; render(); return; }
    loading = true;
    loadError = null;
    render();
    try {
      const [nextSummary, rows] = await Promise.all([deps.api(storePath("/contracts/summary")), deps.api(listPath())]);
      if (generation !== loadGeneration || storeId !== deps.storeId()) return;
      summary = nextSummary;
      documents = Array.isArray(rows) ? rows : [];
      loadedFor = storeId;
    } catch (error) {
      if (generation !== loadGeneration) return;
      loadError = errorText(error);
    }
    loading = false;
    render();
  }

  async function loadTab() {
    const generation = ++loadGeneration;
    loading = true;
    documents = [];
    render();
    try {
      const rows = await deps.api(listPath());
      if (generation !== loadGeneration) return;
      documents = Array.isArray(rows) ? rows : [];
    } catch (error) {
      if (generation !== loadGeneration) return;
      notify(errorText(error), "bad");
    }
    loading = false;
    render();
  }

  function emptyHtml() {
    return `<div class="proposals-empty contracts-empty" data-contracts-empty>
      <span class="proposals-empty-icon" aria-hidden="true">${ICON.pen}</span>
      <h3>Contratos listos para firmar, sin papeleo</h3>
      <p>Elige el tipo de contrato y cuéntale a YAPI lo que acordaron. Redacta las cláusulas en lenguaje comercial boliviano; tú las revisas y los dos firman en línea, con código por correo y un PDF con el registro de firma.</p>
      <ol class="proposals-steps">
        <li><span>1</span><strong>Elige el tipo y los datos</strong><small>Tus datos legales ya están cargados; completas los de tu cliente.</small></li>
        <li><span>2</span><strong>YAPI redacta las cláusulas</strong><small>Objeto, precio, plazo, obligaciones y jurisdicción. Nunca inventa montos.</small></li>
        <li><span>3</span><strong>Firman los dos en línea</strong><small>Tu cliente confirma un código en su correo y firma desde su teléfono.</small></li>
      </ol>
      <p class="proposals-try">Empieza con un ejemplo:</p>
      <div class="contracts-examples">${CONTRACT_EXAMPLES.map((example, index) => `<button type="button" class="contract-example" data-contract-example="${index}">
        <span class="contract-example-icon" aria-hidden="true">${TYPE_ICON[example.contractType]}</span>
        <span><small>${esc(typeInfo(example.contractType).label)}</small><strong>${esc(example.label)}</strong></span></button>`).join("")}</div>
      <button type="button" class="primary proposals-cta" data-contract-new data-autofocus>Crear mi primer contrato</button>
      <p class="contracts-empty-note">${ICON.scale}<span>Firma electrónica simple para acuerdos comerciales privados. Escrituras públicas, inmuebles, vehículos y algunos actos laborales o societarios necesitan notario: consulta a un abogado o notario.</span></p>
    </div>`;
  }

  function render() {
    if (!deps.storeId()) {
      root.innerHTML = `<div class="proposals-empty"><p>Crea o elige una tienda para empezar a enviar contratos.</p></div>`;
      return;
    }
    if (loadError && !summary) {
      root.innerHTML = `<div class="proposals-error" role="alert"><p>${esc(loadError)}</p><button type="button" class="primary" data-contracts-retry>Intentar de nuevo</button></div>`;
      return;
    }
    if (!summary) {
      root.innerHTML = `<div class="proposals-skeleton" aria-busy="true" aria-label="Cargando contratos">${"<span></span>".repeat(3)}</div>`;
      return;
    }
    if (!summary.all) { root.innerHTML = emptyHtml(); return; }
    const now = new Date();
    const emptyTab = { open: "No tienes contratos esperando firmas.", signed: "Aún no tienes contratos firmados. ¡El primero está cerca!", draft: "No tienes borradores.", closed: "Nada vencido ni anulado.", all: "Aún no tienes contratos." }[filter];
    const list = loading && !documents.length
      ? `<div class="proposals-skeleton" aria-busy="true">${"<span></span>".repeat(2)}</div>`
      : documents.length
        ? `<ul class="proposals-list">${documents.map((doc) => cardHtml(doc, now)).join("")}</ul>`
        : `<p class="proposals-filter-empty">${esc(emptyTab)}</p>`;
    const counts = { all: summary.all, open: summary.open, signed: summary.signed, draft: summary.draft, closed: summary.closed };
    root.innerHTML = `<div class="proposals-head">
        <dl class="ui-stats contracts-summary">
          ${uiStat({ label: "Te toca firmar", icon: "pen-line", value: `${Number(summary.awaitingYou || 0)}<small>${summary.awaitingYou ? "Ábrelos y firma en un toque" : "Nada pendiente de tu lado"}</small>`, tone: summary.awaitingYou ? "attention" : "" })}
          ${uiStat({ label: "Esperando a tus clientes", icon: "hourglass", value: `${Math.max(0, Number(summary.open || 0) - Number(summary.awaitingYou || 0))}<small>${Number(summary.open || 0)} por firmar en total</small>` })}
          ${uiStat({ label: "Firmados", icon: "circle-check", value: `${Number(summary.signed || 0)}<small>Con PDF y registro de firma</small>`, tone: "good" })}
        </dl>
        <button type="button" class="primary proposals-new" data-contract-new>${ICON.spark}<span>Nuevo contrato</span></button>
      </div>
      <div class="ui-tabs" role="tablist" aria-label="Filtrar contratos">
        ${FILTERS.map((option) => `<button type="button" role="tab" class="ui-tab" aria-selected="${filter === option.id}" data-contract-filter="${option.id}">${esc(option.label)}<span>${Number(counts[option.id] || 0)}</span></button>`).join("")}
      </div>
      ${list}`;
  }

  function cardHtml(doc, now) {
    const state = contractState(doc, now);
    const who = doc.customer?.name || "Sin cliente";
    const line = [doc.numberLabel, who, signingLine(doc)].filter(Boolean).join(" · ");
    return `<li><button type="button" class="proposal-card contract-card-row" data-contract-card data-contract-id="${esc(doc.id)}">
      <span class="proposal-avatar" aria-hidden="true">${esc(initials(doc.customer?.name || doc.title))}</span>
      <span class="proposal-card-main"><strong>${esc(doc.title)}</strong><small>${esc(line)}</small></span>
      <span class="proposal-card-side"><span class="proposal-chip contract-chip is-${state}" data-contract-chip>${esc(CONTRACT_STATE_LABEL[state])}</span></span>
    </button></li>`;
  }

  root.addEventListener("click", (event) => {
    const example = event.target.closest("[data-contract-example]");
    if (example) { openComposer(CONTRACT_EXAMPLES[Number(example.dataset.contractExample)]); return; }
    if (event.target.closest("[data-contract-new]")) { openComposer(); return; }
    if (event.target.closest("[data-contracts-retry]")) { void load(); return; }
    const tab = event.target.closest("[data-contract-filter]");
    if (tab) {
      if (filter !== tab.dataset.contractFilter) { filter = tab.dataset.contractFilter; void loadTab(); }
      root.querySelector(`[data-contract-filter="${filter}"]`)?.focus();
      return;
    }
    const card = event.target.closest("[data-contract-card]");
    if (card) void openDetail(card.dataset.contractId);
  });

  // ── composer ─────────────────────────────────────────────────────────

  function openComposer(prefill = null) {
    composer = {
      contractType: prefill?.contractType || "servicios",
      objeto: prefill?.objeto || "",
      price: prefill?.price || "",
      paymentTerms: prefill?.paymentTerms || "",
      plazo: prefill?.plazo || "",
      city: prefill?.city || "",
      extra: "",
      signingOrder: "merchant_first",
      customerName: prefill?.customerName || "",
      customerDocument: prefill?.customerDocument || "",
      customerEmail: prefill?.customerEmail || "",
      customerPhone: prefill?.customerPhone || "",
      customerAddress: "",
      fromProposalId: prefill?.fromProposalId || null,
      fromProposalLabel: prefill?.fromProposalLabel || null,
      generating: false,
      error: null,
      noAi: false,
    };
    openSheet(composerHtml(), "composer", { wide: true });
  }

  function composerHtml() {
    const c = composer;
    const type = typeInfo(c.contractType);
    const cityOptions = [...new Set([...BOLIVIA_CITIES, ...(c.city && !BOLIVIA_CITIES.includes(c.city) ? [c.city] : [])])];
    return `<header class="proposal-sheet-head">
        <div><p class="proposal-kicker">${ICON.pen}Nuevo contrato</p><h2 id="contractSheetTitle">Arma tu contrato en 4 pasos</h2></div>
        <button type="button" class="proposal-icon-button" data-contract-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body contract-composer" data-contract-composer>
        ${c.fromProposalLabel ? `<p class="contract-from-proposal" data-contract-from-proposal>${ICON.check}<span>Desde la propuesta <strong>${esc(c.fromProposalLabel)}</strong> aceptada: el objeto, el precio y el cliente ya están cargados. Revisa y completa lo que falte.</span></p>` : ""}
        <section class="contract-step-card" aria-labelledby="contractStepType">
          <h3 id="contractStepType"><span class="contract-step-number">1</span>¿Qué tipo de contrato?</h3>
          <div class="ui-choices" role="radiogroup" aria-label="Tipo de contrato">
            ${CONTRACT_TYPES.map((option) => uiChoice({ icon: TYPE_ICON_NAME[option.id] || "file-text", group: "contractType", value: option.id, title: option.label, text: option.hint, checked: option.id === c.contractType })).join("")}
          </div>
          <p class="contract-type-notice" data-contract-type-notice ${type.notice ? "" : "hidden"}>${ICON.alert}<span>${esc(type.notice)}</span></p>
        </section>
        <section class="contract-step-card" aria-labelledby="contractStepParties">
          <h3 id="contractStepParties"><span class="contract-step-number">2</span>¿Con quién firmas?</h3>
          <p class="proposal-hint">Tus datos legales (razón social, NIT, representante) los tomamos de tu facturación y tu verificación; los revisas en el borrador.</p>
          <div class="proposal-two">
            <div><label for="contractCustomerName">Nombre o razón social del cliente</label><input id="contractCustomerName" maxlength="120" autocomplete="off" value="${esc(c.customerName)}" placeholder="Ej.: Café Illimani SRL" data-autofocus></div>
            <div><label for="contractCustomerDocument">CI o NIT del cliente</label><input id="contractCustomerDocument" maxlength="24" autocomplete="off" value="${esc(c.customerDocument)}" placeholder="Ej.: 4455667 LP"></div>
          </div>
          <div class="proposal-two">
            <div><label for="contractCustomerEmail">Correo del cliente</label><input id="contractCustomerEmail" type="email" inputmode="email" maxlength="254" value="${esc(c.customerEmail)}" placeholder="Le llega el código para firmar"></div>
            <div><label for="contractCustomerPhone">WhatsApp del cliente</label><input id="contractCustomerPhone" type="tel" inputmode="tel" maxlength="40" value="${esc(c.customerPhone)}" placeholder="7000 0000"></div>
          </div>
          <div><label for="contractCustomerAddress">Domicilio del cliente</label><input id="contractCustomerAddress" maxlength="240" value="${esc(c.customerAddress)}" placeholder="Calle, número, zona y ciudad"></div>
          <p class="proposal-hint">Lo que no sepas ahora queda marcado en el borrador para completarlo antes de enviar. YAPI nunca inventa datos de personas.</p>
        </section>
        <section class="contract-step-card" aria-labelledby="contractStepTerms">
          <h3 id="contractStepTerms"><span class="contract-step-number">3</span>¿Qué acordaron?</h3>
          <label class="proposal-big-label" for="contractObjeto">Objeto del contrato</label>
          <textarea id="contractObjeto" class="proposal-brief" rows="4" maxlength="2000" placeholder="Ej.: Diseño de identidad visual para una cafetería: logotipo, paleta de colores y manual de marca.">${esc(c.objeto)}</textarea>
          <div class="proposal-chips" aria-label="Ejemplos">${CONTRACT_EXAMPLES.map((example, index) => `<button type="button" class="proposal-example is-small" data-contract-fill="${index}">${esc(example.label)}</button>`).join("")}</div>
          <div class="proposal-two" data-contract-price-row ${c.contractType === "confidencialidad" ? "hidden" : ""}>
            <div><label for="contractPrice">Precio acordado</label><div class="contract-money"><span aria-hidden="true">Bs</span><input id="contractPrice" inputmode="decimal" maxlength="20" value="${esc(c.price)}" placeholder="0,00"></div></div>
            <div><label for="contractPaymentTerms">Forma de pago</label><input id="contractPaymentTerms" maxlength="500" value="${esc(c.paymentTerms)}" placeholder="Ej.: 50% a la firma y 50% a la entrega"></div>
          </div>
          <div class="proposal-two">
            <div><label for="contractPlazo">${c.contractType === "confidencialidad" ? "Vigencia" : "Plazo"}</label><input id="contractPlazo" maxlength="300" value="${esc(c.plazo)}" placeholder="Ej.: 30 días calendario"></div>
            <div><label for="contractCity">Ciudad</label><select id="contractCity"><option value="">Elige la ciudad</option>${cityOptions.map((city) => `<option ${city === c.city ? "selected" : ""}>${esc(city)}</option>`).join("")}</select></div>
          </div>
          <details class="proposal-more" ${c.extra ? "open" : ""}>
            <summary>Más condiciones (opcional)</summary>
            <div class="proposal-more-body"><label for="contractExtra">Algo más que el contrato deba decir</label><textarea id="contractExtra" rows="3" maxlength="1000" placeholder="Ej.: incluye dos rondas de cambios; el cliente entrega los textos.">${esc(c.extra)}</textarea></div>
          </details>
          <p class="proposal-hint">El precio que escribas aquí va tal cual al contrato, con su monto en letras. Si escribes montos en otros campos, te pediremos confirmarlos.</p>
        </section>
        <section class="contract-step-card" aria-labelledby="contractStepOrder">
          <h3 id="contractStepOrder"><span class="contract-step-number">4</span>¿Quién firma primero?</h3>
          <div class="ui-pills" role="radiogroup" aria-label="Orden de firma">
            ${uiPill({ group: "contractOrder", value: "merchant_first", label: "Yo primero (recomendado)", checked: c.signingOrder === "merchant_first" })}
            ${uiPill({ group: "contractOrder", value: "customer_first", label: "Mi cliente primero", checked: c.signingOrder === "customer_first" })}
          </div>
          <p class="proposal-hint">Firmar primero le muestra a tu cliente que el contrato ya está aprobado por ti.</p>
        </section>
        ${noticeHtml()}
        <div class="proposal-problems" role="alert" data-contract-composer-error ${c.error ? "" : "hidden"}>${c.error ? `<p>${esc(c.error)}</p>${c.noAi ? "<p>Puedes empezar con nuestra plantilla y completarla tú.</p>" : ""}` : ""}</div>
        <div class="proposal-generating" data-contract-generating ${c.generating ? "" : "hidden"} aria-live="polite">
          <span class="proposal-orb" aria-hidden="true"></span><p data-contract-generating-text>${esc(GENERATING[0])}</p>
          <small>Suele tardar entre 10 y 30 segundos.</small>
        </div>
      </div>
      <footer class="proposal-sheet-foot">
        <button type="button" class="proposal-link-button" data-contract-blank>Usar plantilla sin IA</button>
        <button type="button" class="primary proposal-submit" data-contract-generate ${c.generating ? "disabled" : ""}>${ICON.spark}<span>${c.generating ? "Redactando…" : "Redactar con IA"}</span></button>
      </footer>`;
  }

  function readComposer() {
    const value = (id) => panel.querySelector(`#${id}`)?.value ?? "";
    Object.assign(composer, {
      contractType: panel.querySelector('input[name="contractType"]:checked')?.value || composer.contractType,
      objeto: value("contractObjeto"),
      price: value("contractPrice"),
      paymentTerms: value("contractPaymentTerms"),
      plazo: value("contractPlazo"),
      city: value("contractCity"),
      extra: value("contractExtra"),
      signingOrder: panel.querySelector('input[name="contractOrder"]:checked')?.value || "merchant_first",
      customerName: value("contractCustomerName"),
      customerDocument: value("contractCustomerDocument"),
      customerEmail: value("contractCustomerEmail"),
      customerPhone: value("contractCustomerPhone"),
      customerAddress: value("contractCustomerAddress"),
    });
  }

  function composerError(message, noAi = false) {
    composer.error = message;
    composer.noAi = noAi;
    const box = panel.querySelector("[data-contract-composer-error]");
    box.hidden = !message;
    box.innerHTML = message ? `<p>${esc(message)}</p>${noAi ? "<p>Puedes empezar con nuestra plantilla y completarla tú.</p>" : ""}` : "";
    if (message) box.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }

  function validComposer() {
    readComposer();
    if (composer.objeto.trim().length < 5 && !composer.fromProposalId) {
      composerError("Cuéntanos de qué trata el contrato (el objeto).");
      panel.querySelector("#contractObjeto").focus();
      return false;
    }
    const email = composer.customerEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { composerError("Revisa el correo del cliente."); panel.querySelector("#contractCustomerEmail").focus(); return false; }
    composerError(null);
    return true;
  }

  async function generate({ ai }) {
    if (!composer || composer.generating) return;
    if (!validComposer()) return;
    const current = composer;
    current.generating = true;
    const button = panel.querySelector("[data-contract-generate]");
    button.disabled = true;
    button.querySelector("span").textContent = ai ? "Redactando…" : "Creando…";
    const box = panel.querySelector("[data-contract-generating]");
    if (ai) {
      box.hidden = false;
      let step = 0;
      generatingTimer = setInterval(() => {
        step = Math.min(step + 1, GENERATING.length - 1);
        const text = panel.querySelector("[data-contract-generating-text]");
        if (text) text.textContent = GENERATING[step];
      }, 2200);
    }
    try {
      const doc = await deps.api(storePath("/contracts/draft"), { method: "POST", body: JSON.stringify(draftPayload(current, { ai })) });
      if (composer !== current) return;
      clearInterval(generatingTimer);
      composer = null;
      openEditor(doc, { ai });
      void load();
    } catch (error) {
      if (composer !== current) return;
      clearInterval(generatingTimer);
      current.generating = false;
      box.hidden = true;
      button.disabled = false;
      button.querySelector("span").textContent = "Redactar con IA";
      composerError(errorText(error), error?.status === 503);
    }
  }

  // ── editor ───────────────────────────────────────────────────────────

  function openEditor(doc, { ai = false } = {}) {
    editor = {
      ...editorFromDocument(doc),
      ai: ai || (doc.events || []).some((event) => event.type === "ai_drafted" && event.data?.model),
      signing: doc.signing || null,
      saveState: "saved",
      regenerating: -1,
      sending: false,
    };
    if (!editor.validUntil) editor.validUntil = dueDateFromPreset(30);
    openSheet(editorHtml(), "editor", { wide: true });
  }

  const PARTY_FIELDS = {
    merchant: [
      ["legalName", "Nombre o razón social", 160, "Ej.: Estudio Andino SRL"],
      ["document", "NIT o CI", 40, "Ej.: 1020304050"],
      ["representative", "Representante legal (si es empresa)", 120, "Opcional"],
      ["representativeDocument", "CI del representante", 40, "Opcional"],
      ["address", "Domicilio", 240, "Calle, número, zona y ciudad"],
      ["email", "Correo para notificaciones", 254, "correo@tuempresa.bo"],
    ],
    customer: [
      ["name", "Nombre o razón social", 120, "Ej.: Café Illimani SRL"],
      ["document", "CI o NIT", 24, "Ej.: 4455667 LP"],
      ["email", "Correo (le llega el código para firmar)", 254, "correo@cliente.com"],
      ["phone", "WhatsApp", 40, "7000 0000"],
      ["address", "Domicilio", 240, "Calle, número, zona y ciudad"],
      ["representative", "Representante legal (si es empresa)", 120, "Opcional"],
    ],
  };
  const partyValue = (party, field) => {
    if (party === "merchant") return editor.meta.merchantParty[field] ?? "";
    if (["name", "document", "email", "phone"].includes(field)) return editor.customer[field] ?? "";
    return editor.meta.customerParty[field] ?? "";
  };
  function setPartyValue(party, field, value) {
    if (party === "merchant") editor.meta.merchantParty[field] = value;
    else if (["name", "document", "email", "phone"].includes(field)) editor.customer[field] = value;
    else editor.meta.customerParty[field] = value;
  }
  const customerSigned = () => Boolean(editor?.signing?.customerSigned);

  function partyCardHtml(party) {
    const info = typeInfo(editor.meta.contractType);
    const label = party === "merchant" ? info.merchant : info.customer;
    return `<fieldset class="contract-party-card" data-contract-party-card="${party}">
      <legend><small>${esc(label)}</small>${party === "merchant" ? "Tú" : "Tu cliente"}</legend>
      ${PARTY_FIELDS[party].map(([field, text, max, placeholder]) => {
        const id = `contractParty-${party}-${field}`;
        const value = partyValue(party, field);
        const optional = /Opcional/.test(placeholder) || field === "phone";
        const missing = !optional && !String(value).trim();
        return `<div class="contract-field${missing ? " is-missing" : ""}"><label for="${id}">${esc(text)}</label>
          <input id="${id}" data-party="${party}" data-field="${field}" maxlength="${max}" value="${esc(value)}" placeholder="${esc(placeholder)}"${field === "email" ? ' type="email" inputmode="email"' : ""}${field === "phone" ? ' type="tel" inputmode="tel"' : ""}${missing ? ' aria-invalid="true"' : ""}></div>`;
      }).join("")}
    </fieldset>`;
  }

  function editorHtml() {
    const e = editor;
    const sent = e.currentVersion > 0;
    const info = typeInfo(e.meta.contractType);
    const pending = contractPending(e);
    const cityOptions = [...new Set([...BOLIVIA_CITIES, ...(e.meta.city && !BOLIVIA_CITIES.includes(e.meta.city) ? [e.meta.city] : [])])];
    const deadlinePreset = DEADLINES.find((option) => dueDateInputValue(dueDateFromPreset(option.days)) === dueDateInputValue(e.validUntil))?.id || "custom";
    const primaryLabel = sent ? "Enviar versión nueva" : e.meta.signingOrder === "customer_first" ? "Enviar para firma" : "Firmar y enviar";
    return `<header class="proposal-sheet-head is-editor">
        <div class="proposal-editor-title">
          <p class="proposal-kicker">${esc(sent ? `${e.numberLabel} · editando` : `${info.title} · borrador`)} <span class="proposal-save-state" data-contract-save-state>${saveLabel()}</span></p>
          <label for="contractTitle" class="sr-only">Título del contrato</label>
          <input id="contractTitle" class="proposal-title-input" maxlength="200" value="${esc(e.title)}" placeholder="Título del contrato">
        </div>
        <button type="button" class="proposal-icon-button" data-contract-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body" data-contract-editor>
        <h2 id="contractSheetTitle" class="sr-only">Editar contrato</h2>
        ${e.ai ? `<p class="proposal-ai-notice" data-contract-ai-notice role="note">${ICON.spark}<span><strong>Borrador generado con IA — revísalo; no es asesoría legal.</strong> YAPI no inventa datos ni montos: lo que falta queda marcado para que lo completes.</span></p>` : ""}
        ${info.notice ? `<p class="contract-type-notice">${ICON.alert}<span>${esc(info.notice)}</span></p>` : ""}
        <section class="proposal-step" aria-labelledby="contractPartiesTitle">
          <h3 id="contractPartiesTitle">Las partes</h3>
          <p class="proposal-hint">Así aparecerán en la cláusula de partes y en las firmas. Quedan fijas en la versión que se firma.</p>
          <div class="contract-parties-grid">${partyCardHtml("merchant")}${partyCardHtml("customer")}</div>
        </section>
        <section class="proposal-step" aria-labelledby="contractSettingsTitle">
          <h3 id="contractSettingsTitle">Ciudad y firma</h3>
          <div class="proposal-two">
            <div><label for="contractEditCity">Ciudad del contrato</label><select id="contractEditCity" data-contract-city><option value="">Elige la ciudad</option>${cityOptions.map((city) => `<option ${city === e.meta.city ? "selected" : ""}>${esc(city)}</option>`).join("")}</select></div>
            <div><span class="contract-label">Quién firma primero</span>
              <div class="ui-pills" role="radiogroup" aria-label="Orden de firma">
                ${uiPill({ group: "contractEditOrder", value: "merchant_first", label: "Yo primero", checked: e.meta.signingOrder === "merchant_first" })}
                ${uiPill({ group: "contractEditOrder", value: "customer_first", label: "Mi cliente", checked: e.meta.signingOrder === "customer_first" })}
              </div></div>
          </div>
          <span class="contract-label">Tu cliente puede firmar hasta</span>
          <div class="ui-pills" role="radiogroup" aria-label="Plazo para firmar">
            ${DEADLINES.map((option) => uiPill({ group: "contractDeadline", value: option.id, label: option.label, checked: deadlinePreset === option.id })).join("")}
            ${uiPill({ group: "contractDeadline", value: "custom", label: "Otra fecha", checked: deadlinePreset === "custom" })}
          </div>
          <div class="proposal-custom-date" data-contract-custom-date ${deadlinePreset === "custom" ? "" : "hidden"}><label for="contractDeadlineDate">Firmar antes de</label><input id="contractDeadlineDate" type="date" min="${esc(dueDateInputValue(new Date().toISOString()))}" value="${esc(dueDateInputValue(e.validUntil))}"></div>
          <p class="proposal-hint" data-contract-deadline-hint>${esc(e.validUntil ? `Tu cliente puede firmar hasta el ${longDate(e.validUntil)}.` : "Elige una fecha")}</p>
        </section>
        <section class="proposal-step" aria-labelledby="contractClausesTitle">
          <h3 id="contractClausesTitle">Cláusulas</h3>
          <div class="contract-clauses" data-contract-clauses>
            <div class="contract-fixed-clause"><span class="contract-ordinal">PRIMERA</span><strong>Partes</strong><small>Se escribe sola con los datos de arriba.</small></div>
            ${e.clauses.map((clause, index) => clauseHtml(clause, index)).join("")}
            <div class="contract-fixed-clause"><span class="contract-ordinal">${esc(ordinal(e.clauses.length + 2))}</span><strong>Domicilios y firma electrónica</strong><small>Se escribe sola: correos de notificación y firma con código por correo.</small></div>
          </div>
          <button type="button" class="proposal-secondary contract-add-clause" data-contract-add-clause>${ICON.plus}Agregar cláusula</button>
        </section>
        ${noticeHtml()}
        <div class="proposal-pending" data-contract-pending role="status" ${pending.length ? "" : "hidden"}>${pendingHtml()}</div>
      </div>
      <footer class="proposal-sheet-foot">
        <div class="proposal-total-line"><small>${esc(signingLine({ ...e, status: sent ? e.status : "DRAFT" }) || "Borrador")}</small>
          <button type="button" class="proposal-pending-jump" data-contract-pending-jump ${pending.length ? "" : "hidden"}>${esc(pendingSummary(pending))} ›</button></div>
        <button type="button" class="primary proposal-submit" data-contract-send ${pending.length || customerSigned() ? "disabled" : ""}>${ICON.pen}<span>${esc(primaryLabel)}</span></button>
      </footer>`;
  }

  const ORDINALS = ["PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA"];
  function ordinal(position) {
    if (position >= 1 && position <= 10) return ORDINALS[position - 1];
    if (position > 10 && position < 20) return `DÉCIMA ${ORDINALS[position - 11]}`;
    if (position === 20) return "VIGÉSIMA";
    return `CLÁUSULA ${position}`;
  }

  function clauseHtml(clause, index) {
    const count = editor.clauses.length;
    const regenerating = editor.regenerating === index;
    const confirm = clause.text.includes(CONFIRM_AMOUNT_MARKER);
    const missing = /\{\{[^{}]+\}\}/.test(clause.text.split(CONFIRM_AMOUNT_MARKER).join("") + clause.title);
    return `<section class="contract-clause-card${regenerating ? " is-busy" : ""}${confirm || missing ? " needs-data" : ""}" data-contract-clause="${index}">
      <div class="contract-clause-head">
        <span class="contract-ordinal" aria-hidden="true">${esc(ordinal(index + 2))}</span>
        <label class="sr-only" for="contractClauseTitle${index}">Título de la cláusula ${index + 2}</label>
        <input id="contractClauseTitle${index}" data-clause-field="title" class="proposal-block-title" maxlength="300" value="${esc(clause.title)}" placeholder="Título de la cláusula">
      </div>
      <label class="sr-only" for="contractClauseText${index}">Texto de la cláusula «${esc(clause.title || index + 2)}»</label>
      <textarea id="contractClauseText${index}" data-clause-field="text" rows="${Math.min(10, Math.max(3, Math.ceil((clause.text || "").length / 80) + 1))}" aria-label="Texto de la cláusula «${esc(clause.title || String(index + 2))}»" placeholder="Escribe la cláusula">${esc(clause.text)}</textarea>
      ${confirm ? `<p class="proposal-line-flag is-confirm" data-contract-confirm-flag>${ICON.alert}<span>Este monto lo tomamos de lo que escribiste — confírmalo</span>
        <button type="button" class="proposal-secondary is-small" data-contract-confirm-amount>${ICON.check}Confirmar monto</button></p>` : ""}
      ${missing ? `<p class="proposal-line-flag" data-contract-missing-flag>${ICON.alert}<span>Completa lo marcado con {{…}} — YAPI no lo inventa.</span></p>` : ""}
      <div class="proposal-block-tools">
        <button type="button" class="proposal-tool is-ai" data-contract-regenerate ${regenerating ? "disabled" : ""}>${ICON.spark}<span>${regenerating ? "Reescribiendo…" : "Regenerar con IA"}</span></button>
        <span class="proposal-tools-spacer"></span>
        <button type="button" class="proposal-tool" data-contract-move="-1" aria-label="Subir cláusula" ${index === 0 ? "disabled" : ""}>${ICON.up}</button>
        <button type="button" class="proposal-tool" data-contract-move="1" aria-label="Bajar cláusula" ${index === count - 1 ? "disabled" : ""}>${ICON.down}</button>
        <button type="button" class="proposal-tool is-danger" data-contract-remove-clause aria-label="Quitar cláusula">${ICON.trash}</button>
      </div>
    </section>`;
  }

  function saveLabel() {
    return { saved: "Guardado", saving: "Guardando…", dirty: "Sin guardar", error: "No se pudo guardar", conflict: "Cambió en otro lado" }[editor?.saveState || "saved"];
  }

  function pendingHtml() {
    const rows = contractPending(editor);
    if (!rows.length) return "";
    return `<p><strong>${esc(pendingSummary(rows))} antes de enviar:</strong></p>
      <ul>${rows.map((row) => `<li><button type="button" class="proposal-link-button" data-contract-goto="${esc(row.where)}">${esc(row.label)}</button></li>`).join("")}</ul>`;
  }

  function refreshEditor() {
    if (!editor) return;
    const rows = contractPending(editor);
    const pending = panel.querySelector("[data-contract-pending]");
    if (pending) { pending.hidden = !rows.length; pending.innerHTML = pendingHtml(); }
    const send = panel.querySelector("[data-contract-send]");
    if (send && !editor.sending) send.disabled = rows.length > 0 || customerSigned();
    const jump = panel.querySelector("[data-contract-pending-jump]");
    if (jump) { jump.hidden = !rows.length; jump.textContent = `${pendingSummary(rows)} ›`; }
    const hint = panel.querySelector("[data-contract-deadline-hint]");
    if (hint) hint.textContent = !editor.validUntil ? "Elige una fecha" : new Date(editor.validUntil).getTime() < Date.now() ? "Esa fecha ya pasó: elige una futura." : `Tu cliente puede firmar hasta el ${longDate(editor.validUntil)}.`;
    panel.querySelectorAll("[data-party]").forEach((input) => {
      const optional = /Opcional/.test(input.placeholder) || input.dataset.field === "phone";
      const missing = !optional && !input.value.trim();
      input.closest(".contract-field")?.classList.toggle("is-missing", missing);
      if (missing) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    });
  }

  function rerenderEditor(focus) {
    const scroller = panel.querySelector(".proposal-sheet-body");
    const top = scroller?.scrollTop ?? 0;
    panel.innerHTML = editorHtml();
    const body = panel.querySelector(".proposal-sheet-body");
    if (body) body.scrollTop = top;
    if (focus) panel.querySelector(focus)?.focus({ preventScroll: false });
  }

  function keepSheetInPlace() {
    panel.scrollTop = 0;
    requestAnimationFrame(() => { panel.scrollTop = 0; });
    setTimeout(() => { panel.scrollTop = 0; }, 450);
  }

  function markDirty() {
    if (!editor) return;
    editor.saveState = "dirty";
    const label = panel.querySelector("[data-contract-save-state]");
    if (label) label.textContent = saveLabel();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSave(), 700);
  }
  let saving = Promise.resolve(true);
  function flushSave() {
    clearTimeout(saveTimer);
    if (!editor || editor.saveState === "saved") return saving;
    const current = editor;
    const body = contractPayload(current);
    current.saveState = "saving";
    const label = panel.querySelector("[data-contract-save-state]");
    if (label) label.textContent = saveLabel();
    saving = saving.then(async () => {
      try {
        const headers = current.editTag ? { "if-match": `"${current.editTag}"` } : {};
        const saved = await deps.api(docPath(current.id), { method: "PATCH", body: JSON.stringify(body), headers });
        if (saved?.editTag) current.editTag = saved.editTag;
        if (current.saveState === "saving") current.saveState = "saved";
        return true;
      } catch (error) {
        if (error?.status === 409) {
          current.saveState = "conflict";
          void onEditConflict(current, error);
          return false;
        }
        current.saveState = "error";
        notify(errorText(error), "bad");
        return false;
      } finally {
        const el = editor === current ? panel.querySelector("[data-contract-save-state]") : null;
        if (el) el.textContent = saveLabel();
      }
    });
    return saving;
  }

  async function onEditConflict(current, error) {
    clearTimeout(saveTimer);
    let doc;
    try {
      doc = await deps.api(docPath(current.id));
    } catch (failure) {
      notify(errorText(failure), "bad");
      return;
    }
    if (editor !== current || layer.hidden) return;
    editor = null;
    sheetDoc = doc;
    const notice = doc.signing?.customerSigned
      ? "Tu cliente ya firmó esta versión mientras editabas. Esa es la que vale: fírmala o anúlala. Tus cambios sin enviar no se guardaron."
      : ["SIGNED", "VOIDED", "EXPIRED"].includes(doc.status)
        ? "Este contrato ya no se puede editar. Tus últimos cambios no se guardaron."
        : /pestaña|dispositivo/.test(error?.message || "")
          ? "Este contrato cambió en otra pestaña o dispositivo. Te mostramos la versión guardada; revisa y vuelve a editar."
          : errorText(error);
    openSheet(detailHtml(doc, notice), "detail");
    panel.dataset.docId = doc.id;
    void load();
  }

  async function regenerate(index) {
    if (!editor || editor.regenerating >= 0) return;
    const current = editor;
    await flushSave();
    if (editor !== current) return;
    current.regenerating = index;
    rerenderEditor();
    try {
      const result = await deps.api(contractPath(current.id, "/regenerate-clause"), { method: "POST", body: JSON.stringify({ index }) });
      if (editor !== current) return;
      current.clauses[index] = { title: result.block.title || current.clauses[index].title, text: result.block.text || "" };
      current.regenerating = -1;
      rerenderEditor(`[data-contract-clause="${index}"] [data-clause-field="text"]`);
      markDirty();
      notify("Cláusula reescrita. Revísala antes de enviar.");
    } catch (error) {
      if (editor !== current) return;
      current.regenerating = -1;
      rerenderEditor();
      notify(errorText(error), "bad");
    }
  }

  /** "Firmar y enviar" opens the merchant's signature; "Enviar para firma" sends right away. */
  async function onPrimary() {
    if (!editor || editor.sending) return;
    const rows = contractPending(editor);
    if (rows.length) { refreshEditor(); return; }
    if (!editor.validUntil || new Date(editor.validUntil).getTime() < Date.now()) { notify("Elige hasta cuándo se puede firmar.", "bad"); return; }
    if (editor.meta.signingOrder === "merchant_first") { openSigner(editor, { sendFirst: true }); return; }
    await sendContract(editor, { email: true });
  }

  async function sendContract(current, { email }) {
    current.sending = true;
    const button = panel.querySelector("[data-contract-send]");
    if (button) { button.disabled = true; button.querySelector("span").textContent = "Enviando…"; }
    current.saveState = current.saveState === "saved" ? "dirty" : current.saveState;
    const saved = await flushSave();
    try {
      if (!saved) throw new Error("No pudimos guardar tus cambios. Revisa tu conexión e intenta de nuevo.");
      const sent = await deps.api(docPath(current.id, "/send"), { method: "POST", body: JSON.stringify({ email }) });
      if (editor !== current) return null;
      editor = null;
      openShare(sent.document, { fresh: true, emailed: sent.emailed });
      void load();
      return sent;
    } catch (error) {
      if (editor !== current) return null;
      current.sending = false;
      if (button) { button.disabled = false; button.querySelector("span").textContent = current.currentVersion > 0 ? "Enviar versión nueva" : "Enviar para firma"; }
      notify(errorText(error), "bad");
      return null;
    }
  }

  // ── merchant signature ───────────────────────────────────────────────

  /** The merchant's signature sheet. `sendFirst`: the editor's contract is saved and sent before signing. */
  function openSigner(source, { sendFirst = false } = {}) {
    const meta = source.meta || editorFromDocument(source).meta;
    const info = typeInfo(meta.contractType);
    signer = { source, sendFirst, method: "TYPED", busy: false, name: meta.merchantParty.representative || meta.merchantParty.legalName || "", drawing: null, fromEditor: Boolean(source.clauses && sendFirst) };
    const pad = source;
    openSheet(`<header class="proposal-sheet-head">
        <div><p class="proposal-kicker">${ICON.pen}${esc(source.numberLabel && source.currentVersion ? source.numberLabel : "Tu firma")}</p><h2 id="contractSheetTitle">Firma como ${esc(info.merchant)}</h2></div>
        <button type="button" class="proposal-icon-button" data-contract-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body contract-signer" data-contract-signer>
        <p class="proposal-hint">${sendFirst ? "Firmas tú primero y luego le enviamos el contrato a tu cliente para que firme." : "Tu firma queda registrada con la versión que tu cliente ve."}</p>
        <label for="contractSignerName">Tu nombre completo</label>
        <input id="contractSignerName" maxlength="120" autocomplete="name" value="${esc(signer.name)}" data-autofocus>
        <div class="ui-tabs" role="tablist" aria-label="Cómo firmar">
          <button type="button" role="tab" class="ui-tab" aria-selected="true" data-contract-sign-method="TYPED">${icon("keyboard", { size: 16 })}Escribir</button>
          <button type="button" role="tab" class="ui-tab" aria-selected="false" data-contract-sign-method="DRAWN">${icon("pen-line", { size: 16 })}Dibujar</button>
        </div>
        <div class="contract-sign-typed" data-contract-sign-typed><span data-contract-sign-preview>${esc(signer.name || "Tu firma")}</span></div>
        <div class="contract-sign-draw" data-contract-sign-draw hidden>
          <canvas width="560" height="180" data-contract-sign-canvas aria-label="Dibuja tu firma"></canvas>
          <button type="button" class="proposal-link-button" data-contract-sign-clear>Borrar</button>
        </div>
        <p class="contract-sign-consent">Al firmar aceptas este contrato con firma electrónica simple. Guardamos tu nombre, tu usuario, la fecha y hora, tu IP y tu dispositivo, y la huella de la versión firmada.</p>
        <p class="proposal-problems" role="alert" data-contract-sign-error hidden></p>
      </div>
      <footer class="proposal-sheet-foot">
        <button type="button" class="proposal-link-button" data-contract-sign-back>${pad.clauses ? "Volver al contrato" : "Cancelar"}</button>
        <button type="button" class="primary proposal-submit" data-contract-sign-submit>${ICON.pen}<span>${sendFirst ? "Firmar y enviar" : "Firmar"}</span></button>
      </footer>`, "sign");
    bindSignatureCanvas();
  }

  function bindSignatureCanvas() {
    const canvas = panel.querySelector("[data-contract-sign-canvas]");
    if (!canvas) return;
    let context = null;
    let drawing = false;
    const ink = () => {
      if (!context) {
        context = canvas.getContext?.("2d") ?? null;
        if (context) { context.lineWidth = 2.6; context.lineCap = "round"; context.lineJoin = "round"; context.strokeStyle = "#0f2a4a"; }
      }
      return context;
    };
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width, y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height };
    };
    canvas.addEventListener("pointerdown", (event) => {
      if (!ink()) return;
      drawing = true;
      canvas.setPointerCapture?.(event.pointerId);
      const { x, y } = point(event);
      context.beginPath();
      context.moveTo(x, y);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing || !context) return;
      const { x, y } = point(event);
      context.lineTo(x, y);
      context.stroke();
      if (signer) signer.drawing = true;
    });
    const stop = () => { drawing = false; };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    panel.querySelector("[data-contract-sign-clear]")?.addEventListener("click", () => {
      context?.clearRect(0, 0, canvas.width, canvas.height);
      if (signer) signer.drawing = false;
    });
  }

  function signError(message) {
    const box = panel.querySelector("[data-contract-sign-error]");
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || "";
  }

  async function submitSignature() {
    if (!signer || signer.busy) return;
    const current = signer;
    const name = panel.querySelector("#contractSignerName").value.replace(/\s+/g, " ").trim();
    if (name.length < 3) { signError("Escribe tu nombre completo para firmar."); panel.querySelector("#contractSignerName").focus(); return; }
    let image = null;
    if (current.method === "DRAWN") {
      if (!current.drawing) { signError("Dibuja tu firma en el recuadro, o elige «Escribir»."); return; }
      image = panel.querySelector("[data-contract-sign-canvas]").toDataURL("image/png");
      if (image.length > 60_000) { signError("Tu firma dibujada es muy grande. Bórrala y dibújala más simple."); return; }
    }
    signError(null);
    current.busy = true;
    const button = panel.querySelector("[data-contract-sign-submit]");
    button.disabled = true;
    button.querySelector("span").textContent = current.sendFirst ? "Firmando y enviando…" : "Firmando…";
    try {
      let doc = current.source;
      if (current.sendFirst) {
        // Save, freeze the version (link only), sign it, then email the customer the link.
        if (editor === current.source) {
          editor.saveState = editor.saveState === "saved" ? "dirty" : editor.saveState;
          const saved = await flushSave();
          if (!saved) throw new Error("No pudimos guardar tus cambios. Revisa tu conexión e intenta de nuevo.");
        }
        const sent = await deps.api(docPath(doc.id, "/send"), { method: "POST", body: JSON.stringify({ email: false }) });
        doc = sent.document;
      }
      await deps.api(contractPath(doc.id, "/sign"), { method: "POST", body: JSON.stringify({ version: doc.currentVersion, name, method: current.method, ...(image && { image }) }) });
      let emailed = false;
      if (current.sendFirst && doc.customer?.email) {
        const again = await deps.api(docPath(doc.id, "/send"), { method: "POST", body: JSON.stringify({ email: true }) }).catch(() => null);
        emailed = Boolean(again?.emailed);
      }
      const detail = await deps.api(docPath(doc.id));
      editor = null;
      signer = null;
      void load();
      if (current.sendFirst) openShare(detail, { fresh: true, emailed, signed: true });
      else {
        sheetDoc = detail;
        openSheet(detailHtml(detail), "detail");
        panel.dataset.docId = detail.id;
        notify(detail.status === "SIGNED" ? "¡Contrato firmado por ambas partes! Les enviamos la copia a los dos." : "Firmaste el contrato.");
      }
    } catch (error) {
      current.busy = false;
      button.disabled = false;
      button.querySelector("span").textContent = current.sendFirst ? "Firmar y enviar" : "Firmar";
      signError(errorText(error));
    }
  }

  // ── share ────────────────────────────────────────────────────────────

  function previewLink(doc, className, inner) {
    return `<a class="${className}" ${doc.previewUrl ? `href="${esc(doc.previewUrl)}"` : 'aria-disabled="true" role="link"'} data-contract-preview-link target="_blank" rel="noopener">${inner}</a>`;
  }

  function openShare(doc, { fresh = false, emailed = false, signed = false } = {}) {
    sheetDoc = doc;
    const email = doc.customer?.email;
    const text = whatsAppContractMessage({ customerName: doc.customer?.name ?? null, storeName: storeName(), numberLabel: doc.numberLabel, title: doc.title, url: doc.publicUrl });
    openSheet(`<header class="proposal-sheet-head">
        <div>${fresh ? `<p class="proposal-success-mark" aria-hidden="true">${ICON.check}</p>` : ""}<h2 id="contractSheetTitle">${fresh ? (signed ? `Firmaste ${esc(doc.numberLabel)}` : `¡Contrato ${esc(doc.numberLabel)} enviado!`) : `Compartir ${esc(doc.numberLabel)}`}</h2>
          <p class="proposal-sub">${esc(doc.title)}${doc.customer?.name ? ` · ${esc(doc.customer.name)}` : ""}</p></div>
        <button type="button" class="proposal-icon-button" data-contract-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body" data-contract-share>
        <p class="proposal-hint">${emailed && email ? `Le enviamos a ${esc(email)} el enlace para revisar y firmar. ` : ""}Tu cliente abre el enlace, confirma un código que le llega a su correo y firma desde su teléfono. Te avisamos cuando firme.</p>
        <div class="proposal-share">
          <a class="proposal-share-option is-whatsapp" href="${esc(whatsAppShareUrl(doc.customer?.phone, text))}" target="_blank" rel="noopener noreferrer" data-contract-share-action="whatsapp" data-autofocus>
            <span class="proposal-share-icon">${ICON.whatsapp}</span><span><strong>WhatsApp</strong><small>${doc.customer?.phone ? `Abre el chat con ${esc(doc.customer.phone)}` : "Elige el chat al abrir WhatsApp"}</small></span></a>
          ${email ? `<button type="button" class="proposal-share-option" data-contract-share-action="email"><span class="proposal-share-icon">${ICON.mail}</span><span><strong>${emailed ? "Reenviar por correo" : "Enviar por correo"}</strong><small>A ${esc(email)}, con el PDF adjunto</small></span></button>` : ""}
          <button type="button" class="proposal-share-option" data-contract-share-action="copy"><span class="proposal-share-icon">${ICON.link}</span><span><strong>Copiar enlace</strong><small>Pégalo donde quieras</small></span></button>
          ${previewLink(doc, "proposal-share-option", `<span class="proposal-share-icon">${ICON.eye}</span><span><strong>Ver como cliente</strong><small>Abrirlo desde aquí no cuenta como vista</small></span>`)}
        </div>
        <p class="proposal-share-status" role="status" aria-live="polite" data-contract-share-status></p>
      </div>
      <footer class="proposal-sheet-foot"><button type="button" class="primary proposal-submit is-full" data-contract-close>Listo</button></footer>`, "share");
    panel.dataset.docId = doc.id;
  }

  async function onShareAction(button, event) {
    const doc = sheetDoc;
    if (!doc) return;
    const status = panel.querySelector("[data-contract-share-status]");
    const kind = button.dataset.contractShareAction;
    const record = (channel) => deps.api(docPath(doc.id, "/shared"), { method: "POST", body: JSON.stringify({ channel }) }).catch(() => {});
    if (kind === "whatsapp") { void record("whatsapp"); status.textContent = "Abrimos WhatsApp con el mensaje listo."; return; }
    if (kind === "copy") {
      event?.preventDefault();
      try {
        await navigator.clipboard.writeText(doc.publicUrl);
        status.textContent = "¡Enlace copiado!";
      } catch {
        window.prompt("Copia el enlace del contrato", doc.publicUrl);
      }
      void record("link");
      return;
    }
    button.disabled = true;
    try {
      const result = await deps.api(docPath(doc.id, "/send"), { method: "POST", body: JSON.stringify({ email: true }) });
      sheetDoc = { ...sheetDoc, ...result.document };
      status.textContent = result.emailed ? `Enviado a ${result.document.customer?.email}.` : "No pudimos enviar el correo. Compártelo por WhatsApp o copia el enlace.";
    } catch (error) {
      status.textContent = errorText(error);
    } finally {
      button.disabled = false;
    }
  }

  // ── detail ───────────────────────────────────────────────────────────

  async function openDetail(id) {
    const known = documents.find((row) => row.id === id);
    openSheet(`<header class="proposal-sheet-head"><div><h2 id="contractSheetTitle">${esc(known?.title || "Contrato")}</h2></div><button type="button" class="proposal-icon-button" data-contract-close aria-label="Cerrar">${ICON.close}</button></header><div class="proposal-sheet-body"><div class="proposals-skeleton" aria-busy="true">${"<span></span>".repeat(2)}</div></div>`, "detail");
    panel.dataset.docId = id;
    try {
      const doc = await deps.api(docPath(id));
      if (layer.hidden || panel.dataset.docId !== id || mode !== "detail") return;
      sheetDoc = doc;
      openSheet(detailHtml(doc), "detail");
      panel.dataset.docId = doc.id;
    } catch (error) {
      const body = panel.querySelector(".proposal-sheet-body");
      if (body) body.innerHTML = `<p class="proposals-error" role="alert">${esc(errorText(error))}</p>`;
    }
  }

  function signatureRow(label, who, signature, waiting) {
    return `<li class="${signature ? "is-signed" : waiting ? "is-next" : ""}">
      <span class="contract-signature-dot" aria-hidden="true">${signature ? ICON.check : waiting ? ICON.clock : ""}</span>
      <span><small>${esc(label)}</small><strong>${esc(who)}</strong></span>
      <em>${signature ? `Firmó ${esc(dateTime(signature.signedAt))}` : waiting ? "Le toca firmar" : "Pendiente"}</em>
    </li>`;
  }

  function detailHtml(doc, notice = "") {
    const now = new Date();
    const state = contractState(doc, now);
    const e = editorFromDocument(doc);
    const info = typeInfo(e.meta.contractType);
    const signing = doc.signing || {};
    const open = ["sent", "viewed", "signed_you", "signed_customer"].includes(state);
    const signed = state === "signed";
    const links = doc.publicUrl
      ? `${previewLink(doc, "proposal-secondary", `${ICON.eye}Ver como cliente`)}
         <a class="proposal-secondary" href="${esc(pdfUrl(doc.publicUrl, signed))}" target="_blank" rel="noopener" data-contract-pdf>${ICON.doc}${signed ? "Descargar PDF firmado" : "PDF"}</a>`
      : "";
    let actions = "";
    if (state === "draft") actions = `<button type="button" class="primary" data-contract-action="edit">Seguir editando</button><button type="button" class="proposal-secondary is-danger" data-contract-action="delete">Eliminar borrador</button>`;
    else if (open) {
      actions = `${signing.waitingFor === "merchant" ? `<button type="button" class="primary" data-contract-action="sign">${ICON.pen}Firmar ahora</button>` : ""}
        <button type="button" class="${signing.waitingFor === "merchant" ? "proposal-secondary" : "primary"}" data-contract-action="share">Compartir</button>
        ${signing.customerSigned ? "" : `<button type="button" class="proposal-secondary" data-contract-action="edit">Editar</button>`}${links}`;
    } else actions = `${signed ? "" : `<button type="button" class="primary" data-contract-action="duplicate">Duplicar</button>`}${links}${signed ? `<button type="button" class="proposal-secondary" data-contract-action="duplicate">Duplicar</button>` : ""}`;
    const progress = doc.currentVersion > 0 ? `<section class="contract-progress" data-contract-progress aria-label="Firmas">
        <ol>
          ${signatureRow(info.merchant, e.meta.merchantParty.legalName || storeName(), signing.merchant, signing.waitingFor === "merchant")}
          ${signatureRow(info.customer, doc.customer?.name || "Tu cliente", signing.customer, signing.waitingFor === "customer")}
        </ol>
        ${signed ? `<p class="proposal-hint">${ICON.lock} Firmado e inmutable. Los dos recibieron el PDF firmado con el registro de firma electrónica.</p>` : ""}
        ${signing.customerSigned && !signed ? `<p class="proposal-hint">Tu cliente ya firmó esta versión: fírmala para cerrarlo, o anúlala si ya no va.</p>` : ""}
      </section>` : "";
    const closedNote = state === "expired" ? `<p class="proposal-note is-closed">Venció sin todas las firmas. Duplícalo para enviarlo de nuevo con otra fecha.</p>` : state === "voided" ? `<p class="proposal-note is-closed">Anulado. Tu cliente ve que ya no se puede firmar.</p>` : "";
    const timeline = contractTimeline(doc.events || []).reverse();
    return `<header class="proposal-sheet-head">
        <div><p class="proposal-kicker">${esc(doc.numberLabel)} · ${esc(info.label)}</p><h2 id="contractSheetTitle">${esc(doc.title)}</h2></div>
        <button type="button" class="proposal-icon-button" data-contract-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body" data-contract-detail>
        <div class="proposal-detail-hero">
          <span class="proposal-chip contract-chip is-${state}" data-contract-chip>${esc(CONTRACT_STATE_LABEL[state])}</span>
          <strong class="proposal-detail-amount contract-detail-line">${esc(signingLine(doc) || CONTRACT_STATE_LABEL[state])}</strong>
          <p class="proposal-hint">${esc([doc.customer?.name || "Sin cliente", doc.validUntil && open ? `Firmar antes del ${longDate(doc.validUntil)}` : ""].filter(Boolean).join(" · "))}</p>
        </div>
        ${notice ? `<p class="proposal-note is-conflict" role="alert" data-contract-conflict>${ICON.alert}<span>${esc(notice)}</span></p>` : ""}
        ${progress}${closedNote}
        <div class="proposal-detail-actions">${actions}</div>
        <section class="proposal-detail-block" aria-labelledby="contractTimelineTitle">
          <h3 id="contractTimelineTitle">Historial</h3>
          <ol class="proposal-timeline">${timeline.map((entry) => `<li class="is-${entry.tone}"><span>${esc(entry.label)}</span><time datetime="${esc(entry.at)}">${esc(dateTime(entry.at))}</time></li>`).join("") || '<li class="is-neutral"><span>Sin movimientos todavía</span></li>'}</ol>
        </section>
        ${open ? `<div class="proposal-danger">
          <button type="button" class="proposal-link-button is-danger" data-contract-action="void-ask">Anular contrato</button>
          <div data-contract-void-confirm hidden><p>¿Anular ${esc(doc.numberLabel)}? Nadie podrá firmarlo${signing.customerSigned || signing.merchantSigned ? "; las firmas ya hechas quedan en el historial" : ""}.</p>
            <button type="button" class="proposal-secondary is-danger" data-contract-action="void">Sí, anular</button>
            <button type="button" class="proposal-secondary" data-contract-action="void-cancel">No, mantener</button></div>
        </div>` : ""}
      </div>`;
  }

  async function onDetailAction(button) {
    const doc = sheetDoc;
    if (!doc) return;
    const action = button.dataset.contractAction;
    if (action === "share") { openShare(doc); return; }
    if (action === "edit") { openEditor(doc); return; }
    if (action === "sign") { openSigner(doc); return; }
    if (action === "void-ask") { panel.querySelector("[data-contract-void-confirm]").hidden = false; button.hidden = true; panel.querySelector('[data-contract-action="void-cancel"]')?.focus(); return; }
    if (action === "void-cancel") { panel.querySelector("[data-contract-void-confirm]").hidden = true; const ask = panel.querySelector('[data-contract-action="void-ask"]'); ask.hidden = false; ask.focus(); return; }
    button.disabled = true;
    try {
      if (action === "duplicate") {
        const content = (doc.content || []).map((block) => ({ ...block }));
        const copy = await deps.api(storePath("/documents"), {
          method: "POST",
          body: JSON.stringify({
            kind: "CONTRACT",
            title: String(doc.title).slice(0, 190),
            ...(doc.customer?.name && { customerName: doc.customer.name }),
            ...(doc.customer?.email && { customerEmail: doc.customer.email }),
            ...(doc.customer?.phone && { customerPhone: doc.customer.phone }),
            ...(doc.customer?.document && { customerDocument: doc.customer.document }),
            content,
            validUntil: dueDateFromPreset(30),
          }),
        });
        notify("Copia creada como borrador.");
        openEditor(copy);
        void load();
        return;
      }
      if (action === "void") {
        await deps.api(docPath(doc.id, "/void"), { method: "POST", body: JSON.stringify({}) });
        notify(`${doc.numberLabel} anulado.`);
        void openDetail(doc.id);
        void load();
        return;
      }
      if (action === "delete") {
        await deps.api(docPath(doc.id), { method: "DELETE" });
        await closeSheet();
        notify("Borrador eliminado.");
        void load();
      }
    } catch (error) {
      notify(errorText(error), "bad");
    } finally {
      button.disabled = false;
    }
  }

  // ── sheet events ─────────────────────────────────────────────────────

  panel.addEventListener("submit", (event) => event.preventDefault());

  panel.addEventListener("input", (event) => {
    const target = event.target;
    if (mode === "composer" && composer) {
      if (target.id === "contractObjeto" && composer.error) composerError(null);
      return;
    }
    if (mode === "sign" && target.id === "contractSignerName") {
      const preview = panel.querySelector("[data-contract-sign-preview]");
      if (preview) preview.textContent = target.value.trim() || "Tu firma";
      return;
    }
    if (mode !== "editor" || !editor) return;
    if (target.id === "contractTitle") { editor.title = target.value; markDirty(); refreshEditor(); return; }
    if (target.dataset.party) { setPartyValue(target.dataset.party, target.dataset.field, target.value); markDirty(); refreshEditor(); return; }
    if (target.id === "contractDeadlineDate") { editor.validUntil = dueDateFromInput(target.value); markDirty(); refreshEditor(); return; }
    const clauseEl = target.closest("[data-contract-clause]");
    if (clauseEl && target.dataset.clauseField) {
      const clause = editor.clauses[Number(clauseEl.dataset.contractClause)];
      clause[target.dataset.clauseField] = target.value;
      refreshEditor();
      markDirty();
    }
  });

  panel.addEventListener("change", (event) => {
    const target = event.target;
    if (mode === "composer" && composer && target.name === "contractType") {
      readComposer();
      const scroller = panel.querySelector(".proposal-sheet-body");
      const top = scroller?.scrollTop ?? 0;
      panel.innerHTML = composerHtml();
      panel.querySelector(".proposal-sheet-body").scrollTop = top;
      panel.querySelector(`input[name="contractType"][value="${composer.contractType}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (mode !== "editor" || !editor) return;
    if (target.matches("[data-contract-city]")) { editor.meta.city = target.value; markDirty(); refreshEditor(); return; }
    if (target.name === "contractEditOrder") {
      editor.meta.signingOrder = target.value;
      const send = panel.querySelector("[data-contract-send] span");
      if (send && editor.currentVersion === 0) send.textContent = target.value === "customer_first" ? "Enviar para firma" : "Firmar y enviar";
      markDirty();
      return;
    }
    if (target.name === "contractDeadline") {
      const custom = panel.querySelector("[data-contract-custom-date]");
      if (custom) custom.hidden = target.value !== "custom";
      const preset = DEADLINES.find((option) => option.id === target.value);
      if (preset) editor.validUntil = dueDateFromPreset(preset.days);
      const date = panel.querySelector("#contractDeadlineDate");
      if (date) date.value = dueDateInputValue(editor.validUntil);
      markDirty();
      refreshEditor();
    }
  });

  panel.addEventListener("click", (event) => {
    const target = event.target;
    if (mode === "composer" && composer) {
      const fill = target.closest("[data-contract-fill]");
      if (fill) {
        readComposer();
        Object.assign(composer, { ...CONTRACT_EXAMPLES[Number(fill.dataset.contractFill)] });
        const top = panel.querySelector(".proposal-sheet-body")?.scrollTop ?? 0;
        panel.innerHTML = composerHtml();
        panel.querySelector(".proposal-sheet-body").scrollTop = top;
        panel.querySelector("#contractObjeto")?.focus({ preventScroll: true });
        return;
      }
      if (target.closest("[data-contract-generate]")) { void generate({ ai: true }); return; }
      if (target.closest("[data-contract-blank]")) { void generate({ ai: false }); return; }
    }
    if (mode === "sign" && signer) {
      const tab = target.closest("[data-contract-sign-method]");
      if (tab) {
        signer.method = tab.dataset.contractSignMethod;
        panel.querySelectorAll("[data-contract-sign-method]").forEach((other) => other.setAttribute("aria-selected", String(other === tab)));
        panel.querySelector("[data-contract-sign-typed]").hidden = signer.method !== "TYPED";
        panel.querySelector("[data-contract-sign-draw]").hidden = signer.method !== "DRAWN";
        return;
      }
      if (target.closest("[data-contract-sign-submit]")) { void submitSignature(); return; }
      if (target.closest("[data-contract-sign-back]")) {
        const source = signer.source;
        signer = null;
        if (editor === source) openSheet(editorHtml(), "editor", { wide: true });
        else { sheetDoc = source; openSheet(detailHtml(source), "detail"); panel.dataset.docId = source.id; }
        return;
      }
    }
    if (mode === "editor" && editor) {
      if (target.closest("[data-contract-send]")) { void onPrimary(); return; }
      const clauseEl = target.closest("[data-contract-clause]");
      const index = clauseEl ? Number(clauseEl.dataset.contractClause) : -1;
      if (target.closest("[data-contract-regenerate]") && index >= 0) { void regenerate(index); return; }
      const move = target.closest("[data-contract-move]");
      if (move && index >= 0) {
        const to = index + Number(move.dataset.contractMove);
        if (to < 0 || to >= editor.clauses.length) return;
        editor.clauses = moveClause(editor.clauses, index, Number(move.dataset.contractMove));
        rerenderEditor(`[data-contract-clause="${to}"] [data-contract-move="${move.dataset.contractMove}"]:not([disabled]), [data-contract-clause="${to}"] [data-clause-field="title"]`);
        markDirty();
        return;
      }
      if (target.closest("[data-contract-remove-clause]") && index >= 0) {
        editor.clauses.splice(index, 1);
        rerenderEditor();
        markDirty();
        notify("Cláusula quitada.");
        return;
      }
      if (target.closest("[data-contract-confirm-amount]") && index >= 0) {
        editor.clauses[index].text = confirmAmount(editor.clauses[index].text);
        rerenderEditor(`[data-contract-clause="${index}"] [data-clause-field="text"]`);
        markDirty();
        notify("Monto confirmado.");
        return;
      }
      if (target.closest("[data-contract-add-clause]")) {
        editor.clauses.push({ title: "", text: "" });
        rerenderEditor(`[data-contract-clause="${editor.clauses.length - 1}"] [data-clause-field="title"]`);
        markDirty();
        return;
      }
      if (target.closest("[data-contract-pending-jump]")) {
        const list = panel.querySelector("[data-contract-pending]");
        list?.scrollIntoView({ block: "center", behavior: "smooth" });
        list?.querySelector("[data-contract-goto]")?.focus({ preventScroll: true });
        keepSheetInPlace();
        return;
      }
      const goto = target.closest("[data-contract-goto]");
      if (goto) {
        const [kind, at] = goto.dataset.contractGoto.split(":");
        const selector = kind === "title" ? "#contractTitle"
          : kind === "city" ? "#contractEditCity"
            : kind === "merchant" || kind === "customer" ? `[data-party="${kind}"][data-field="${at}"]`
              : `[data-contract-clause="${at}"] [data-contract-confirm-amount], [data-contract-clause="${at}"] [data-clause-field="text"]`;
        const field = panel.querySelector(selector);
        field?.scrollIntoView({ block: "center", behavior: "smooth" });
        field?.focus({ preventScroll: true });
        keepSheetInPlace();
        return;
      }
    }
    const share = target.closest("[data-contract-share-action]");
    if (share) { void onShareAction(share, event); return; }
    const action = target.closest("[data-contract-action]");
    if (action) void onDetailAction(action);
  });

  return {
    /** The view became visible: load the active store's contracts. */
    show() {
      if (loadedFor !== deps.storeId()) { documents = []; summary = null; filter = "all"; }
      render();
      void load();
    },
    /** The active store changed. */
    reset() {
      documents = [];
      summary = null;
      loadedFor = null;
      filter = "all";
      void closeSheet();
      if (document.body.dataset.dashboardView === "contracts") void load();
    },
    /** "Crear contrato" on an accepted proposal: the composer, prefilled from the accepted version. */
    startFromProposal(proposal) {
      const scope = (proposal.content || []).find((block) => block.type === "list" && block.items?.length);
      openComposer({
        contractType: "servicios",
        objeto: `${proposal.title}${scope ? `: ${scope.items.join("; ")}` : ""}`.slice(0, 2000),
        price: proposal.totalAmount > 0 ? formatMoney(proposal.totalAmount).replace(/^Bs\s/, "") : "",
        customerName: proposal.customer?.name || "",
        customerEmail: proposal.customer?.email || "",
        customerPhone: proposal.customer?.phone || "",
        customerDocument: proposal.customer?.document || "",
        fromProposalId: proposal.id,
        fromProposalLabel: proposal.numberLabel,
      });
    },
  };
}
