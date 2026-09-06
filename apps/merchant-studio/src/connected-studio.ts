import { escapeHtml, icon, renderStudioLogin, renderStudioComposer, studioModeNav } from "./studio-ui";
import { batchStatusLabel, validateImageBatch } from "./batch-upload";
import {
  ApiError,
  CHECKOUT_ORIGIN,
  MerchantStudioApi,
  SESSION_STORAGE_KEY,
  proposalPreviewUrl,
  type AgentMessage,
  type Clarification,
  type JsonRecord,
  type MerchantStore,
  type VisualProposal,
  type VisualVersion,
} from "./api";

type StudioPage = "home" | "checkout";
type Phase = "signed-out" | "loading" | "ready" | "error";

interface AttachedImage {
  id: string;
  file: File;
  src: string;
  ready: boolean;
  uploaded: boolean;
}

interface ConnectedState {
  phase: Phase;
  stores: MerchantStore[];
  storeId: string;
  messages: AgentMessage[];
  proposals: VisualProposal[];
  versions: VisualVersion[];
  activeProposalId: string;
  approvedProposalId: string;
  page: StudioPage;
  images: AttachedImage[];
  batchToken: number;
  busy: boolean;
  error: string;
  toast: string;
}

const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "");
const currentStoreKey = "pagosya_current_store_id";

const state: ConnectedState = {
  phase: sessionStorage.getItem(SESSION_STORAGE_KEY) ? "loading" : "signed-out",
  stores: [],
  storeId: sessionStorage.getItem(currentStoreKey) ?? "",
  messages: [],
  proposals: [],
  versions: [],
  activeProposalId: "",
  approvedProposalId: "",
  page: "home",
  images: [],
  batchToken: 0,
  busy: false,
  error: "",
  toast: "",
};

function selectedStore(): MerchantStore | undefined {
  return state.stores.find((store) => store.id === state.storeId);
}

function selectedProposal(): VisualProposal | undefined {
  return state.proposals.find((proposal) => proposal.id === state.activeProposalId);
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function messageMetadata(message?: AgentMessage): JsonRecord {
  return message?.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata) ? message.metadata : {};
}

