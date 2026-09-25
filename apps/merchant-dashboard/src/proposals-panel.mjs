import { escapeHtml as esc } from "./html.mjs";
import { dueDateFromInput, dueDateFromPreset, dueDateInputValue, formatMoney, longDate, parseMoney, whatsAppShareUrl } from "./cobros.mjs";
import {
  EXAMPLE_PROMPTS,
  PROPOSAL_STATE_LABEL,
  blankProposalBlocks,
  editorItems,
  pendingData,
  proposalPayload,
  proposalState,
  proposalTimeline,
  proposalTotal,
  validityLine,
  whatsAppProposalMessage,
} from "./proposals.mjs";

/**
 * Documentos → Propuestas (D2): first-run guide, "describe the job" composer (YAPI drafts,
 * never inventing prices), a block editor with autosave, share, and the detail with the
 * customer's answer (changes requested / accepted → Crear cobro). Everything interpolated
 * into markup goes through esc().
 *
 * deps:
 *   api(path, options)  authenticated dashboard API call (throws Error with .status)
 *   storeId()           active store id
 *   store()             active store row ({ name, ... }) or null
 *   signedIn()          whether a merchant session exists
 *   apiBase()           the API base URL ("…/v1"), for the public PDF link
 *   openCobro(id)       switch to Cobros and open that cobro's share sheet
 */
