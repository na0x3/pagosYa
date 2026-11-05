import { buildIsActive, sourceBuildTransition, type SourceBuildSession, type SourceBuildEvent } from './source-build-session';
import { loadPlace, nudge, placePill, savePlace, spinState } from './source-yapi-pill';
import { fadeWhenIdle } from './source-toolbar-fade';
import { needsAnswer, renderExit, renderHistory, renderPill } from './source-yapi-pill-view';
import './source-yapi-pill.css';
import { assumedFactsCheck, pageLabel, renderAssumedFacts, type AssumedFactView } from './source-assumed-facts';
import { renderPagePicker, bindPagePicker } from './source-page-picker';
import { mountCodeHighlight } from './source-code-highlight';
import { mountSourceAccountDemo } from './source-account-demo';
import { codeFileEditable, codeFileForPage, renderCodeBrowser } from './source-code-tree';
import { composeActionMode } from './source-studio-actions';
import { createDirectEditor } from './source-direct-editor';
import { bocetoRevealY, createBocetoPanel } from './source-boceto';
import { closeBocetoMenu } from './boceto-menu';
import { renderInspiration } from './source-inspiration';
import { renderTemplateChoices, type TemplateChoice } from './source-templates';
import { inlineProductChange, inlineProducts, keepEdges, matchInlineField, type InlineProductField } from './source-inline-text';
import { createProductForm } from './source-create-product';
import { renderBuildProgress, type BuildProgress } from './source-build-progress';
import { apiHeroUrls, fitStyleFrames, keepStylePolling, renderStylePicker, type StyleProposalView } from './source-style-pick';
import { REVIEW_POLL_MS, reviewNoteMarkup, reviewPollAction } from './source-review-note';
import { merchantSafeText, merchantMessageText } from './source-merchant-copy';
import { renderBuildStage, mountBuildStage, type BuildStageState } from './source-build-stage';
import { mountFace, renderFaceMark } from './source-face';
import { mountStarField } from './source-star-field';
import './source-build-progress.css';
import { renderStoreReadiness } from './store-readiness';
import { openRetention } from './retention';
import { openCommercePlatform } from './commerce-platform';
import { openCommerceContent } from './commerce-content';
import { openShippingSettings } from './shipping-settings';
import { openDomainShop } from './domain-shop';
import { openPagesPanel } from './source-pages';
import { openCatalogArrangement } from './catalog-arrangement';
import { openRecommendations } from './recommendations';
import { openBrandProfile } from './brand-profile';
import { renderSourcePublication } from './source-publication';
import { checkSourceWebsite, sourceCheckResult, sourceChecksBlockPublishing, type SourceCheck } from './source-checks';
import { prepareSourceMedia, validateSourceMediaBatch } from './source-images';
import { API_BASE_URL, ApiError, MerchantStudioApi, SESSION_STORAGE_KEY, type SourceSetup, type SourceChatJob, type SourceDraftRetry, type JsonRecord, type AgentMessage, type MerchantStore, type SourceState, type SourceVersion, type SourceGenerationSettings, type SourceGenerationEstimate, type SourceGenerationRun } from './api';
import { queueStatus } from './source-queue-status';
import { QUICK_ACTIONS, createSelectionState, createViewingState, matchEditableText, selectionChipLabel, selectionPayload, viewingPayload, type SelectionPayload, type ViewingPayload } from './source-selection';
import { sourcePreviewDocument, receivePreviewNavigation, receivePreviewSelection, receivePreviewViewing, receivePreviewContact, openPreviewContact, type PreviewNavigation, type PreviewSelection, createPreviewImageLoader } from '@pagosya/storefront-preview';
import { escapeHtml as escape, icon, renderStudioLogin, renderStudioComposer, studioModeNav } from './studio-ui';
import { applySuggestion, dismissSuggestions, renderSuggestions, suggestionCards, type SuggestionCard } from './source-suggestions';
import { bindStarterSwap, renderStarterSwap, showsStarterSwap, type StarterAlternative } from './source-starter-swap';
import { planCardOf, planIntro, renderPlanCard } from './source-plan-card';
import './source-studio.css';
import './source-browser.css';
import './source-workspace-design.css';
import { bindSourcePaymentPreview } from './source-payment-preview';
import { bindAssistantPreview } from './source-assistant-preview';
import { focusDebugEnabled, recordFocusLoss, watchComposerFocus } from './source-focus-debug';
import { mountNarrator, narratorBridge } from './source-narrator';

const SOURCE_MODEL_OPTIONS = [['auto', 'Auto · OpenAI'], ['gpt-5.6-luna', 'Luna · económico'], ['gpt-5.6-terra', 'Terra · equilibrado'], ['gpt-5.6-sol', 'Sol · avanzado'], ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5 · económico'], ['claude-sonnet-5', 'Claude Sonnet 5 · equilibrado'], ['claude-opus-5-5', 'Claude Opus 5.5 · avanzado']] as const;
const SOURCE_MODEL_STORAGE = "pagosya_source_model";
/**
 * A premium pick used to persist forever, so one session's choice silently repriced
 * every later build for that merchant -- the single largest driver of observed spend.
 * Cheaper models still stick, because keeping those saves money; the expensive ones
 * are remembered only for the working session that chose them.
 */
const PREMIUM_SOURCE_MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'claude-sonnet-5', 'claude-opus-5-5'];
const PREMIUM_MODEL_TTL_MS = 2 * 60 * 60 * 1000;