function proposalMessage(proposalId: string): AgentMessage | undefined {
  return [...state.messages].reverse().find((message) => message.role === "ASSISTANT" && message.proposalId === proposalId);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "guardado";
  return new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function clarificationFrom(message: AgentMessage): Clarification | null {
  const clarification = messageMetadata(message).clarification;
  if (!clarification || typeof clarification !== "object" || Array.isArray(clarification)) return null;
  const candidate = clarification as unknown as Clarification;
  return typeof candidate.prompt === "string" && Array.isArray(candidate.options) ? candidate : null;
}

function renderLogin(): string { return renderStudioLogin(state); }

function renderLoading(): string {
  return `<main class="studio-loading" aria-live="polite"><img src="/logo-mark.png" alt="" /><span class="eyebrow">MERCHANT STUDIO</span><h1>Conectando tu tienda…</h1><div class="loading-line"><i></i></div></main>`;
}

function renderEmpty(): string {
  return `<main class="studio-empty"><img src="/logo-mark.png" alt="" /><span class="eyebrow">MERCHANT STUDIO</span><h1>Todavía no hay una tienda.</h1><p>Crea una tienda en el dashboard y vuelve aquí para dirigirla con YAPI.</p><button class="button" data-action="logout">Cerrar sesión</button></main>`;
}

function renderConnectionError(): string {
  return `<main class="studio-empty"><img src="/logo-mark.png" alt="" /><span class="eyebrow">CONEXIÓN INTERRUMPIDA</span><h1>No pudimos abrir el Studio.</h1><p>${escapeHtml(state.error || "Comprueba que la API esté disponible e inténtalo de nuevo.")}</p><div class="empty-actions"><button class="button button--publish" data-action="retry">Reintentar</button><button class="button" data-action="logout">Cerrar sesión</button></div></main>`;
}

function renderBatch(): string {
  if (!state.images.length) return "";
  const ready = state.images.filter((image) => image.ready).length;
  const complete = ready === state.images.length;
  return `
    <section class="batch-card ${complete ? "is-complete" : "is-loading"}" data-drop-zone aria-label="Lote de imágenes adjuntas">
      <div class="batch-card__header"><span>${icon("paperclip")} <strong>${state.images.length} imágenes</strong><span class="batch-size"> · un solo lote</span></span><span class="batch-state ${complete ? "is-ready" : ""}">${complete ? icon("check") : ""}${batchStatusLabel(ready, state.images.length)}</span></div>
      <div class="batch-thumbs">${state.images.map((image, index) => `<figure class="batch-thumb ${image.ready ? "is-ready" : "is-pending"}">${image.ready ? `<img src="${image.src}" alt="Imagen ${index + 1}: ${escapeHtml(image.file.name)}" />` : `<span class="batch-thumb__loading">${index + 1}</span>`}<figcaption>${image.uploaded ? icon("check") : index + 1}</figcaption></figure>`).join("")}</div>
      <div class="batch-card__footer"><span>${complete ? "Cada imagen ocupa una casilla estable" : "Leyendo archivos sin perder su orden"}</span><button class="text-button" type="button" data-action="open-upload">Reemplazar lote</button></div>
    </section>`;
}

function renderProposalCard(proposal: VisualProposal): string {
  const active = proposal.id === state.activeProposalId;
  return `<button class="remote-proposal ${active ? "is-active" : ""}" type="button" data-proposal-id="${escapeHtml(proposal.id)}" aria-pressed="${active}"><span><small>BORRADOR PRIVADO</small><strong>${escapeHtml(proposal.title)}</strong></span><em>${active ? "En pantalla" : "Revisar →"}</em></button>`;
}

function renderMessage(message: AgentMessage): string {
  const user = message.role === "USER";
  const clarification = !user ? clarificationFrom(message) : null;
  const proposals = !user
    ? state.proposals.filter((proposal) => proposal.id === message.proposalId || arrayOfStrings(messageMetadata(message).proposalIds).includes(proposal.id))
    : [];
  return `
    <article class="${user ? "message message--remote-user" : "agent-note remote-agent-note"}">
      <div class="${user ? "message-meta" : "agent-note__meta"}">${user ? '<span class="avatar">TÚ</span>' : '<span class="yapi-dot"></span>'}<strong>${user ? "Tú" : "YAPI"}</strong><time>${formatTime(message.createdAt)}</time></div>
      <p>${escapeHtml(message.content)}</p>
      ${clarification ? `<div class="clarification-options">${clarification.options.map((option) => `<button type="button" data-clarification="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("")}</div>` : ""}
      ${proposals.length ? `<div class="remote-proposals">${proposals.map(renderProposalCard).join("")}</div>` : ""}
    </article>`;
}

function renderReview(): string {
  const proposal = selectedProposal();
  if (!proposal) {
    const draft = selectedStore()?.websiteDraft;
    const inventory = draft?.inventoryChanges || [];
    return `<section class="remote-empty-state"><span>${icon("eye")}</span><strong>${draft ? "Borrador guardado en privado" : "Tu tienda está publicada"}</strong><p>${draft ? "Revisa la vista previa y pulsa Publicar para actualizar tu tienda." : "Describe un cambio. YAPI creará una variante privada para que la compares aquí."}</p>${inventory.length ? `<p>También se publicarán estos ajustes de stock:</p><ul>${inventory.map((change) => `<li>${escapeHtml(change.name)}: ${change.beforeStock ?? "sin límite"} → ${change.stock ?? "sin límite"}</li>`).join("")}</ul>` : ""}</section>`;
  }
  const metadata = messageMetadata(proposalMessage(proposal.id));
  const changed = arrayOfStrings(metadata.changedAreas);
  const preserved = arrayOfStrings(metadata.preservedAreas);
  const approved = state.approvedProposalId === proposal.id;
  return `
    <section class="change-set remote-review" aria-labelledby="remote-changes-title">
      <div class="section-heading"><div><span class="eyebrow">BORRADOR DE YAPI</span><h2 id="remote-changes-title">${escapeHtml(proposal.title)}</h2></div><span class="proposal-status">${proposal.status === "APPLIED" ? "PUBLICADO" : "PRIVADO"}</span></div>
      ${proposal.rationale ? `<p class="proposal-rationale">${escapeHtml(proposal.rationale)}</p>` : ""}
      <div class="remote-evidence">
        <div><small>CAMBIÓ</small>${(changed.length ? changed : ["dirección visual"]).map((item) => `<span>${icon("check")} ${escapeHtml(item)}</span>`).join("")}</div>
        <div><small>CONSERVÓ</small>${(preserved.length ? preserved : ["productos", "precios", "checkout"]).map((item) => `<span>${icon("lock")} ${escapeHtml(item)}</span>`).join("")}</div>
      </div>
      <div class="approval-card remote-approval ${approved ? "is-approved" : ""}">
        <div class="approval-card__copy"><span class="approval-icon">${approved ? icon("check") : icon("alert")}</span><div><strong>${approved ? "Borrador aprobado" : "Revisión necesaria"}</strong><p>${approved ? "Ya puedes guardar esta propuesta en el borrador privado." : "Comprueba la vista y el checkout antes de publicar."}</p></div></div>
        <div class="approval-actions"><button class="button button--secondary" type="button" data-action="show-checkout">${icon("cart")} Revisar checkout</button><button class="button button--primary" type="button" data-action="approve-proposal">${approved ? `${icon("check")} Aprobado` : "Aprobar borrador"}</button></div>
      </div>
    </section>`;
}

function renderConversation(): string {
  const messages = state.messages.slice(-30);
  return `<div class="agent-stream" data-agent-stream>
    ${messages.length ? messages.map(renderMessage).join("") : `<section class="conversation-welcome"><span class="yapi-dot"></span><strong>YAPI está listo</strong><p>Pídeme cambios de portada, color, texto, imágenes, secciones u organización del catálogo.</p></section>`}
    ${state.busy ? `<article class="agent-note"><div class="agent-note__meta"><span class="yapi-dot"></span><strong>YAPI</strong><span>trabajando</span></div><div class="thinking"><i></i><i></i><i></i><span>${state.images.length ? "Subiendo el lote y preparando una variante…" : "Leyendo la tienda y preparando una variante…"}</span></div></article>` : ""}
    ${renderReview()}
  </div>`;
}

function renderComposer(): string {
  return renderStudioComposer({ busy: state.busy, attachments: renderBatch(), suggestions: [
    { label: "Portada editorial", instruction: "Haz la portada más editorial" },
    { label: "Mejorar jerarquía", instruction: "Mejora la jerarquía visual sin cambiar precios ni checkout" },
  ] });
}

function renderAgentPanel(): string {
  return `<aside class="agent-panel" aria-label="Conversación con YAPI"><header class="agent-header"><div><span class="agent-wordmark">YAPI</span><span class="online"><i></i> Conectado</span></div><button class="icon-button" type="button" data-action="new-task" aria-label="Nueva tarea">${icon("plus")}</button></header>${renderConversation()}${renderComposer()}</aside>`;
}

function renderCanvas(): string {
  const store = selectedStore();
  if (!store) return "";
  const proposal = selectedProposal();
  return `<main class="canvas-panel connected-canvas" aria-label="Vista previa real de la tienda">
    <header class="canvas-toolbar">
      ${studioModeNav("website")}<div class="viewport-controls"><button class="is-active" type="button" aria-label="Vista de escritorio">${icon("desktop")}</button><span>Vista real</span></div>
      <div class="history-controls"><button type="button" data-action="restore" aria-label="Restaurar versión anterior" ${state.versions.length && !state.busy ? "" : "disabled"}>${icon("undo")}</button><span>${state.versions.length} versiones</span></div>
      <div class="page-control"><label for="connected-page-select">Página</label><select id="connected-page-select" data-page-select><option value="home" ${state.page === "home" ? "selected" : ""}>Tienda</option><option value="checkout" ${state.page === "checkout" ? "selected" : ""}>Carrito / checkout</option></select></div>
      <span class="canvas-state">${proposal || store.websiteDraft ? "Vista del borrador" : "Tienda publicada"}</span>
    </header>
    <div class="preview-frame remote-preview"><iframe data-store-preview title="Vista previa de ${escapeHtml(store.name)}" src="${escapeHtml(proposalPreviewUrl(store, proposal))}" allow="clipboard-write; payment"></iframe></div>
    <footer class="canvas-status"><span>${icon("check")} Documento real conectado</span><span>${proposal || store.websiteDraft ? "Borrador privado" : "Versión pública"}</span><span>${state.page === "checkout" ? `${icon("lock")} Pago protegido` : "Selecciona checkout para revisarlo"}</span></footer>
  </main>`;
}

function renderTopbar(): string {
  const store = selectedStore();
  const proposal = selectedProposal();
  const approved = Boolean(proposal && state.approvedProposalId === proposal.id);
  return `<header class="topbar connected-topbar">
    <a class="product-mark" href="/" aria-label="pagosYa Merchant Studio"><img src="/logo-mark.png" alt="" /><span>pagosYa</span><i></i><strong>Merchant Studio</strong></a>
    <div class="connected-store-select"><label for="store-select">Tienda</label><select id="store-select" data-store-select>${state.stores.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === state.storeId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>
    <div class="save-state">${icon("check")} ${proposal ? "Borrador guardado" : "Conectado"}</div>
    <div class="top-actions"><button class="button button--ghost" type="button" data-action="logout" title="Cerrar sesión">${icon("logout")} Salir</button><button class="button button--publish ${proposal && !approved ? "needs-review" : ""}" type="button" data-action="publish" ${(proposal && approved || !proposal && selectedStore()?.websiteDraft) && !state.busy ? "" : "disabled"}>${state.busy ? "Procesando…" : proposal ? "Usar en borrador" : selectedStore()?.websiteDraft ? selectedStore()?.websiteDraft?.inventoryChanges?.length ? "Publicar sitio y stock" : "Publicar" : "Sin borrador"}</button></div>
  </header>`;
}

function renderReady(): string {
  if (!state.stores.length) return renderEmpty();
  return `<div class="studio-shell">${renderTopbar()}<div class="studio-workspace">${renderAgentPanel()}${renderCanvas()}</div>${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}</div>`;
}

function render(app: HTMLDivElement, preserveScroll = false): void {
  const previousScroll = preserveScroll ? document.querySelector<HTMLElement>("[data-agent-stream]")?.scrollTop ?? 0 : 0;
  app.innerHTML = state.phase === "signed-out" ? renderLogin() : state.phase === "loading" ? renderLoading() : state.phase === "error" ? renderConnectionError() : renderReady();
  bindEvents(app);
  const stream = document.querySelector<HTMLElement>("[data-agent-stream]");
  if (stream) stream.scrollTop = preserveScroll ? previousScroll : stream.scrollHeight;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Archivo inválido"));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function acceptImages(app: HTMLDivElement, files: File[]): Promise<void> {
  const batch = validateImageBatch(files);
  if (!batch.accepted.length) return showToast(app, "Selecciona hasta 3 imágenes de máximo 10 MB.");
  const token = ++state.batchToken;
  state.images = batch.accepted.map(({ id, file }) => ({ id, file, src: "", ready: false, uploaded: false }));
  state.error = batch.rejected.length ? `${batch.rejected.length} archivo(s) no se incluyeron.` : "";
  render(app, true);
  await Promise.all(state.images.map(async (image, index) => {
    try {
      const src = await readFile(image.file);
      if (state.batchToken !== token || !state.images[index]) return;
      state.images[index] = { ...state.images[index], src, ready: true };
      render(app, true);
    } catch {
      if (state.batchToken !== token) return;
      state.error = "Una imagen no pudo abrirse; las demás conservaron su casilla.";
      render(app, true);
    }
  }));
  if (state.batchToken === token) showToast(app, `${state.images.filter((image) => image.ready).length} de ${state.images.length} imágenes listas en un solo lote.`);
}

async function loadStore(app: HTMLDivElement, storeId: string): Promise<void> {
  state.storeId = storeId;
  sessionStorage.setItem(currentStoreKey, storeId);
  state.busy = true;
  state.error = "";
  render(app);
  try {
    const [conversation, studio] = await Promise.all([api.conversation(storeId), api.visualStudio(storeId)]);
    state.messages = conversation.messages;
    state.proposals = studio.proposals;
    state.versions = studio.versions;
    const ready = studio.proposals.find((proposal) => proposal.status === "READY" && proposal.baseWebsiteRevision === (selectedStore()?.websiteRevision ?? 0));
    state.activeProposalId = ready?.id ?? "";
    state.approvedProposalId = "";
  } finally {
    state.busy = false;
  }
  render(app);
}

async function hydrate(app: HTMLDivElement): Promise<void> {
  state.phase = "loading";
  render(app);
  try {
    state.stores = await api.listStores();
    state.phase = "ready";
    if (!state.stores.length) return render(app);
    const existing = state.stores.find((store) => store.id === state.storeId);
    await loadStore(app, existing?.id ?? state.stores[0].id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      state.phase = "signed-out";
      state.error = "Tu sesión venció. Vuelve a ingresar.";
    } else {
      state.phase = "error";
      state.error = error instanceof Error ? error.message : "No se pudo conectar Merchant Studio.";
    }
    render(app);
  }
}

function checkoutPreview(): void {
  const frame = document.querySelector<HTMLIFrameElement>("[data-store-preview]");
  if (!frame?.contentWindow || state.page !== "checkout") return;
  frame.contentWindow.postMessage({ type: "PAGOSYA_STORE_PREVIEW_NAVIGATION", previewAction: "cart", previewSection: "products" }, new URL(CHECKOUT_ORIGIN).origin);
}

function showConnectionFailure(app: HTMLDivElement, error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    state.phase = "signed-out";
    state.error = "Tu sesión venció. Vuelve a ingresar.";
  } else {
    state.phase = "error";
    state.error = error instanceof Error ? error.message : "No se pudo conectar Merchant Studio.";
  }
  render(app);
}

async function sendCommand(app: HTMLDivElement, instruction: string): Promise<void> {
  const store = selectedStore();
  if (!store || !instruction.trim() || state.busy) return;
  if (state.images.some((image) => !image.ready)) return showToast(app, "Espera a que las imágenes terminen de cargar.");
  state.busy = true;
  state.error = "";
  render(app);
  try {
    const uploaded = await Promise.all(state.images.map(async (image, index) => {
      const result = await api.upload(image.file);
      if (state.images[index]) state.images[index].uploaded = true;
      return result.url;
    }));
    const response = await api.sendMessage(store.id, instruction.trim(), uploaded, state.activeProposalId || undefined, store.websiteRevision ?? 0);
    state.messages.push(response.userMessage, response.assistantMessage);
    response.proposals?.forEach((proposal) => {
      state.proposals = [proposal, ...state.proposals.filter((item) => item.id !== proposal.id)];
    });
    if (response.proposal) state.activeProposalId = response.proposal.id;
    else if (response.proposals?.[0]) state.activeProposalId = response.proposals[0].id;
    state.approvedProposalId = "";
    state.images = [];
    state.batchToken += 1;
    const studio = await api.visualStudio(store.id);
    state.proposals = studio.proposals;
    state.versions = studio.versions;
    if (response.proposal) state.activeProposalId = response.proposal.id;
    showToast(app, response.needsClarification ? "YAPI necesita una precisión." : "Borrador privado preparado.");
  } catch (error) {
    state.error = error instanceof Error ? error.message : "YAPI no pudo preparar el borrador.";
    showToast(app, state.error);
  } finally {
    state.busy = false;
    render(app);
  }
}

async function publish(app: HTMLDivElement): Promise<void> {
  const store = selectedStore();
  const proposal = selectedProposal();
  if (!store || state.busy || (proposal ? state.approvedProposalId !== proposal.id : !store.websiteDraft)) return;
  state.busy = true;
  render(app, true);
  try {
    const updated = proposal
      ? await api.applyProposal(store.id, proposal.id, store.websiteRevision ?? 0)
      : await api.publishDraft(store.id, store.websiteRevision ?? 0);
    state.stores = state.stores.map((item) => item.id === updated.id ? { ...item, ...updated } : item);
    state.activeProposalId = "";
    state.approvedProposalId = "";
    const studio = await api.visualStudio(store.id);
    state.proposals = studio.proposals;
    state.versions = studio.versions;
    showToast(app, proposal ? "Borrador guardado en privado. Revísalo y pulsa Publicar." : "Tienda publicada.");
  } catch (error) {
    showToast(app, error instanceof Error ? error.message : "No se pudo publicar.");
  } finally {
    state.busy = false;
    render(app);
  }
}

async function restore(app: HTMLDivElement): Promise<void> {
  const store = selectedStore();
  const version = state.versions[0];
  if (!store || !version || state.busy) return;
  state.busy = true;
  render(app, true);
  try {
    const updated = await api.restoreVersion(store.id, version.id, store.websiteRevision ?? 0);
    state.activeProposalId = "";
    state.approvedProposalId = "";
    state.stores = state.stores.map((item) => item.id === updated.id ? { ...item, ...updated } : item);
    const studio = await api.visualStudio(store.id);
    state.versions = studio.versions;
    showToast(app, `Restauraste: ${version.label}.`);
  } catch (error) {
    showToast(app, error instanceof Error ? error.message : "No se pudo restaurar la versión.");
  } finally {
    state.busy = false;
    render(app);
  }
}

async function logout(app: HTMLDivElement): Promise<void> {
  try { await api.logout(); } catch { /* Local sign-out still protects this browser. */ }
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(currentStoreKey);
  api.setToken("");
  state.phase = "signed-out";
  state.stores = [];
  state.messages = [];
  state.error = "";
  render(app);
}

function showToast(app: HTMLDivElement, message: string): void {
  state.toast = message;
  render(app, true);
  window.setTimeout(() => {
    if (state.toast !== message) return;
    state.toast = "";
    render(app, true);
  }, 2800);
}

function bindEvents(app: HTMLDivElement): void {
  document.querySelector<HTMLFormElement>("[data-login-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    state.busy = true;
    state.error = "";
    render(app);
    try {
      const response = await api.login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      api.setToken(response.token);
      sessionStorage.setItem(SESSION_STORAGE_KEY, response.token);
      sessionStorage.setItem("pagosya_merchant_email", response.user.email);
      state.busy = false;
      await hydrate(app);
    } catch (error) {
      state.busy = false;
      state.error = error instanceof Error ? error.message : "No pudimos iniciar sesión.";
      render(app);
    }
  });

  document.querySelector<HTMLFormElement>("[data-composer]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const instruction = String(new FormData(event.currentTarget as HTMLFormElement).get("command") ?? "");
    void sendCommand(app, instruction);
  });
  document.querySelector<HTMLInputElement>("[data-image-input]")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void acceptImages(app, files);
  });
  document.querySelector<HTMLSelectElement>("[data-store-select]")?.addEventListener("change", (event) => {
    void loadStore(app, (event.currentTarget as HTMLSelectElement).value).catch((error: unknown) => showConnectionFailure(app, error));
  });
  document.querySelector<HTMLSelectElement>("[data-page-select]")?.addEventListener("change", (event) => {
    state.page = (event.currentTarget as HTMLSelectElement).value as StudioPage;
    render(app, true);
  });
  document.querySelector<HTMLIFrameElement>("[data-store-preview]")?.addEventListener("load", checkoutPreview);
  document.querySelectorAll<HTMLElement>("[data-proposal-id]").forEach((element) => element.addEventListener("click", () => {
    state.activeProposalId = element.dataset.proposalId ?? "";
    state.approvedProposalId = "";
    state.page = "home";
    render(app, true);
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-clarification]").forEach((button) => button.addEventListener("click", () => void sendCommand(app, button.dataset.clarification ?? "")));
  document.querySelectorAll<HTMLButtonElement>("[data-suggestion]").forEach((button) => button.addEventListener("click", () => {
    const textarea = document.querySelector<HTMLTextAreaElement>("#agent-command");
    if (textarea) { textarea.value = button.dataset.suggestion ?? ""; textarea.focus(); }
  }));
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => element.addEventListener("click", () => {
    const action = element.dataset.action;
    if (action === "open-upload") document.querySelector<HTMLInputElement>("[data-image-input]")?.click();
    if (action === "approve-proposal" && state.activeProposalId) { state.approvedProposalId = state.activeProposalId; showToast(app, "Propuesta revisada. Ya puedes usarla en el borrador."); }
    if (action === "show-checkout") { state.page = "checkout"; render(app, true); }
    if (action === "publish") void publish(app);
    if (action === "restore") void restore(app);
    if (action === "retry") void hydrate(app);
    if (action === "logout") void logout(app);
    if (action === "new-task") { state.activeProposalId = ""; state.approvedProposalId = ""; state.images = []; render(app); }
  }));
}

export async function mountConnectedStudio(app: HTMLDivElement): Promise<void> {
  render(app);
  if (state.phase === "loading") await hydrate(app);
}