export function mountProposalsPanel(deps) {
  const root = document.getElementById("proposalsRoot");
  if (!root) return { show() {}, reset() {} };

  const FILTERS = [
    { id: "all", label: "Todas" },
    { id: "open", label: "Abiertas" },
    { id: "accepted", label: "Aceptadas" },
    { id: "draft", label: "Borradores" },
    { id: "closed", label: "Cerradas" },
  ];
  const VALIDITY = [{ id: "7", label: "7 días", days: 7 }, { id: "15", label: "15 días", days: 15 }, { id: "30", label: "30 días", days: 30 }];
  const GENERATING = ["Leyendo tu catálogo…", "Entendiendo el trabajo…", "Escribiendo el alcance y el cronograma…", "Armando la inversión sin inventar precios…", "Dando los últimos toques…"];

  let documents = [];
  let summary = null;
  let loadedFor = null;
  let loading = false;
  let loadError = null;
  let filter = "all";
  let loadGeneration = 0;
  let catalog = null;
  let lastFocus = null;
  /** The sheet's current content: composer | editor | share | detail. */
  let mode = null;
  let composer = null;
  let editor = null;
  let sheetDoc = null;
  let saveTimer = null;
  let generatingTimer = null;

  // ── shell ────────────────────────────────────────────────────────────

  const layer = document.createElement("div");
  layer.className = "proposal-sheet-layer";
  layer.hidden = true;
  layer.innerHTML = `<div class="proposal-sheet-backdrop" data-proposal-close></div>
    <section class="proposal-sheet" data-proposal-sheet role="dialog" aria-modal="true" aria-labelledby="proposalSheetTitle" tabindex="-1"></section>`;
  document.body.appendChild(layer);
  const panel = layer.querySelector("[data-proposal-sheet]");

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
    sheetDoc = null;
    document.body.classList.remove("proposal-sheet-open");
    lastFocus?.focus?.({ preventScroll: true });
    if (hadEditor) void load();
  }
  layer.addEventListener("click", (event) => {
    if (event.target.closest("[data-proposal-close]")) void closeSheet();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || layer.hidden || event.defaultPrevented) return;
    if (mode === "composer" && composer?.generating) return;
    void closeSheet();
  });
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  panel.addEventListener("keydown", (event) => {
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
  const pdfUrl = (publicUrl) => `${deps.apiBase().replace(/\/$/, "")}/documents/public/${encodeURIComponent(tokenFrom(publicUrl))}/pdf`;
  const dateTime = (iso) => new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(iso));
  const ICON = {
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z"/><path d="M9 9.5c.3 2 2 3.8 4.2 4.5l1.1-1.1 1.7.8-.4 1.4c-3.3.3-6.8-3.1-6.6-6.4l1.4-.4.8 1.7z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  };

  // ── list ─────────────────────────────────────────────────────────────

  const listPath = () => `${storePath("/documents")}?kind=PROPOSAL&limit=100${filter !== "all" ? `&state=${filter}` : ""}`;

  async function load() {
    const storeId = deps.storeId();
    const generation = ++loadGeneration;
    if (!storeId || !deps.signedIn()) { documents = []; summary = null; loadedFor = null; render(); return; }
    loading = true;
    loadError = null;
    render();
    try {
      const [nextSummary, rows] = await Promise.all([deps.api(storePath("/proposals/summary")), deps.api(listPath())]);
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
    return `<div class="proposals-empty" data-proposals-empty>
      <span class="proposals-empty-icon" aria-hidden="true">${ICON.spark}</span>
      <h3>Propuestas profesionales en segundos</h3>
      <p>Cuéntale a YAPI qué trabajo vas a hacer y arma la propuesta por ti: alcance, entregables, cronograma e inversión con los precios de tu catálogo. Tú la revisas y tu cliente la acepta en línea.</p>
      <ol class="proposals-steps">
        <li><span>1</span><strong>Describe el trabajo</strong><small>En tus palabras, como se lo contarías a tu cliente.</small></li>
        <li><span>2</span><strong>YAPI arma la propuesta</strong><small>Tú editas cada sección; nunca inventa precios.</small></li>
        <li><span>3</span><strong>Tu cliente la acepta</strong><small>Por WhatsApp o correo, y la conviertes en cobro en un toque.</small></li>
      </ol>
      <p class="proposals-try">Prueba con un ejemplo:</p>
      <div class="proposals-examples">${EXAMPLE_PROMPTS.map((example, index) => `<button type="button" class="proposal-example" data-proposal-example="${index}">${ICON.spark}<span>${esc(example.label)}</span></button>`).join("")}</div>
      <button type="button" class="primary proposals-cta" data-proposal-new data-autofocus>Crear mi primera propuesta</button>
    </div>`;
  }

  function render() {
    if (!deps.storeId()) {
      root.innerHTML = `<div class="proposals-empty"><p>Crea o elige una tienda para empezar a enviar propuestas.</p></div>`;
      return;
    }
    if (loadError && !summary) {
      root.innerHTML = `<div class="proposals-error" role="alert"><p>${esc(loadError)}</p><button type="button" class="primary" data-proposals-retry>Intentar de nuevo</button></div>`;
      return;
    }
    if (!summary) {
      root.innerHTML = `<div class="proposals-skeleton" aria-busy="true" aria-label="Cargando propuestas">${"<span></span>".repeat(3)}</div>`;
      return;
    }
    if (!summary.counts?.all) { root.innerHTML = emptyHtml(); return; }
    const bob = (summary.totals || []).find((row) => row.currency === "BOB") || { open: 0, accepted30: 0 };
    const counts = summary.counts;
    const now = new Date();
    const emptyTab = { open: "No tienes propuestas esperando respuesta.", accepted: "Aún no te aceptaron una propuesta. ¡La primera está cerca!", draft: "No tienes borradores.", closed: "Nada vencido ni anulado.", all: "Aún no tienes propuestas." }[filter];
    const list = loading && !documents.length
      ? `<div class="proposals-skeleton" aria-busy="true">${"<span></span>".repeat(2)}</div>`
      : documents.length
        ? `<ul class="proposals-list">${documents.map((doc) => cardHtml(doc, now)).join("")}</ul>`
        : `<p class="proposals-filter-empty">${esc(emptyTab)}</p>`;
    root.innerHTML = `<div class="proposals-head">
        <dl class="proposals-summary">
          <div><dt>Esperando respuesta</dt><dd>${esc(formatMoney(bob.open))}<small>${Number(counts.open || 0)} ${counts.open === 1 ? "propuesta" : "propuestas"}${counts.changes ? ` · ${Number(counts.changes)} con cambios pedidos` : ""}</small></dd></div>
          <div class="is-good"><dt>Aceptadas · 30 días</dt><dd>${esc(formatMoney(bob.accepted30))}<small>${Number(counts.accepted || 0)} en total</small></dd></div>
        </dl>
        <button type="button" class="primary proposals-new" data-proposal-new>${ICON.spark}<span>Nueva propuesta con IA</span></button>
      </div>
      <div class="proposals-filters" role="tablist" aria-label="Filtrar propuestas">
        ${FILTERS.map((option) => `<button type="button" role="tab" aria-selected="${filter === option.id}" data-proposal-filter="${option.id}">${esc(option.label)}<span>${Number(counts[option.id] || 0)}</span></button>`).join("")}
      </div>
      ${list}`;
  }

  function cardHtml(doc, now) {
    const state = proposalState(doc, now);
    const who = doc.customer?.name || "Sin cliente";
    const line = [doc.numberLabel, who, validityLine(doc, now)].filter(Boolean).join(" · ");
    return `<li><button type="button" class="proposal-card" data-proposal-card data-proposal-id="${esc(doc.id)}">
      <span class="proposal-avatar" aria-hidden="true">${esc(initials(doc.customer?.name || doc.title))}</span>
      <span class="proposal-card-main"><strong>${esc(doc.title)}</strong><small>${esc(line)}</small></span>
      <span class="proposal-card-side">
        <strong>${doc.totalAmount ? esc(formatMoney(doc.totalAmount, doc.currency)) : "—"}</strong>
        <span class="proposal-chip is-${state}">${esc(PROPOSAL_STATE_LABEL[state])}</span>
      </span>
    </button></li>`;
  }

  root.addEventListener("click", (event) => {
    const example = event.target.closest("[data-proposal-example]");
    if (example) { openComposer(EXAMPLE_PROMPTS[Number(example.dataset.proposalExample)]); return; }
    if (event.target.closest("[data-proposal-new]")) { openComposer(); return; }
    if (event.target.closest("[data-proposals-retry]")) { void load(); return; }
    const tab = event.target.closest("[data-proposal-filter]");
    if (tab) {
      if (filter !== tab.dataset.proposalFilter) { filter = tab.dataset.proposalFilter; void loadTab(); }
      root.querySelector(`[data-proposal-filter="${filter}"]`)?.focus();
      return;
    }
    const card = event.target.closest("[data-proposal-card]");
    if (card) void openDetail(card.dataset.proposalId);
  });

  // ── composer ─────────────────────────────────────────────────────────

  function openComposer(example = null) {
    composer = { brief: example?.brief || "", tone: example?.tone || "formal", customerName: "", customerPhone: "", customerEmail: "", budgetHint: "", deadline: "", generating: false, error: null, noAi: false };
    openSheet(composerHtml(), "composer");
  }

  function composerHtml() {
    const c = composer;
    return `<header class="proposal-sheet-head">
        <div><p class="proposal-kicker">${ICON.spark}Nueva propuesta</p><h2 id="proposalSheetTitle">¿Qué trabajo vas a hacer?</h2></div>
        <button type="button" class="proposal-icon-button" data-proposal-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body proposal-composer" data-proposal-composer>
        <label class="proposal-big-label" for="proposalBrief">Describe el trabajo</label>
        <textarea id="proposalBrief" class="proposal-brief" rows="5" maxlength="2000" placeholder="Ej.: Diseño de logo e identidad para una cafetería que abre en noviembre, con tarjetas y plantillas para Instagram." data-autofocus>${esc(c.brief)}</textarea>
        <p class="proposal-hint">Cuéntalo como se lo contarías a tu cliente. YAPI usa los precios de tu catálogo y los que escribas aquí; lo demás queda marcado para que lo completes.</p>
        <div class="proposal-chips" aria-label="Ejemplos">${EXAMPLE_PROMPTS.map((example, index) => `<button type="button" class="proposal-example is-small" data-proposal-fill="${index}">${esc(example.label)}</button>`).join("")}</div>
        <details class="proposal-more" ${c.customerName || c.budgetHint || c.deadline ? "open" : ""}>
          <summary>Más detalles (opcional)</summary>
          <div class="proposal-more-body">
            <div class="proposal-two">
              <div><label for="proposalCustomerName">Nombre del cliente</label><input id="proposalCustomerName" maxlength="120" autocomplete="off" value="${esc(c.customerName)}" placeholder="Ej.: Café Aroma"></div>
              <div><label for="proposalCustomerPhone">WhatsApp del cliente</label><input id="proposalCustomerPhone" type="tel" inputmode="tel" maxlength="40" value="${esc(c.customerPhone)}" placeholder="7000 0000"></div>
            </div>
            <div><label for="proposalCustomerEmail">Correo del cliente</label><input id="proposalCustomerEmail" type="email" inputmode="email" maxlength="254" value="${esc(c.customerEmail)}" placeholder="opcional"></div>
            <div><label for="proposalBudget">Presupuesto o precios que ya tienes</label><input id="proposalBudget" maxlength="200" value="${esc(c.budgetHint)}" placeholder="Ej.: el letrero cuesta Bs 800"></div>
            <div><label for="proposalDeadline">Fecha límite</label><input id="proposalDeadline" maxlength="120" value="${esc(c.deadline)}" placeholder="Ej.: antes del 15 de noviembre"></div>
          </div>
        </details>
        <fieldset class="proposal-tone"><legend>Tono</legend>
          <label class="proposal-pill"><input type="radio" name="proposalTone" value="formal" ${c.tone === "formal" ? "checked" : ""}><span>Formal</span></label>
          <label class="proposal-pill"><input type="radio" name="proposalTone" value="cercano" ${c.tone === "cercano" ? "checked" : ""}><span>Cercano</span></label>
        </fieldset>
        <div class="proposal-problems" role="alert" data-proposal-composer-error ${c.error ? "" : "hidden"}>${c.error ? `<p>${esc(c.error)}</p>${c.noAi ? "<p>Puedes empezar con la plantilla de siempre y completarla tú.</p>" : ""}` : ""}</div>
        <div class="proposal-generating" data-proposal-generating ${c.generating ? "" : "hidden"} aria-live="polite">
          <span class="proposal-orb" aria-hidden="true"></span><p data-proposal-generating-text>${esc(GENERATING[0])}</p>
          <small>Suele tardar entre 10 y 30 segundos.</small>
        </div>
      </div>
      <footer class="proposal-sheet-foot">
        <button type="button" class="proposal-link-button" data-proposal-blank>Empezar sin IA</button>
        <button type="button" class="primary proposal-submit" data-proposal-generate ${c.generating ? "disabled" : ""}>${ICON.spark}<span>${c.generating ? "Creando…" : "Crear borrador con IA"}</span></button>
      </footer>`;
  }

  function readComposer() {
    const value = (id) => panel.querySelector(`#${id}`)?.value ?? "";
    Object.assign(composer, {
      brief: value("proposalBrief"),
      customerName: value("proposalCustomerName"),
      customerPhone: value("proposalCustomerPhone"),
      customerEmail: value("proposalCustomerEmail"),
      budgetHint: value("proposalBudget"),
      deadline: value("proposalDeadline"),
      tone: panel.querySelector('input[name="proposalTone"]:checked')?.value || "formal",
    });
  }

  function composerError(message, noAi = false) {
    composer.error = message;
    composer.noAi = noAi;
    const box = panel.querySelector("[data-proposal-composer-error]");
    box.hidden = !message;
    box.innerHTML = message ? `<p>${esc(message)}</p>${noAi ? "<p>Puedes empezar con la plantilla de siempre y completarla tú.</p>" : ""}` : "";
  }

  async function generate() {
    if (!composer || composer.generating) return;
    readComposer();
    const brief = composer.brief.trim();
    if (brief.length < 10) { composerError("Cuéntanos un poco más del trabajo (al menos 10 caracteres)."); panel.querySelector("#proposalBrief").focus(); return; }
    const email = composer.customerEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { composerError("Revisa el correo del cliente."); panel.querySelector("#proposalCustomerEmail").focus(); return; }
    composerError(null);
    const current = composer;
    current.generating = true;
    const button = panel.querySelector("[data-proposal-generate]");
    button.disabled = true;
    button.querySelector("span").textContent = "Creando…";
    const box = panel.querySelector("[data-proposal-generating]");
    box.hidden = false;
    let step = 0;
    generatingTimer = setInterval(() => {
      step = Math.min(step + 1, GENERATING.length - 1);
      const text = panel.querySelector("[data-proposal-generating-text]");
      if (text) text.textContent = GENERATING[step];
    }, 2200);
    const payload = {
      brief,
      tone: current.tone,
      ...(current.customerName.trim() && { customerName: current.customerName.trim() }),
      ...(current.customerPhone.trim() && { customerPhone: current.customerPhone.trim() }),
      ...(email && { customerEmail: email.toLowerCase() }),
      ...(current.budgetHint.trim() && { budgetHint: current.budgetHint.trim() }),
      ...(current.deadline.trim() && { deadline: current.deadline.trim() }),
    };
    try {
      const doc = await deps.api(storePath("/proposals/draft"), { method: "POST", body: JSON.stringify(payload) });
      if (composer !== current) return;
      clearInterval(generatingTimer);
      composer = null;
      openEditor(doc, { ai: true });
      void load();
    } catch (error) {
      if (composer !== current) return;
      clearInterval(generatingTimer);
      current.generating = false;
      box.hidden = true;
      button.disabled = false;
      button.querySelector("span").textContent = "Crear borrador con IA";
      composerError(errorText(error), error?.status === 503);
    }
  }

  async function startBlank() {
    if (composer) readComposer();
    const c = composer || {};
    const title = (c.brief || "").trim().split(/\n/)[0].slice(0, 120) || "Nueva propuesta";
    try {
      const doc = await deps.api(storePath("/documents"), {
        method: "POST",
        body: JSON.stringify({
          kind: "PROPOSAL",
          title,
          ...(c.customerName?.trim() && { customerName: c.customerName.trim() }),
          ...(c.customerPhone?.trim() && { customerPhone: c.customerPhone.trim() }),
          ...(c.customerEmail?.trim() && { customerEmail: c.customerEmail.trim().toLowerCase() }),
          content: blankProposalBlocks(),
          validUntil: dueDateFromPreset(15),
        }),
      });
      composer = null;
      openEditor(doc, { ai: false });
      void load();
    } catch (error) {
      if (composer) composerError(errorText(error));
      else notify(errorText(error), "bad");
    }
  }

  // ── editor ───────────────────────────────────────────────────────────

  function openEditor(doc, { ai = false } = {}) {
    const validUntil = doc.validUntil || dueDateFromPreset(15);
    editor = {
      id: doc.id,
      numberLabel: doc.numberLabel,
      status: doc.status,
      currentVersion: doc.currentVersion || 0,
      ai: ai || (doc.events || []).some((event) => event.type === "ai_drafted"),
      title: doc.title || "",
      customer: { name: doc.customer?.name || "", email: doc.customer?.email || "", phone: doc.customer?.phone || "" },
      items: editorItems(doc.items || []),
      blocks: (Array.isArray(doc.content) ? doc.content : []).map((block) => ({ type: block.type, title: block.title || "", text: block.text || "", items: [...(block.items || [])] })),
      validUntil,
      validPreset: "custom",
      showCatalog: false,
      catalogQuery: "",
      saveState: "saved",
      regenerating: -1,
      sending: false,
    };
    const matching = VALIDITY.find((option) => dueDateInputValue(dueDateFromPreset(option.days)) === dueDateInputValue(validUntil));
    if (matching) editor.validPreset = matching.id;
    openSheet(editorHtml(), "editor", { wide: true });
    void loadCatalog();
  }

  function editorHtml() {
    const e = editor;
    const sent = e.currentVersion > 0;
    const investmentIndex = e.blocks.findIndex((block) => /inversi/i.test(block.title));
    return `<header class="proposal-sheet-head is-editor">
        <div class="proposal-editor-title">
          <p class="proposal-kicker">${esc(sent ? `${e.numberLabel} · editando` : "Propuesta · borrador")} <span class="proposal-save-state" data-proposal-save-state>${saveLabel()}</span></p>
          <label for="proposalTitle" class="sr-only">Título de la propuesta</label>
          <input id="proposalTitle" class="proposal-title-input" maxlength="200" value="${esc(e.title)}" placeholder="Título de la propuesta">
        </div>
        <button type="button" class="proposal-icon-button" data-proposal-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body" data-proposal-editor>
        <h2 id="proposalSheetTitle" class="sr-only">Editar propuesta</h2>
        ${e.ai ? `<p class="proposal-ai-notice" data-proposal-ai-notice role="note">${ICON.spark}<span><strong>Borrador generado con IA — revísalo antes de enviarlo.</strong> YAPI no inventa precios: los que faltan quedan marcados para que los completes.</span></p>` : ""}
        <section class="proposal-step" aria-labelledby="proposalCustomerTitle">
          <h3 id="proposalCustomerTitle">Para quién es</h3>
          <div class="proposal-three">
            <div><label for="proposalEditName">Nombre del cliente</label><input id="proposalEditName" data-customer="name" maxlength="120" value="${esc(e.customer.name)}" placeholder="Ej.: Café Aroma"></div>
            <div><label for="proposalEditPhone">WhatsApp</label><input id="proposalEditPhone" data-customer="phone" type="tel" inputmode="tel" maxlength="40" value="${esc(e.customer.phone)}" placeholder="7000 0000"></div>
            <div><label for="proposalEditEmail">Correo</label><input id="proposalEditEmail" data-customer="email" type="email" inputmode="email" maxlength="254" value="${esc(e.customer.email)}" placeholder="opcional"></div>
          </div>
        </section>
        <div class="proposal-blocks" data-proposal-blocks>${e.blocks.map((block, index) => blockHtml(block, index, index === investmentIndex)).join("")}</div>
        ${investmentIndex < 0 ? `<section class="proposal-step">${itemsSectionHtml()}</section>` : ""}
        <div class="proposal-add-section">
          <span>Agregar sección:</span>
          <button type="button" class="proposal-secondary" data-proposal-add-block="paragraph">${ICON.plus}Párrafo</button>
          <button type="button" class="proposal-secondary" data-proposal-add-block="list">${ICON.plus}Lista</button>
          <button type="button" class="proposal-secondary" data-proposal-add-block="clause">${ICON.plus}Cláusula</button>
        </div>
        <section class="proposal-step" aria-labelledby="proposalValidityTitle">
          <h3 id="proposalValidityTitle">Válida por</h3>
          <div class="proposal-pills" role="radiogroup" aria-label="Validez">
            ${VALIDITY.map((option) => `<label class="proposal-pill"><input type="radio" name="proposalValidity" value="${option.id}" ${e.validPreset === option.id ? "checked" : ""}><span>${esc(option.label)}</span></label>`).join("")}
            <label class="proposal-pill"><input type="radio" name="proposalValidity" value="custom" ${e.validPreset === "custom" ? "checked" : ""}><span>Otra fecha</span></label>
          </div>
          <div class="proposal-custom-date" ${e.validPreset === "custom" ? "" : "hidden"}><label for="proposalValidDate">Válida hasta</label><input id="proposalValidDate" type="date" value="${esc(dueDateInputValue(e.validUntil))}"></div>
          <p class="proposal-hint" data-proposal-valid-hint>${esc(validHint())}</p>
        </section>
        <div class="proposal-pending" data-proposal-pending role="status" ${pendingData(e).length ? "" : "hidden"}>${pendingHtml()}</div>
      </div>
      <footer class="proposal-sheet-foot">
        <div class="proposal-total-line"><small>Inversión total</small><strong data-proposal-total>${esc(formatMoney(proposalTotal(e.items)))}</strong></div>
        <button type="button" class="primary proposal-submit" data-proposal-send ${pendingData(e).length ? "disabled" : ""}>${sent ? "Enviar versión nueva" : "Enviar propuesta"}</button>
      </footer>`;
  }

  function saveLabel() {
    return { saved: "Guardado", saving: "Guardando…", dirty: "Sin guardar", error: "No se pudo guardar" }[editor?.saveState || "saved"];
  }

  function validHint() {
    if (!editor.validUntil) return "Elige una fecha";
    if (new Date(editor.validUntil).getTime() < Date.now()) return "Esa fecha ya pasó: elige una futura.";
    return `Tu cliente puede aceptarla hasta el ${longDate(editor.validUntil)}.`;
  }

  function blockHtml(block, index, withItems) {
    const count = editor.blocks.length;
    const label = block.title?.trim() || `Sección ${index + 1}`;
    const typeLabel = { paragraph: "Párrafo", list: "Lista", clause: "Cláusula", heading: "Título" }[block.type] || "Sección";
    const body = block.type === "list"
      ? `<label class="sr-only" for="proposalBlockItems${index}">Puntos de «${esc(label)}»</label>
         <textarea id="proposalBlockItems${index}" data-block-field="items" rows="${Math.max(3, block.items.length + 1)}" aria-label="Puntos de «${esc(label)}»" placeholder="Un punto por línea">${esc(block.items.join("\n"))}</textarea>
         <p class="proposal-hint">Un punto por línea${/cronograma/i.test(block.title) ? " · por ejemplo: Semana 1 — Bocetos" : ""}.</p>`
      : `<label class="sr-only" for="proposalBlockText${index}">Texto de «${esc(label)}»</label>
         <textarea id="proposalBlockText${index}" data-block-field="text" rows="${Math.min(8, Math.max(3, Math.ceil((block.text || "").length / 70) + 1))}" aria-label="Texto de «${esc(label)}»" placeholder="Escribe esta sección">${esc(block.text)}</textarea>`;
    const regenerating = editor.regenerating === index;
    return `<section class="proposal-block is-${esc(block.type)}${regenerating ? " is-busy" : ""}" data-proposal-block="${index}">
      <div class="proposal-block-head">
        <span class="proposal-block-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        <label class="sr-only" for="proposalBlockTitle${index}">Título de la sección ${index + 1}</label>
        <input id="proposalBlockTitle${index}" data-block-field="title" class="proposal-block-title" maxlength="300" value="${esc(block.title)}" aria-label="Título de la sección ${index + 1}" placeholder="Título de la sección">
        <span class="proposal-block-type">${esc(typeLabel)}</span>
      </div>
      ${body}
      ${withItems ? itemsSectionHtml() : ""}
      <div class="proposal-block-tools">
        <button type="button" class="proposal-tool is-ai" data-proposal-regenerate ${regenerating ? "disabled" : ""}>${ICON.spark}<span>${regenerating ? "Reescribiendo…" : "Regenerar con IA"}</span></button>
        <span class="proposal-tools-spacer"></span>
        <button type="button" class="proposal-tool" data-proposal-move="-1" aria-label="Subir sección" ${index === 0 ? "disabled" : ""}>${ICON.up}</button>
        <button type="button" class="proposal-tool" data-proposal-move="1" aria-label="Bajar sección" ${index === count - 1 ? "disabled" : ""}>${ICON.down}</button>
        <button type="button" class="proposal-tool is-danger" data-proposal-remove-block aria-label="Quitar sección">${ICON.trash}</button>
      </div>
    </section>`;
  }

  function itemsSectionHtml() {
    return `<div class="proposal-items" data-proposal-items-box>
      <p class="proposal-items-title">Ítems de la inversión</p>
      <div data-proposal-items>${itemsHtml()}</div>
      <div class="proposal-item-actions">
        <button type="button" class="proposal-secondary" data-proposal-add-line>${ICON.plus}Agregar línea</button>
        <button type="button" class="proposal-secondary" data-proposal-catalog aria-expanded="${editor.showCatalog}">Desde tu catálogo</button>
      </div>
      <div class="proposal-catalog" data-proposal-catalog-panel ${editor.showCatalog ? "" : "hidden"}>${catalogHtml()}</div>
    </div>`;
  }

  function itemsHtml() {
    if (!editor.items.length) return `<p class="proposal-hint">Sin ítems todavía. Agrega lo que vas a cobrar.</p>`;
    return editor.items.map((item, index) => {
      const missing = item.description.trim() && !((item.unitAmount ?? 0) > 0);
      return `<div class="proposal-line${missing ? " needs-price" : ""}" data-proposal-line="${index}">
        <input class="proposal-line-desc" data-line-field="description" maxlength="480" value="${esc(item.description)}" placeholder="Producto o servicio" aria-label="Descripción de la línea ${index + 1}">
        <div class="proposal-line-qty" role="group" aria-label="Cantidad de la línea ${index + 1}">
          <button type="button" data-proposal-qty="-1" aria-label="Menos">−</button>
          <input data-line-field="quantity" inputmode="numeric" value="${esc(item.quantity)}" aria-label="Cantidad de la línea ${index + 1}">
          <button type="button" data-proposal-qty="1" aria-label="Más">+</button>
        </div>
        <div class="proposal-line-price"><span aria-hidden="true">Bs</span><input data-line-field="price" inputmode="decimal" value="${esc(item.priceText)}" placeholder="0,00" aria-label="Precio de la línea ${index + 1}"${missing ? ' aria-invalid="true"' : ""}></div>
        <button type="button" class="proposal-icon-button is-small" data-proposal-remove-line aria-label="Quitar la línea ${index + 1}">${ICON.close}</button>
        ${missing ? `<p class="proposal-line-flag" data-proposal-line-flag>${ICON.alert}Falta el precio — YAPI no lo inventa. Escríbelo aquí.</p>` : ""}
      </div>`;
    }).join("");
  }

  async function loadCatalog() {
    if (catalog?.storeId === deps.storeId()) return;
    try {
      const rows = await deps.api(storePath("/payment_links"));
      catalog = { storeId: deps.storeId(), rows: (Array.isArray(rows) ? rows : []).filter((row) => row.status !== "ARCHIVED" && Number.isInteger(row.amount) && row.amount > 0) };
    } catch {
      catalog = { storeId: deps.storeId(), rows: [] };
    }
    const target = panel.querySelector("[data-proposal-catalog-panel]");
    if (target && editor) target.innerHTML = catalogHtml();
  }

  function catalogHtml() {
    if (!catalog) return `<p class="proposal-hint">Cargando tu catálogo…</p>`;
    if (!catalog.rows.length) return `<p class="proposal-hint">Aún no tienes productos con precio. Escribe la línea a mano.</p>`;
    const query = (editor?.catalogQuery || "").toLowerCase();
    const rows = catalog.rows.filter((row) => !query || String(row.name).toLowerCase().includes(query)).slice(0, 30);
    return `<label for="proposalCatalogSearch" class="sr-only">Buscar en tu catálogo</label>
      <input id="proposalCatalogSearch" data-proposal-catalog-search placeholder="Buscar producto" value="${esc(editor?.catalogQuery || "")}">
      <ul class="proposal-catalog-list">${rows.map((row) => `<li><button type="button" data-proposal-product="${esc(row.id)}"><span>${esc(row.name)}</span><strong>${esc(formatMoney(row.amount, row.currency))}</strong></button></li>`).join("") || '<li class="proposal-hint">Sin resultados</li>'}</ul>`;
  }

  function pendingHtml() {
    const rows = pendingData(editor);
    if (!rows.length) return "";
    return `<p><strong>${rows.length === 1 ? "Falta 1 dato" : `Faltan ${rows.length} datos`} antes de enviar:</strong></p>
      <ul>${rows.map((row) => `<li><button type="button" class="proposal-link-button" data-proposal-goto="${esc(row.where)}">${esc(row.label)}${row.token === "{{precio}}" ? "" : ` · ${esc(row.token)}`}</button></li>`).join("")}</ul>`;
  }

  /** Totals, pending data, the send button and line flags, without re-rendering what the merchant is typing in. */
  function refreshEditor() {
    if (!editor) return;
    const total = panel.querySelector("[data-proposal-total]");
    if (total) total.textContent = formatMoney(proposalTotal(editor.items));
    const pending = panel.querySelector("[data-proposal-pending]");
    const rows = pendingData(editor);
    if (pending) { pending.hidden = !rows.length; pending.innerHTML = pendingHtml(); }
    const send = panel.querySelector("[data-proposal-send]");
    if (send && !editor.sending) send.disabled = rows.length > 0;
    const hint = panel.querySelector("[data-proposal-valid-hint]");
    if (hint) hint.textContent = validHint();
  }

  function refreshLine(index) {
    const line = panel.querySelector(`[data-proposal-line="${index}"]`);
    const item = editor?.items[index];
    if (!line || !item) return;
    const missing = Boolean(item.description.trim()) && !((item.unitAmount ?? 0) > 0);
    line.classList.toggle("needs-price", missing);
    const price = line.querySelector('[data-line-field="price"]');
    if (missing) price.setAttribute("aria-invalid", "true"); else price.removeAttribute("aria-invalid");
    const flag = line.querySelector("[data-proposal-line-flag]");
    if (!missing) flag?.remove();
    else if (!flag) line.insertAdjacentHTML("beforeend", `<p class="proposal-line-flag" data-proposal-line-flag>${ICON.alert}Falta el precio — YAPI no lo inventa. Escríbelo aquí.</p>`);
  }

  function rerenderItems() {
    const box = panel.querySelector("[data-proposal-items]");
    if (box) box.innerHTML = itemsHtml();
    refreshEditor();
  }

  function rerenderBlocks(focus) {
    const scroller = panel.querySelector(".proposal-sheet-body");
    const top = scroller?.scrollTop ?? 0;
    panel.innerHTML = editorHtml();
    const body = panel.querySelector(".proposal-sheet-body");
    if (body) body.scrollTop = top;
    if (focus) panel.querySelector(focus)?.focus({ preventScroll: false });
  }

  // Autosave: every change is PATCHed after a short pause; closing or sending flushes it.
  function markDirty() {
    if (!editor) return;
    editor.saveState = "dirty";
    const label = panel.querySelector("[data-proposal-save-state]");
    if (label) label.textContent = saveLabel();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSave(), 700);
  }
  let saving = Promise.resolve(true);
  function flushSave() {
    clearTimeout(saveTimer);
    if (!editor || editor.saveState === "saved") return saving;
    const current = editor;
    const body = proposalPayload(current);
    current.saveState = "saving";
    const label = panel.querySelector("[data-proposal-save-state]");
    if (label) label.textContent = saveLabel();
    saving = saving.then(async () => {
      try {
        await deps.api(docPath(current.id), { method: "PATCH", body: JSON.stringify(body) });
        if (current.saveState === "saving") current.saveState = "saved";
        return true;
      } catch (error) {
        current.saveState = "error";
        notify(errorText(error), "bad");
        return false;
      } finally {
        const el = editor === current ? panel.querySelector("[data-proposal-save-state]") : null;
        if (el) el.textContent = saveLabel();
      }
    });
    return saving;
  }

  async function regenerate(index) {
    if (!editor || editor.regenerating >= 0) return;
    const current = editor;
    const block = current.blocks[index];
    current.regenerating = index;
    rerenderBlocks();
    try {
      const body = { block: block.type === "list" ? { type: "list", ...(block.title && { title: block.title }), items: block.items.filter((item) => item.trim()) } : { type: block.type, ...(block.title && { title: block.title }), text: block.text } };
      const result = await deps.api(docPath(current.id, "/regenerate-section"), { method: "POST", body: JSON.stringify(body) });
      if (editor !== current) return;
      const next = result.block || {};
      current.blocks[index] = { type: block.type, title: block.title, text: next.text ?? "", items: [...(next.items || [])] };
      current.regenerating = -1;
      rerenderBlocks(`[data-proposal-block="${index}"] [data-block-field]:not([data-block-field="title"])`);
      markDirty();
      notify("Sección reescrita. Revísala antes de enviar.");
    } catch (error) {
      if (editor !== current) return;
      current.regenerating = -1;
      rerenderBlocks();
      notify(errorText(error), "bad");
    }
  }

  async function sendProposal() {
    if (!editor || editor.sending) return;
    if (pendingData(editor).length) { refreshEditor(); return; }
    if (!editor.customer.name.trim()) {
      notify("¿Para quién es? Escribe el nombre del cliente.", "bad");
      panel.querySelector("#proposalEditName")?.focus();
      return;
    }
    if (!editor.validUntil || new Date(editor.validUntil).getTime() < Date.now()) {
      notify("Elige hasta cuándo es válida la propuesta.", "bad");
      return;
    }
    const current = editor;
    current.sending = true;
    const button = panel.querySelector("[data-proposal-send]");
    button.disabled = true;
    button.textContent = "Enviando…";
    current.saveState = current.saveState === "saved" ? "dirty" : current.saveState;
    const saved = await flushSave();
    try {
      if (!saved) throw new Error("No pudimos guardar tus cambios. Revisa tu conexión e intenta de nuevo.");
      const sent = await deps.api(docPath(current.id, "/send"), { method: "POST", body: JSON.stringify({ email: false }) });
      if (editor !== current) return;
      editor = null;
      openShare(sent.document, { fresh: true });
      void load();
    } catch (error) {
      if (editor !== current) return;
      current.sending = false;
      button.disabled = false;
      button.textContent = current.currentVersion > 0 ? "Enviar versión nueva" : "Enviar propuesta";
      notify(errorText(error), "bad");
    }
  }

  // ── share ────────────────────────────────────────────────────────────

  function shareText(doc) {
    return whatsAppProposalMessage({ customerName: doc.customer?.name ?? null, storeName: storeName(), numberLabel: doc.numberLabel, title: doc.title, total: doc.totalAmount, currency: doc.currency, validUntil: doc.validUntil, url: doc.publicUrl });
  }
  function previewLink(doc, className, inner) {
    return `<a class="${className}" ${doc.previewUrl ? `href="${esc(doc.previewUrl)}"` : 'aria-disabled="true" role="link"'} data-proposal-preview-link target="_blank" rel="noopener">${inner}</a>`;
  }

  function openShare(doc, { fresh = false } = {}) {
    sheetDoc = doc;
    const email = doc.customer?.email;
    openSheet(`<header class="proposal-sheet-head">
        <div>${fresh ? `<p class="proposal-success-mark" aria-hidden="true">${ICON.check}</p>` : ""}<h2 id="proposalSheetTitle">${fresh ? `¡Propuesta ${esc(doc.numberLabel)} lista!` : `Compartir ${esc(doc.numberLabel)}`}</h2>
          <p class="proposal-sub">${esc(doc.title)}${doc.totalAmount ? ` · ${esc(formatMoney(doc.totalAmount, doc.currency))}` : ""}${doc.customer?.name ? ` · ${esc(doc.customer.name)}` : ""}</p></div>
        <button type="button" class="proposal-icon-button" data-proposal-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body">
        <p class="proposal-hint">${fresh ? "Mándasela a tu cliente: la abre en su teléfono, la acepta o te pide cambios, y tú lo ves aquí." : "Tu cliente siempre ve la última versión enviada."}</p>
        <div class="proposal-share">
          <a class="proposal-share-option is-whatsapp" href="${esc(whatsAppShareUrl(doc.customer?.phone, shareText(doc)))}" target="_blank" rel="noopener noreferrer" data-proposal-share-action="whatsapp" data-autofocus>
            <span class="proposal-share-icon">${ICON.whatsapp}</span><span><strong>WhatsApp</strong><small>${doc.customer?.phone ? `Abre el chat con ${esc(doc.customer.phone)}` : "Elige el chat al abrir WhatsApp"}</small></span></a>
          ${email
            ? `<button type="button" class="proposal-share-option" data-proposal-share-action="email"><span class="proposal-share-icon">${ICON.mail}</span><span><strong>Enviar por correo</strong><small>A ${esc(email)}, con el PDF adjunto</small></span></button>`
            : `<div class="proposal-share-option is-form"><span class="proposal-share-icon">${ICON.mail}</span><span><strong>Correo</strong><small>Tu cliente no tiene correo guardado.</small><span class="proposal-inline"><label for="proposalShareEmail" class="sr-only">Correo del cliente</label><input id="proposalShareEmail" type="email" placeholder="correo@cliente.com"><button type="button" class="proposal-secondary" data-proposal-share-action="email-new">Enviar</button></span></span></div>`}
          <button type="button" class="proposal-share-option" data-proposal-share-action="copy"><span class="proposal-share-icon">${ICON.link}</span><span><strong>Copiar enlace</strong><small>Pégalo donde quieras: Instagram, Messenger, SMS…</small></span></button>
          ${previewLink(doc, "proposal-share-option", `<span class="proposal-share-icon">${ICON.eye}</span><span><strong>Ver como cliente</strong><small data-proposal-preview-hint>${doc.previewUrl ? "Abrirla desde aquí no cuenta como vista" : "Preparando la vista previa…"}</small></span>`)}
        </div>
        <p class="proposal-share-status" role="status" aria-live="polite" data-proposal-share-status></p>
      </div>
      <footer class="proposal-sheet-foot"><button type="button" class="primary proposal-submit is-full" data-proposal-close>Listo</button></footer>`, "share");
    panel.dataset.docId = doc.id;
    if (doc.previewUrl) return;
    deps.api(docPath(doc.id)).then((detail) => {
      if (panel.dataset.docId !== doc.id || mode !== "share" || !detail?.previewUrl) throw new Error("no preview");
      sheetDoc = { ...doc, ...detail };
      const link = panel.querySelector("[data-proposal-preview-link]");
      link.href = detail.previewUrl;
      link.removeAttribute("aria-disabled");
      link.removeAttribute("role");
      const hint = panel.querySelector("[data-proposal-preview-hint]");
      if (hint) hint.textContent = "Abrirla desde aquí no cuenta como vista";
    }).catch(() => {
      const hint = panel.querySelector("[data-proposal-preview-hint]");
      if (hint && panel.dataset.docId === doc.id) hint.textContent = "Ábrela desde el detalle de la propuesta.";
    });
  }

  async function onShareAction(button, event) {
    const doc = sheetDoc;
    if (!doc) return;
    const status = panel.querySelector("[data-proposal-share-status]");
    const kind = button.dataset.proposalShareAction;
    const record = (channel) => deps.api(docPath(doc.id, "/shared"), { method: "POST", body: JSON.stringify({ channel }) }).catch(() => {});
    if (kind === "whatsapp") { void record("whatsapp"); status.textContent = "Abrimos WhatsApp con el mensaje listo."; return; }
    if (kind === "copy") {
      event?.preventDefault();
      try {
        await navigator.clipboard.writeText(doc.publicUrl);
        status.textContent = "¡Enlace copiado!";
      } catch {
        window.prompt("Copia el enlace de la propuesta", doc.publicUrl);
      }
      void record("link");
      return;
    }
    button.disabled = true;
    try {
      if (kind === "email-new") {
        const input = panel.querySelector("#proposalShareEmail");
        const email = input.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = "Revisa el correo."; input.focus(); return; }
        await deps.api(docPath(doc.id), { method: "PATCH", body: JSON.stringify({ customerEmail: email }) });
      }
      const result = await deps.api(docPath(doc.id, "/send"), { method: "POST", body: JSON.stringify({ email: true }) });
      sheetDoc = { ...sheetDoc, ...result.document };
      status.textContent = result.emailed ? `Enviada a ${result.document.customer?.email}.` : "No pudimos enviar el correo. Compártela por WhatsApp o copia el enlace.";
      void load();
    } catch (error) {
      status.textContent = errorText(error);
    } finally {
      button.disabled = false;
    }
  }

  // ── detail ───────────────────────────────────────────────────────────

  async function openDetail(id) {
    const known = documents.find((row) => row.id === id);
    openSheet(`<header class="proposal-sheet-head"><div><h2 id="proposalSheetTitle">${esc(known?.title || "Propuesta")}</h2></div><button type="button" class="proposal-icon-button" data-proposal-close aria-label="Cerrar">${ICON.close}</button></header><div class="proposal-sheet-body"><div class="proposals-skeleton" aria-busy="true">${"<span></span>".repeat(2)}</div></div>`, "detail");
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

  function detailHtml(doc) {
    const now = new Date();
    const state = proposalState(doc, now);
    const events = doc.events || [];
    const lastChanges = [...events].reverse().find((event) => event.type === "changes_requested");
    const accepted = events.find((event) => event.type === "accepted");
    const cobro = events.find((event) => event.type === "cobro_created");
    const editable = ["draft", "sent", "viewed", "changes"].includes(state);
    const open = ["sent", "viewed", "changes"].includes(state);
    const links = doc.publicUrl
      ? `${previewLink(doc, "proposal-secondary", `${ICON.eye}Ver como cliente`)}
         <a class="proposal-secondary" href="${esc(pdfUrl(doc.publicUrl))}" target="_blank" rel="noopener">${ICON.doc}PDF</a>`
      : "";
    let actions = "";
    if (state === "draft") actions = `<button type="button" class="primary" data-proposal-action="edit">Seguir editando</button><button type="button" class="proposal-secondary is-danger" data-proposal-action="delete">Eliminar borrador</button>`;
    else if (open) actions = `<button type="button" class="primary" data-proposal-action="share">Compartir</button><button type="button" class="proposal-secondary" data-proposal-action="edit">Editar</button>${links}`;
    else actions = `<button type="button" class="${state === "accepted" ? "proposal-secondary" : "primary"}" data-proposal-action="duplicate">Duplicar</button>${links}`;
    const changesNote = state === "changes" && lastChanges
      ? `<div class="proposal-note is-changes" data-proposal-changes-note>
          <p class="proposal-note-title">${ICON.alert}<strong>${esc(lastChanges.data?.name || "Tu cliente")} pidió cambios</strong><small>${esc(dateTime(lastChanges.at))}</small></p>
          <blockquote>${esc(lastChanges.data?.message || "")}</blockquote>
          <div class="proposal-note-actions">
            <button type="button" class="primary" data-proposal-action="edit">Editar y reenviar</button>
            ${lastChanges.data?.email ? `<a class="proposal-secondary" href="mailto:${esc(lastChanges.data.email)}?subject=${encodeURIComponent(`Propuesta ${doc.numberLabel}`)}">${ICON.mail}Responder</a>` : ""}
          </div>
          <p class="proposal-hint">También está en tu Inbox. Tu cliente todavía puede aceptar esta versión.</p>
        </div>`
      : "";
    const acceptedNote = state === "accepted"
      ? `<div class="proposal-note is-accepted" data-proposal-accepted-note>
          <p class="proposal-note-title">${ICON.check}<strong>Aceptada por ${esc(accepted?.data?.name || "tu cliente")}</strong><small>${accepted ? esc(dateTime(accepted.at)) : ""}</small></p>
          <p class="proposal-hint">Constancia: ${esc(accepted?.data?.email || "")} aceptó la versión ${esc(accepted?.version || doc.currentVersion)}${accepted?.data?.sha256 ? ` (huella ${esc(String(accepted.data.sha256).slice(0, 12))})` : ""}.</p>
          <div class="proposal-note-actions">
            ${cobro
              ? `<button type="button" class="primary" data-proposal-action="open-cobro" data-cobro-id="${esc(cobro.data?.cobroId || "")}">Ver el cobro</button>`
              : `<button type="button" class="primary" data-proposal-action="cobro">Crear cobro</button>`}
          </div>
          ${cobro ? "" : `<p class="proposal-hint">Crea un cobro con estos mismos ítems y compártelo por WhatsApp: tu cliente paga con QR o tarjeta.</p>`}
        </div>`
      : "";
    const closedNote = state === "expired" ? `<p class="proposal-note is-closed">Venció sin respuesta. Duplícala para enviar una nueva con otra fecha.</p>` : state === "voided" ? `<p class="proposal-note is-closed">Anulada. Tu cliente ve que ya no está vigente.</p>` : "";
    const timeline = proposalTimeline(events).reverse();
    return `<header class="proposal-sheet-head">
        <div><p class="proposal-kicker">${esc(doc.numberLabel)}</p><h2 id="proposalSheetTitle">${esc(doc.title)}</h2></div>
        <button type="button" class="proposal-icon-button" data-proposal-close aria-label="Cerrar">${ICON.close}</button>
      </header>
      <div class="proposal-sheet-body">
        <div class="proposal-detail-hero">
          <span class="proposal-chip is-${state}">${esc(PROPOSAL_STATE_LABEL[state])}</span>
          <strong class="proposal-detail-amount">${doc.totalAmount ? esc(formatMoney(doc.totalAmount, doc.currency)) : "Sin monto"}</strong>
          <p class="proposal-hint">${esc([doc.customer?.name || "Sin cliente", validityLine(doc, now)].filter(Boolean).join(" · "))}</p>
        </div>
        ${changesNote}${acceptedNote}${closedNote}
        <div class="proposal-detail-actions">${actions}</div>
        <section class="proposal-detail-block" aria-label="Inversión">
          <ul class="proposal-detail-items">${(doc.items || []).map((item) => `<li><span>${esc(item.quantity)}× ${esc(String(item.description).replace(/\s*\{\{precio\}\}/, ""))}</span><strong>${item.unitAmount > 0 ? esc(formatMoney(item.amount, doc.currency)) : "Sin precio"}</strong></li>`).join("") || '<li><span>Sin ítems</span></li>'}</ul>
          <p class="proposal-detail-line is-total"><span>Total</span><strong>${esc(formatMoney(doc.totalAmount, doc.currency))}</strong></p>
        </section>
        <section class="proposal-detail-block" aria-labelledby="proposalTimelineTitle">
          <h3 id="proposalTimelineTitle">Historial</h3>
          <ol class="proposal-timeline">${timeline.map((entry) => `<li class="is-${entry.tone}"><span>${esc(entry.label)}</span><time datetime="${esc(entry.at)}">${esc(dateTime(entry.at))}</time></li>`).join("") || '<li class="is-neutral"><span>Sin movimientos todavía</span></li>'}</ol>
        </section>
        ${editable && doc.currentVersion > 0 ? `<div class="proposal-danger">
          <button type="button" class="proposal-link-button is-danger" data-proposal-action="void-ask">Anular propuesta</button>
          <div data-proposal-void-confirm hidden><p>¿Anular ${esc(doc.numberLabel)}? Tu cliente verá que ya no está vigente y no podrá aceptarla.</p>
            <button type="button" class="proposal-secondary is-danger" data-proposal-action="void">Sí, anular</button>
            <button type="button" class="proposal-secondary" data-proposal-action="void-cancel">No, mantener</button></div>
        </div>` : ""}
      </div>`;
  }

  async function onDetailAction(button) {
    const doc = sheetDoc;
    if (!doc) return;
    const action = button.dataset.proposalAction;
    if (action === "share") { openShare(doc); return; }
    if (action === "edit") { openEditor(doc); return; }
    if (action === "open-cobro") { const id = button.dataset.cobroId; await closeSheet(); if (id) deps.openCobro(id, { share: false }); return; }
    if (action === "void-ask") { panel.querySelector("[data-proposal-void-confirm]").hidden = false; button.hidden = true; panel.querySelector('[data-proposal-action="void-cancel"]')?.focus(); return; }
    if (action === "void-cancel") { panel.querySelector("[data-proposal-void-confirm]").hidden = true; const ask = panel.querySelector('[data-proposal-action="void-ask"]'); ask.hidden = false; ask.focus(); return; }
    button.disabled = true;
    try {
      if (action === "cobro") {
        button.textContent = "Creando el cobro…";
        const result = await deps.api(docPath(doc.id, "/cobro"), { method: "POST", body: JSON.stringify({}) });
        await closeSheet();
        void load();
        deps.openCobro(result.cobro.id, { share: true });
        return;
      }
      if (action === "duplicate") {
        const copy = await deps.api(storePath("/documents"), {
          method: "POST",
          body: JSON.stringify({
            kind: "PROPOSAL",
            title: String(doc.title).slice(0, 190),
            ...(doc.customer?.name && { customerName: doc.customer.name }),
            ...(doc.customer?.email && { customerEmail: doc.customer.email }),
            ...(doc.customer?.phone && { customerPhone: doc.customer.phone }),
            items: (doc.items || []).map(({ description, quantity, unitAmount, paymentLinkId }) => ({ description, quantity, unitAmount, ...(paymentLinkId && { paymentLinkId }) })),
            ...(doc.discountAmount ? { discountAmount: doc.discountAmount } : {}),
            content: doc.content || [],
            validUntil: dueDateFromPreset(15),
          }),
        });
        notify("Copia creada como borrador.");
        openEditor(copy);
        void load();
        return;
      }
      if (action === "void") {
        await deps.api(docPath(doc.id, "/void"), { method: "POST", body: JSON.stringify({}) });
        notify(`${doc.numberLabel} anulada.`);
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
      button.textContent = { cobro: "Crear cobro", duplicate: "Duplicar" }[action] || button.textContent;
    } finally {
      button.disabled = false;
    }
  }

  // ── sheet events ─────────────────────────────────────────────────────

  panel.addEventListener("submit", (event) => event.preventDefault());

  panel.addEventListener("input", (event) => {
    const target = event.target;
    if (mode === "composer" && composer) {
      if (target.id === "proposalBrief" && composer.error) composerError(null);
      return;
    }
    if (mode !== "editor" || !editor) return;
    if (target.id === "proposalTitle") { editor.title = target.value; markDirty(); refreshEditor(); return; }
    if (target.dataset.customer) { editor.customer[target.dataset.customer] = target.value; markDirty(); refreshEditor(); return; }
    if (target.id === "proposalValidDate") { editor.validUntil = dueDateFromInput(target.value); markDirty(); refreshEditor(); return; }
    if (target.matches("[data-proposal-catalog-search]")) {
      editor.catalogQuery = target.value;
      const list = panel.querySelector(".proposal-catalog-list");
      const holder = document.createElement("div");
      holder.innerHTML = catalogHtml();
      const fresh = holder.querySelector(".proposal-catalog-list");
      if (list && fresh) list.replaceWith(fresh);
      return;
    }
    const blockEl = target.closest("[data-proposal-block]");
    const line = target.closest("[data-proposal-line]");
    if (line) {
      const index = Number(line.dataset.proposalLine);
      const item = editor.items[index];
      if (target.dataset.lineField === "description") item.description = target.value;
      if (target.dataset.lineField === "quantity") item.quantity = Math.min(100000, Math.max(1, parseInt(target.value, 10) || 1));
      if (target.dataset.lineField === "price") { item.priceText = target.value; item.unitAmount = parseMoney(target.value); }
      refreshLine(index);
      refreshEditor();
      markDirty();
      return;
    }
    if (blockEl && target.dataset.blockField) {
      const block = editor.blocks[Number(blockEl.dataset.proposalBlock)];
      if (target.dataset.blockField === "title") block.title = target.value;
      if (target.dataset.blockField === "text") block.text = target.value;
      if (target.dataset.blockField === "items") block.items = target.value.split("\n");
      refreshEditor();
      markDirty();
    }
  });

  panel.addEventListener("change", (event) => {
    const target = event.target;
    if (mode !== "editor" || !editor) return;
    if (target.name === "proposalValidity") {
      editor.validPreset = target.value;
      const custom = panel.querySelector(".proposal-custom-date");
      if (custom) custom.hidden = target.value !== "custom";
      const preset = VALIDITY.find((option) => option.id === target.value);
      if (preset) editor.validUntil = dueDateFromPreset(preset.days);
      const date = panel.querySelector("#proposalValidDate");
      if (date) date.value = dueDateInputValue(editor.validUntil);
      markDirty();
      refreshEditor();
      return;
    }
    if (target.dataset.lineField === "price") {
      const item = editor.items[Number(target.closest("[data-proposal-line]").dataset.proposalLine)];
      if (item.unitAmount) { item.priceText = formatMoney(item.unitAmount).replace(/^Bs\s/, ""); target.value = item.priceText; }
    }
  });

  panel.addEventListener("keydown", (event) => {
    // Enter in a one-line field never submits or sends anything.
    if (event.key === "Enter" && event.target.matches("input")) event.preventDefault();
  });

  panel.addEventListener("click", (event) => {
    const target = event.target;
    // composer
    const fill = target.closest("[data-proposal-fill]");
    if (fill && composer) {
      const example = EXAMPLE_PROMPTS[Number(fill.dataset.proposalFill)];
      const brief = panel.querySelector("#proposalBrief");
      brief.value = example.brief;
      panel.querySelector(`input[name="proposalTone"][value="${example.tone}"]`).checked = true;
      composerError(null);
      brief.focus();
      return;
    }
    if (target.closest("[data-proposal-generate]")) { void generate(); return; }
    if (target.closest("[data-proposal-blank]")) { void startBlank(); return; }
    // editor
    if (mode === "editor" && editor) {
      if (target.closest("[data-proposal-send]")) { void sendProposal(); return; }
      const blockEl = target.closest("[data-proposal-block]");
      const index = blockEl ? Number(blockEl.dataset.proposalBlock) : -1;
      if (target.closest("[data-proposal-regenerate]") && index >= 0) { void regenerate(index); return; }
      const move = target.closest("[data-proposal-move]");
      if (move && index >= 0) {
        const to = index + Number(move.dataset.proposalMove);
        if (to < 0 || to >= editor.blocks.length) return;
        const [block] = editor.blocks.splice(index, 1);
        editor.blocks.splice(to, 0, block);
        rerenderBlocks(`[data-proposal-block="${to}"] [data-proposal-move="${move.dataset.proposalMove}"]:not([disabled]), [data-proposal-block="${to}"] [data-block-field="title"]`);
        markDirty();
        return;
      }
      if (target.closest("[data-proposal-remove-block]") && index >= 0) {
        editor.blocks.splice(index, 1);
        rerenderBlocks();
        markDirty();
        notify("Sección quitada.");
        return;
      }
      const add = target.closest("[data-proposal-add-block]");
      if (add) {
        const type = add.dataset.proposalAddBlock;
        editor.blocks.push(type === "list" ? { type, title: "", text: "", items: [] } : { type, title: "", text: "", items: [] });
        rerenderBlocks(`[data-proposal-block="${editor.blocks.length - 1}"] [data-block-field="title"]`);
        markDirty();
        return;
      }
      if (target.closest("[data-proposal-add-line]")) {
        editor.items.push({ description: "", quantity: 1, unitAmount: null, priceText: "", paymentLinkId: null });
        rerenderItems();
        panel.querySelector(`[data-proposal-line="${editor.items.length - 1}"] [data-line-field="description"]`)?.focus();
        return;
      }
      const removeLine = target.closest("[data-proposal-remove-line]");
      if (removeLine) {
        editor.items.splice(Number(removeLine.closest("[data-proposal-line]").dataset.proposalLine), 1);
        rerenderItems();
        markDirty();
        return;
      }
      const qty = target.closest("[data-proposal-qty]");
      if (qty) {
        const lineIndex = Number(qty.closest("[data-proposal-line]").dataset.proposalLine);
        const item = editor.items[lineIndex];
        item.quantity = Math.min(100000, Math.max(1, (item.quantity || 1) + Number(qty.dataset.proposalQty)));
        qty.parentElement.querySelector('[data-line-field="quantity"]').value = String(item.quantity);
        refreshEditor();
        markDirty();
        return;
      }
      const catalogButton = target.closest("[data-proposal-catalog]");
      if (catalogButton) {
        editor.showCatalog = !editor.showCatalog;
        catalogButton.setAttribute("aria-expanded", String(editor.showCatalog));
        const box = panel.querySelector("[data-proposal-catalog-panel]");
        box.hidden = !editor.showCatalog;
        box.innerHTML = catalogHtml();
        if (editor.showCatalog) box.querySelector("input")?.focus();
        return;
      }
      const product = target.closest("[data-proposal-product]");
      if (product) {
        const row = catalog?.rows.find((candidate) => candidate.id === product.dataset.proposalProduct);
        if (!row) return;
        editor.items.push({ description: String(row.name).slice(0, 480), quantity: 1, unitAmount: row.amount, priceText: formatMoney(row.amount).replace(/^Bs\s/, ""), paymentLinkId: row.id });
        editor.showCatalog = false;
        panel.querySelector("[data-proposal-catalog-panel]").hidden = true;
        panel.querySelector("[data-proposal-catalog]")?.setAttribute("aria-expanded", "false");
        rerenderItems();
        markDirty();
        return;
      }
      const goto = target.closest("[data-proposal-goto]");
      if (goto) {
        const [kind, at] = goto.dataset.proposalGoto.split(":");
        const selector = kind === "title" ? "#proposalTitle"
          : kind === "customer" ? "#proposalEditName"
            : kind === "item" ? `[data-proposal-line="${at}"] [data-line-field="price"]`
              : `[data-proposal-block="${at}"] [data-block-field]:not([data-block-field="title"])`;
        const field = panel.querySelector(selector);
        field?.scrollIntoView({ block: "center", behavior: "smooth" });
        field?.focus({ preventScroll: true });
        return;
      }
    }
    const share = target.closest("[data-proposal-share-action]");
    if (share) { void onShareAction(share, event); return; }
    const action = target.closest("[data-proposal-action]");
    if (action) void onDetailAction(action);
  });

  return {
    /** The view became visible: load the active store's proposals. */
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
      catalog = null;
      filter = "all";
      void closeSheet();
      if (document.body.dataset.dashboardView === "proposals") void load();
    },
  };
}