type Attachment = { file: File; src: string; url?: string };
type RetrySubmission = { text: string; assetUrls: string[]; setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo'; currentPage: string; selection?: SelectionPayload; viewing?: ViewingPayload; templateId?: string; directionId?: string; resumeDraft?: boolean; stylePick?: { generationId: string; index?: number; auto?: boolean }; planId?: string };
export async function mountSourceStudio(app: HTMLDivElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embedded') === '1' && window.parent !== window;
  // YAPI in design mode (spec 2026-10-22 v2): the dashboard's design mode shows the store full screen and YAPI as a movable pill.
  const pillMode = embedded ? params.get('layout') !== 'classic' : params.get('layout') === 'pill';
  const safeStorage = () => { try { return window.localStorage; } catch { return null; } };
  let historyOpen = false, plusOpen = false, pillPlace = loadPlace(safeStorage()), cardsHiddenFor = '';
  // Full screen (owner 2026-10-23): the left panel tucks away and only the top controls stay over the store; remembered.
  const DOCK_HIDDEN_KEY = 'pagosya_yapi_dock_hidden';
  let dockHidden = (() => { try { return safeStorage()?.getItem(DOCK_HIDDEN_KEY) === '1'; } catch { return false; } })();
  const saveDockHidden = () => { try { if (dockHidden) safeStorage()?.setItem(DOCK_HIDDEN_KEY, '1'); else safeStorage()?.removeItem(DOCK_HIDDEN_KEY); } catch { /* best effort */ } };
  let stopFade: (() => void) | undefined;
  const notifyParent = (data: JsonRecord) => { if (embedded) window.parent.postMessage(data, location.origin); };
  let checks: SourceCheck[] | null = null, checksKey = '', checking = false;
  /** Spec 2026-10-14 store voice: «Datos que YAPI supuso» for the shown revision, and the fact being edited. */
  let assumedFacts: AssumedFactView[] | null = null, factEditing: string | null = null;
  let checkAbort: AbortController | null = null;
  let setup: SourceSetup | null = null;
  const generationSettings: SourceGenerationSettings = { model: 'auto', maxCredits: 200, motion: 'auto', scrollFeel: 'soft', sitePurpose: 'shop' };
  try {
    const raw = localStorage.getItem(SOURCE_MODEL_STORAGE);
    const saved = raw?.startsWith('{') ? JSON.parse(raw) as { model?: string; at?: number } : { model: raw ?? undefined, at: 0 };
    const fresh = !PREMIUM_SOURCE_MODELS.includes(saved.model || '') || Date.now() - (saved.at || 0) < PREMIUM_MODEL_TTL_MS;
    if (fresh && SOURCE_MODEL_OPTIONS.some(([id]) => id === saved.model)) generationSettings.model = saved.model as SourceGenerationSettings['model'];
    else if (!fresh) localStorage.removeItem(SOURCE_MODEL_STORAGE);
  } catch { /* Storage may be disabled; the selector still works in this session. */ }
  let navigationChoice: '' | 'dropdown' | 'pages' = '';
  let chatgptPlanMode = false;
  // Spec 2026-11-04 §7: the model select is the owner's (YAPI_MODEL_PICKER=1); merchants always send auto.
  let modelPickerOn = false;
  let estimate: SourceGenerationEstimate | null = null, estimateError = '';
  let estimateTimer: number | undefined, estimateRequest = 0;
  let usage: SourceGenerationRun[] | null = null;
  let aiUsage: Array<{ stage: string; model: string; status: string; usage: { providerMicroUsd?: number | null } | null }> = [];
  let testsExpanded = false, publicationOpen = false, creditsOpen = false;
  let productPhoto = false;
  let chatExpanded = true;
  let visualEditing = false, visualEditPending = false;
  let productForm: ReturnType<typeof createProductForm> | null = null;
  let buildProgress: BuildProgress | null = null;
  let buildStatus = '';
  // Spec 2026-10-28 §1: while a new store's first design is queued or running the canvas says so instead of showing rev 1.
  let designing = false;
  let styleView: StyleProposalView | null = null; let styleOpen: number | null = null; let styleDevice: 'desktop' | 'phone' = 'desktop'; let stylePoll: number | undefined; let stylePollStarted = 0; let reviewTimer: number | undefined;
  window.addEventListener('resize', () => fitStyleFrames(app));
  app.addEventListener('click', event => {
    const target = event.target as Node;
    app.querySelectorAll<HTMLDetailsElement>('.source-disclosure[open]').forEach(details => {
      if (!details.contains(target)) details.open = false;
    });
    publicationOpen = Boolean(app.querySelector<HTMLDetailsElement>('.source-publication-details')?.open);
    creditsOpen = Boolean(app.querySelector<HTMLDetailsElement>('.source-credit-details')?.open);
  }, true);
  app.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const details = (event.target as Element).closest<HTMLDetailsElement>('.source-disclosure[open]');
    if (details) { details.open = false; details.querySelector<HTMLElement>('summary')?.focus(); event.preventDefault(); }
  });
  let liveCatalog: JsonRecord | null = null;
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  let renderedAt = 0;
  watchComposerFocus(app, () => ({ busy, mode, renderedAt, storeId }));
  const directEditor = createDirectEditor(api);
  const bocetoPanel = createBocetoPanel(api);
  const loadPreviewImages = createPreviewImageLoader(API_BASE_URL);
  let previewRender = 0;
  // Section selection (Wix-style): the merchant clicks a part of the preview and the next request is scoped to it.
  const selection = createSelectionState();
  // Spec 2026-11-05 point-at: the section in the middle of the preview, sent when nothing is selected.
  const viewing = createViewingState();
  let selectMode = false, platformHint = false, editableField: { id: string; value: string } | null = null, selectionRequest = 0;
  let fieldsCache: { key: string; fields: import('./source-visual-fields').VisualField[] } | null = null;
  function applyCanvas() {
    const wrap = app.querySelector<HTMLElement>('.source-frame-wrap');
    const frame = wrap?.querySelector('iframe');
    const pill = app.querySelector<HTMLElement>('[data-canvas-zoom]');
    if (!wrap || !frame) return;
    if (bocetoOpen && mode === 'preview') {
      wrap.classList.add('is-boceto-canvas');
      (frame as HTMLIFrameElement).style.height = canvasHeight + 'px';
      wrap.style.transform = `translate(${canvasX}px, ${canvasY}px) scale(${canvasZoom})`;
      if (pill) pill.textContent = Math.round(canvasZoom * 100) + '%';
    } else {
      wrap.classList.remove('is-boceto-canvas');
      (frame as HTMLIFrameElement).style.height = '';
      wrap.style.transform = '';
    }
  }
  /** Zoom around a point given in board (canvas container) coordinates. */
  function zoomCanvasAt(factor: number, x: number, y: number) {
    const zoom = Math.min(3, Math.max(0.1, canvasZoom * factor));
    canvasX = x - (x - canvasX) * (zoom / canvasZoom);
    canvasY = y - (y - canvasY) * (zoom / canvasZoom);
    canvasZoom = zoom;
    applyCanvas();
  }
  /** One wheel notch moves a bounded step: trackpad pinches stay fine-grained and a mouse wheel
   * (deltaY ≈ ±100) no longer jumps 2.7× per click, which made zooming in or out nearly impossible. */
  const wheelZoomFactor = (deltaY: number) => Math.exp(-Math.max(-24, Math.min(24, deltaY)) * 0.012);
  function canvasBoard() { return app.querySelector<HTMLElement>('.boceto-canvas'); }
  /** Center the page on the board at a zoom that fills it — no dead whitespace. The side panels are docked outside
   * the board, so its whole width is visible. */
  function fitCanvas() {
    const board = canvasBoard();
    if (!board) return;
    const visible = Math.max(320, board.clientWidth);
    canvasZoom = Math.min(1.25, Math.max(0.1, (visible - 56) / 1280));
    canvasX = (visible - 1280 * canvasZoom) / 2;
    canvasY = 28;
    applyCanvas();
  }
  function syncBocetoMode(frame: HTMLIFrameElement | null = app.querySelector<HTMLIFrameElement>('.source-frame-wrap iframe')) {
    try { frame?.contentWindow?.postMessage({ type: 'pagosya:boceto-mode', on: bocetoOpen && mode === 'preview' }, '*'); } catch { /* frame is gone */ }
  }
  function syncSelectMode(frame: HTMLIFrameElement | null = app.querySelector<HTMLIFrameElement>('.source-frame-wrap iframe')) {
    try { frame?.contentWindow?.postMessage({ type: 'pagosya:source-edit-mode', on: selectMode, ...(selection.get() ? { selectedId: selection.get()!.sectionId } : {}) }, '*'); } catch { /* frame is gone */ }
  }
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && (selection.get() || platformHint)) { clearSelection(); renderSelection(); scheduleEstimate(); } });
  // Figma-style zoom keys while the Boceto board is open: ⌘/Ctrl + acerca, − aleja, 0 ajusta.
  window.addEventListener('keydown', event => {
    if (!bocetoOpen || mode !== 'preview' || !(event.metaKey || event.ctrlKey)) return;
    const board = canvasBoard();
    if (!board) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomCanvasAt(1.2, board.clientWidth / 2, board.clientHeight / 2); }
    else if (event.key === '-') { event.preventDefault(); zoomCanvasAt(1 / 1.2, board.clientWidth / 2, board.clientHeight / 2); }
    else if (event.key === '0') { event.preventDefault(); fitCanvas(); }
  });
  // In the Boceto the panel also forgets the block, so picking it again brings the chip back.
  function clearSelection() { selection.clear(); platformHint = false; editableField = null; selectionRequest++; if (bocetoOpen) bocetoPanel.forgetSelection(); }
  function renderSelection() { if (pillMode) { render(); syncSelectMode(); return; } const host = app.querySelector<HTMLElement>('[data-selection-host]'); if (host) host.innerHTML = selectionMarkup(); syncSelectMode(); }
  function takeSelection(picked: PreviewSelection) {
    if (!selectMode) return;
    clearSelection();
    if (picked.kind === 'platform') platformHint = true;
    else if (picked.sectionId) {
      selection.set({ sectionId: picked.sectionId, label: picked.label || picked.sectionId, at: picked.at, page: picked.page, area: picked.area });
      const request = selectionRequest, key = `${storeId}:${version?.revision}`;
      if (picked.kind === 'section' && picked.text && version) void (async () => {
        try {
          if (fieldsCache?.key !== key) fieldsCache = { key, fields: (await api.sourceVisualFields(storeId, version!.revision)).fields };
          if (request !== selectionRequest) return;
          const match = matchEditableText(picked.text, fieldsCache.fields);
          if (match) { editableField = { id: match.id, value: match.value }; renderSelection(); }
        } catch { /* the shortcut is optional */ }
      })();
    }
    renderSelection();
  }
  function selectionMarkup() {
    const current = selection.get();
    if (platformHint) return '<p class="selection-hint" data-selection-hint role="status">Esa parte la administra pagosYa.</p>';
    if (!current) return '';
    return `<div class="selection-panel"><span class="selection-chip" data-selection-chip>Sobre: ${escape(selectionChipLabel(current))} <button type="button" aria-label="Quitar selección" data-selection-clear>×</button></span><div class="selection-actions" role="group" aria-label="Acciones rápidas para esta sección">${QUICK_ACTIONS.map(action => `<button type="button" data-quick-action="${escape(action.id)}">${escape(action.label)}</button>`).join('')}${editableField ? '<button type="button" data-selection-edit-text>Editar texto</button>' : ''}</div></div>`;
  }
  let previewNavigation: Partial<PreviewNavigation> = {};
  bindSourcePaymentPreview(() => app.querySelector('iframe'), () => version ? previewSnapshot() : null);
  // The store bot in the preview answers through the merchant's test chat (baek 2026-10-17).
  bindAssistantPreview(() => app.querySelector('iframe'), body => api.assistantTest(storeId, body));
  window.addEventListener('message', event => {
    const previewFrame = app.querySelector('iframe');
    // The store's WhatsApp, phone and email links open for the merchant, like on the published store.
    const contact = receivePreviewContact(event, previewFrame); if (contact) { openPreviewContact(contact); return; }
    if (event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:boceto-ready') { syncBocetoMode(previewFrame as HTMLIFrameElement); if (bocetoOpen) bocetoPanel.resync(); return; }
    if (bocetoOpen && event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:boceto-size' && Number.isFinite(event.data.height)) {
      const next = Math.min(20000, Math.max(360, Number(event.data.height)));
      if (Math.abs(next - canvasHeight) > 24) { canvasHeight = next; applyCanvas(); }
      return;
    }
    if (bocetoOpen && event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:boceto-wheel') {
      closeBocetoMenu();
      const { dx, dy, ctrl, x, y } = event.data as { dx: number; dy: number; ctrl: boolean; x: number; y: number };
      if (ctrl) {
        // The cursor arrives in iframe-page coordinates; convert to board space so the point
        // under the cursor actually stays put while zooming.
        zoomCanvasAt(wheelZoomFactor(Number(dy || 0)), canvasX + Number(x || 0) * canvasZoom, canvasY + Number(y || 0) * canvasZoom);
      } else {
        canvasX -= Number(dx || 0);
        canvasY -= Number(dy || 0);
        applyCanvas();
      }
      return;
    }
    if (bocetoOpen && event.source === previewFrame?.contentWindow && event.origin === 'null' && typeof event.data?.type === 'string' && event.data.type.startsWith('pagosya:boceto-')) {
      const PICK_PATH = /^([a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4})?$/;
      if (event.data.type === 'pagosya:boceto-select' && typeof event.data.id === 'string' && event.data.id.length <= 40) bocetoPanel.remoteSelect(event.data.id, typeof event.data.path === 'string' && PICK_PATH.test(event.data.path) ? event.data.path : '', event.data.add === true);
      if (event.data.type === 'pagosya:boceto-context' && typeof event.data.id === 'string' && event.data.id.length <= 40 && typeof event.data.path === 'string' && PICK_PATH.test(event.data.path) && Number.isFinite(event.data.x) && Number.isFinite(event.data.y)) {
        const rect = canvasBoard()?.getBoundingClientRect();
        // The frame shows the whole page unscrolled: board px = translate + page px × zoom.
        const pct = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
        if (rect) bocetoPanel.remoteContext({ id: event.data.id, path: event.data.path, x: rect.left + canvasX + event.data.x * canvasZoom, y: rect.top + canvasY + event.data.y * canvasZoom, fx: pct(event.data.fx), fy: pct(event.data.fy) });
      }
      if (event.data.type === 'pagosya:boceto-free-many' && Array.isArray(event.data.moves) && event.data.moves.length <= 40) bocetoPanel.remoteFreeMany(event.data.moves.filter((move: any) => move && typeof move.id === 'string' && move.id.length <= 40 && typeof move.path === 'string' && /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/.test(move.path) && Number.isFinite(move.x) && Number.isFinite(move.y) && (move.w === undefined || Number.isFinite(move.w))).map((move: any) => ({ id: move.id, path: move.path, x: move.x, y: move.y, ...(move.w !== undefined ? { w: move.w } : {}) })));
      if (event.data.type === 'pagosya:boceto-reorder-many' && Array.isArray(event.data.ids) && event.data.ids.length <= 20 && event.data.ids.every((id: unknown) => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id)) && Number.isInteger(event.data.index)) bocetoPanel.remoteReorderMany(event.data.ids, event.data.index);
      if (event.data.type === 'pagosya:boceto-select-many' && Array.isArray(event.data.items) && event.data.items.length <= 40) bocetoPanel.remoteSelectMany(event.data.items.filter((item: any) => item && typeof item.id === 'string' && /^[a-z0-9-]{1,40}$/.test(item.id) && typeof item.path === 'string' && PICK_PATH.test(item.path)).map((item: any) => ({ id: item.id, path: item.path })), event.data.add === true);
      if (event.data.type === 'pagosya:boceto-reorder' && typeof event.data.id === 'string' && Number.isInteger(event.data.index)) bocetoPanel.remoteReorder(event.data.id, event.data.index);
      if (event.data.type === 'pagosya:boceto-text' && typeof event.data.id === 'string' && typeof event.data.field === 'string' && typeof event.data.value === 'string') bocetoPanel.remoteText(event.data.id, event.data.field, event.data.value.slice(0, 1000));
      if (event.data.type === 'pagosya:boceto-el-move' && typeof event.data.id === 'string' && typeof event.data.el === 'string' && typeof event.data.x === 'number' && typeof event.data.y === 'number') bocetoPanel.remoteElMove(event.data.id, event.data.el, event.data.x, event.data.y);
      if (event.data.type === 'pagosya:boceto-free' && typeof event.data.id === 'string' && typeof event.data.path === 'string' && /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/.test(event.data.path) && typeof event.data.x === 'number' && typeof event.data.y === 'number') bocetoPanel.remoteFree(event.data.id, event.data.path, event.data.x, event.data.y, typeof event.data.w === 'number' ? event.data.w : undefined);
      if (event.data.type === 'pagosya:boceto-node-move' && typeof event.data.id === 'string' && typeof event.data.path === 'string' && /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/.test(event.data.path) && Array.isArray(event.data.order) && event.data.order.length <= 12 && event.data.order.every((key: unknown) => typeof key === 'string' && /^[a-zA-Z0-9]{1,20}$/.test(key))) bocetoPanel.remoteNodeMove(event.data.id, event.data.path, event.data.order);
      if (event.data.type === 'pagosya:boceto-key' && ['up', 'down', 'delete', 'undo', 'redo', 'copy', 'paste', 'duplicate'].includes(event.data.key)) bocetoPanel.remoteKey(event.data.key);
      if (event.data.type === 'pagosya:boceto-reveal' && typeof event.data.top === 'number' && typeof event.data.height === 'number') {
        const board = canvasBoard();
        if (board) { canvasY = bocetoRevealY(canvasY, canvasZoom, board.clientHeight, event.data.top, event.data.height); applyCanvas(); }
      }
      if (event.data.type === 'pagosya:boceto-photo' && typeof event.data.id === 'string' && typeof event.data.slot === 'string') bocetoPanel.remotePhoto(event.data.id, event.data.slot);
      return;
    }
    if (event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:preview-scroll' && Number.isFinite(event.data.y)) { previewScroll = { key: shownScrollKey, y: Math.max(0, Math.min(200000, Number(event.data.y))) }; return; }
    if (visualEditing && event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:visual-select') { directEditor.select(event.data.value, event.data.kind); return; }
    // Spec 2026-10-20 §6: a text double-clicked and changed in the preview, saved through the direct-edit field that holds it.
    if (plantillasOn && event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:inline-text' && typeof event.data.before === 'string' && typeof event.data.after === 'string') { void saveInlineText(event.data.before.slice(0, 2000), event.data.after.slice(0, 2000)); return; }
    if (plantillasOn && event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:inline-product-text' && typeof event.data.productId === 'string' && event.data.productId.length <= 64 && ['name', 'description', 'price'].includes(event.data.field) && typeof event.data.after === 'string') { void saveInlineProduct(event.data.productId, event.data.field, event.data.after.slice(0, 2000)); return; }
    if (plantillasOn && event.source === previewFrame?.contentWindow && event.origin === 'null' && event.data?.type === 'pagosya:inline-product' && typeof event.data.productId === 'string' && event.data.productId.length <= 64) { openProductEditor(event.data.productId, event.data.field === 'price' ? 'price' : 'description'); return; }
    const looked = receivePreviewViewing(event, previewFrame);
    if (looked) { viewing.set(looked); return; }
    const picked = receivePreviewSelection(event, previewFrame);
    if (picked) { takeSelection(picked); return; }
    const next = receivePreviewNavigation(event, previewFrame, version?.snapshot);
    if (!next) return;
    if (next.newTab && version) {
      const url = new URL(location.href);
      url.search = new URLSearchParams({ source: '1', browser: '1', store: storeId, revision: String(version.revision), page: next.page, query: next.query || '', anchor: next.fragment || '' }).toString(); url.hash = '';
      sessionStorage.setItem('pagosya_merchant_api_base', API_BASE_URL);
      sessionStorage.setItem(`pagosya_source_preview_cart:${storeId}:${version.revision}`, JSON.stringify(next.cart || []));
      const tab = window.open(url.href, '_blank');
      if (tab) { tab.opener = null; return; }
    }
    page = next.page; previewNavigation = next; clearSelection(); viewing.clear(); render();
  });
  let disposeAccountPreview: (() => void) | undefined;
  // Where the preview was scrolled, per store, page and query (owner 2026-10-21: saves reloaded it from the top).
  let previewScroll = { key: '', y: 0 }, shownScrollKey = '';
  /** The page each preview frame shows, without its scroll position, so a redraw can keep a frame that would not change. */
  const shownPreviews = new WeakMap<HTMLIFrameElement, string>();
  async function renderPreview(frame: HTMLIFrameElement) {
    const request = ++previewRender;
    const selectedPage = page;
    // A redraw of the same page (a save, a new revision) comes back where the merchant was; another page starts at the top.
    const scrollKey = `${storeId}|${selectedPage}|${previewNavigation.query || ''}`;
    const scrollY = !bocetoOpen && !previewNavigation.fragment && previewScroll.key === scrollKey ? previewScroll.y : 0;
    try {
      const snapshot = await loadPreviewImages(previewSnapshot());
      if (frame.isConnected && request === previewRender) {
        const doc = sourcePreviewDocument(snapshot, selectedPage, { ...previewNavigation, paymentForm: true, accountForms: !visualEditing, editing: visualEditing, inlineText: plantillasOn && !visualEditing && !bocetoOpen && !historical(), inlineProducts: plantillasOn ? inlineProducts(liveCatalog) : undefined, scrollY });
        // Owner 2026-10-28 («way too many refreshes»): a redraw that would show the same page keeps the one already loaded.
        const key = doc.replace(/var wanted = \d+, restoring/, 'var wanted = 0, restoring');
        // The kept page still takes the current modes (select, boceto, canvas) a fresh load would have applied.
        if (shownPreviews.get(frame) === key) { syncSelectMode(frame); syncBocetoMode(frame); if (bocetoOpen) bocetoPanel.resync(); applyCanvas(); return; }
        shownPreviews.set(frame, key);
        frame.addEventListener('load', () => { syncSelectMode(frame); syncBocetoMode(frame); if (bocetoOpen) bocetoPanel.resync(); applyCanvas(); }, { once: true }); disposeAccountPreview?.(); frame.srcdoc = doc; shownScrollKey = scrollKey; if (!visualEditing) disposeAccountPreview = mountSourceAccountDemo(frame); }
    } catch (e) {
      if (frame.isConnected && request === previewRender) frame.replaceWith(document.createTextNode(e instanceof Error ? e.message : 'No se pudo abrir la vista previa.'));
    }
  }
  let stores: MerchantStore[] = [], storeId = '', state: SourceState = { revision: 0, versions: [], nextBefore: null }, version: SourceVersion | null = null;
  let messages: AgentMessage[] = [], assets: Attachment[] = [];
  let buildSession: SourceBuildSession = { phase: 'idle' };
  // YAPI's glass window over the preview (spec 2026-10-21 Part C): request, plan, step, summary.
  const narratorWindow = mountNarrator(document);
  // Owner 2026-10-25: builds no longer write into the glass window (the floating «YAPI · Ahora: …» card); the chat panel already
  // shows the request, its steps and the reply. The window stays only for the occasional store news.
  const narrator = narratorBridge({ open() {}, show() {} }, pillMode);
  // Owner 2026-10-27: no store news in a little YAPI window over the store («eliminate this little yapi window»); the figures
  // live in the dashboard. The window is mounted but never opened.
  const transitionBuild = (event: SourceBuildEvent) => {
    const wasBuilding = buildIsActive(buildSession);
    buildSession = sourceBuildTransition(buildSession, event);
    if (event.type === 'interrupt' && wasBuilding) narrator.interrupted(error);
  };
  const building = () => buildIsActive(buildSession);
  let busy = false, loading = true, error = '', toast = '', instruction = '';
  // Spec 2026-10-20 Plantillas fill: the Plantillas button and double-click text editing, asked once from the API.
  let plantillasOn = false, plantillasAsked = false;
  // The agent's latest clean draft while it builds (sub-project 3): the store appears in the preview as YAPI works.
  let liveDraft: { at: number; interrupted?: boolean; snapshot: SourceVersion['snapshot'] } | null = null;
  let showSavedRevision = false;
  const showingDraft = () => Boolean(liveDraft && !showSavedRevision && mode === 'preview');
  /** Why «Ver en navegador» is unavailable, or what it opens: a disabled button otherwise gives no reason. */
  const browserHint = () => busy ? 'Disponible cuando YAPI termine' : dirty() ? 'Guarda o descarta tus cambios de código para abrirla' : productForm ? 'Cierra el formulario de producto para abrirla' : visualEditPending ? 'Espera a que se guarde tu cambio' : showingDraft() ? 'Abrir el borrador en una pestaña nueva' : 'Abrir la vista previa en una pestaña nueva';
  let pendingSubmission: { text: string; imageCount: number; hasVideo: boolean; files: Array<{ src: string; video: boolean }> } | null = null;
  let buildStage: { update(state: BuildStageState): void; destroy(): void } | null = null;
  let idleFace: { destroy(): void } | null = null;
  // YAPI's stars play over the whole Studio until a site exists (source-star-field.ts). The layer lives on <body>,
  // outside what render() replaces, so the stars keep their flight across re-renders.
  let starField: { destroy(): void } | null = null;
  let retrySubmission: RetrySubmission | null = null;
  /** The request the preserved draft was built from; "Guardar borrador" resends it with resumeDraft. */
  let draftRetry: SourceDraftRetry | null = null;
  let toastTimer: number | undefined;
  /** The browser checks the last load started; they open every page at four widths and can take minutes. */
  let checksRun: Promise<void> = Promise.resolve();
  let mode = 'preview', mobile = false, page = 'index.html', filePath = 'index.html', draft: string | null = null;
  let bocetoOpen = false;
  // A structured draft opens in YAPI + preview. The canvas is an optional editing mode.
  let bocetoConfirm = false, bocetoFitted = false;
  const bocetoPhase = () => Boolean(version?.snapshot.files.some(file => file.path === 'sketch.json'));
  let canvasZoom = 0.82, canvasX = 60, canvasY = 40, canvasHeight = 2400;
  const dirty = () => draft !== null && draft !== version?.snapshot.files.find(f => f.path === filePath)?.content;
  if (embedded) (window as Window & { pagosyaStudioCanLeave?: () => boolean }).pagosyaStudioCanLeave = () => {
    if (productForm?.isBusy) { window.alert('Espera a que termine de guardarse el producto.'); return false; }
    if (busy && buildSession.phase !== 'running') { window.alert('YAPI está trabajando. Espera a que termine antes de cambiar de tienda o salir.'); return false; }
    return !(dirty() || instruction.trim() || assets.length || productForm?.hasChanges) || window.confirm('Tienes un mensaje, imágenes o código sin guardar. ¿Descartarlos y salir de esta tienda?');
  };
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'pagosya:catalog-refresh') return;
    if (storeId && !busy) void refreshCatalog();
  });
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type !== 'pagosya:studio-action' || event.data.storeId !== storeId || loading) return;
    const action = event.data.action;
    if (action === 'compose' && typeof event.data.text === 'string' && composeActionMode({ text: event.data.text, origin: event.data.origin }, { busy, blocked: dirty() || historical() }) === 'send') {
      // Asked from the YAPI box on another tab ("hazme una tienda"): YAPI starts working right away.
      chatExpanded = true;
      notifyParent({ type: 'pagosya:studio-action-received', storeId });
      void send(event.data.text.slice(0, 12000));
      return;
    }
    if (action === 'compose' && typeof event.data.text === 'string') {
      if (busy && event.data.origin !== 'growth') {
        toast = 'YAPI está trabajando. Tu mensaje quedó listo para enviarlo después.';
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { toast = ''; app.querySelector('.toast')?.remove(); }, 6000);
      }
      instruction = [instruction.trim(), event.data.text.slice(0, 12000)].filter(Boolean).join('\n\n').slice(0, 12000);
      // A suggestion from the dashboard's Crecimiento view: say where it came from; the merchant still sends it.
      if (event.data.origin === 'growth') {
        toast = 'Sugerencia lista: revísala y envíala cuando quieras.';
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { toast = ''; app.querySelector('.toast')?.remove(); }, 6000);
      }
      chatExpanded = true; render(); focusComposer(); scheduleEstimate();
    } else if (action === 'media') {
      const button = app.querySelector<HTMLButtonElement>('[data-visual-tab="assets"]');
      if (button && !button.disabled) { if (button.getAttribute('aria-expanded') !== 'true') button.click(); }
      else { toast = 'Adjunta tus imágenes o videos en el chat para crear tu sitio.'; render(); focusComposer(); }
    } else if (action === 'content') app.querySelector<HTMLButtonElement>('#source-content')?.click();
    else return;
    notifyParent({ type: 'pagosya:studio-action-received', storeId });
  });
  async function refreshCatalog() {
    const selectedStore = storeId;
    try {
      const [catalog, conversation] = await Promise.all([api.sourceCatalog(selectedStore), api.sourceConversation(selectedStore)]);
      if (selectedStore !== storeId || busy) return;
      liveCatalog = catalog; setup = conversation.setup || null;
      if (version && !dirty()) void runChecks();
      // Update only the preview and setup question; leave the composer and code intact.
      const frame = app.querySelector<HTMLIFrameElement>('iframe');
      if (frame && version && !historical()) void renderPreview(frame);
      const question = app.querySelector('[data-setup-prompt]'); if (question && setup) question.textContent = setup.prompt;
    } catch { /* A saved preview remains usable offline; generation fetches the current catalog again. */ }
  }
  function previewSnapshot() {
    if (showingDraft()) return liveDraft!.snapshot;
    return { ...version!.snapshot, files: version!.snapshot.files.map(f => {
      if (f.path === filePath && draft !== null) return { ...f, content: draft };
      if (f.path !== 'config.js' || !liveCatalog || historical()) return f;
      // The platform config is JSON, never evaluate merchant-authored code in this frame.
      try {
        const match = f.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
        if (!match) return f;
        const config = JSON.parse(match[1]);
        return { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: liveCatalog })};` };
      } catch { return f; }
    }) };
  }
  // Snapshots are kept internally for recovery, but the merchant always edits the current draft.
  const historical = () => false;
  // YAPI's next-step cards (spec 2026-10-19 §2): hidden for good after «No, gracias»; a popup card answers with a note.
  let suggestionsHidden = false, suggestionNote = '';
  // «Probar otro estilo» (spec 2026-10-24 §2): asked for on each load while a build reply has no merchant message after it.
  let starterAlternatives: StarterAlternative[] = [], starterNote = '';
  const suggestionIndex = new Map<string, SuggestionCard>();
  const disabled = (condition: boolean) => condition ? 'disabled' : '';
  const clearAssets = () => { productPhoto = false; assets.forEach(a => URL.revokeObjectURL(a.src)); assets = []; };
  window.addEventListener('beforeunload', event => { if (dirty() || busy && buildSession.phase !== 'running' || instruction.trim() || assets.length) { event.preventDefault(); event.returnValue = ''; } });

  async function action(task: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ''; toast = ''; render();
    try { await task(); } catch (e) {
      error = e instanceof Error ? e.message : 'No pudimos completar la solicitud.';
      if (e instanceof ApiError && e.status === 401) { sessionStorage.removeItem(SESSION_STORAGE_KEY); api.setToken(''); clearAssets(); notifyParent({ type: 'pagosya:session-expired' }); }
    } finally {
      busy = false; loading = false; if (building()) transitionBuild({ type: 'interrupt' }); render();
      window.clearTimeout(toastTimer);
      if (toast) toastTimer = window.setTimeout(() => { toast = ''; app.querySelector('.toast')?.remove(); }, 4000);
    }
  }
  const revertInline = () => { try { app.querySelector<HTMLIFrameElement>('.source-frame-wrap iframe')?.contentWindow?.postMessage({ type: 'pagosya:inline-text-revert' }, '*'); } catch { /* frame is gone */ } };
  /** A product's name, description or simple price changed in the preview: saved on the product, so every page shows it. */
  async function saveInlineProduct(productId: string, field: InlineProductField, after: string) {
    if (busy || !storeId || historical()) { revertInline(); toast = 'Espera a que termine lo que está en curso para editar el producto.'; render(); return; }
    const items = (liveCatalog?.items as Array<Record<string, unknown>> | undefined) ?? [];
    const change = inlineProductChange(items.find(item => item.id === productId), field, after);
    if ('editor' in change) { revertInline(); toast = change.message; render(); return; }
    try { await api.updateProduct(storeId, productId, change.patch); toast = 'Producto actualizado en toda tu tienda.'; await refreshCatalog(); }
    catch (cause) { revertInline(); toast = cause instanceof Error ? cause.message : 'No pudimos guardar el producto.'; }
    render();
  }

  /** The double-clicked text's words before and after: the first text field showing them takes the change, as a new revision. */
  async function saveInlineText(before: string, after: string) {
    const revert = revertInline;
    const shown = version;
    if (!shown || busy || dirty() || historical() || visualEditPending || !storeId) { revert(); toast = 'Espera a que termine lo que está en curso para editar el texto.'; render(); return; }
    if (!after.trim()) { revert(); toast = 'El texto no puede quedar vacío.'; render(); return; }
    visualEditPending = true;
    try {
      const field = matchInlineField((await api.sourceVisualFields(storeId, shown.revision)).fields, before);
      if (!field) { revert(); toast = 'Ese texto no se puede cambiar aquí. Pídeselo a YAPI en el chat.'; return; }
      await api.editSourceVisual(storeId, { revision: shown.revision, fieldId: field.id, value: keepEdges(field.value, after) });
      await load(); toast = 'Texto guardado.';
    } catch (cause) { revert(); toast = cause instanceof Error ? cause.message : 'No pudimos guardar el texto.'; }
    finally { visualEditPending = false; render(); }
  }

  /** A product's name or price double-clicked in the preview: its editor, where the product is changed everywhere. */
  function openProductEditor(productId: string, step: 'description' | 'price') {
    if (embedded) notifyParent({ type: 'pagosya:workspace', view: 'products', productId, step });
    else location.assign(`${import.meta.env.VITE_DASHBOARD_ORIGIN || 'http://localhost:4323'}#dashboard-products`);
  }

  async function load(_revision?: number, waitForChecks = false) {
    liveDraft = null; showSavedRevision = false;
    // Asked beside the first load, so the first preview already has double-click editing (live check 2026-10-21).
    const settings = plantillasAsked ? null : (plantillasAsked = true, api.templateSettings().catch(() => null));
    const [project, conversation, catalog] = await Promise.all([api.sourceState(storeId), api.sourceConversation(storeId), api.sourceCatalog(storeId).catch(() => null)]);
    if (settings) plantillasOn = (await settings)?.plantillas === true;
    liveCatalog = catalog;
    state = project; messages = conversation.messages; setup = conversation.setup || null;
    if (!messages.some(message => showsStarterSwap(messages, message.id))) starterAlternatives = [];
    else void api.starterAlternatives(storeId).then(result => { starterAlternatives = result.alternatives; render(); }).catch(() => undefined);
    version = state.revision ? await api.sourceVersion(storeId, state.revision) : null;
    assumedFacts = version ? await api.assumedFacts(storeId, version.revision).then(result => result.facts).catch(() => null) : null;
    factEditing = null;
    generationSettings.sitePurpose = version?.snapshot.brief.sitePurpose || setup?.sitePurpose || 'shop';
    if (version) {
      try {
        const match = version.snapshot.files.find(f => f.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
        const config = match ? JSON.parse(match[1]) : {};
        const savedMotion = config.motion || 'subtle';
        generationSettings.motion = ['auto', 'off', 'subtle', 'expressive'].includes(savedMotion) ? savedMotion : 'subtle';
        generationSettings.scrollFeel = ['native', 'soft', 'cinematic'].includes(config.scrollFeel) ? config.scrollFeel : 'soft';
      } catch { generationSettings.motion = 'subtle'; generationSettings.scrollFeel = 'soft'; }
    }
    draft = null; page = 'index.html'; filePath = 'index.html'; previewNavigation = {}; clearSelection(); viewing.clear(); fieldsCache = null; scheduleEstimate();
    await refreshInterruptedDraft().catch(() => {});
    syncReviewWatch();
    // A saved design shows at once; the browser checks load every page at four widths and report when done.
    if (version) { checksRun = runChecks(); if (waitForChecks) { render(); await checksRun; } }
  }
  async function boot() {
    stores = await api.listStores();
    storeId = embedded ? stores.find(s => s.id === params.get('store'))?.id || '' : stores.find(s => s.id === sessionStorage.getItem('pagosya_current_store_id'))?.id || stores[0]?.id || '';
    // Asked before the first canvas render so a returning merchant never sees rev 1 under a pending first design, but never
    // allowed to hold the Studio: a slow or unanswered request falls back to «no job» after 2.5 s (A/B test suite 2026-10-29).
    const noJob = { job: null } as { job: SourceChatJob | null };
    const latestJob = storeId ? await Promise.race([api.latestSourceChatJob(storeId).catch(() => noJob), new Promise<typeof noJob>(resolve => window.setTimeout(() => resolve(noJob), 2500))]) : noJob;
    designing = Boolean(latestJob.job?.firstDesign && ['QUEUED', 'RUNNING'].includes(latestJob.job.status));
    if (storeId) await load();
    if (pillMode && embedded) notifyParent({ type: 'pagosya:design-focus', open: true });
    if (storeId) void api.retention(storeId).then(r => { if (r?.settings?.suggestionsDismissedAt) { suggestionsHidden = true; render(); } }).catch(() => undefined);
    if (storeId) {
      const selectedStore = storeId;
      const latest = latestJob;
      // A background personal touch is followed quietly: the merchant keeps the chat, and a message they send cancels it.
      if (latest.job && ['QUEUED', 'RUNNING'].includes(latest.job.status) && latest.job.background) void followBackgroundJob(selectedStore, '');
      else if (latest.job && ['QUEUED', 'RUNNING'].includes(latest.job.status)) followRunningJob(selectedStore, latest.job);
    }
    if (storeId) void loadStyleProposal();
  }
  /** A request still running on the server (the merchant came back, or a new store's follow-up carries their own request)
   * owns the editor state as if it had just been sent. Boot's action finishes first. */
  function followRunningJob(selectedStore: string, job: SourceChatJob) {
    // Only a first design keeps the cover; any other request the Studio follows shows the store (review fix M2).
    designing = Boolean(job.firstDesign);
    let designNext = false, handedOn = false;
    // A first design cut by a spent quota goes back to QUEUED and resumes on its own (spec 2026-10-28 §1).
    let ran = false;
    const onUpdate = (update: SourceChatJob) => {
      // The template build followed after a reload queues the first design as it ends (review fix I5).
      if (update.designNext) { designNext = true; designing = true; }
      if (job.firstDesign && update.status === 'RUNNING') ran = true;
      if (job.firstDesign && ran && update.status === 'QUEUED') { if (buildStatus !== DESIGN_WAIT) { buildStatus = DESIGN_WAIT; updateBuildProgress(); } return; }
      showQueue(update);
    };
    // Waits out the action that is finishing (the reply that queued the follow-up), which would otherwise drop this one.
    const start = () => { if (storeId !== selectedStore || building()) { if (job.firstDesign && designing) { designing = false; render(); } return; } if (busy) { window.setTimeout(start, 250); return; } void action(async () => {
      transitionBuild({ type: 'accepted', jobId: job.id, requestId: job.requestId }); narrator.submitted(''); buildStatus = 'YAPI sigue trabajando en tu pedido…'; render();
      const stop = watchBuildProgress(selectedStore, job.requestId);
      try { await api.waitSourceChatJob(selectedStore, job, onUpdate); transitionBuild({ type: 'complete' }); designing = designNext; await load(); if (designNext) { handedOn = true; void followBackgroundJob(selectedStore, job.requestId); } narrator.completed([...messages].reverse().find(m => m.role === 'ASSISTANT') ?? ''); }
      finally { stop(); stopStylePoll(); if (!handedOn) designing = false; if (building()) transitionBuild({ type: 'interrupt' }); await refreshInterruptedDraft().catch(() => {}); void loadStyleProposal(); }
    }); };
    window.setTimeout(start, 0);
  }
  const DESIGN_WAIT = 'YAPI sigue diseñando; termina en un rato.';
  /** How long the Studio keeps looking for a follow-up the server has not queued yet: 10 × 2 s. */
  const FOLLOW_ATTEMPTS = 10, FOLLOW_WAIT_MS = 2000;
  // Variety spec §5: a new store's background personal touch saves a newer revision. The open Studio follows it quietly
  // (no build lock, the merchant keeps chatting; a request they send cancels the touch on the server) and reloads when it lands.
  async function followBackgroundJob(selectedStore: string, finishedRequestId: string) {
    let handedOver = false;
    try { handedOver = await followNextJob(selectedStore, finishedRequestId); }
    finally { if (!handedOver && designing) { designing = false; render(); } }
  }
  /** True when the next job became the merchant's own followed request. */
  async function followNextJob(selectedStore: string, finishedRequestId: string): Promise<boolean> {
    // Owner 2026-10-25 («I need to refresh to see the changes»): the server queues the touch only once the finished request's
    // job has closed, so right after a reply the latest job is still that one. Look again for a while before giving up.
    let job: SourceChatJob | null = null;
    for (let attempt = 0; attempt < FOLLOW_ATTEMPTS && storeId === selectedStore; attempt++) {
      const latest = await api.latestSourceChatJob(selectedStore).catch(() => ({ job: null }));
      const found = latest.job;
      if (found && found.requestId !== finishedRequestId) {
        if (['QUEUED', 'RUNNING'].includes(found.status)) { job = found; break; }
        // A follow-up that already finished while the Studio looked still brings its revision in.
        if (finishedRequestId && !building()) { designing = false; await load().catch(() => {}); render(); }
        return false;
      }
      if (!finishedRequestId) return false;
      await new Promise(resolve => setTimeout(resolve, FOLLOW_WAIT_MS));
    }
    if (!job) return false;
    // Owner 2026-10-22: the follow-up that applies the merchant's own request is their request, shown with its progress.
    if (!job.background) { if (storeId !== selectedStore) return false; followRunningJob(selectedStore, job); return true; }
    designing = false;
    await api.waitSourceChatJob(selectedStore, job).catch(() => undefined);
    if (storeId !== selectedStore || building()) return false;
    await load().catch(() => {});
    render();
    return false;
  }
  // A request waiting behind another store's run says so instead of looking frozen (owner report 2026-10-15).
  function showQueue(job: SourceChatJob) {
    const waiting = queueStatus(job);
    if (waiting) { if (buildStatus !== waiting) { buildStatus = waiting; updateBuildProgress(); } }
    else if (buildStatus.startsWith('En espera:')) { buildStatus = 'YAPI está trabajando en tu pedido…'; updateBuildProgress(); }
  }
  /**
   * Polls land every 1.5s. The stage updates in place rather than re-rendering,
   * so the face keeps its phase instead of snapping back to its first beat.
   */
  function updateBuildProgress() {
    narrator.progress(buildProgress);
    buildStage?.update({ status: buildStatus, progress: buildProgress });
    const designStep = app.querySelector<HTMLElement>('[data-designing-step]');
    if (designStep) designStep.textContent = buildStatus;
    const host = app.querySelector<HTMLElement>('[data-build-progress]');
    if (!host) return;
    const stream = app.querySelector<HTMLElement>('[data-agent-stream]');
    const atBottom = stream && stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
    const expanded = host.querySelector('details')?.open;
    host.innerHTML = buildProgress ? renderBuildProgress(buildProgress, true) : `<p class="build-waiting" role="status">${escape(buildStatus)}</p>`;
    const details = host.querySelector('details');
    if (details && expanded !== undefined) details.open = expanded;
    if (stream && atBottom) stream.scrollTop = stream.scrollHeight;
  }
  async function refreshInterruptedDraft() {
    const selectedStore = storeId, revision = state.revision;
    const result = await api.sourceDraftPreview(selectedStore);
    if (storeId !== selectedStore || state.revision !== revision || !result.interrupted || !result.at || !result.files) return;
    const saved = version?.snapshot.files.filter(file => file.encoding === 'base64' && !result.files!.some(next => next.path === file.path)) || [];
    liveDraft = { at: result.at, interrupted: true, snapshot: { ...(version?.snapshot ?? {}), files: [...result.files, ...saved] } as SourceVersion['snapshot'] };
    draftRetry = result.retry ?? null;
    showSavedRevision = false;
    mode = 'preview';
  }
  function watchBuildProgress(selectedStore: string, requestId: string) {
    const controller = new AbortController(); let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await api.sourceProgress(selectedStore, requestId, controller.signal);
        if (controller.signal.aborted || storeId !== selectedStore) return;
        if (result.progress) { buildProgress = result.progress; updateBuildProgress(); if (result.progress.steps.at(-1)?.stage === 'styles') watchStyleProposal(); }
        const draft = await api.sourceDraftPreview(selectedStore, liveDraft?.at, controller.signal);
        if (!controller.signal.aborted && storeId === selectedStore && building() && draft.at && draft.files) {
          // Photos the saved revision already has are not resent; keep them from the current version.
          const saved = version?.snapshot.files.filter(file => file.encoding === 'base64' && !draft.files!.some(next => next.path === file.path)) || [];
          const hadDraft = Boolean(liveDraft);
          showSavedRevision = false;
          liveDraft = { at: draft.at, snapshot: { ...(version?.snapshot ?? {}), files: [...draft.files, ...saved] } as SourceVersion['snapshot'] };
          const frame = app.querySelector<HTMLIFrameElement>('.is-live-draft iframe');
          if (hadDraft && frame) void renderPreview(frame); else render();
        }
      } catch { /* Status availability must not interrupt the build request. */ }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 1500);
    };
    timer = window.setTimeout(poll, 500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }
  /** Elige tu estilo: the four cards the API proposed. Hero paths are API-relative, so they are pointed at Studio's API base. */
  /** `showPicker`: the stage just turned to styles, so the canvas must switch to the picker even before any card exists. */
  async function loadStyleProposal(showPicker = false) {
    const selectedStore = storeId, base = new URL(API_BASE_URL, location.href).href;
    // A failed request (the API restarting, a dropped connection) is no answer: the cards on screen stay and the poll goes on.
    // Treating it as «no proposal» blanked the picker until a reload (Pulso Studio, 2026-10-19).
    const answer = await api.styleProposal(selectedStore).catch(() => undefined);
    if (storeId !== selectedStore) return;
    if (!answer) { if (styleView?.status === 'RUNNING' && !stylePoll) watchStyleProposal(); return; }
    const proposal = answer.proposal;
    const next = proposal && { ...proposal, cards: proposal.cards.map(card => ({ ...card, html: card.html && apiHeroUrls(card.html, base) })) };
    // Re-rendering reloads every card iframe, so a poll that brings nothing new leaves them alone.
    const changed = JSON.stringify(next) !== JSON.stringify(styleView);
    styleView = next;
    // Choosable cards keep drawing their heroes after the request ended (spec 2026-10-12), so a running proposal keeps the
    // poll alive; STYLE_POLL_MAX_MS bounds a row a crashed worker left running.
    if (styleView?.status === 'RUNNING' && !stylePoll) watchStyleProposal();
    else if (!keepStylePolling(styleView, Date.now() - stylePollStarted)) stopStylePoll();
    if (changed || showPicker && !app.querySelector('.style-pick')) render();
  }
  function stopStylePoll() { if (stylePoll) { window.clearInterval(stylePoll); stylePoll = undefined; } }
  function stopReviewWatch() { if (reviewTimer) { window.clearInterval(reviewTimer); reviewTimer = undefined; } }
  /** While YAPI polishes the shown revision (spec 2026-10-12): poll the state every 4 s, load the polished version (preview
   *  and chat) when it lands, drop the note when the review ends without one, and cancel it once the merchant edits. */
  function syncReviewWatch() {
    stopReviewWatch();
    if (!state.reviewPending) return;
    const selectedStore = storeId;
    reviewTimer = window.setInterval(() => void (async () => {
      if (storeId !== selectedStore) { stopReviewWatch(); return; }
      const next = await api.sourceState(selectedStore).catch(() => null);
      if (!next || storeId !== selectedStore || !reviewTimer) return;
      const step = reviewPollAction({ shownRevision: state.revision, next, editing: busy || dirty() || visualEditing || bocetoOpen });
      if (step === 'wait') return;
      stopReviewWatch();
      if (step === 'reload') { await load(next.revision); render(); return; }
      if (step === 'cancel') await api.cancelSourceReview(selectedStore).catch(() => undefined);
      state = { ...state, reviewPending: false }; render();
    })(), REVIEW_POLL_MS);
  }
  function watchStyleProposal() {
    if (stylePoll || styleView?.status === 'AWAITING_STYLE') return;
    stylePollStarted = Date.now();
    stylePoll = window.setInterval(() => void loadStyleProposal(), 1500); void loadStyleProposal(true);
  }
  async function pickStyle(pick: { index?: number; auto?: boolean }) {
    if (!styleView || busy || dirty() || historical()) return;
    const chosen = styleView.cards.find(card => card.index === (pick.auto ? styleView!.recommended : pick.index));
    const stylePick = { generationId: styleView.generationId, ...pick };
    styleView = null; styleOpen = null;
    const accepted = await send(`Usar el estilo «${chosen?.name ?? 'elegido'}»`, undefined, [], undefined, undefined, { text: '', assetUrls: [], currentPage: 'index.html', stylePick });
    // The pick never became a job (upload, flush or network failure): bring the cards back.
    if (!accepted) void loadStyleProposal();
  }
  /** "Guardar borrador": finish the preserved run with its own request (resumeDraft), so its design is saved instead of rebuilt
   *  from the saved revision. True once a new revision is saved. */
  async function finishDraft(): Promise<boolean> {
    if (!draftRetry || busy) return false;
    const retry = draftRetry, before = state.revision;
    await send(retry.text, retry.setupAction, retry.assetUrls, retry.templateId, retry.directionId, { ...retry, resumeDraft: true });
    const saved = state.revision > before;
    if (saved) draftRetry = null;
    return saved;
  }
  const draftNeedsSaving = () => Boolean(liveDraft?.interrupted && !showSavedRevision && draftRetry);
  /** A new message while a preserved draft shows builds on that draft: it is saved first, then the message goes out. */
  async function saveDraftThenSend() {
    const pending = { text: instruction, assets };
    if (!pending.text.trim() && !pending.assets.length) return;
    instruction = ''; assets = [];
    const saved = await finishDraft();
    instruction = pending.text; assets = pending.assets;
    if (saved) await send(instruction); else render();
  }
  /** Resolves true once the API accepted the request as a job. */
  async function send(text: string, setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo', retryAssetUrls?: string[], templateId?: string, directionId?: string, retry?: RetrySubmission): Promise<boolean> {
    if (!text.trim() && assets.length) text = 'Te comparto estas imágenes para el sitio.';
    if (!text.trim() || busy || dirty() || historical()) return false;
    let accepted = false;
    if (!retry && navigationChoice) {
      text += navigationChoice === 'dropdown'
        ? '\n\nNavegación elegida: menú Tienda desplegable con enlaces reales a categorías o colecciones dentro del mismo sitio. Accesible con teclado y móvil. No abrir ventanas nuevas ni inventar categorías.'
        : '\n\nNavegación elegida: enlaces visibles a páginas separadas dentro del mismo sitio, en la misma pestaña del navegador. Usar páginas con contenido real, con regreso a Inicio y navegación móvil.';
    }
    chatExpanded = true;
    const submittedAssets = assets;
    const submittedInstruction = instruction;
    // Preview navigation after a failure must not turn Retry into a new request.
    const submittedSelection: SelectionPayload | undefined = retry ? retry.selection : selection.get() ? selectionPayload(selection.get()!) : undefined;
    const submittedViewing: ViewingPayload | undefined = retry ? retry.viewing : !submittedSelection && viewing.get() ? viewingPayload(viewing.get()!) : undefined;
    const submittedPage = retry ? retry.currentPage : page;
    const submittedAsPhoto = productPhoto;
    productPhoto = false;
    const knownMessageIds = new Set(messages.map(message => message.id));
    // The submitted request has its own state; the composer is for the next draft.
    instruction = ''; assets = []; retrySubmission = null;
    pendingSubmission = { text, imageCount: retryAssetUrls?.length ?? submittedAssets.length, hasVideo: retryAssetUrls ? retryAssetUrls.some(url => /\.mp4$/i.test(url)) : submittedAssets.some(a => a.file.type === 'video/mp4'),
      // The blobs stay valid until the request ends, so the merchant sees what they sent while YAPI works.
      files: retryAssetUrls ? [] : submittedAssets.map(a => ({ src: a.src, video: a.file.type === 'video/mp4' })) };
    showSavedRevision = false; mode = 'preview';
    transitionBuild({ type: 'submit' }); narrator.submitted(text); buildProgress = null; buildStatus = submittedAssets.some(asset => !asset.url) ? 'Subiendo tus archivos…' : 'Enviando tu pedido…';
    await action(async () => {
      let sentToApi = false, succeeded = false;
      let stopProgress = () => {};
      let submittedUrls = retryAssetUrls || [];
      try {
        if (bocetoOpen && !(await bocetoPanel.flush())) throw new Error('No se pudo guardar tu último cambio del boceto. Inténtalo de nuevo antes de pedirle cambios a YAPI.');
        const pending = submittedAssets.filter(asset => !asset.url); let nextUpload = 0;
        const uploads = await Promise.allSettled(Array.from({ length: Math.min(3, pending.length) }, async () => {
          while (nextUpload < pending.length) { const asset = pending[nextUpload++]; asset.url = (await api.upload(asset.file)).url; }
        }));
        const failedUpload = uploads.find(result => result.status === 'rejected');
        if (failedUpload?.status === 'rejected') throw failedUpload.reason;
        submittedUrls = retryAssetUrls || submittedAssets.map(asset => asset.url!);
        sentToApi = true;
        const browserReview = checksKey === checkKey() && !checking ? [...new Set((checks || []).filter(row => row.status === 'failed' || row.status === 'warning').map(row => `${row.label}: ${row.detail || ''}`))].slice(0, 8).map(row => row.slice(0, 500)) : [];
        // Stress test 2026-10-21: a background touch saved r2–r3 while this Studio still held r1, so every request was
        // refused with «El sitio cambió en otra sesión». Catch up to the newest saved revision before sending.
        const latest = await api.sourceState(storeId).catch(() => null);
        if (latest && latest.revision > state.revision) await load();
        const requestId = crypto.randomUUID();
        buildStatus = 'Esperando la respuesta de YAPI…'; updateBuildProgress();
        stopProgress = watchBuildProgress(storeId, requestId);
        const result = await api.sendSourceMessage(storeId, text, submittedUrls, state.revision, setup?.step, setupAction, generationSettings, browserReview, requestId, templateId, directionId, submittedSelection, submittedPage, job => { accepted = true; transitionBuild({ type: 'accepted', jobId: job.id, requestId: job.requestId }); render(); }, { ...(submittedViewing ? { viewing: submittedViewing } : {}), ...(retry?.resumeDraft ? { resumeDraft: true } : {}), ...(retry?.stylePick ? { stylePick: retry.stylePick } : {}), ...(retry?.planId ? { planId: retry.planId } : {}), onUpdate: job => { if (job.designNext) designing = true; showQueue(job); } });
        stopProgress();
        succeeded = true; if (selection.get()?.sectionId === submittedSelection?.sectionId) clearSelection(); pendingSubmission = null; transitionBuild({ type: 'complete' }); liveDraft = null;
        productPhoto = false; navigationChoice = '';
        messages.push(result.userMessage, result.assistantMessage); setup = result.setup || null; liveCatalog = null;
        narrator.completed(result.assistantMessage ?? '');
        if (result.assistantMessage?.metadata?.styleProposal) void loadStyleProposal();
        render();
        if (result.revision) {
          mode = 'preview'; await load(result.revision.revision);
          void followBackgroundJob(storeId, requestId);
          // The merchant keeps chatting and browsing while the checks run; publishing waits for them.
          const checkedRevision = version?.revision;
          void checksRun.then(() => {
            if (version?.revision !== checkedRevision || checking || !checks) return;
            toast = checks.some(row => row.status === 'failed') ? 'Cambios guardados con errores pendientes. Revisa el resultado en el chat.' : checks.some(row => row.status === 'warning' || row.status === 'skipped') ? 'Diseño comprobado con pasos pendientes. Revisa el resultado en el chat.' : 'Comprobaciones terminadas. Revisa el diseño antes de publicar.';
            render(); window.clearTimeout(toastTimer);
            toastTimer = window.setTimeout(() => { toast = ''; app.querySelector('.toast')?.remove(); }, 4000);
          });
        }
      } catch (e) {
        designing = false;
        // A failed generation may still have saved the message. Do not put that
        // message back in the composer; keep an explicit retry with the same URLs.
        let persisted = Boolean(retryAssetUrls), answered = false;
        if (sentToApi && !succeeded) {
          await api.sourceConversation(storeId).then(result => {
            messages = result.messages; setup = result.setup || null;
            const savedIndex = messages.findIndex(message => message.role === 'USER' && !knownMessageIds.has(message.id)
              && message.content.trim() === text.trim()
              && Array.isArray(message.metadata?.assetUrls)
              && message.metadata.assetUrls.length === submittedUrls.length
              && submittedUrls.every(url => (message.metadata!.assetUrls as string[]).includes(url)));
            if (savedIndex >= 0) {
              persisted = true;
              answered = messages.slice(savedIndex + 1).some(message => message.role === 'ASSISTANT' && !message.metadata?.failed);
            }
          }).catch(() => {});
        }
        if (!succeeded) {
          if (persisted) {
            if (!answered) retrySubmission = { text, assetUrls: submittedUrls, setupAction, currentPage: submittedPage, selection: submittedSelection, viewing: submittedViewing, templateId, directionId, stylePick: retry?.stylePick };
          } else {
            instruction = submittedAsPhoto ? submittedInstruction : text; assets = submittedAssets; productPhoto = submittedAsPhoto;
          }
        }
        if (!succeeded) {
          if (liveDraft) liveDraft.interrupted = true;
          await refreshInterruptedDraft().catch(() => {});
          // The window says why it stopped (the server's merchant text), not a bare «Me detuve».
          narrator.interrupted(merchantSafeText(e instanceof Error ? e.message : '', ''));
        }
        throw e;
      } finally {
        stopProgress(); stopStylePoll();
        if (assets !== submittedAssets) submittedAssets.forEach(asset => URL.revokeObjectURL(asset.src));
        pendingSubmission = null; if (building()) transitionBuild({ type: 'interrupt' }); scheduleEstimate();
        if (usage !== null) await api.sourceUsage(storeId).then(result => { usage = result.runs; aiUsage = result.aiUsage || []; }).catch(() => { usage = null; });
      }
    });
    return accepted;
  }
  function checkKey() { return JSON.stringify([storeId, version?.revision, version ? previewSnapshot().files : []]); }
  function checksPassed() { return !showingDraft() && !dirty() && !checking && checksKey === checkKey() && Boolean(checks?.length) && !sourceChecksBlockPublishing(checks!); }
  async function runChecks(force = false) {
    if (!version || dirty() || showingDraft()) return;
    const key = checkKey(), checkedStoreId = storeId, checkedRevision = version.revision;
    if (!force && key === checksKey) return;
    checkAbort?.abort(); const controller = new AbortController(); checkAbort = controller;
    checksKey = key; checks = null; checking = true; updateChecks();
    try {
      let rows: SourceCheck[];
      try {
        const snapshot = await loadPreviewImages(previewSnapshot());
        if (controller.signal.aborted) return;
        rows = await checkSourceWebsite(snapshot, controller.signal);
      } catch (error) {
        rows = [{ label: 'Comprobación', status: 'failed', detail: merchantSafeText(error instanceof Error ? error.message : '', 'No se pudo comprobar.') }];
      }
      if (controller.signal.aborted) return;
      // Facts YAPI assumed and the merchant has not settled block publishing, never the preview (spec 2026-10-14 store voice).
      const factsRow = assumedFactsCheck(assumedFacts);
      if (factsRow) rows = [...rows, factsRow];
      await api.recordSourceChecks(checkedStoreId, checkedRevision, sourceCheckResult(rows), controller.signal);
      if (!controller.signal.aborted) checks = rows;
    }
    catch (error) { if (!controller.signal.aborted) checks = [{ label: 'Comprobación', status: 'failed', detail: merchantSafeText(error instanceof Error ? error.message : '', 'No se pudo comprobar.') }]; }
    finally { if (!controller.signal.aborted) { checking = false; updateChecks(); } }
  }
  function updateReadiness() {
    const mount = app.querySelector('[data-source-readiness]'); if (!mount) return;
    const open = mount.querySelector('details')?.open;
    mount.innerHTML = renderStoreReadiness({ sitePurpose: version?.snapshot.brief.sitePurpose || generationSettings.sitePurpose, catalog: liveCatalog, branded: Boolean(version?.snapshot.files.some(file => file.path === 'brand.css')), checked: checksPassed() && !checks?.some(row => row.status === 'skipped'), checking, published: Boolean(state.publication?.revision && state.publication.active), canPublish: Boolean(version && checksPassed() && state.publication?.experiment?.status !== 'RUNNING'), locked: busy || dirty() });
    if (open) mount.querySelector('details')!.open = true;
  }
  function updateChecks() {
    updateReadiness();
    const publication = state.publication;
    const blocked = busy || !checksPassed() || !version || publication?.experiment?.status === 'RUNNING';
    const publish = app.querySelector<HTMLButtonElement>('#source-publish');
    if (publish) publish.disabled = blocked || version?.revision === publication?.revision;
    const start = app.querySelector<HTMLButtonElement>('#source-test-start');
    if (start) start.disabled = blocked || publication?.active === false || !publication?.revision || version?.revision === publication?.revision;
  }
  function scheduleEstimate() {
    window.clearTimeout(estimateTimer);
    const request = ++estimateRequest;
    estimate = null; estimateError = '';
    updateEstimate();
    if (!storeId) return;
    estimateTimer = window.setTimeout(async () => {
      try {
        const result = await api.estimateSource(storeId, { ...generationSettings, revision: state.revision, instruction: instruction || (state.revision ? 'Ajustar mi sitio' : 'Crear mi sitio'), assetUrls: assets.map(a => a.url || 'pending-upload'), ...(selection.get() ? { selection: selectionPayload(selection.get()!) } : viewing.get() ? { viewing: viewingPayload(viewing.get()!) } : {}) });
        if (request !== estimateRequest) return;
        if (!result?.estimate || !Number.isFinite(result.estimate.minCredits) || !Number.isFinite(result.estimate.maxCredits)) {
          throw new Error('No se pudo estimar el costo. Vuelve a intentarlo.');
        }
        estimate = result;
        const nextPlanMode = result.billingMode === 'chatgpt-plan';
        if (chatgptPlanMode !== nextPlanMode) { chatgptPlanMode = nextPlanMode; render(); }
        const nextPicker = result.modelPicker === true;
        if (!nextPicker) generationSettings.model = 'auto';
        if (modelPickerOn !== nextPicker) { modelPickerOn = nextPicker; render(); }
      } catch (e) { if (request !== estimateRequest) return; estimateError = e instanceof Error ? e.message : 'No se pudo estimar. Vuelve a intentarlo.'; }
      updateEstimate();
    }, 600);
  }
  function estimateText() {
    if (estimateError) return estimateError;
    if (!estimate) return chatgptPlanMode ? 'Modo ChatGPT local · sin créditos API.' : 'Calculando estimación…';
    if (estimate.billingMode === 'chatgpt-plan') return 'Modo ChatGPT local · usa tu plan de ChatGPT, sin créditos API. Se aplican los límites de tu plan.';
    return `${Math.min(generationSettings.maxCredits, estimate.estimate.minCredits)}–${Math.min(generationSettings.maxCredits, estimate.estimate.maxCredits)} créditos estimados · límite ${generationSettings.maxCredits}. ${estimate.reason}`;
  }
  function updateEstimate() {
    const output = app.querySelector<HTMLElement>('[data-source-estimate]');
    if (output) output.textContent = estimateText();
  }
  function generationControls(locked: boolean) {
    return `<section class="source-generation-controls" aria-label="${modelPickerOn ? 'Modelo y créditos' : 'Créditos'}">${modelPickerOn ? `<div class="source-generation-fields"><label>Modelo<select id="source-model" ${disabled(locked)}>${SOURCE_MODEL_OPTIONS.map(([id, label]) => `<option value="${id}" ${generationSettings.model === id ? 'selected' : ''} ${chatgptPlanMode && id !== 'auto' && !id.startsWith('gpt-') ? 'disabled' : ''}>${label}</option>`).join('')}</select></label></div>` : ''}<details class="source-credit-details source-disclosure" ${creditsOpen ? 'open' : ''}><summary>${chatgptPlanMode ? 'Plan de ChatGPT' : 'Créditos'}</summary><div class="source-disclosure-panel"><label ${chatgptPlanMode ? 'hidden' : ''}>Límite por solicitud<input id="source-credit-limit" type="number" min="1" max="500" step="1" value="${generationSettings.maxCredits}" ${disabled(locked)}></label><p data-source-estimate role="status">${escape(estimateText())}</p><p ${chatgptPlanMode ? 'hidden' : ''}>Créditos de uso · sin compra de saldo. Si falla, 0 créditos YAPI; las llamadas API sí pueden tener costo. ${modelPickerOn ? 'El modelo elegido se usa para generar tu sitio; la conversación usa siempre un modelo económico. Un modelo avanzado vuelve a Auto tras unas horas. ' : ''}El límite se aplica al costo API estimado de conversación, generación y hasta una reparación.</p><button type="button" class="text-button" id="source-usage" ${disabled(locked)}>Ver uso reciente</button>${usage ? `<ol class="source-usage-list">${usage.length ? usage.map(run => `<li>${run.revision ? 'Cambios guardados' : run.status === 'RUNNING' ? 'En curso' : 'Sin cambios guardados'} · ${escape(run.model)} · ${run.credits} créditos${run.durationMs !== null ? ` · ${Math.round(run.durationMs / 1000)} s` : ''}</li>`).join('') : '<li>Todavía no hay generaciones.</li>'}</ol>` : ''}${usage && aiUsage.length && !chatgptPlanMode ? `<p>Costo API calculado de las últimas ${aiUsage.length} llamadas, incluidas conversación y análisis: USD ${(aiUsage.reduce((sum, row) => sum + (row.usage?.providerMicroUsd || 0), 0) / 1000000).toFixed(4)}${aiUsage.some(row => typeof row.usage?.providerMicroUsd !== 'number') ? ' · Hay llamadas cuyo costo no se pudo calcular.' : ''}</p>` : ''}</div></details></section>`;
  }
  function attachmentBatch() {
    if (!assets.length) return '';
    return `<section class="batch-card is-complete" aria-label="Archivos adjuntos"><div class="batch-card__header"><strong>${assets.length} ${assets.some(a => a.file.type === 'video/mp4') ? 'archivos' : 'imágenes'}</strong><span class="batch-state is-ready">Listas para enviar</span></div><div class="batch-thumbs">${assets.map((a, i) => `<figure class="batch-thumb is-ready">${a.file.type === 'video/mp4' ? `<video src="${a.src}" controls autoplay muted loop playsinline preload="auto" aria-label="${escape(a.file.name)}"></video>` : `<img src="${a.src}" alt="${escape(a.file.name)}">`}<button class="source-remove-asset" type="button" data-remove-asset="${i}" aria-label="Quitar ${escape(a.file.name)}" ${disabled(busy)}>${icon('plus')}</button></figure>`).join('')}</div><div class="batch-card__footer">Hasta 24 archivos · imágenes: 6 MB · videos MP4: 20 MB en total</div></section>`;
  }
  /** The files a merchant sent stay visible in their message: large, tappable to open full size. Only upload paths and http(s) URLs render. */
  function sentAttachments(metadata: JsonRecord) {
    const urls = Array.isArray(metadata.assetUrls) ? (metadata.assetUrls as unknown[]).filter((url): url is string => typeof url === 'string') : [];
    return attachmentGallery(urls.flatMap(url => {
      if (/^\/(?:api\/)?v1\/uploads\//.test(url)) return [{ src: new URL(url, new URL(API_BASE_URL, location.href)).href }];
      return /^https?:\/\//i.test(url) ? [{ src: url }] : [];
    }));
  }
  function attachmentGallery(files: Array<{ src: string; video?: boolean }>) {
    const items = files.map(({ src, video }) => video || /\.mp4(?:$|\?)/i.test(src)
      ? `<video src="${escape(src)}" controls muted playsinline preload="metadata" aria-label="Video adjunto"></video>`
      : `<a href="${escape(src)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir imagen adjunta en tamaño completo"><img src="${escape(src)}" alt="Imagen adjunta" loading="lazy"></a>`);
    return items.length ? `<div class="message-attachments" data-count="${items.length}">${items.join('')}</div>` : '';
  }
  function chatMessage(message: AgentMessage) {
    const user = message.role === 'USER';
    const metadata = message.metadata || {};
    const clarification = metadata.clarification as { options?: Array<{ label: string; value: string }> } | undefined;
    // merchantSafeText runs last: it is the guard for messages stored before the
    // API gate existed, whose diagnostics no rewording above can make readable.
    const visibleContent = user ? message.content : planCardOf(message, state.revision) ? planIntro(message.content) : merchantMessageText(message.content
      .replaceAll('Guardé el borrador', 'Guardé los cambios de tu tienda')
      .replaceAll('Tu revisión anterior sigue guardada.', 'Tus cambios anteriores siguen guardados.')
      .replaceAll('No se guardó ninguna revisión nueva.', 'No se guardaron cambios nuevos.'), metadata);
    return `<article class="${user ? 'message message--remote-user' : 'agent-note remote-agent-note'}"><div class="${user ? 'message-meta' : 'agent-note__meta'}">${user ? '<span class="avatar">TÚ</span>' : renderFaceMark()}<strong>${user ? 'Tú' : 'YAPI'}</strong></div>${user ? sentAttachments(metadata) : ''}<p>${escape(visibleContent)}</p>
      ${!user && !pillMode ? renderBuildProgress(metadata.progress, false, metadata.sourceRevision ? 'saved' : 'reply') : ''}
      ${clarification?.options ? `<div class="clarification-options">${clarification.options.map(o => `<button type="button" data-clarification="${escape(o.value)}" ${disabled(busy || dirty() || historical())}>${escape(o.label)}</button>`).join('')}</div>` : ''}
      ${!user ? (() => { const card = planCardOf(message, state.revision); return card ? renderPlanCard(card, busy || dirty() || historical()) : ''; })() : ''}
      ${!user && !suggestionsHidden ? (() => { const cards = suggestionCards(metadata); cards.forEach(card => suggestionIndex.set(card.id, card)); return renderSuggestions(cards, busy || dirty() || historical()) + (cards.length && suggestionNote ? `<p class="source-suggestions__note" role="status">${escape(suggestionNote)}</p>` : ''); })() : ''}
      ${!user && starterAlternatives.length && showsStarterSwap(messages, message.id) ? renderStarterSwap(starterAlternatives, import.meta.env.BASE_URL, busy || dirty() || historical()) + (starterNote ? `<p class="source-suggestions__note" role="status">${escape(starterNote)}</p>` : '') : ''}
      ${!user && (metadata.startChoices || Array.isArray(metadata.templateChoices)) && !state.revision ? `<div class="source-empty-actions"><button type="button" class="button" data-start-scratch ${disabled(busy || dirty())}>Crear desde cero</button>${metadata.startChoices ? `<button type="button" class="button button--secondary" data-choose-template ${disabled(busy || dirty())}>Usar una plantilla</button>` : ''}</div>` : ''}
      ${!user && Array.isArray(metadata.templateChoices) ? renderTemplateChoices(metadata.templateChoices as TemplateChoice[], import.meta.env.BASE_URL, busy || dirty() || historical() || (state.revision > 0 && !templateUntouched()) || message.id !== latestTemplateChoicesId()) : ''}
      ${metadata.generation && !pillMode ? `<p class="source-chat-hint">${escape(String((metadata.generation as JsonRecord).model))} · ${escape(String((metadata.generation as JsonRecord).credits))} créditos</p>` : ''}
      ${typeof metadata.sourceRevision === 'number' && !pillMode ? '<p class="source-chat-hint">Cambios guardados en tu tienda.</p>' : ''}
    </article>`;
  }
  /** Untouched: the current revision is the one a template produced, so another template can replace it freely. */
  function templateUntouched() {
    const brief = version?.snapshot?.brief;
    return Boolean(brief?.templateId && version?.revision === state.revision && brief.templateRevision === state.revision);
  }
  /** Only YAPI's latest set of Plantilla cards can be chosen; the API rejects older sets. */
  function latestTemplateChoicesId() {
    return messages.filter(message => Array.isArray((message.metadata as JsonRecord | undefined)?.templateChoices)).at(-1)?.id;
  }

  function storeTools(locked: boolean) {
    const unavailable = disabled(locked || !storeId);
    return `<details class="source-store-menu source-disclosure"><summary>Mi tienda</summary><nav class="source-disclosure-panel" aria-label="Herramientas de mi tienda">
      <section><h2>Diseño y contenido</h2><button id="source-brand" ${unavailable}>Identidad de mi marca</button><button id="source-content" ${unavailable}>Contenido y ofertas</button><button id="source-pages" ${disabled(locked || !storeId || !version)}>Páginas de mi tienda</button><button data-start-photo ${disabled(locked || !storeId || historical() || assets.length > 0)}>Diseñar desde una foto</button></section>
      <section><h2>Marketing</h2><button id="source-retention" ${unavailable}>Correos, Comeback y promociones</button>${embedded ? `<button data-business-view="integrations" ${unavailable}>Integraciones</button><button data-business-view="experiments" ${unavailable}>Pruebas A/B</button>` : ''}</section>
      <section><h2>Configuración</h2><button id="source-shipping" ${unavailable}>Envíos y retiro</button><button id="source-domain" ${unavailable}>Tu propio dominio</button><button id="source-arrangement" ${unavailable}>Cómo se ven tus productos</button><button id="source-recommendations" ${unavailable}>Recomendaciones</button></section>
      <section><h2>Productos</h2><button id="source-digital" ${unavailable}>Archivos digitales</button></section>
      <section><h2>Finanzas</h2><button id="source-credits" ${unavailable}>Tarjetas de regalo y saldos</button></section>
      <section><h2>Contenido web</h2><button id="source-redirects" ${unavailable}>Artículos y redirecciones</button></section>
    </nav></details><input type="file" data-product-photo-input accept="image/png,image/jpeg,image/webp" hidden>`;
  }
  function sendProductPhoto() {
    if (!productPhoto || assets.length !== 1 || assets[0].file.type === 'video/mp4') return;
    void send(`Construye un borrador completo de mi tienda a partir del único producto de esta foto. Te delego el diseño, los colores y la composición. Usa esta imagen como foto del producto, conserva los datos confirmados y no inventes precio, stock, reseñas ni condiciones de entrega. No publiques. ${instruction.trim().slice(0, 11000)}`, 'product-photo');
  }
  /** YAPI in design mode: the cards waiting for an answer, the conversation sheet and the pill (spec 2026-10-22 v2). */
  function pillParts() {
    const latest = [...messages].reverse().find(m => m.role === 'ASSISTANT');
    // The merchant can put the cards away; the next YAPI message brings them back.
    const waiting = latest && latest.id !== cardsHiddenFor && needsAnswer(latest, state.revision) ? chatMessage(latest) : '';
    const locked = busy || visualEditPending || dirty() || Boolean(productForm);
    // From 900px the parts stack in a glass panel fixed at the left (owner 2026-10-23); narrower, the panel is display:contents.
    return `<button type="button" class="yapi-dock-open${waiting ? ' has-news' : ''}" data-yapi-dock-open aria-label="Mostrar a YAPI"><img src="${import.meta.env.BASE_URL}logo-mark.png" alt="" width="22" height="22">YAPI</button><aside class="yapi-dock" aria-label="YAPI"><button type="button" class="yapi-dock-hide" data-yapi-dock-hide aria-label="Ver la tienda en pantalla completa" title="Pantalla completa"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>${renderHistory(historyOpen, messages.map(chatMessage).join(''))}${waiting || error ? `<div class="yapi-cards${waiting ? ' is-waiting' : ''}" data-yapi-cards>${waiting ? '<button type="button" class="yapi-cards__hide" data-yapi-cards-hide aria-label="Ocultar">×</button>' : ''}${waiting}${error ? `<p class="auth-error" role="alert">${escape(merchantSafeText(error))}</p>` : ''}</div>` : ''}
      ${productForm ? '<div class="yapi-sheet" data-yapi-product-host></div>' : ''}
      ${renderPill({ instruction, busy: locked || historical() || !storeId, spin: yapiSpin(), selectionLabel: selection.get() ? selectionChipLabel(selection.get()!) : undefined, attachments: productPhoto ? '' : attachmentBatch(), menuOpen: plusOpen, logo: `${import.meta.env.BASE_URL}logo-mark.png` })}</aside>`;
  }
  const docked = () => window.matchMedia?.('(min-width: 900px)').matches ?? false;
  const yapiSpin = () => spinState({ building: building(), followingOwnRequest: false, reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
  /** The pill, the cards above it and YAPI's bubble, placed together after every render, drag and resize. */
  function placeYapi() {
    const box = app.querySelector<HTMLElement>('[data-yapi-pill]');
    if (!box) return;
    if (docked() && dockHidden) { if (!narratorWindow.element.isConnected) document.body.append(narratorWindow.element); narratorWindow.anchor(null); narratorWindow.spinning(yapiSpin()); return; }
    if (docked()) {
      // The panel's CSS lays its parts out. YAPI's words (progress, store news) sit inside it above the composer, never as a
      // window over the conversation (owner 2026-10-23); the anchor only keeps the window's corner pill away.
      const parts = [box, app.querySelector<HTMLElement>('[data-yapi-product-host]'), app.querySelector<HTMLElement>('[data-yapi-cards]')].filter((el): el is HTMLElement => Boolean(el));
      for (const el of parts) for (const key of ['left', 'top', 'bottom', 'width'] as const) el.style[key] = '';
      if (narratorWindow.element.nextElementSibling !== box) box.before(narratorWindow.element);
      narratorWindow.anchor({ left: 0, top: 0, width: box.offsetWidth });
      narratorWindow.spinning(yapiSpin());
      return;
    }
    if (!narratorWindow.element.isConnected || narratorWindow.element.closest('.yapi-dock')) document.body.append(narratorWindow.element);
    const at = placePill(pillPlace, { width: box.offsetWidth, height: box.offsetHeight }, { width: innerWidth, height: innerHeight });
    Object.assign(box.style, at.docked ? { left: '0px', top: `${at.top}px`, width: '100%' } : { left: `${at.left}px`, top: `${at.top}px`, width: '' });
    // Cards and YAPI's bubble stack above the pill, held by their bottom edge; below it when the pill is near the top.
    const above = at.top >= 220;
    let block = { top: at.top, height: box.offsetHeight };
    for (const sheet of [app.querySelector<HTMLElement>('[data-yapi-product-host]'), app.querySelector<HTMLElement>('[data-yapi-cards]')]) {
      if (!sheet) continue;
      sheet.style.left = `${at.left + box.offsetWidth / 2}px`;
      if (above) Object.assign(sheet.style, { top: 'auto', bottom: `${innerHeight - block.top + 12}px` });
      else Object.assign(sheet.style, { bottom: 'auto', top: `${block.top + block.height + 12}px` });
      const r = sheet.getBoundingClientRect();
      block = { top: r.top, height: r.height };
    }
    narratorWindow.anchor(above ? { left: at.left, top: block.top, width: box.offsetWidth } : { left: at.left, top: Math.min(block.top, 159), width: box.offsetWidth, height: block.top + block.height - Math.min(block.top, 159) });
    narratorWindow.spinning(yapiSpin());
  }
  function bindPill() {
    // Publicar stands alone at the top right, outside the fading tools bar (review 2026-10-22).
    const publishControls = app.querySelector<HTMLElement>('.canvas-toolbar .source-publish-controls');
    if (publishControls) { const corner = document.createElement('div'); corner.className = 'yapi-publish'; corner.append(publishControls); app.querySelector('.studio-shell')?.append(corner); }
    const star = app.querySelector<HTMLElement>('[data-yapi-star]');
    const box = app.querySelector<HTMLElement>('[data-yapi-pill]');
    let drag: { id: number; dx: number; dy: number } | null = null;
    star?.addEventListener('pointerdown', event => { if (!box || docked()) return; const r = box.getBoundingClientRect(); drag = { id: event.pointerId, dx: event.clientX - r.left, dy: event.clientY - r.top }; star.setPointerCapture?.(event.pointerId); event.preventDefault(); });
    star?.addEventListener('pointermove', event => { if (drag?.id !== event.pointerId) return; pillPlace = { x: event.clientX - drag.dx, y: event.clientY - drag.dy }; placeYapi(); });
    star?.addEventListener('pointerup', event => { if (drag?.id !== event.pointerId) return; drag = null; savePlace(safeStorage(), pillPlace); });
    star?.addEventListener('dblclick', () => { if (docked()) return; pillPlace = null; savePlace(safeStorage(), null); placeYapi(); });
    star?.addEventListener('keydown', event => { if (!box || docked()) return; const next = nudge(pillPlace, event.key, { width: box.offsetWidth, height: box.offsetHeight }, { width: innerWidth, height: innerHeight }); if (next !== pillPlace) { event.preventDefault(); pillPlace = next; savePlace(safeStorage(), pillPlace); placeYapi(); } });
    app.querySelector('[data-yapi-plus]')?.addEventListener('click', () => { plusOpen = !plusOpen; render(); });
    app.querySelector('[data-yapi-history-open]')?.addEventListener('click', () => { historyOpen = true; render(); });
    app.querySelector('[data-yapi-dock-hide]')?.addEventListener('click', () => { dockHidden = true; saveDockHidden(); render(); });
    app.querySelector('[data-yapi-dock-open]')?.addEventListener('click', () => { dockHidden = false; saveDockHidden(); render(); app.querySelector<HTMLTextAreaElement>('#agent-command')?.focus(); });
    app.querySelector('[data-yapi-cards-hide]')?.addEventListener('click', () => { cardsHiddenFor = [...messages].reverse().find(m => m.role === 'ASSISTANT')?.id ?? ''; render(); });
    app.querySelector('[data-yapi-history-close]')?.addEventListener('click', () => { historyOpen = false; render(); });
    app.querySelector('[data-yapi-exit]')?.addEventListener('click', () => { notifyParent({ type: 'pagosya:design-focus', open: false }); notifyParent({ type: 'pagosya:workspace', view: 'stores' }); });
    app.querySelector<HTMLTextAreaElement>('#agent-command')?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); app.querySelector<HTMLFormElement>('[data-yapi-pill]')?.requestSubmit(); } });
    stopFade?.();
    const tools = app.querySelector<HTMLElement>('.canvas-toolbar');
    stopFade = tools ? fadeWhenIdle(tools) : undefined;
    // The panel's conversation is always open: show its latest message.
    const list = docked() ? app.querySelector<HTMLElement>('.yapi-dock .yapi-history__list') : null;
    if (list) list.scrollTop = list.scrollHeight;
    placeYapi();
  }
  if (pillMode) {
    window.addEventListener('resize', () => placeYapi());
    document.addEventListener('keydown', event => {
      const field = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (event.key === 'Escape' && (historyOpen || plusOpen)) { historyOpen = false; plusOpen = false; render(); return; }
      if (event.key === '/' && !field) { event.preventDefault(); app.querySelector<HTMLTextAreaElement>('#agent-command')?.focus(); }
    });
  }
  /** Owner 2026-10-28 («way too many refreshes»): every redraw rebuilt the preview frame, so a check finishing or a cost
   *  estimate reloaded the whole store. The loaded frame is moved aside before the redraw and put back in place of the new
   *  one; renderPreview then leaves it alone when its page has not changed. Browsers without moveBefore reload as before. */
  type MovableParent = ParentNode & { moveBefore?: (node: Node, child: Node | null) => void };
  function carryPreviewOut(): HTMLIFrameElement | null {
    const frame = app.querySelector<HTMLIFrameElement>('iframe');
    const body = document.body as MovableParent;
    if (!frame || !shownPreviews.has(frame) || typeof body.moveBefore !== 'function') return null;
    try { frame.style.display = 'none'; body.moveBefore(frame, null); return frame; } catch { return null; }
  }
  function carryPreviewIn(kept: HTMLIFrameElement | null) {
    if (!kept) return;
    const fresh = app.querySelector<HTMLIFrameElement>('iframe');
    const parent = fresh?.parentNode as MovableParent | null;
    if (!fresh || !parent?.moveBefore || fresh.title !== kept.title || fresh.getAttribute('sandbox') !== kept.getAttribute('sandbox')) { kept.remove(); return; }
    try {
      for (const name of fresh.getAttributeNames()) if (name !== 'srcdoc' && name !== 'src') kept.setAttribute(name, fresh.getAttribute(name)!);
      kept.style.cssText = fresh.style.cssText;
      parent.moveBefore(kept, fresh); fresh.remove();
    } catch { kept.remove(); }
  }
  function render() {
    renderedAt = performance.now();
    const pageMenuOpen = Boolean(app.querySelector<HTMLDetailsElement>('.source-page-menu')?.open);
    // An async render while the merchant is typing to YAPI (cost estimate, checks) rebuilds the
    // composer; its text survives via `instruction`, so only focus and caret need carrying over.
    const typing = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.id === 'agent-command'
      ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
    const oldStream = app.querySelector<HTMLElement>('[data-agent-stream]');
    const oldScroll = oldStream?.scrollTop || 0;
    const nearBottom = !oldStream || oldStream.scrollHeight - oldScroll - oldStream.clientHeight < 70;
    const locked = busy || visualEditPending || dirty() || Boolean(productForm);
    if (!bocetoPhase() || productPhoto) { bocetoOpen = false; bocetoConfirm = false; }
    const inBoceto = Boolean(bocetoOpen && version && mode === 'preview');
    // A RUNNING proposal only shows while its build runs; once the cards are ready they wait for the pick.
    // A picked style whose build failed shows again for Reintentar, but not while that build (or another) is running.
    // Choosable cards (spec 2026-10-12) stay on screen after the request ended, while their heroes are still being drawn.
    const showStyles = !inBoceto && mode === 'preview' && (styleView ? styleView.status === 'PICKED' ? !building() : styleView.status === 'AWAITING_STYLE' || (styleView.status === 'RUNNING' && styleView.pickable === true) || building() : building() && buildProgress?.steps.at(-1)?.stage === 'styles');
    if (!sessionStorage.getItem(SESSION_STORAGE_KEY)) {
      if (embedded) { notifyParent({ type: 'pagosya:session-expired' }); app.innerHTML = '<p>Tu sesión terminó. Vuelve a entrar desde el panel.</p>'; return; }
      app.innerHTML = renderStudioLogin({ busy, error });
      app.querySelector('form')?.addEventListener('submit', event => {
        event.preventDefault(); const fields = new FormData(event.currentTarget as HTMLFormElement);
        void action(async () => { const login = await api.login(String(fields.get('email')), String(fields.get('password'))); sessionStorage.setItem(SESSION_STORAGE_KEY, login.token); api.setToken(login.token); await boot(); });
      });
      return;
    }
    if (loading) {
      app.innerHTML = `<main class="studio-loading" aria-live="polite"><img src="${import.meta.env.BASE_URL}logo-mark.png" alt=""><h1>Conectando tu tienda…</h1><div class="loading-line"><i></i></div></main>`;
      return;
    }
    const store = stores.find(s => s.id === storeId);
    const keptPreview = carryPreviewOut();
    app.innerHTML = `<div class="studio-shell source-mode ${embedded ? 'source-embedded' : ''}${pillMode ? ' is-yapi-pill' : ''}${pillMode && dockHidden ? ' is-dock-hidden' : ''}">
      ${pillMode ? renderExit() : `<header class="topbar connected-topbar">
        <a class="product-mark" href="/" aria-label="pagosYa Merchant Studio"><img src="${import.meta.env.BASE_URL}logo-mark.png" alt=""><span>pagosYa</span><i></i><strong>Merchant Studio</strong></a>
        <div class="connected-store-select"><span>Mi tienda</span><strong>${escape(store?.name || 'Sin tienda')}</strong></div>
        <div class="save-state">${icon('check')} ${dirty() ? 'Cambios sin guardar' : version ? version.revision === state.publication?.revision && state.publication.active ? 'Diseño publicado' : 'Diseño guardado' : 'Conectado'}</div>
        <div class="top-actions"><button class="button button--ghost" id="source-logout" ${disabled(locked)}>Salir</button><button class="button button--publish" id="${embedded ? 'source-top-export' : 'source-export'}" ${disabled(locked || !version || showingDraft())}>Descargar ZIP</button></div>
      </header>`}
      <div class="studio-workspace${inBoceto ? ' is-boceto is-boceto-left-yapi' : ''}">
        ${pillMode ? '' : `<aside class="agent-panel ${chatExpanded || building() || error || (!version && !productPhoto) ? 'is-chat-expanded' : ''} ${productForm ? 'is-creating-product' : ''}" aria-label="${productForm ? 'Crear producto' : 'Conversación con YAPI'}">
          <header class="agent-header"><div>${embedded ? '<button type="button" id="source-back-stores">← Mis tiendas</button>' : ''}<span class="agent-wordmark">YAPI</span><span class="online"><i></i> Sitio a medida</span></div><div class="agent-header-actions"><button type="button" id="source-chat-toggle" aria-expanded="${Boolean(chatExpanded || building() || error || !version)}" aria-controls="source-chat-history">${chatExpanded ? 'Ocultar conversación' : 'Ver conversación'}</button><button class="icon-button" id="source-reload" aria-label="Actualizar conversación" ${disabled(locked)}>${icon('undo')}</button></div></header>
          <div class="agent-stream" id="source-chat-history" data-agent-stream><div data-source-readiness></div><div data-assumed-facts>${renderAssumedFacts({ facts: assumedFacts, editing: factEditing, locked })}</div>
            ${messages.length ? messages.map(chatMessage).join('') : version
              // A store whose design was made without a chat (a template, an import, a demo) is past the first question
              // (owner 2026-10-22: every such store opened on «Antes de crear el sitio…»).
              ? `<section class="conversation-welcome">${renderFaceMark({ size: 30 })}<strong>Tu tienda ya tiene diseño.</strong><p>Pídeme lo que quieras cambiar: textos, colores, fotos o secciones.</p></section>`
              : `<section class="conversation-welcome">${renderFaceMark({ size: 30 })}<strong>Tu sitio empieza con una conversación.</strong><p data-setup-prompt>${escape(setup?.prompt || `Antes de crear el sitio de ${store?.name || 'tu negocio'}, aclaremos tu negocio y el estilo que buscas. ¿Qué vendes y a quién quieres llegar?`)}</p></section>`}
            ${building() ? `${pendingSubmission ? `<article class="message message--remote-user" data-pending-request>${attachmentGallery(pendingSubmission.files)}<p>${escape(pendingSubmission.text)}</p>${pendingSubmission.imageCount && !pendingSubmission.files.length ? `<small>${pendingSubmission.imageCount} ${pendingSubmission.imageCount === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</small>` : ''}</article>` : ''}<article class="agent-note remote-agent-note"><div class="agent-note__meta"><strong>YAPI</strong></div><div data-build-progress aria-label="Proceso de YAPI">${buildProgress ? renderBuildProgress(buildProgress, true) : `<p class="build-waiting" role="status">${escape(buildStatus)}</p>`}</div></article>` : ''}
            ${dirty() ? '<p class="source-chat-hint">Guarda o descarta la edición de código antes de pedir otro cambio.</p>' : ''}
            ${error ? `<p class="auth-error" role="alert">${escape(merchantSafeText(error))}</p>${retrySubmission ? `<button type="button" class="button button--secondary" id="source-retry-message" ${disabled(locked || historical() || Boolean(instruction.trim()) || assets.length > 0)}>Reintentar mensaje</button>` : ''}` : ''}
            ${!storeId ? '<section class="remote-empty-state"><strong>No hay una tienda todavía.</strong><p>Crea una tienda en el dashboard para comenzar.</p></section>' : ''}
          </div>
          <div class="source-compose-area">${!version ? `<label class="source-purpose-choice">Quiero crear<select id="source-site-purpose" ${disabled(locked)}>${[['shop','Una tienda'],['service','Un sitio de servicios'],['portfolio','Un portafolio'],['editorial','Un sitio editorial']].map(([value,label]) => `<option value="${value}" ${generationSettings.sitePurpose === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}${generationControls(locked)}<label class="source-purpose-choice source-navigation-choice">¿Cómo se navegará tu sitio?<select id="source-navigation-choice" ${disabled(locked)}><option value="" ${!navigationChoice ? 'selected' : ''}>${version ? 'Conservar navegación actual' : 'Elegir navegación'}</option><option value="dropdown" ${navigationChoice === 'dropdown' ? 'selected' : ''}>Tienda con menú desplegable</option><option value="pages" ${navigationChoice === 'pages' ? 'selected' : ''}>Páginas separadas en el mismo sitio</option></select></label>
          <div data-selection-host>${selectionMarkup()}</div>
          ${renderStudioComposer({ busy: locked || historical() || !storeId, source: true, instruction, attachments: productPhoto ? '' : attachmentBatch(), suggestions: setup || productPhoto ? [] : version ? [
            { label: 'Crear producto', action: 'create-product' },
            { label: 'Rediseñar sitio', instruction: 'Rediseña todo mi sitio con una dirección visual nueva basada en mi negocio, mis fotos y mis referencias. Conserva los productos y los datos confirmados.' },
            { label: 'Mejorar el móvil', instruction: 'Mejora la lectura y la navegación en móvil sin cambiar los productos.' },
          ] : [
            { label: 'Presentar mi negocio', instruction: 'Quiero un sitio para dar a conocer mi negocio. Te cuento lo que hago: ' },
            { label: 'Vender mis productos', instruction: 'Quiero crear una tienda para vender mis productos. Mi negocio es: ' },
          ] })}</div>
        </aside>`}
        <main class="canvas-panel connected-canvas source-canvas" aria-label="Sitio a medida">
          <header class="canvas-toolbar">${embedded ? `<div class="source-store-menu-host" hidden>${storeTools(locked)}</div>` : storeTools(locked)}${inBoceto ? `<span class="boceto-mode-badge">Boceto</span><button class="button" id="source-boceto-close" aria-pressed="true" title="Desactivar edición manual" ${disabled(locked)}>Editar en Boceto</button><div class="boceto-page-tabs" role="tablist" aria-label="Páginas del boceto">${[['index.html', 'Inicio'], ['product.html', 'Producto'], ['checkout.html', 'Pedido'], ...(version!.snapshot.files.some(f => f.path === 'components/auth/login.tsx') ? [['acceso-ingresar.html', 'Cuenta']] : [])].map(([file, label]) => `<button type="button" data-boceto-page="${file}" aria-pressed="${page === file}">${label}</button>`).join('')}</div><button class="button button--publish" id="source-boceto-generate" ${disabled(locked)}>Generar sitio</button>` : `${embedded ? '' : studioModeNav('source', locked || Boolean(instruction.trim()))}<div class="source-view-controls"><button id="source-preview-tab" aria-pressed="${Boolean(version) && mode === 'preview'}">${icon('eye')} Vista previa</button><button id="source-code-tab" aria-pressed="${mode === 'code'}" ${disabled(!version || showingDraft() || bocetoPhase())}><span class="source-code-symbol" aria-hidden="true">&lt;/&gt;</span> Código</button><button id="source-select-mode" title="Toca una sección o dibuja un círculo alrededor de lo que quieres cambiar" aria-pressed="${selectMode && mode === 'preview'}" ${disabled(!version || showingDraft() || mode !== 'preview' || visualEditing || locked)}>Seleccionar</button>${bocetoPhase() ? `<button id="source-boceto-tab" aria-pressed="false" title="Activar edición manual" ${disabled(locked || showingDraft() || historical())}>Editar en Boceto</button>` : ''}</div>${version && mode === 'preview' ? renderPagePicker(showingDraft() ? liveDraft!.snapshot.files : version.snapshot.files, page, locked) : ''}<button class="button" id="source-open-browser" title="${browserHint()}" ${disabled(locked || !version)}>${icon('external')} Ver en navegador</button><button class="icon-button" id="source-width" aria-label="${mobile ? 'Ver escritorio' : 'Ver móvil'}" aria-pressed="${mobile}">${icon('desktop')}</button><div class="source-publish-controls">${bocetoPhase() ? `<button class="button button--publish" id="source-boceto-generate" ${disabled(locked || historical() || showingDraft())}>Generar sitio</button>` : `${state.publication?.revision ? `<button id="source-visibility" class="source-visibility" role="switch" aria-label="Tienda publicada" aria-checked="${state.publication.active}" ${disabled(locked)}><span aria-hidden="true"></span>${state.publication.active ? 'Publicado' : 'Sin publicar'}</button>` : ''}${version ? renderSourcePublication(state, version, { locked: locked || showingDraft(), checking, failed: !checksPassed(), slug: store?.slug || '', expanded: testsExpanded, detailsOpen: publicationOpen }) : ''}${!version || version.revision !== state.publication?.revision ? `<button class="button button--publish" id="source-publish" ${disabled(locked || showingDraft() || checking || !checks || Boolean(checks.some(c => c.status === 'failed')) || !version || state.publication?.experiment?.status === 'RUNNING')}>${state.publication?.revision ? 'Publicar estos cambios' : 'Publicar este diseño'}</button>` : ''}`}</div>`}</header>
          <div class="source-canvas-notice">${building() && !pillMode ? `<div class="source-job-status" role="status"><span>${buildSession.phase === 'running' ? 'Tu pedido sigue guardado aunque cierres esta página.' : 'Enviando tu pedido…'}</span><button class="button" id="source-cancel-job" ${disabled(buildSession.phase !== 'running')}>Cancelar pedido</button></div>` : ''}${liveDraft?.interrupted && !building() ? `<div class="source-draft-recovery" role="status"><span>${draftRetry ? 'Este borrador todavía no está guardado. Guárdalo para seguir trabajando sobre él.' : 'Tu borrador está conservado. Reintenta para completar la verificación antes de publicarlo.'}</span>${draftRetry ? `<button class="button button--primary" id="source-save-draft" ${disabled(locked)}>Guardar borrador</button>` : ''}<button class="button" id="source-toggle-saved">${showSavedRevision ? 'Ver borrador conservado' : 'Ver diseño guardado'}</button></div>` : ''}${reviewNoteMarkup(Boolean(state.reviewPending) && !building())}</div>
          ${productPhoto && assets[0] ? `<section class="preview-frame source-photo-preview" aria-label="Crear tienda desde un producto"><img src="${escape(assets[0].src)}" alt="Foto del producto para crear tu tienda"><div class="source-photo-ready"><h1>De un producto a tu tienda.</h1><p>YAPI usará esta foto para proponer el diseño, los colores y la composición. Puedes añadir detalles en el chat.</p><p>Completa el nombre, el precio y los datos de venta antes de publicar.</p><button class="button button--publish" id="source-create-photo" ${disabled(locked || !storeId)}>Crear tienda desde esta foto</button><button class="text-button" id="source-photo-cancel" ${disabled(locked)}>Usar como adjunto normal</button><button class="text-button" data-remove-asset="0" ${disabled(locked)}>Quitar foto</button></div></section>` : showStyles ? renderStylePicker(styleView, { open: styleOpen, device: styleDevice, storeName: store?.name || '', busy: locked }) : designing ? `<div class="source-designing" role="status"><p class="source-designing__title">YAPI está diseñando tu tienda</p><p class="source-designing__step" data-designing-step>${escape(buildStatus)}</p></div>` : showingDraft() ? `<div class="preview-frame remote-preview source-frame-wrap is-live-draft ${mobile ? 'is-mobile' : ''}"><span class="live-draft-badge" data-live-draft-badge role="status">${building() ? 'Borrador en vivo · YAPI sigue trabajando' : 'Borrador conservado · Falta completar la verificación'}</span><iframe title="Vista previa del borrador" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div>` : version ? mode === 'preview' ? (bocetoOpen ? `<div class="boceto-canvas"><div class="preview-frame remote-preview source-frame-wrap ${mobile ? 'is-mobile' : ''}"><iframe title="Vista previa del sitio" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div><div class="boceto-canvas__hud"><button type="button" data-canvas-out>−</button><span data-canvas-zoom>82%</span><button type="button" data-canvas-in>+</button><button type="button" data-canvas-fit>Ajustar</button></div></div>` : `<div class="preview-frame remote-preview source-frame-wrap ${mobile ? 'is-mobile' : ''}"><iframe title="Vista previa del sitio" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div>`) : renderCodeBrowser(version.snapshot.files, filePath, busy, Boolean(dirty())) : building() ? `<section class="source-empty-preview source-build-canvas" aria-label="YAPI está creando tu sitio"><div data-build-stage-host>${renderBuildStage({ status: buildStatus, progress: buildProgress })}</div></section>` : renderInspiration({ busy: building(), disabled: locked || !storeId || assets.length > 0, commerce: generationSettings.sitePurpose === 'shop' })}
          <footer class="canvas-status"><span>${icon('lock')} Vista previa · sin cobros</span><span>${dirty() ? 'Edición sin guardar' : version ? 'Diseño actual' : 'Esperando tu idea'}</span></footer>
        </main>${pillMode ? pillParts() : ''}
      </div>${visualEditing && version ? '<div data-source-direct-edit></div>' : ''}${bocetoOpen && version && mode === 'preview' ? '<div data-source-boceto></div>' : ''}${toast ? `<div class="toast" role="status">${escape(toast)}</div>` : ''}${bocetoPhase() && bocetoConfirm ? `<div class="boceto-confirm" role="dialog" aria-modal="true" aria-labelledby="boceto-confirm-title"><div class="boceto-confirm__card"><h2 id="boceto-confirm-title">Generar sitio</h2><p>Tu boceto se convertirá en sitio web. Después ya no podrás editarlo por bloques; podrás pedirle cambios a YAPI y ver el código.</p><div class="boceto-confirm__actions"><button type="button" class="button" data-boceto-confirm="cancel">Cancelar</button><button type="button" class="button button--publish" data-boceto-confirm="go">Generar sitio</button></div></div></div>` : ''}
    </div>`;
    carryPreviewIn(keptPreview);
    const pageMenu = app.querySelector<HTMLDetailsElement>('.source-page-menu');
    if (pageMenu) pageMenu.open = pageMenuOpen;
    bind(); updateChecks(); fitStyleFrames(app);
    // Entering the boceto phase (first load, or a new store's first boceto) frames the page on the board once.
    if (inBoceto && !bocetoFitted) { bocetoFitted = true; requestAnimationFrame(() => fitCanvas()); }
    if (!inBoceto) bocetoFitted = false;
    // render() replaced the DOM, so the previous stage's timer and game are gone.
    buildStage?.destroy();
    const stageHost = app.querySelector<HTMLElement>('[data-build-stage-host]');
    buildStage = stageHost ? mountBuildStage(stageHost, { plain: pillMode }) : null;
    buildStage?.update({ status: buildStatus, progress: buildProgress });
    // The idle canvas runs the same face as the build stage, so the wait
    // before a site exists and the wait while one is built speak one language.
    idleFace?.destroy();
    const idleStage = app.querySelector<HTMLElement>('.inspiration-stage [data-face]');
    idleFace = idleStage ? mountFace(idleStage) : null;
    // The playground fills the page while there is no site; while YAPI builds nothing animates, so the stars leave.
    if (!version && !building() && !starField) starField = mountStarField(document.body);
    if ((version || building()) && starField) { starField.destroy(); starField = null; }
    const bocetoHost = app.querySelector<HTMLElement>('[data-source-boceto]');
    if (bocetoHost && version) bocetoPanel.mount(bocetoHost, {
      storeId, version, locked: busy || dirty() || historical(),
      // Smooth loop: saves stay silent (no preview reload); the Studio only tracks the new revision so
      // later requests do not conflict. A full resync happens once, when the merchant closes Boceto.
      saved: async revision => { state.revision = revision; if (version) version.revision = revision; },
      // Structural edits (items or blocks added, removed, reordered from the panel) need the rebuilt page:
      // only the preview frame re-renders, so the canvas zoom, pan and panels stay where they are.
      reload: revision => {
        const reloadStore = storeId;
        void api.sourceVersion(reloadStore, revision).then(fresh => {
          if (storeId !== reloadStore || state.revision !== revision || !bocetoOpen) return;
          version = fresh;
          const frame = app.querySelector<HTMLIFrameElement>('.source-frame-wrap iframe');
          if (frame) void renderPreview(frame);
        }).catch(() => { /* the next save or closing Boceto resyncs */ });
      },
      // The chat stays on the left; section layers and properties share the right inspector.
      chatOnLeft: true,
      selected: block => {
        if (!bocetoOpen) return;
        if (block) selection.set({ sectionId: `skb-${block.id}`, label: block.label }); else selection.clear();
        renderSelection();
      },
      resized: () => fitCanvas(),
      apply: payload => { try { if (bocetoOpen) app.querySelector<HTMLIFrameElement>('.source-frame-wrap iframe')?.contentWindow?.postMessage({ type: 'pagosya:boceto-apply', ...payload }, '*'); } catch { /* frame gone */ } },
    });
    const directHost = app.querySelector<HTMLElement>('[data-source-direct-edit]');
    if (directHost && version) directEditor.mount(directHost, {
      storeId, version, locked: busy || dirty() || historical(),
      close: () => { visualEditing = false; render(); app.querySelector<HTMLElement>('#source-visual-edit')?.focus(); },
      pending: value => { visualEditPending = value; render(); },
      saved: async () => { await load(); toast = 'Cambio visual guardado.'; render(); },
      prepare: text => { visualEditing = false; instruction = text; render(); focusComposer(); scheduleEstimate(); },
    });

    const stream = app.querySelector<HTMLElement>('[data-agent-stream]');
    if (stream && productForm) { stream.append(productForm.element); stream.scrollTop = oldScroll; }
    const productHost = app.querySelector<HTMLElement>('[data-yapi-product-host]');
    if (productHost && productForm) productHost.append(productForm.element);
    else if (stream) stream.scrollTop = nearBottom ? stream.scrollHeight : oldScroll;
    const editor = app.querySelector<HTMLTextAreaElement>('#source-code');
    if (editor) { const file = version!.snapshot.files.find(f => f.path === filePath); editor.value = file?.encoding === 'base64' ? `Recurso multimedia: ${file.path}` : draft ?? file?.content ?? ''; mountCodeHighlight(editor, file?.encoding === 'base64' ? '' : filePath); }
    const frame = app.querySelector<HTMLIFrameElement>('iframe');
    if (frame && (version || showingDraft())) void renderPreview(frame);
    if (typing) {
      const field = app.querySelector<HTMLTextAreaElement>('#agent-command');
      if (field && !field.disabled) {
        field.focus({ preventScroll: true });
        try { field.setSelectionRange(typing.start ?? field.value.length, typing.end ?? field.value.length); } catch { /* best effort */ }
      } else if (focusDebugEnabled()) {
        recordFocusLoss({ kind: 'render', reason: field ? 'composer-disabled' : 'composer-missing', busy, visualEditPending, dirty: dirty(), productForm: Boolean(productForm), mode, storeId });
      }
    }
  }
const focusComposer = () => { const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); field?.focus(); field?.scrollIntoView({ block: 'nearest' }); };
  function bind() {
    if (pillMode) bindPill();
    app.querySelectorAll<HTMLButtonElement>('[data-style-card]').forEach(button => button.addEventListener('click', () => { styleOpen = Number(button.dataset.styleCard); render(); }));
    app.querySelector('[data-style-close]')?.addEventListener('click', () => { styleOpen = null; render(); });
    // «Datos que YAPI supuso» (spec 2026-10-14): Confirmar and Editar save at once; Quitar asks YAPI for a short edit.
    app.querySelectorAll<HTMLButtonElement>('[data-fact-confirm]').forEach(button => button.addEventListener('click', () => void action(async () => {
      const saved = await api.confirmAssumedFact(storeId, button.dataset.factConfirm!, state.revision);
      await load(saved.revision);
      toast = 'Dato confirmado.';
    })));
    app.querySelectorAll<HTMLButtonElement>('[data-fact-edit]').forEach(button => button.addEventListener('click', () => { factEditing = button.dataset.factEdit!; render(); }));
    app.querySelector('[data-fact-cancel]')?.addEventListener('click', () => { factEditing = null; render(); });
    app.querySelector<HTMLFormElement>('[data-fact-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const text = String(new FormData(form).get('text') || '').trim();
      if (!text) return;
      void action(async () => {
        const saved = await api.editAssumedFact(storeId, form.dataset.factForm!, state.revision, text);
        await load(saved.revision);
        toast = saved.unwrapped.length ? `Dato corregido. También aparece sin marcar en ${saved.unwrapped.map(pageLabel).join(', ')}: pídele a YAPI que lo cambie ahí.` : 'Dato corregido en toda la tienda.';
      });
    });
    app.querySelectorAll<HTMLButtonElement>('[data-fact-remove]').forEach(button => button.addEventListener('click', () => void action(async () => {
      const result = await api.removeAssumedFact(storeId, button.dataset.factRemove!, state.revision);
      await load(result.revision);
      toast = result.removed ? 'YAPI quitó el dato y reescribió esas frases.' : 'YAPI no pudo quitar el dato en todas las páginas. Vuelve a intentarlo o corrígelo.';
    })));
    app.querySelectorAll<HTMLButtonElement>('[data-style-device]').forEach(button => button.addEventListener('click', () => { styleDevice = button.dataset.styleDevice as 'desktop' | 'phone'; render(); }));
    app.querySelector<HTMLButtonElement>('[data-style-use]')?.addEventListener('click', event => void pickStyle({ index: Number((event.currentTarget as HTMLButtonElement).dataset.styleUse) }));
    app.querySelector('[data-style-auto]')?.addEventListener('click', () => void pickStyle({ auto: true }));
    app.querySelector<HTMLButtonElement>('[data-style-retry]')?.addEventListener('click', event => void pickStyle({ index: Number((event.currentTarget as HTMLButtonElement).dataset.styleRetry) }));
    app.querySelector('#source-boceto-tab')?.addEventListener('click', () => {
      if (busy || dirty() || historical() || showingDraft() || !bocetoPhase()) return;
      bocetoOpen = true; bocetoFitted = false; mode = 'preview'; page = 'index.html';
      visualEditing = false; previewNavigation = {}; clearSelection(); viewing.clear(); render();
    });
    app.querySelector('#source-boceto-close')?.addEventListener('click', () => {
      if (busy) return;
      void action(async () => {
        if (!(await bocetoPanel.flush())) { toast = 'No se pudo guardar tu último cambio. Inténtalo de nuevo.'; return; }
        bocetoOpen = false; chatExpanded = true;
        clearSelection(); viewing.clear(); await load();
      });
    });
    // Boceto's own page tabs: look at the sketch's other pages; editing happens on Inicio.
    app.querySelectorAll<HTMLButtonElement>('[data-boceto-page]').forEach(button => button.addEventListener('click', () => {
      if (page === button.dataset.bocetoPage) return;
      page = button.dataset.bocetoPage!; previewNavigation = {}; clearSelection(); viewing.clear(); render();
      fitCanvas(); syncBocetoMode();
    }));
    app.querySelector('#source-boceto-generate')?.addEventListener('click', () => { if (busy) return; bocetoConfirm = true; render(); });
    app.querySelector('[data-boceto-confirm="cancel"]')?.addEventListener('click', () => { bocetoConfirm = false; render(); });
    // Generar sitio is final: save what is pending, build, and the Studio leaves the boceto phase with the new revision.
    app.querySelector('[data-boceto-confirm="go"]')?.addEventListener('click', () => {
      bocetoConfirm = false;
      void action(async () => {
        // The site is built from the saved boceto: a change that did not save would silently go missing.
        if (bocetoOpen && !(await bocetoPanel.flush())) { toast = 'No se pudo guardar tu último cambio. Inténtalo de nuevo.'; return; }
        try { await api.buildSketch(storeId, { revision: state.revision }); }
        catch (failure) {
          // A toast, not the chat's error line: the chat is hidden on the Diseño tab.
          if (failure instanceof ApiError && failure.status === 409) { await load(); toast = 'El boceto cambió. Revisa la versión más reciente y vuelve a generar.'; return; }
          toast = 'No se pudo generar. Inténtalo de nuevo.'; return;
        }
        page = 'index.html'; mode = 'preview';
        await load();
        toast = 'Sitio generado desde tu boceto. Revísalo y publícalo cuando quieras.';
      });
    });
    app.querySelector('[data-canvas-in]')?.addEventListener('click', () => { const board = canvasBoard(); if (board) zoomCanvasAt(1.2, board.clientWidth / 2, board.clientHeight / 2); });
    app.querySelector('[data-canvas-out]')?.addEventListener('click', () => { const board = canvasBoard(); if (board) zoomCanvasAt(1 / 1.2, board.clientWidth / 2, board.clientHeight / 2); });
    app.querySelector('[data-canvas-fit]')?.addEventListener('click', fitCanvas);
    // Zoom and pan also work from the dark board around the page, not only over the iframe.
    const board = canvasBoard();
    board?.addEventListener('wheel', event => {
      event.preventDefault();
      const rect = board.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomCanvasAt(wheelZoomFactor(event.deltaY), event.clientX - rect.left, event.clientY - rect.top);
      else { canvasX -= event.deltaX; canvasY -= event.deltaY; applyCanvas(); }
    }, { passive: false });
    app.querySelector('#source-visual-edit')?.addEventListener('click', () => { if (!busy && !dirty() && !visualEditPending) { visualEditing = !visualEditing; mode = 'preview'; render(); } });
    app.querySelector('#source-select-mode')?.addEventListener('click', () => { selectMode = !selectMode; if (!selectMode) clearSelection(); render(); });
    app.querySelector('[data-selection-host]')?.addEventListener('click', event => {
      const target = event.target as Element;
      if (target.closest('[data-selection-clear]')) { clearSelection(); renderSelection(); scheduleEstimate(); return; }
      const quick = target.closest<HTMLElement>('[data-quick-action]');
      if (quick) {
        const action = QUICK_ACTIONS.find(item => item.id === quick.dataset.quickAction);
        if (action) { instruction = action.instruction; const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); if (field) field.value = instruction; scheduleEstimate(); focusComposer(); }
        return;
      }
      if (target.closest('[data-selection-edit-text]') && editableField && !busy && !dirty()) {
        if (bocetoPhase()) { app.querySelector<HTMLButtonElement>('#source-boceto-tab')?.click(); return; }
        const wanted = editableField.value;
        selectMode = false; clearSelection(); visualEditing = true; mode = 'preview'; render(); directEditor.select(wanted, 'text');
      }
    });
    app.querySelector('#source-back-stores')?.addEventListener('click', () => notifyParent({ type: 'pagosya:workspace', view: 'stores' }));
    app.querySelector('#source-chat-toggle')?.addEventListener('click', () => { chatExpanded = !chatExpanded; render(); app.querySelector<HTMLElement>('#source-chat-toggle')?.focus(); });
    app.querySelector('[data-composer-action="create-product"]')?.addEventListener('click', () => {
      if (busy || dirty() || historical() || !storeId || productForm) return;
      plusOpen = false;
      productForm = createProductForm(api, storeId, () => void refreshCatalog(), () => {
        productForm?.dispose(); productForm = null; render();
        app.querySelector<HTMLButtonElement>('[data-composer-action="create-product"]')?.focus();
      });
      render(); app.querySelector('[data-agent-stream]')?.scrollTo({ top: 0 }); productForm.focus();
    });
    app.querySelector('[data-source-readiness]')?.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-readiness-action]');
      if (!button || button.disabled || busy || dirty()) return;
      const step = button.dataset.readinessAction;
      if (step === 'test') { void runChecks(true); return; }
      if (step === 'products') {
        if (embedded) notifyParent({ type: 'pagosya:workspace', view: 'products' });
        else location.assign(`${import.meta.env.VITE_DASHBOARD_ORIGIN || 'http://localhost:4323'}#dashboard-products`);
        return;
      }
      app.querySelector<HTMLButtonElement>(`#source-${step === 'publish' ? 'publish' : step}`)?.click();
    });
    for (const section of ['credits', 'digital', 'redirects'] as const) app.querySelector(`#source-${section}`)?.addEventListener('click', () => { if (!busy && !dirty() && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'integrations'}); else void openCommercePlatform(api, storeId, section); } });
    app.querySelectorAll('[data-start-scratch]').forEach(button => button.addEventListener('click', () => void send('Quiero crear mi tienda desde cero, sin usar plantillas.')));
    app.querySelectorAll('[data-choose-template]').forEach(button => button.addEventListener('click', () => void send('Quiero usar una plantilla.')));
    app.querySelectorAll('[data-start-photo]').forEach(button => button.addEventListener('click', () => { if (!busy && !dirty() && !historical() && !assets.length) app.querySelector<HTMLInputElement>('[data-product-photo-input]')?.click(); }));
    app.querySelector('[data-product-photo-input]')?.addEventListener('change', event => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (!files.length || busy || dirty() || historical() || assets.length) return;
      void action(async () => {
        if (files.length !== 1 || !['image/png', 'image/jpeg', 'image/webp'].includes(files[0].type)) throw new Error('Elige una foto de producto en JPG, PNG o WebP.');
        const file = await prepareSourceMedia(files[0]);
        assets = [{ file, src: URL.createObjectURL(file) }]; productPhoto = true; scheduleEstimate();
      }).then(() => { const button = app.querySelector<HTMLButtonElement>('#source-create-photo'); button?.focus(); button?.scrollIntoView({ block: 'nearest' }); });
    });
    app.querySelector('#source-create-photo')?.addEventListener('click', sendProductPhoto);
    app.querySelector('#source-photo-cancel')?.addEventListener('click', () => { productPhoto = false; render(); });
    app.querySelector('.source-store-menu nav')?.addEventListener('click', event => { if ((event.target as Element).closest('button')) { const details = app.querySelector<HTMLDetailsElement>('.source-store-menu'); if (details) { details.open = false; details.querySelector<HTMLElement>('summary')?.focus(); } } });
    app.querySelectorAll<HTMLButtonElement>('[data-business-view]').forEach(button => button.onclick = () => { if (!busy && !dirty()) notifyParent({type:'pagosya:workspace',view:button.dataset.businessView}); });
    app.querySelector('#source-retention')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({ type: 'pagosya:workspace', view: 'marketing', tab: 'program' }); else void openRetention(api, storeId, () => void refreshCatalog()); } });
    bindPagePicker(app, {
      select: next => { if (busy || dirty()) return; page = next; previewNavigation = {}; clearSelection(); viewing.clear(); render(); },
      manage: () => { if (!busy && storeId && version) app.querySelector<HTMLButtonElement>('#source-pages')?.click(); },
    });
    app.querySelector('#source-pages')?.addEventListener('click', () => { if (!busy && storeId && version) void openPagesPanel(api, storeId, version, { onAsk: text => { visualEditing = false; instruction = text; render(); focusComposer(); scheduleEstimate(); }, onAdded: () => void load() }); });
    app.querySelector('#source-content')?.addEventListener('click', () => { if (!busy && storeId) { void openCommerceContent(api, storeId); } });
    app.querySelector('#source-shipping')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'store-settings',section:'shipping'}); else void openShippingSettings(api, storeId, () => void refreshCatalog()); } });
    app.querySelector('#source-domain')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'store-settings',section:'domain'}); else void openDomainShop(api, storeId, () => void refreshCatalog()); } });
    app.querySelector('#source-recommendations')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'integrations'}); else void openRecommendations(api, storeId); } });
    app.querySelector('#source-arrangement')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'integrations'}); else void openCatalogArrangement(api, storeId, () => void refreshCatalog()); } });
    app.querySelector('#source-brand')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'store-settings',section:'brand'}); else void openBrandProfile(api, storeId); } });
    const on = (id: string, fn: () => void) => app.querySelector(`#${id}`)?.addEventListener('click', fn);

    app.querySelector('.source-publication-details')?.addEventListener('toggle', event => { const details = event.target as HTMLDetailsElement; if (details.isConnected) publicationOpen = details.open; });
    app.querySelector('.source-credit-details')?.addEventListener('toggle', event => { const details = event.target as HTMLDetailsElement; if (details.isConnected) creditsOpen = details.open; });
    app.querySelector('.source-experiments')?.addEventListener('toggle', event => { testsExpanded = (event.target as HTMLDetailsElement).open; });
    const publicationChanged = () => notifyParent({ type: 'pagosya:source-publication-changed', storeId, revision: state.publication?.revision, active: state.publication?.active, contactFormEnabled: state.publication?.contactFormEnabled });
    on('source-visibility', () => void action(async () => {
      state.publication = await api.sourceVisibility(storeId, !state.publication?.active, state.publication?.version || 0);
      toast = state.publication.active ? 'Tu tienda vuelve a estar publicada.' : 'Tienda sin publicar. Tu diseño sigue guardado.';
      publicationChanged();
    }));
    app.querySelector('#source-contact-form')?.addEventListener('change', event => {
      const enabled = (event.target as HTMLInputElement).checked;
      void action(async () => {
        const saved = await api.setSourceContactForm(storeId, state.revision, enabled);
        liveCatalog = null;
        await load(saved.revision || undefined);
        toast = enabled ? 'Formulario activado. Las consultas llegan a tu panel.' : 'Formulario desactivado.';
        publicationChanged();
      });
    });
    on('source-publish', () => void action(async () => {
      if (!version || !checksPassed()) throw new Error('Completa las comprobaciones antes de publicar.');
      state.publication = await api.publishSource(storeId, version.revision, state.publication?.version || 0);
      toast = 'Diseño publicado. Los clientes ya pueden verlo.'; publicationChanged();
    }));
    on('source-alternative', () => void action(async () => {
      transitionBuild({ type: 'submit' }); testsExpanded = true;
      const saved = await api.sourceAlternative(storeId, { ...generationSettings, revision: state.revision, instruction: 'Mejora la claridad de compra conservando la identidad de la marca.' });
      await load(saved.revision); transitionBuild({ type: 'complete' }); toast = 'Alternativa guardada. Revísala antes de iniciar la prueba.';
    }));
    on('source-test-start', () => void action(async () => {
      if (!version || !checksPassed()) throw new Error('Completa las comprobaciones antes de iniciar la prueba.');
      state.publication = await api.startSourceTest(storeId, version.revision, state.publication?.version || 0);
      testsExpanded = true; toast = 'Prueba iniciada. Cada visitante verá A o B.'; publicationChanged();
    }));
    on('source-test-refresh', () => void action(async () => { state = await api.sourceState(storeId); }));
    const finishTest = (apply: boolean) => void action(async () => {
      const publication = state.publication;
      if (!publication?.experiment) return;
      state.publication = await api.finishSourceTest(storeId, publication.experiment.id, publication.version, apply);
      toast = apply ? 'Ganador publicado. Todos los visitantes nuevos verán el diseño elegido.' : 'Prueba detenida. Se conserva el diseño A.'; publicationChanged();
    });
    on('source-test-stop', () => finishTest(false));
    on('source-test-apply', () => finishTest(true));
    on('source-start', focusComposer);
    on('source-retry-message', () => {
      if (retrySubmission && !instruction.trim() && !assets.length) void send(retrySubmission.text, retrySubmission.setupAction, retrySubmission.assetUrls, retrySubmission.templateId, retrySubmission.directionId, retrySubmission);
    });
    on('source-usage', () => void action(async () => { if (usage) { usage = null; aiUsage = []; } else { const result = await api.sourceUsage(storeId); usage = result.runs; aiUsage = result.aiUsage || []; } }));
    // render() replaces the select, so hand the caret back to its replacement:
    // choosing what to create must not drop a keyboard merchant onto the body.
    app.querySelector('#source-navigation-choice')?.addEventListener('change', event => { navigationChoice = (event.target as HTMLSelectElement).value as typeof navigationChoice; });
    app.querySelector('#source-site-purpose')?.addEventListener('change', event => { generationSettings.sitePurpose = (event.target as HTMLSelectElement).value as SourceGenerationSettings['sitePurpose']; scheduleEstimate(); render(); app.querySelector<HTMLSelectElement>('#source-site-purpose')?.focus({ preventScroll: true }); });
    app.querySelector('#source-model')?.addEventListener('change', event => { generationSettings.model = (event.target as HTMLSelectElement).value as SourceGenerationSettings['model']; try { localStorage.setItem(SOURCE_MODEL_STORAGE, JSON.stringify({ model: generationSettings.model, at: Date.now() })); } catch {} scheduleEstimate(); });
    app.querySelector('#source-credit-limit')?.addEventListener('change', event => { const input = event.target as HTMLInputElement; if (!input.checkValidity()) { input.reportValidity(); input.value = String(generationSettings.maxCredits); return; } generationSettings.maxCredits = Number(input.value); scheduleEstimate(); });
    on('source-logout', () => void action(async () => { await api.logout().catch(() => {}); sessionStorage.removeItem(SESSION_STORAGE_KEY); api.setToken(''); clearAssets(); }));
    on('source-reload', () => void action(boot));
    on('source-open-browser', () => {
      if (!version || busy || dirty()) return;
      const url = new URL(location.href);
      url.search = new URLSearchParams({ source: '1', browser: '1', store: storeId, revision: String(version.revision), ...(showingDraft() ? { draft: '1' } : {}), page, ...(previewNavigation.query ? { query: previewNavigation.query } : {}), ...(previewNavigation.fragment ? { anchor: previewNavigation.fragment } : {}) }).toString();
      url.hash = '';
      // A same-origin tab inherits this session; sever its opener immediately.
      sessionStorage.setItem('pagosya_merchant_api_base', API_BASE_URL);
      const tab = window.open(url.href, '_blank');
      if (tab) tab.opener = null;
      else { error = 'El navegador bloqueó la pestaña. Permite ventanas emergentes y vuelve a intentarlo.'; render(); }
    });
    app.querySelector('#agent-command')?.addEventListener('input', event => { instruction = (event.target as HTMLTextAreaElement).value; const retry = app.querySelector<HTMLButtonElement>('#source-retry-message'); if (retry) retry.disabled = busy || dirty() || historical() || Boolean(instruction.trim()) || assets.length > 0; scheduleEstimate(); });
    app.querySelector('[data-composer]')?.addEventListener('submit', event => { event.preventDefault(); if (productPhoto) sendProductPhoto(); else if (draftNeedsSaving()) void saveDraftThenSend(); else void send(instruction); });
    on('source-save-draft', () => void finishDraft());
    app.querySelectorAll<HTMLButtonElement>('[data-suggestion]').forEach(button => button.addEventListener('click', () => {
      instruction = button.dataset.suggestion || ''; const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); if (field) field.value = instruction; scheduleEstimate(); focusComposer();
    }));
    app.querySelectorAll<HTMLButtonElement>('[data-clarification]').forEach(button => button.addEventListener('click', () => void send(button.dataset.clarification || '')));
    app.querySelectorAll<HTMLButtonElement>('[data-suggestion-card]').forEach(button => button.addEventListener('click', () => {
      const card = suggestionIndex.get(button.dataset.suggestionCard || ''); if (!card || busy) return;
      void applySuggestion(card, { send: text => send(text), api, storeId }).then(note => { if (note) { suggestionNote = note; render(); } }).catch(error => { suggestionNote = error instanceof Error ? error.message : 'No se pudo completar.'; render(); });
    }));
    // YAPI plan card (spec 2026-10-22): «Construir» / «Hacer cambios» builds the saved plan; «Cambiar» asks what to change.
    app.querySelectorAll<HTMLButtonElement>('[data-plan-build]').forEach(button => button.addEventListener('click', () => {
      if (busy) return;
      void send(button.textContent?.trim() || 'Construir', undefined, undefined, undefined, undefined, { text: button.textContent?.trim() || 'Construir', assetUrls: [], currentPage: page, planId: button.dataset.planBuild });
    }));
    app.querySelectorAll<HTMLButtonElement>('[data-plan-change]').forEach(button => button.addEventListener('click', () => {
      const field = app.querySelector<HTMLTextAreaElement>('#agent-command');
      if (field) { field.placeholder = 'Dime qué cambiar del plan…'; field.focus(); }
    }));
    bindStarterSwap(app, { post: starterId => api.swapStarter(storeId, starterId, state.revision), onDone: () => { starterNote = ''; void load().then(() => render()).catch(() => undefined); }, onError: message => { starterNote = message; render(); } });
    app.querySelector<HTMLButtonElement>('[data-suggestions-dismiss]')?.addEventListener('click', () => { suggestionsHidden = true; render(); void dismissSuggestions(api, storeId).catch(() => undefined); });
    app.querySelectorAll<HTMLButtonElement>('[data-template-choice]').forEach(button => button.addEventListener('click', () => void send(`Usar ${button.dataset.templateName || ''}`, undefined, undefined, button.dataset.templateChoice)));
    app.querySelector('[data-action="open-upload"]')?.addEventListener('click', () => app.querySelector<HTMLInputElement>('[data-image-input]')?.click());
    app.querySelector('[data-image-input]')?.addEventListener('change', event => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (!files.length || busy) return;
      void action(async () => {
        if (productPhoto) throw new Error('Este modo usa una sola foto. Retira la actual o úsala como adjunto normal para añadir más.');
        if (files.length + assets.length > 24) throw new Error('Adjunta hasta 24 imágenes o videos en total.');
        const prepared: File[] = [];
        for (const file of files) prepared.push(await prepareSourceMedia(file));
        validateSourceMediaBatch([...assets.map(a => a.file), ...prepared]);
        assets.push(...prepared.map(file => ({ file, src: URL.createObjectURL(file) })));
        scheduleEstimate();
      });
    });
    app.querySelectorAll<HTMLButtonElement>('[data-remove-asset]').forEach(button => button.addEventListener('click', () => { const [removed] = assets.splice(Number(button.dataset.removeAsset), 1); URL.revokeObjectURL(removed.src); productPhoto = false; scheduleEstimate(); render(); }));
    on('source-export', () => void action(async () => { const blob = await api.exportSource(storeId, version!.revision); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `storefront-r${version!.revision}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }));
    on('source-cancel-job', () => { if (buildSession.phase !== 'running') return; void api.cancelSourceChatJob(storeId, buildSession.jobId).catch(error => { toast = error instanceof Error ? error.message : 'No se pudo cancelar el pedido.'; render(); }); });
    on('source-toggle-saved', () => { showSavedRevision = !showSavedRevision; page = 'index.html'; previewNavigation = {}; clearSelection(); viewing.clear(); render(); if (showSavedRevision) void runChecks(); });
    on('source-preview-tab', () => { mode = 'preview'; render(); }); on('source-code-tab', () => { if (bocetoPhase()) return; if (!dirty() && version) filePath = codeFileForPage(version.snapshot.files, page); mode = 'code'; render(); }); on('source-width', () => { mobile = !mobile; render(); });
    app.querySelectorAll<HTMLButtonElement>('[data-code-file]').forEach(button => button.addEventListener('click', () => { if (busy || dirty()) return; filePath = button.dataset.codeFile!; draft = null; render(); }));
    app.querySelector('#source-file')?.addEventListener('change', event => { filePath = (event.target as HTMLSelectElement).value; draft = null; render(); });
    app.querySelector('#source-code')?.addEventListener('input', event => {
      if (!version || !codeFileEditable(version.snapshot.files, filePath)) return;
      draft = (event.target as HTMLTextAreaElement).value;
      app.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('#agent-command, [data-code-file], [data-composer] button, [data-suggestion], [data-clarification], [data-template-choice], [data-direction-choice], [data-style-card], [data-style-use], [data-style-auto], [data-style-retry], [data-starter-swap], #source-reload, #source-logout, #source-export, #source-open-browser, #source-file, #source-model, #source-credit-limit, #source-build-now, #source-usage, #source-contact-form, #source-visibility').forEach(control => { control.disabled = busy || dirty(); });
      app.querySelector<HTMLButtonElement>('#source-save')!.disabled = busy || !dirty() || historical();
      app.querySelector<HTMLButtonElement>('#source-discard')!.disabled = busy || !dirty();
    });
    on('source-save', () => void action(async () => { if (!version || !codeFileEditable(version.snapshot.files, filePath) || draft === null) return; const savedFile = filePath, savedPage = page; const result = await api.editSourceFile(storeId, state.revision, filePath, draft!); await load(result.revision); filePath = savedFile; page = savedPage; toast = 'Cambios guardados.'; }));
    on('source-discard', () => { draft = null; render(); });
  }
  render();
  // The first load already read the catalog and the conversation; reading them again rebuilt the preview and reran the checks
  // a few seconds after a store opened (owner 2026-10-28: «way too many refreshes»). Only a failed catalog read is retried.
  if (sessionStorage.getItem(SESSION_STORAGE_KEY)) { await action(boot); if (embedded && storeId && !liveCatalog) void refreshCatalog(); }
  else loading = false;
  if (embedded && storeId) notifyParent({ type: 'pagosya:studio-ready', storeId });
}
