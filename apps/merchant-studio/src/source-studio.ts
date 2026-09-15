import { createSourceDesignJobs } from './source-design-jobs';
import { createSourceVisualTools } from './source-visual-tools';
import { createProductForm } from './source-create-product';
import { renderBuildProgress, type BuildProgress } from './source-build-progress';
import './source-build-progress.css';
import { renderStoreReadiness } from './store-readiness';
import { openRetention } from './retention';
import { openCommercePlatform } from './commerce-platform';
import { openCommerceContent } from './commerce-content';
import { openShippingSettings } from './shipping-settings';
import { openBrandProfile } from './brand-profile';
import { renderSourcePublication } from './source-publication';
import { checkSourceWebsite, sourceChecksBlockPublishing, type SourceCheck } from './source-checks';
import { prepareSourceMedia, validateSourceMediaBatch } from './source-images';
import { API_BASE_URL, ApiError, MerchantStudioApi, SESSION_STORAGE_KEY, type SourceSetup, type JsonRecord, type AgentMessage, type MerchantStore, type SourceState, type SourceVersion, type SourceGenerationSettings, type SourceGenerationEstimate, type SourceGenerationRun } from './api';
import { sourcePreviewDocument, receivePreviewNavigation, type PreviewNavigation } from './source-preview';
import { createPreviewImageLoader } from './source-preview-media';
import { escapeHtml as escape, icon, renderStudioLogin, renderStudioComposer, studioModeNav } from './studio-ui';
import './source-studio.css';
import './source-browser.css';
import './source-workspace-design.css';
import { bindSourcePaymentPreview } from './source-payment-preview';

const SOURCE_MODEL_OPTIONS = [['auto', 'Auto · OpenAI'], ['gpt-5.6-luna', 'Luna · económico'], ['gpt-5.6-terra', 'Terra · equilibrado'], ['gpt-5.6-sol', 'Sol · avanzado'], ['deepseek-v4-flash', 'DeepSeek Flash · económico'], ['deepseek-v4-pro', 'DeepSeek Pro'], ['deepseek-v4-flash-vision-exp', 'DeepSeek Flash Vision · experimental']] as const;
const SOURCE_MODEL_STORAGE = "pagosya_source_model";

type Attachment = { file: File; src: string; url?: string };
type RetrySubmission = { text: string; assetUrls: string[]; setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo' };
export async function mountSourceStudio(app: HTMLDivElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embedded') === '1' && window.parent !== window;
  const notifyParent = (data: JsonRecord) => { if (embedded) window.parent.postMessage(data, location.origin); };
  let checks: SourceCheck[] | null = null, checksKey = '', checking = false;
  let checkAbort: AbortController | null = null;
  let setup: SourceSetup | null = null;
  let generationSettings: SourceGenerationSettings = { model: 'auto', maxCredits: 50, motion: 'auto' };
  try {
    const saved = localStorage.getItem(SOURCE_MODEL_STORAGE);
    if (SOURCE_MODEL_OPTIONS.some(([id]) => id === saved)) generationSettings.model = saved as SourceGenerationSettings['model'];
  } catch { /* Storage may be disabled; the selector still works in this session. */ }
  let estimate: SourceGenerationEstimate | null = null, estimateError = '';
  let estimateTimer: number | undefined, estimateRequest = 0;
  let usage: SourceGenerationRun[] | null = null;
  let aiUsage: Array<{ stage: string; model: string; status: string; usage: { providerMicroUsd?: number | null } | null }> = [];
  let testsExpanded = false, publicationOpen = false, creditsOpen = false;
  let productPhoto = false;
  let chatExpanded = false;
  let workspaceTheme = 'light';
  try { workspaceTheme = localStorage.getItem('pagosya_dashboard_theme') === 'dark' ? 'dark' : 'light'; } catch { /* Use the default palette. */ }
  let productForm: ReturnType<typeof createProductForm> | null = null;
  let buildProgress: BuildProgress | null = null;
  let buildStatus = '';
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
  const mountVisualTools = createSourceVisualTools(api);
  const mountDesignJobs = createSourceDesignJobs(api);
  const loadPreviewImages = createPreviewImageLoader(API_BASE_URL);
  let previewRender = 0;
  let previewNavigation: Partial<PreviewNavigation> = {};
  bindSourcePaymentPreview(() => app.querySelector('iframe'), () => version ? previewSnapshot() : null);
  window.addEventListener('message', event => {
    const next = receivePreviewNavigation(event, app.querySelector('iframe'), version?.snapshot);
    if (!next) return;
    if (next.newTab && version) {
      const url = new URL(location.href);
      url.search = new URLSearchParams({ source: '1', browser: '1', store: storeId, revision: String(version.revision), page: next.page, query: next.query || '', anchor: next.fragment || '' }).toString(); url.hash = '';
      sessionStorage.setItem('pagosya_merchant_api_base', API_BASE_URL);
      sessionStorage.setItem(`pagosya_source_preview_cart:${storeId}:${version.revision}`, JSON.stringify(next.cart || []));
      const tab = window.open(url.href, '_blank');
      if (tab) { tab.opener = null; return; }
    }
    page = next.page; previewNavigation = next; render();
  });
  async function renderPreview(frame: HTMLIFrameElement) {
    const request = ++previewRender;
    const selectedPage = page;
    try {
      const snapshot = await loadPreviewImages(previewSnapshot());
      if (frame.isConnected && request === previewRender) frame.srcdoc = sourcePreviewDocument(snapshot, selectedPage, { ...previewNavigation, paymentForm: true });
    } catch (e) {
      if (frame.isConnected && request === previewRender) frame.replaceWith(document.createTextNode(e instanceof Error ? e.message : 'No se pudo abrir la vista previa.'));
    }
  }
  let stores: MerchantStore[] = [], storeId = '', state: SourceState = { revision: 0, versions: [], nextBefore: null }, version: SourceVersion | null = null;
  let messages: AgentMessage[] = [], assets: Attachment[] = [];
  let busy = false, generating = false, loading = true, error = '', toast = '', instruction = '';
  let pendingSubmission: { text: string; imageCount: number; hasVideo: boolean } | null = null;
  let retrySubmission: RetrySubmission | null = null;
  let toastTimer: number | undefined;
  let mode = 'preview', mobile = false, page = 'index.html', filePath = 'index.html', draft: string | null = null;
  const dirty = () => draft !== null && draft !== version?.snapshot.files.find(f => f.path === filePath)?.content;
  if (embedded) (window as Window & { pagosyaStudioCanLeave?: () => boolean }).pagosyaStudioCanLeave = () => {
    if (productForm?.isBusy) { window.alert('Espera a que termine de guardarse el producto.'); return false; }
    if (busy) { window.alert('YAPI está trabajando. Espera a que termine antes de cambiar de tienda o salir.'); return false; }
    return !(dirty() || instruction.trim() || assets.length || productForm?.hasChanges) || window.confirm('Tienes un mensaje, imágenes o código sin guardar. ¿Descartarlos y salir de esta tienda?');
  };
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'pagosya:catalog-refresh') return;
    if (storeId && !busy) void refreshCatalog();
  });
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'pagosya:workspace-theme') {
      workspaceTheme = event.data.theme === 'dark' ? 'dark' : 'light';
      app.querySelector<HTMLElement>('.source-mode')?.setAttribute('data-workspace-theme', workspaceTheme); return;
    }
    if (event.data?.type !== 'pagosya:studio-action' || event.data.storeId !== storeId || loading) return;
    const action = event.data.action;
    if (action === 'compose' && typeof event.data.text === 'string') {
      instruction = [instruction.trim(), event.data.text.slice(0, 12000)].filter(Boolean).join('\n\n').slice(0, 12000);
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
  const disabled = (condition: boolean) => condition ? 'disabled' : '';
  const clearAssets = () => { productPhoto = false; assets.forEach(a => URL.revokeObjectURL(a.src)); assets = []; };
  window.addEventListener('beforeunload', event => { if (dirty() || busy || instruction.trim() || assets.length) { event.preventDefault(); event.returnValue = ''; } });

  async function action(task: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ''; toast = ''; render();
    try { await task(); } catch (e) {
      error = e instanceof Error ? e.message : 'No pudimos completar la solicitud.';
      if (e instanceof ApiError && e.status === 401) { sessionStorage.removeItem(SESSION_STORAGE_KEY); api.setToken(''); clearAssets(); notifyParent({ type: 'pagosya:session-expired' }); }
    } finally {
      busy = false; loading = false; generating = false; render();
      window.clearTimeout(toastTimer);
      if (toast) toastTimer = window.setTimeout(() => { toast = ''; app.querySelector('.toast')?.remove(); }, 4000);
    }
  }
  async function load(_revision?: number, waitForChecks = false) {
    const [project, conversation, catalog] = await Promise.all([api.sourceState(storeId), api.sourceConversation(storeId), api.sourceCatalog(storeId).catch(() => null)]);
    liveCatalog = catalog;
    state = project; messages = conversation.messages; setup = conversation.setup || null;
    version = state.revision ? await api.sourceVersion(storeId, state.revision) : null;
    if (version) {
      try {
        const match = version.snapshot.files.find(f => f.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
        const savedMotion = match ? JSON.parse(match[1]).motion : 'subtle';
        generationSettings.motion = ['auto', 'off', 'subtle', 'expressive'].includes(savedMotion) ? savedMotion : 'subtle';
      } catch { generationSettings.motion = 'subtle'; }
    }
    draft = null; page = 'index.html'; filePath = 'index.html'; previewNavigation = {}; scheduleEstimate();
    if (version) { if (waitForChecks) await runChecks(); else void runChecks(); }
  }
  async function boot() {
    stores = await api.listStores();
    storeId = embedded ? stores.find(s => s.id === params.get('store'))?.id || '' : stores.find(s => s.id === sessionStorage.getItem('pagosya_current_store_id'))?.id || stores[0]?.id || '';
    if (storeId) await load();
  }
  function updateBuildProgress() {
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
  function watchBuildProgress(selectedStore: string, requestId: string) {
    const controller = new AbortController(); let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await api.sourceProgress(selectedStore, requestId, controller.signal);
        if (controller.signal.aborted || storeId !== selectedStore) return;
        if (result.progress) { buildProgress = result.progress; updateBuildProgress(); }
      } catch { /* Status availability must not interrupt the build request. */ }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 1500);
    };
    timer = window.setTimeout(poll, 500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }
  async function send(text: string, setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo', retryAssetUrls?: string[]) {
    if (!text.trim() && assets.length) text = 'Te comparto estas imágenes para el sitio.';
    if (!text.trim() || busy || dirty() || historical()) return;
    chatExpanded = true;
    const submittedAssets = assets;
    const submittedInstruction = instruction;
    const submittedAsPhoto = productPhoto;
    productPhoto = false;
    const knownMessageIds = new Set(messages.map(message => message.id));
    // The submitted request has its own state; the composer is for the next draft.
    instruction = ''; assets = []; retrySubmission = null;
    pendingSubmission = { text, imageCount: retryAssetUrls?.length ?? submittedAssets.length, hasVideo: retryAssetUrls ? retryAssetUrls.some(url => /\.mp4$/i.test(url)) : submittedAssets.some(a => a.file.type === 'video/mp4') };
    generating = true; buildProgress = null; buildStatus = submittedAssets.some(asset => !asset.url) ? 'Subiendo tus archivos…' : 'Enviando tu pedido…';
    await action(async () => {
      let sentToApi = false, succeeded = false;
      let stopProgress = () => {};
      let submittedUrls = retryAssetUrls || [];
      try {
        const pending = submittedAssets.filter(asset => !asset.url); let nextUpload = 0;
        const uploads = await Promise.allSettled(Array.from({ length: Math.min(3, pending.length) }, async () => {
          while (nextUpload < pending.length) { const asset = pending[nextUpload++]; asset.url = (await api.upload(asset.file)).url; }
        }));
        const failedUpload = uploads.find(result => result.status === 'rejected');
        if (failedUpload?.status === 'rejected') throw failedUpload.reason;
        submittedUrls = retryAssetUrls || submittedAssets.map(asset => asset.url!);
        sentToApi = true;
        const browserReview = checksKey === checkKey() && !checking ? [...new Set((checks || []).filter(row => row.status === 'failed' || row.status === 'warning').map(row => `${row.label}: ${row.detail || ''}`))].slice(0, 8).map(row => row.slice(0, 500)) : [];
        const requestId = crypto.randomUUID();
        buildStatus = 'Esperando la respuesta de YAPI…'; updateBuildProgress();
        stopProgress = watchBuildProgress(storeId, requestId);
        const result = await api.sendSourceMessage(storeId, text, submittedUrls, state.revision, setup?.step, setupAction, generationSettings, browserReview, requestId);
        stopProgress();
        succeeded = true; pendingSubmission = null; generating = false;
        productPhoto = false;
        messages.push(result.userMessage, result.assistantMessage); setup = result.setup || null; liveCatalog = null;
        render();
        if (result.revision) {
          await load(result.revision.revision, true); mode = 'preview';
          toast = checks?.some(row => row.status === 'failed') ? 'Cambios guardados con errores pendientes. Revisa el resultado en el chat.' : checks?.some(row => row.status === 'warning' || row.status === 'skipped') ? 'Diseño comprobado con pasos pendientes. Revisa el resultado en el chat.' : 'Comprobaciones terminadas. Revisa el diseño antes de publicar.';
        }
      } catch (e) {
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
            if (!answered) retrySubmission = { text, assetUrls: submittedUrls, setupAction };
          } else {
            instruction = submittedAsPhoto ? submittedInstruction : text; assets = submittedAssets; productPhoto = submittedAsPhoto;
          }
        }
        throw e;
      } finally {
        stopProgress();
        if (assets !== submittedAssets) submittedAssets.forEach(asset => URL.revokeObjectURL(asset.src));
        pendingSubmission = null; generating = false; scheduleEstimate();
        if (usage !== null) await api.sourceUsage(storeId).then(result => { usage = result.runs; aiUsage = result.aiUsage || []; }).catch(() => { usage = null; });
      }
    });
  }
  function checkKey() { return JSON.stringify([storeId, version?.revision, version ? previewSnapshot().files : []]); }
  function checksPassed() { return !dirty() && !checking && checksKey === checkKey() && Boolean(checks?.length) && !sourceChecksBlockPublishing(checks!); }
  async function runChecks(force = false) {
    if (!version || dirty()) return;
    const key = checkKey();
    if (!force && key === checksKey) return;
    checkAbort?.abort(); const controller = new AbortController(); checkAbort = controller;
    checksKey = key; checks = null; checking = true; updateChecks();
    try {
      const snapshot = await loadPreviewImages(previewSnapshot());
      if (controller.signal.aborted) return;
      const rows = await checkSourceWebsite(snapshot, controller.signal); if (!controller.signal.aborted) checks = rows;
    }
    catch (error) { if (!controller.signal.aborted) checks = [{ label: 'Comprobación', status: 'failed', detail: error instanceof Error ? error.message : 'No se pudo comprobar.' }]; }
    finally { if (!controller.signal.aborted) { checking = false; updateChecks(); } }
  }
  function updateReadiness() {
    const mount = app.querySelector('[data-source-readiness]'); if (!mount) return;
    const open = mount.querySelector('details')?.open;
    mount.innerHTML = renderStoreReadiness({ catalog: liveCatalog, branded: Boolean(version?.snapshot.files.some(file => file.path === 'brand.css')), checked: checksPassed() && !checks?.some(row => row.status === 'skipped'), checking, published: Boolean(state.publication?.revision && state.publication.active), canPublish: Boolean(version && checksPassed() && state.publication?.experiment?.status !== 'RUNNING'), locked: busy || dirty() });
    if (open) mount.querySelector('details')!.open = true;
  }
  function updateChecks() {
    updateReadiness();
    const review = app.querySelector('[data-source-review]');
    if (review) review.innerHTML = renderReview();
    const el = app.querySelector('[data-source-checks]'); if (!el) return;
    const expanded = el.querySelector('details')?.open;
    const failed = checks?.filter(row => row.status === 'failed').length || 0;
    const publication = state.publication;
    const blocked = busy || !checksPassed() || !version || publication?.experiment?.status === 'RUNNING';
    const publish = app.querySelector<HTMLButtonElement>('#source-publish');
    if (publish) publish.disabled = blocked || version?.revision === publication?.revision;
    const start = app.querySelector<HTMLButtonElement>('#source-test-start');
    if (start) start.disabled = blocked || publication?.active === false || !publication?.revision || version?.revision === publication?.revision;
    const skipped = checks?.filter(row => row.status === 'skipped').length || 0;
    const warnings = checks?.filter(row => row.status === 'warning') || [];
    const repairable = [...(checks?.filter(row => row.status === 'failed') || []), ...warnings];
    el.innerHTML = `<details class="source-checks source-disclosure" ${expanded ? 'open' : ''}><summary>${checking ? 'Comprobando sitio en escritorio y móvil…' : !checks ? 'Comprobación del sitio pendiente' : failed ? `${failed} puntos por corregir en el sitio` : warnings.length ? 'Comprobación terminada · revisa los detalles de diseño' : skipped ? 'Comprobación terminada · revisa los pasos pendientes' : 'Recorrido de compra comprobado'}</summary><div class="source-disclosure-panel"><p>Comprobamos la tienda actual: carga, enlaces, carrito y apertura del pago en una vista aislada. No prueba cobros reales ni sustituye la revisión visual.</p>${checks ? `<ul>${checks.map(row => `<li data-check-status="${row.status}"><strong>${row.status === 'passed' ? '✓' : row.status === 'failed' ? 'Error' : row.status === 'warning' ? 'Revisar diseño' : 'Pendiente'}</strong> ${escape(row.label)}${row.detail ? `<span> · ${escape(row.detail)}</span>` : ''}</li>`).join('')}</ul>` : ''}<button type="button" data-repeat-checks ${disabled(checking || busy || dirty())}>Volver a comprobar</button>${repairable.length ? `<button type="button" data-refine-design ${disabled(busy || dirty() || Boolean(instruction.trim()))}>${failed ? 'Preparar correcciones' : 'Preparar ajustes de diseño'}</button>` : ''}</div></details>`;
    el.querySelector('[data-repeat-checks]')?.addEventListener('click', () => void runChecks(true));
    el.querySelector('[data-refine-design]')?.addEventListener('click', () => {
      if (busy || dirty() || historical() || instruction.trim()) return;
      const findings = [...new Set(repairable.map(row => `${row.label}: ${row.detail || ''}`))].slice(0, 8);
      instruction = `Revisa estos detalles observados en escritorio y móvil, conserva la dirección visual actual y corrige solo los problemas confirmados:\n${findings.join('\n')}`;
      const field = app.querySelector<HTMLTextAreaElement>('#agent-command');
      if (field) field.value = instruction;
      scheduleEstimate(); field?.focus({ preventScroll: true }); updateChecks();
    });
    review?.querySelector('button')?.addEventListener('click', () => el.querySelector<HTMLButtonElement>('[data-refine-design]')?.click());
  }
  function renderReview() {
    if (!version || generating) return '';
    const current = !dirty() && checksKey === checkKey();
    const failed = current ? checks?.filter(row => row.status === 'failed') || [] : [];
    const warnings = current ? checks?.filter(row => row.status === 'warning') || [] : [];
    const pending = current ? checks?.filter(row => row.status === 'skipped') || [] : [];
    const text = !current || checking || !checks ? 'Cambios guardados. Comprobación del navegador pendiente…'
      : failed.length ? `Encontré ${failed.length} comprobaciones con errores. Hay correcciones pendientes antes de publicar.`
      : warnings.length ? 'Las comprobaciones técnicas terminaron. Hay detalles visuales que revisar.'
      : pending.length ? 'Las comprobaciones del diseño terminaron. Quedan pasos para comprobar la venta.'
      : 'Las comprobaciones automáticas terminaron sin errores. Revisa también el aspecto del sitio antes de publicar.';
    const details = [...new Set([...failed, ...pending, ...warnings].map(row => row.detail || row.label))].slice(0, 3);
    return `<section class="agent-note" role="status" aria-label="Comprobación del navegador"><strong>Comprobación del navegador</strong><p>${escape(text)}</p>${details.map(detail => `<p class="source-chat-hint">${escape(detail)}</p>`).join('')}${failed.length || warnings.length ? `<button type="button" class="text-button" ${disabled(busy || dirty() || Boolean(instruction.trim()))}>Corregir lo detectado</button>` : ''}</section>`;
  }
  function scheduleEstimate() {
    window.clearTimeout(estimateTimer);
    const request = ++estimateRequest;
    estimate = null; estimateError = '';
    updateEstimate();
    if (!storeId) return;
    estimateTimer = window.setTimeout(async () => {
      try {
        const result = await api.estimateSource(storeId, { ...generationSettings, revision: state.revision, instruction: instruction || (state.revision ? 'Ajustar mi sitio' : 'Crear mi sitio'), assetUrls: assets.map(a => a.url || 'pending-upload') });
        if (request !== estimateRequest) return;
        if (!result?.estimate || !Number.isFinite(result.estimate.minCredits) || !Number.isFinite(result.estimate.maxCredits)) {
          throw new Error('No se pudo estimar el costo. Vuelve a intentarlo.');
        }
        estimate = result;
      } catch (e) { if (request !== estimateRequest) return; estimateError = e instanceof Error ? e.message : 'No se pudo estimar. Vuelve a intentarlo.'; }
      updateEstimate();
    }, 600);
  }
  function estimateText() {
    if (estimateError) return estimateError;
    if (!estimate) return 'Calculando estimación…';
    return `${Math.min(generationSettings.maxCredits, estimate.estimate.minCredits)}–${Math.min(generationSettings.maxCredits, estimate.estimate.maxCredits)} créditos estimados · límite ${generationSettings.maxCredits}. ${estimate.reason}`;
  }
  function updateEstimate() {
    const output = app.querySelector<HTMLElement>('[data-source-estimate]');
    if (output) output.textContent = estimateText();
  }
  function generationControls(locked: boolean) {
    return `<section class="source-generation-controls" aria-label="Modelo y créditos"><div class="source-generation-fields"><label>Modelo<select id="source-model" ${disabled(locked)}>${SOURCE_MODEL_OPTIONS.map(([id, label]) => `<option value="${id}" ${generationSettings.model === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><details class="source-credit-details source-disclosure" ${creditsOpen ? 'open' : ''}><summary>Créditos</summary><div class="source-disclosure-panel"><label>Límite por solicitud<input id="source-credit-limit" type="number" min="1" max="500" step="1" value="${generationSettings.maxCredits}" ${disabled(locked)}></label><p data-source-estimate role="status">${escape(estimateText())}</p><p>Créditos de uso · sin compra de saldo. Si falla, 0 créditos YAPI; las llamadas API sí pueden tener costo. El modelo elegido se usa para conversar y generar. El límite se aplica al costo API estimado de conversación, generación y hasta una reparación. DeepSeek se estima con tarifa máxima; su factura puede ser menor. Para imágenes, elige Flash Vision.</p><button type="button" class="text-button" id="source-usage" ${disabled(locked)}>Ver uso reciente</button>${usage ? `<ol class="source-usage-list">${usage.length ? usage.map(run => `<li>${run.revision ? 'Cambios guardados' : run.status === 'RUNNING' ? 'En curso' : 'Sin cambios guardados'} · ${escape(run.model)} · ${run.credits} créditos${run.durationMs !== null ? ` · ${Math.round(run.durationMs / 1000)} s` : ''}</li>`).join('') : '<li>Todavía no hay generaciones.</li>'}</ol>` : ''}${usage && aiUsage.length ? `<p>Costo API calculado de las últimas ${aiUsage.length} llamadas, incluidas conversación y análisis: USD ${(aiUsage.reduce((sum, row) => sum + (row.usage?.providerMicroUsd || 0), 0) / 1000000).toFixed(4)}${aiUsage.some(row => typeof row.usage?.providerMicroUsd !== 'number') ? ' · Hay llamadas cuyo costo no se pudo calcular.' : ''}</p>` : ''}</div></details></section>`;
  }
  function attachmentBatch() {
    if (!assets.length) return '';
    return `<section class="batch-card is-complete" aria-label="Archivos adjuntos"><div class="batch-card__header"><strong>${assets.length} ${assets.some(a => a.file.type === 'video/mp4') ? 'archivos' : 'imágenes'}</strong><span class="batch-state is-ready">Listas para enviar</span></div><div class="batch-thumbs">${assets.map((a, i) => `<figure class="batch-thumb is-ready">${a.file.type === 'video/mp4' ? `<video src="${a.src}" controls autoplay muted loop playsinline preload="auto" aria-label="${escape(a.file.name)}"></video>` : `<img src="${a.src}" alt="${escape(a.file.name)}">`}<button class="source-remove-asset" type="button" data-remove-asset="${i}" aria-label="Quitar ${escape(a.file.name)}" ${disabled(busy)}>${icon('plus')}</button></figure>`).join('')}</div><div class="batch-card__footer">Hasta 24 archivos · imágenes: 6 MB · videos MP4: 20 MB en total</div></section>`;
  }
  function chatMessage(message: AgentMessage) {
    const user = message.role === 'USER';
    const metadata = message.metadata || {};
    const clarification = metadata.clarification as { options?: Array<{ label: string; value: string }> } | undefined;
    const visibleContent = user ? message.content : message.content
      .replaceAll('Guardé el borrador', 'Guardé los cambios de tu tienda')
      .replaceAll('Tu revisión anterior sigue guardada.', 'Tus cambios anteriores siguen guardados.')
      .replaceAll('No se guardó ninguna revisión nueva.', 'No se guardaron cambios nuevos.')
      .replaceAll('La revisión no pasó el preflight automático:', 'La comprobación no pasó el preflight automático:');
    return `<article class="${user ? 'message message--remote-user' : 'agent-note remote-agent-note'}"><div class="${user ? 'message-meta' : 'agent-note__meta'}">${user ? '<span class="avatar">TÚ</span>' : '<span class="yapi-dot"></span>'}<strong>${user ? 'Tú' : 'YAPI'}</strong></div><p>${escape(visibleContent)}</p>
      ${!user ? renderBuildProgress(metadata.progress) : ''}
      ${clarification?.options ? `<div class="clarification-options">${clarification.options.map(o => `<button type="button" data-clarification="${escape(o.value)}" ${disabled(busy || dirty() || historical())}>${escape(o.label)}</button>`).join('')}</div>` : ''}
      ${metadata.generation ? `<p class="source-chat-hint">${escape(String((metadata.generation as JsonRecord).model))} · ${escape(String((metadata.generation as JsonRecord).credits))} créditos</p>` : ''}
      ${typeof metadata.sourceRevision === 'number' ? '<p class="source-chat-hint">Cambios guardados en tu tienda.</p>' : ''}
    </article>`;
  }
  function storeTools(locked: boolean) {
    const unavailable = disabled(locked || !storeId);
    return `<details class="source-store-menu source-disclosure"><summary>Mi tienda</summary><nav class="source-disclosure-panel" aria-label="Herramientas de mi tienda">
      <section><h2>Diseño y contenido</h2><button id="source-brand" ${unavailable}>Identidad de mi marca</button><button id="source-content" ${unavailable}>Contenido y ofertas</button><button data-start-photo ${disabled(locked || !storeId || historical() || assets.length > 0)}>Diseñar desde una foto</button></section>
      <section><h2>Marketing</h2><button id="source-retention" ${unavailable}>Correos, Comeback y promociones</button>${embedded ? `<button data-business-view="integrations" ${unavailable}>Integraciones</button><button data-business-view="experiments" ${unavailable}>Pruebas A/B</button>` : ''}</section>
      <section><h2>Configuración</h2><button id="source-shipping" ${unavailable}>Envíos y retiro</button></section>
      <section><h2>Productos</h2><button id="source-digital" ${unavailable}>Archivos digitales</button></section>
      <section><h2>Finanzas</h2><button id="source-credits" ${unavailable}>Tarjetas de regalo y saldos</button></section>
      <section><h2>Contenido web</h2><button id="source-redirects" ${unavailable}>Artículos y redirecciones</button></section>
    </nav></details><input type="file" data-product-photo-input accept="image/png,image/jpeg,image/webp" hidden>`;
  }
  function sendProductPhoto() {
    if (!productPhoto || assets.length !== 1 || assets[0].file.type === 'video/mp4') return;
    void send(`Construye un borrador completo de mi tienda a partir del único producto de esta foto. Te delego el diseño, los colores y la composición. Usa esta imagen como foto del producto, conserva los datos confirmados y no inventes precio, stock, reseñas ni condiciones de entrega. No publiques. ${instruction.trim().slice(0, 11000)}`, 'product-photo');
  }
  function render() {
    const oldStream = app.querySelector<HTMLElement>('[data-agent-stream]');
    const oldScroll = oldStream?.scrollTop || 0;
    const nearBottom = !oldStream || oldStream.scrollHeight - oldScroll - oldStream.clientHeight < 70;
    const locked = busy || dirty() || Boolean(productForm);
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
    app.innerHTML = `<div class="studio-shell source-mode ${embedded ? 'source-embedded' : ''}" data-workspace-theme="${workspaceTheme}">
      <header class="topbar connected-topbar">
        <a class="product-mark" href="/" aria-label="pagosYa Merchant Studio"><img src="${import.meta.env.BASE_URL}logo-mark.png" alt=""><span>pagosYa</span><i></i><strong>Merchant Studio</strong></a>
        <div class="connected-store-select"><span>Mi tienda</span><strong>${escape(store?.name || 'Sin tienda')}</strong></div>
        <div class="save-state">${icon('check')} ${dirty() ? 'Cambios sin guardar' : version ? version.revision === state.publication?.revision && state.publication.active ? 'Diseño publicado' : 'Diseño guardado' : 'Conectado'}</div>
        <div class="top-actions"><button class="button button--ghost" id="source-logout" ${disabled(locked)}>Salir</button><button class="button button--publish" id="${embedded ? 'source-top-export' : 'source-export'}" ${disabled(locked || !version)}>Descargar ZIP</button></div>
      </header>
      <div class="studio-workspace">
        <aside class="agent-panel ${chatExpanded || generating || error || !version ? 'is-chat-expanded' : ''} ${productForm ? 'is-creating-product' : ''}" aria-label="${productForm ? 'Crear producto' : 'Conversación con YAPI'}">
          <header class="agent-header"><div>${embedded ? '<button type="button" id="source-back-stores">← Mis tiendas</button>' : ''}<span class="agent-wordmark">YAPI</span><span class="online"><i></i> Sitio a medida</span></div><div class="agent-header-actions"><button type="button" id="source-chat-toggle" aria-expanded="${Boolean(chatExpanded || generating || error || !version)}" aria-controls="source-chat-history">${chatExpanded ? 'Ocultar conversación' : 'Ver conversación'}</button><button class="icon-button" id="source-reload" aria-label="Actualizar conversación" ${disabled(locked)}>${icon('undo')}</button></div></header>
          <div class="agent-stream" id="source-chat-history" data-agent-stream><div data-source-readiness></div>
            ${messages.length ? messages.map(chatMessage).join('') : `<section class="conversation-welcome"><span class="yapi-dot"></span><strong>Tu sitio empieza con una conversación.</strong><p data-setup-prompt>${escape(setup?.prompt || `Antes de crear el sitio de ${store?.name || 'tu negocio'}, aclaremos tu negocio y el estilo que buscas. ¿Qué vendes y a quién quieres llegar?`)}</p></section>`}
            ${generating ? `${pendingSubmission ? `<article class="message message--remote-user" data-pending-request><p>${escape(pendingSubmission.text)}</p>${pendingSubmission.imageCount ? `<small>${pendingSubmission.imageCount} ${pendingSubmission.imageCount === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</small>` : ''}</article>` : ''}<article class="agent-note remote-agent-note"><div class="agent-note__meta"><span class="yapi-dot"></span><strong>YAPI</strong></div><div data-build-progress aria-label="Proceso de YAPI" aria-live="polite">${buildProgress ? renderBuildProgress(buildProgress, true) : `<p class="build-waiting" role="status">${escape(buildStatus)}</p>`}</div></article>` : ''}
            <div data-source-review>${renderReview()}</div>
            ${dirty() ? '<p class="source-chat-hint">Guarda o descarta la edición de código antes de pedir otro cambio.</p>' : ''}
            ${error ? `<p class="auth-error" role="alert">${escape(error)}</p>${retrySubmission ? `<button type="button" class="button button--secondary" id="source-retry-message" ${disabled(locked || historical() || Boolean(instruction.trim()) || assets.length > 0)}>Reintentar mensaje</button>` : ''}` : ''}
            ${!storeId ? '<section class="remote-empty-state"><strong>No hay una tienda todavía.</strong><p>Crea una tienda en el dashboard para comenzar.</p></section>' : ''}
          </div>
          <div class="source-compose-area">${generationControls(locked)}
          ${renderStudioComposer({ busy: locked || historical() || !storeId, source: true, instruction, attachments: productPhoto ? '' : attachmentBatch(), suggestions: setup || productPhoto ? [] : version ? [
            { label: 'Crear producto', action: 'create-product' },
            { label: 'Rediseñar sitio', instruction: 'Rediseña todo mi sitio con una dirección visual nueva basada en mi negocio, mis fotos y mis referencias. Conserva los productos y los datos confirmados.' },
            { label: 'Mejorar el móvil', instruction: 'Mejora la lectura y la navegación en móvil sin cambiar los productos.' },
          ] : [
            { label: 'Presentar mi negocio', instruction: 'Quiero un sitio para dar a conocer mi negocio. Te cuento lo que hago: ' },
            { label: 'Vender mis productos', instruction: 'Quiero crear una tienda para vender mis productos. Mi negocio es: ' },
          ] })}</div>
        </aside>
        <main class="canvas-panel connected-canvas source-canvas" aria-label="Sitio a medida">
          <header class="canvas-toolbar">${storeTools(locked)}${embedded ? '' : studioModeNav('source', locked || Boolean(instruction.trim()))}<div class="source-view-controls"><button id="source-preview-tab" aria-pressed="${Boolean(version) && mode === 'preview'}">Vista previa</button><button id="source-code-tab" aria-pressed="${mode === 'code'}" ${disabled(!version)}>Código</button></div>${embedded ? `<button class="button" id="source-export" ${disabled(locked || !version)}>Descargar ZIP</button>` : ''}<button class="button" id="source-open-browser" title="Abrir la vista previa en una pestaña nueva" ${disabled(locked || !version)}>${icon('external')} Ver en navegador</button><button class="icon-button" id="source-width" aria-label="${mobile ? 'Ver escritorio' : 'Ver móvil'}" aria-pressed="${mobile}">${icon('desktop')}</button><div class="source-publish-controls">${state.publication?.revision ? `<button id="source-visibility" class="source-visibility" role="switch" aria-label="Tienda publicada" aria-checked="${state.publication.active}" ${disabled(locked)}><span aria-hidden="true"></span>${state.publication.active ? 'Publicado' : 'Sin publicar'}</button>` : ''}${!version || version.revision !== state.publication?.revision ? `<button class="button button--publish" id="source-publish" ${disabled(locked || checking || !checks || Boolean(checks.some(c => c.status === 'failed')) || !version || state.publication?.experiment?.status === 'RUNNING')}>${state.publication?.revision ? 'Publicar estos cambios' : 'Publicar este diseño'}</button>` : ''}</div></header>
          <div class="source-revision-bar">${renderSourcePublication(state, version, { locked, checking, failed: !checksPassed(), slug: store?.slug || '', expanded: testsExpanded, detailsOpen: publicationOpen })}
            ${version && mode === 'preview' ? `<label>Página<select id="source-page">${version.snapshot.files.filter(f => f.path.endsWith('.html')).map(f => `<option ${f.path === page ? 'selected' : ''}>${escape(f.path)}</option>`).join('')}</select></label>` : ''}
            <label>Movimiento<select id="source-motion" aria-describedby="source-motion-help" ${disabled(locked || historical())}>${[['auto','Según el diseño'],['off','Sin movimiento'],['subtle','Sutil'],['expressive','Expresivo']].map(([value,label]) => `<option value="${value}" ${generationSettings.motion === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><small class="source-sr-only" id="source-motion-help">${version ? 'Se guarda sin generar de nuevo.' : 'El diseño decide el movimiento de forma predeterminada.'}</small>
            ${version ? '<div data-source-visual-tools></div><div data-source-design-jobs></div><div data-source-checks></div>' : ''}
          </div>
          ${productPhoto && assets[0] ? `<section class="preview-frame source-photo-preview" aria-label="Crear tienda desde un producto"><img src="${escape(assets[0].src)}" alt="Foto del producto para crear tu tienda"><div class="source-photo-ready"><h1>De un producto a tu tienda.</h1><p>YAPI usará esta foto para proponer el diseño, los colores y la composición. Puedes añadir detalles en el chat.</p><p>Completa el nombre, el precio y los datos de venta antes de publicar.</p><button class="button button--publish" id="source-create-photo" ${disabled(locked || !storeId)}>Crear tienda desde esta foto</button><button class="text-button" id="source-photo-cancel" ${disabled(locked)}>Usar como adjunto normal</button><button class="text-button" data-remove-asset="0" ${disabled(locked)}>Quitar foto</button></div></section>` : version ? mode === 'preview' ? `<div class="preview-frame remote-preview source-frame-wrap ${mobile ? 'is-mobile' : ''}"><iframe title="Vista previa del sitio" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div>` : `<section class="source-editor"><label>Archivo<select id="source-file" ${disabled(dirty())}>${version.snapshot.files.filter(f => f.encoding !== 'base64' && (!version!.snapshot.files.some(v => v.path === 'storefront-framework.json') || f.path.startsWith('components/') && f.path.endsWith('.tsx') || f.path === 'styles/globals.css')).map(f => `<option ${f.path === filePath ? 'selected' : ''}>${escape(f.path)}</option>`).join('')}</select></label><textarea id="source-code" aria-label="Código del archivo" spellcheck="false" maxlength="180000" ${disabled(busy)}></textarea><div><button id="source-save" class="button button--publish" ${disabled(busy || !dirty())}>Guardar cambios</button><button id="source-discard" class="button" ${disabled(busy || !dirty())}>Descartar edición</button></div></section>` : `<section class="source-empty-preview" aria-label="Tu sitio a medida"><div class="source-empty-copy"><h1>Tu negocio, tu sitio.</h1><p>Cuéntale a YAPI qué quieres crear. Tu idea, tus fotos y tu marca darán forma al diseño.</p><div class="source-empty-actions"><button type="button" class="button" data-start-photo ${disabled(locked || !storeId || assets.length > 0)}>Crear tienda desde una foto</button></div></div></section>`}
          <footer class="canvas-status"><span>${icon('lock')} Vista previa · sin cobros</span><span>${dirty() ? 'Edición sin guardar' : version ? 'Diseño actual' : 'Esperando tu idea'}</span></footer>
        </main>
      </div>${toast ? `<div class="toast" role="status">${escape(toast)}</div>` : ''}
    </div>`;
    bind(); updateChecks();
    const designHost = app.querySelector<HTMLElement>('[data-source-design-jobs]');
    if (designHost && version) mountDesignJobs(designHost, { storeId, version, page, locked: busy || dirty(), historical: historical(), saved: () => action(async () => { await load(); toast = 'Mejora guardada. Revisa el resultado antes de publicarlo.'; }) });
    const visualHost = app.querySelector<HTMLElement>('[data-source-visual-tools]');
    if (visualHost && version) mountVisualTools(visualHost, { storeId, version, page, settings: generationSettings, locked: busy || dirty(), historical: historical(),
      prepare: text => { instruction = [instruction.trim(), text].filter(Boolean).join('\n\n'); const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); if (field) { field.value = instruction; field.focus(); } scheduleEstimate(); },
      saved: () => action(async () => { await load(); toast = 'Usos guardados. YAPI los tendrá en cuenta en los próximos cambios.'; }),
    });

    const stream = app.querySelector<HTMLElement>('[data-agent-stream]');
    if (stream && productForm) { stream.append(productForm.element); stream.scrollTop = oldScroll; }
    else if (stream) stream.scrollTop = nearBottom ? stream.scrollHeight : oldScroll;
    const editor = app.querySelector<HTMLTextAreaElement>('#source-code');
    if (editor) editor.value = draft ?? version!.snapshot.files.find(f => f.path === filePath)?.content ?? '';
    const frame = app.querySelector<HTMLIFrameElement>('iframe');
    if (frame && version) void renderPreview(frame);
  }
const focusComposer = () => { const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); field?.focus(); field?.scrollIntoView({ block: 'nearest' }); };
  function bind() {
    app.querySelector('#source-back-stores')?.addEventListener('click', () => notifyParent({ type: 'pagosya:workspace', view: 'stores' }));
    app.querySelector('#source-chat-toggle')?.addEventListener('click', () => { chatExpanded = !chatExpanded; render(); app.querySelector<HTMLElement>('#source-chat-toggle')?.focus(); });
    app.querySelector('[data-composer-action="create-product"]')?.addEventListener('click', () => {
      if (busy || dirty() || historical() || !storeId || productForm) return;
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
    app.querySelector('#source-content')?.addEventListener('click', () => { if (!busy && storeId) { void openCommerceContent(api, storeId); } });
    app.querySelector('#source-shipping')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'integrations'}); else void openShippingSettings(api, storeId, () => void refreshCatalog()); } });
    app.querySelector('#source-brand')?.addEventListener('click', () => { if (!busy && storeId) { if (embedded) notifyParent({type:'pagosya:workspace',view:'integrations'}); else void openBrandProfile(api, storeId); } });
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
      generating = true; testsExpanded = true;
      const saved = await api.sourceAlternative(storeId, { ...generationSettings, revision: state.revision, instruction: 'Mejora la claridad de compra conservando la identidad de la marca.' });
          await load(saved.revision); toast = 'Alternativa guardada. Revísala antes de iniciar la prueba.';
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
      if (retrySubmission && !instruction.trim() && !assets.length) void send(retrySubmission.text, retrySubmission.setupAction, retrySubmission.assetUrls);
    });
    on('source-usage', () => void action(async () => { if (usage) { usage = null; aiUsage = []; } else { const result = await api.sourceUsage(storeId); usage = result.runs; aiUsage = result.aiUsage || []; } }));
    app.querySelector('#source-motion')?.addEventListener('change', event => {
      if (busy || dirty() || historical()) return;
      const motion = (event.target as HTMLSelectElement).value as NonNullable<SourceGenerationSettings['motion']>;
      if (!version) { generationSettings.motion = motion; return; }
      void action(async () => {
        const saved = await api.setSourceMotion(storeId, state.revision, motion);
        await load(saved.revision);
        toast = 'Movimiento guardado. Tu diseño se conserva.';
      });
    });
    app.querySelector('#source-model')?.addEventListener('change', event => { generationSettings.model = (event.target as HTMLSelectElement).value as SourceGenerationSettings['model']; try { localStorage.setItem(SOURCE_MODEL_STORAGE, generationSettings.model); } catch {} scheduleEstimate(); });
    app.querySelector('#source-credit-limit')?.addEventListener('change', event => { const input = event.target as HTMLInputElement; if (!input.checkValidity()) { input.reportValidity(); input.value = String(generationSettings.maxCredits); return; } generationSettings.maxCredits = Number(input.value); scheduleEstimate(); });
    on('source-logout', () => void action(async () => { await api.logout().catch(() => {}); sessionStorage.removeItem(SESSION_STORAGE_KEY); api.setToken(''); clearAssets(); }));
    on('source-reload', () => void action(boot));
    on('source-open-browser', () => {
      if (!version || busy || dirty()) return;
      const url = new URL(location.href);
      url.search = new URLSearchParams({ source: '1', browser: '1', store: storeId, revision: String(version.revision), page, ...(previewNavigation.query ? { query: previewNavigation.query } : {}), ...(previewNavigation.fragment ? { anchor: previewNavigation.fragment } : {}) }).toString();
      url.hash = '';
      // A same-origin tab inherits this session; sever its opener immediately.
      sessionStorage.setItem('pagosya_merchant_api_base', API_BASE_URL);
      const tab = window.open(url.href, '_blank');
      if (tab) tab.opener = null;
      else { error = 'El navegador bloqueó la pestaña. Permite ventanas emergentes y vuelve a intentarlo.'; render(); }
    });
    app.querySelector('#agent-command')?.addEventListener('input', event => { instruction = (event.target as HTMLTextAreaElement).value; const retry = app.querySelector<HTMLButtonElement>('#source-retry-message'); if (retry) retry.disabled = busy || dirty() || historical() || Boolean(instruction.trim()) || assets.length > 0; scheduleEstimate(); });
    app.querySelector('[data-composer]')?.addEventListener('submit', event => { event.preventDefault(); if (productPhoto) sendProductPhoto(); else void send(instruction); });
    app.querySelectorAll<HTMLButtonElement>('[data-suggestion]').forEach(button => button.addEventListener('click', () => {
      instruction = button.dataset.suggestion || ''; const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); if (field) field.value = instruction; scheduleEstimate(); focusComposer();
    }));
    app.querySelectorAll<HTMLButtonElement>('[data-clarification]').forEach(button => button.addEventListener('click', () => void send(button.dataset.clarification || '')));
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
    on('source-preview-tab', () => { mode = 'preview'; render(); }); on('source-code-tab', () => { mode = 'code'; if (version?.snapshot.files.some(f => f.path === 'storefront-framework.json') && !filePath.startsWith('components/') && filePath !== 'styles/globals.css') filePath = 'components/home.tsx'; render(); }); on('source-width', () => { mobile = !mobile; render(); });
    app.querySelector('#source-page')?.addEventListener('change', event => { page = (event.target as HTMLSelectElement).value; previewNavigation = {}; render(); });
    app.querySelector('#source-file')?.addEventListener('change', event => { filePath = (event.target as HTMLSelectElement).value; draft = null; render(); });
    app.querySelector('#source-code')?.addEventListener('input', event => {
      draft = (event.target as HTMLTextAreaElement).value;
      app.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('#agent-command, [data-composer] button, [data-suggestion], [data-clarification], #source-reload, #source-logout, #source-export, #source-open-browser, #source-file, #source-model, #source-credit-limit, #source-build-now, #source-usage, #source-contact-form, #source-visibility').forEach(control => { control.disabled = busy || dirty(); });
      app.querySelector<HTMLButtonElement>('#source-save')!.disabled = busy || !dirty() || historical();
      app.querySelector<HTMLButtonElement>('#source-discard')!.disabled = busy || !dirty();
    });
    on('source-save', () => void action(async () => { const result = await api.editSourceFile(storeId, state.revision, filePath, draft!); await load(result.revision); toast = 'Cambios guardados.'; }));
    on('source-discard', () => { draft = null; render(); });
  }
  render();
  if (sessionStorage.getItem(SESSION_STORAGE_KEY)) { await action(boot); if (embedded && storeId) void refreshCatalog(); }
  else loading = false;
  if (embedded && storeId) notifyParent({ type: 'pagosya:studio-ready', storeId });
}
