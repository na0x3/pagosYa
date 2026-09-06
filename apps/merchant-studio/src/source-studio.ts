import { ApiError, MerchantStudioApi, SESSION_STORAGE_KEY, type SourceSetup, type JsonRecord, type AgentMessage, type MerchantStore, type SourceState, type SourceVersion } from './api';
import { sourcePreviewDocument } from './source-preview';
import { escapeHtml as escape, icon, renderStudioLogin, renderStudioComposer, studioModeNav } from './studio-ui';
import './source-studio.css';

type Attachment = { file: File; src: string; url?: string };
export async function mountSourceStudio(app: HTMLDivElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embedded') === '1' && window.parent !== window;
  const notifyParent = (data: JsonRecord) => { if (embedded) window.parent.postMessage(data, location.origin); };
  let setup: SourceSetup | null = null;
  let liveCatalog: JsonRecord | null = null;
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  let stores: MerchantStore[] = [], storeId = '', state: SourceState = { revision: 0, versions: [], nextBefore: null }, version: SourceVersion | null = null;
  let messages: AgentMessage[] = [], assets: Attachment[] = [];
  let busy = false, generating = false, loading = true, error = '', toast = '', instruction = '';
  let toastTimer: number | undefined;
  let mode = 'preview', mobile = false, page = 'index.html', filePath = 'index.html', draft: string | null = null;
  const dirty = () => draft !== null && draft !== version?.snapshot.files.find(f => f.path === filePath)?.content;
  if (embedded) (window as Window & { pagosyaStudioCanLeave?: () => boolean }).pagosyaStudioCanLeave = () => {
    if (busy) { window.alert('YAPI está trabajando. Espera a que termine antes de cambiar de tienda o salir.'); return false; }
    return !(dirty() || instruction.trim() || assets.length) || window.confirm('Tienes un mensaje, imágenes o código sin guardar. ¿Descartarlos y salir de esta tienda?');
  };
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'pagosya:catalog-refresh') return;
    if (storeId && !busy) void refreshCatalog();
  });
  async function refreshCatalog() {
    const selectedStore = storeId;
    try {
      const [catalog, conversation] = await Promise.all([api.sourceCatalog(selectedStore), api.sourceConversation(selectedStore)]);
      if (selectedStore !== storeId || busy) return;
      liveCatalog = catalog; setup = conversation.setup || null;
      // Update only the preview and setup question; leave the composer and code intact.
      const frame = app.querySelector<HTMLIFrameElement>('iframe');
      if (frame && version && !historical()) frame.srcdoc = sourcePreviewDocument(previewSnapshot(), page);
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
  const historical = () => Boolean(version && version.revision !== state.revision);
  const disabled = (condition: boolean) => condition ? 'disabled' : '';
  const clearAssets = () => { assets.forEach(a => URL.revokeObjectURL(a.src)); assets = []; };
  window.addEventListener('beforeunload', event => { if (dirty() || busy || instruction.trim()) { event.preventDefault(); event.returnValue = ''; } });

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
  async function load(revision?: number) {
    const [project, conversation] = await Promise.all([api.sourceState(storeId), api.sourceConversation(storeId)]);
    state = project; messages = conversation.messages; setup = conversation.setup || null;
    version = state.revision ? await api.sourceVersion(storeId, revision || state.revision) : null;
    draft = null; page = 'index.html'; filePath = 'index.html';
  }
  async function boot() {
    stores = await api.listStores();
    storeId = embedded ? stores.find(s => s.id === params.get('store'))?.id || '' : stores.find(s => s.id === sessionStorage.getItem('pagosya_current_store_id'))?.id || stores[0]?.id || '';
    if (storeId) await load();
  }
  async function send(text: string, setupAction?: 'generate' | 'restart') {
    if (!text.trim() || busy || dirty() || historical()) return;
    instruction = text;
    generating = true;
    await action(async () => {
      for (const asset of assets) if (!asset.url) asset.url = (await api.upload(asset.file)).url;
      try {
        const result = await api.sendSourceMessage(storeId, text, assets.map(a => a.url!), state.revision, setup?.step, setupAction);
        messages.push(result.userMessage, result.assistantMessage); setup = result.setup || null;
        instruction = ''; clearAssets();
        if (result.revision) { await load(result.revision.revision); mode = 'preview'; toast = 'Nueva revisión lista para revisar.'; }
      } catch (e) {
        // A failed generation can still have persisted the merchant's request.
        await api.sourceConversation(storeId).then(result => { messages = result.messages; setup = result.setup || null; }).catch(() => {});
        throw e;
      }
    });
  }
  function attachmentBatch() {
    if (!assets.length) return '';
    return `<section class="batch-card is-complete" aria-label="Imágenes adjuntas"><div class="batch-card__header"><strong>${assets.length} imágenes</strong><span class="batch-state is-ready">Listas para enviar</span></div><div class="batch-thumbs">${assets.map((a, i) => `<figure class="batch-thumb is-ready"><img src="${a.src}" alt="${escape(a.file.name)}"><button class="source-remove-asset" type="button" data-remove-asset="${i}" aria-label="Quitar ${escape(a.file.name)}" ${disabled(busy)}>${icon('plus')}</button></figure>`).join('')}</div><div class="batch-card__footer">Hasta 6 imágenes · 2 MB cada una · 6 MB en total</div></section>`;
  }
  function chatMessage(message: AgentMessage) {
    const user = message.role === 'USER';
    const metadata = message.metadata || {};
    const revision = typeof metadata.sourceRevision === 'number' ? metadata.sourceRevision : null;
    const clarification = metadata.clarification as { options?: Array<{ label: string; value: string }> } | undefined;
    return `<article class="${user ? 'message message--remote-user' : 'agent-note remote-agent-note'}"><div class="${user ? 'message-meta' : 'agent-note__meta'}">${user ? '<span class="avatar">TÚ</span>' : '<span class="yapi-dot"></span>'}<strong>${user ? 'Tú' : 'YAPI'}</strong></div><p>${escape(message.content)}</p>
      ${clarification?.options ? `<div class="clarification-options">${clarification.options.map(o => `<button type="button" data-clarification="${escape(o.value)}" ${disabled(busy || dirty() || historical())}>${escape(o.label)}</button>`).join('')}</div>` : ''}
      ${revision ? `<button type="button" class="remote-proposal ${version?.revision === revision ? 'is-active' : ''}" data-source-revision="${revision}" ${disabled(busy || dirty())}><span><small>REVISIÓN ${revision}</small><strong>${escape(String(metadata.label || 'Sitio a medida'))}</strong></span><em>${version?.revision === revision ? 'En pantalla' : 'Revisar'}</em></button>` : ''}
    </article>`;
  }
  function render() {
    const oldStream = app.querySelector<HTMLElement>('[data-agent-stream]');
    const oldScroll = oldStream?.scrollTop || 0;
    const nearBottom = !oldStream || oldStream.scrollHeight - oldScroll - oldStream.clientHeight < 70;
    const locked = busy || dirty();
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
    app.innerHTML = `<div class="studio-shell source-mode ${embedded ? 'source-embedded' : ''}">
      <header class="topbar connected-topbar">
        <a class="product-mark" href="/" aria-label="pagosYa Merchant Studio"><img src="${import.meta.env.BASE_URL}logo-mark.png" alt=""><span>pagosYa</span><i></i><strong>Merchant Studio</strong></a>
        <div class="connected-store-select"><label for="source-store">Tienda</label><select id="source-store" ${disabled(locked || Boolean(instruction.trim()))}>${stores.map(s => `<option value="${escape(s.id)}" ${s.id === storeId ? 'selected' : ''}>${escape(s.name)}</option>`).join('')}</select></div>
        <div class="save-state">${icon('check')} ${dirty() ? 'Cambios sin guardar' : version ? 'Revisión guardada' : 'Conectado'}</div>
        <div class="top-actions"><button class="button button--ghost" id="source-logout" ${disabled(locked)}>Salir</button><button class="button button--publish" id="${embedded ? 'source-top-export' : 'source-export'}" ${disabled(locked || !version)}>Descargar ZIP</button></div>
      </header>
      <div class="studio-workspace">
        <aside class="agent-panel" aria-label="Conversación con YAPI">
          <header class="agent-header"><div><span class="agent-wordmark">YAPI</span><span class="online"><i></i> Sitio a medida</span></div><button class="icon-button" id="source-reload" aria-label="Actualizar conversación" ${disabled(locked)}>${icon('undo')}</button></header>
          <div class="agent-stream" data-agent-stream>
            ${messages.length ? messages.filter((message, index) => !(setup && index === messages.length - 1 && message.metadata?.sourceSetup)).map(chatMessage).join('') : setup ? '' : `<section class="conversation-welcome"><span class="yapi-dot"></span><strong>Tu sitio empieza con una conversación.</strong><p>Cuéntame qué vende ${escape(store?.name || 'tu negocio')}, a quién quieres llegar y cómo imaginas su sitio. Puedes adjuntar fotos.</p><p>Prepararé una primera versión aquí. Después la ajustamos juntos.</p></section>`}
            ${setup ? `<section class="source-setup" aria-label="Configuración con YAPI"><div class="agent-note__meta"><span class="yapi-dot"></span><strong>YAPI · ${['business', 'logo', 'products', 'colors', 'review'].indexOf(setup.step) + 1} / 5</strong></div><p data-setup-prompt>${escape(setup.prompt)}</p><div class="clarification-options">${setup.options.map((option, index) => `<button data-setup-option="${index}" ${disabled(locked)}>${escape(option.label)}</button>`).join('')}${setup.step === 'products' && embedded ? '<button data-workspace="products">Administrar productos →</button>' : ''}</div></section>` : ''}
            ${generating ? `<article class="agent-note"><div class="agent-note__meta"><span class="yapi-dot"></span><strong>YAPI</strong><span>trabajando</span></div><p class="source-pending-request">${escape(instruction)}</p><div class="thinking"><i></i><i></i><i></i><span>${setup && setup.step !== 'review' ? 'Guardando tu respuesta…' : 'Diseñando tu sitio y preparando una revisión…'}</span></div>${!setup || setup.step === 'review' ? '<p class="source-chat-hint">Puede tomar hasta cuatro minutos.</p>' : ''}</article>` : ''}
            ${historical() ? '<section class="remote-empty-state"><strong>Estás viendo una revisión anterior.</strong><p>Restaúrala para pedir cambios sobre esta versión.</p></section>' : ''}
            ${dirty() ? '<p class="source-chat-hint">Guarda o descarta la edición de código antes de pedir otro cambio.</p>' : ''}
            ${error ? `<p class="auth-error" role="alert">${escape(error)}</p>` : ''}
            ${!storeId ? '<section class="remote-empty-state"><strong>No hay una tienda todavía.</strong><p>Crea una tienda en el dashboard para comenzar.</p></section>' : ''}
          </div>
          ${renderStudioComposer({ busy: locked || historical() || !storeId, source: true, instruction, attachments: attachmentBatch(), suggestions: setup ? [] : version ? [
            { label: 'Más editorial', instruction: 'Haz la portada más editorial, conservando los productos y el estilo propio del negocio.' },
            { label: 'Mejorar el móvil', instruction: 'Mejora la lectura y la navegación en móvil sin cambiar los productos.' },
          ] : [
            { label: 'Una carta de café', instruction: 'Crea un sitio para mi cafetería, con una carta clara, tonos cálidos y un pedido fácil de armar.' },
            { label: 'Una tienda editorial', instruction: 'Crea una tienda editorial para mi negocio, con tipografía expresiva y protagonismo del catálogo.' },
          ] })}
        </aside>
        <main class="canvas-panel connected-canvas source-canvas" aria-label="Sitio a medida">
          <header class="canvas-toolbar">${embedded ? '<span class="source-embedded-title">Diseño de tu tienda</span>' : studioModeNav('source', locked || Boolean(instruction.trim()))}<div class="source-view-controls"><button id="source-preview-tab" aria-pressed="${mode === 'preview'}">Vista previa</button><button id="source-code-tab" aria-pressed="${mode === 'code'}" ${disabled(!version)}>Código</button></div>${embedded ? `<button class="button" id="source-export" ${disabled(locked || !version)}>Descargar ZIP</button>` : ''}<button class="icon-button" id="source-width" aria-label="${mobile ? 'Ver escritorio' : 'Ver móvil'}" aria-pressed="${mobile}">${icon('desktop')}</button></header>
          <div class="source-revision-bar"><label>Revisión<select id="source-revision" ${disabled(locked || !version)}>${state.versions.length ? state.versions.map(v => `<option value="${v.revision}" ${v.revision === version?.revision ? 'selected' : ''}>${v.revision} · ${escape(v.label)}</option>`).join('') : '<option>Sin revisiones</option>'}</select></label>
            ${state.nextBefore ? `<button class="text-button" id="source-older" ${disabled(locked)}>Ver anteriores</button>` : ''}
            ${historical() ? `<button class="button button--secondary" id="source-restore" ${disabled(locked)}>Restaurar esta revisión</button>` : ''}
            ${version && mode === 'preview' ? `<label>Página<select id="source-page">${version.snapshot.files.filter(f => f.path.endsWith('.html')).map(f => `<option ${f.path === page ? 'selected' : ''}>${escape(f.path)}</option>`).join('')}</select></label>` : ''}
          </div>
          ${version ? mode === 'preview' ? `<div class="preview-frame remote-preview source-frame-wrap ${mobile ? 'is-mobile' : ''}"><iframe title="Vista previa del sitio" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div>` : `<section class="source-editor"><label>Archivo<select id="source-file" ${disabled(dirty())}>${version.snapshot.files.filter(f => f.encoding !== 'base64').map(f => `<option ${f.path === filePath ? 'selected' : ''}>${escape(f.path)}</option>`).join('')}</select></label><textarea id="source-code" aria-label="Código del archivo" spellcheck="false" maxlength="180000" ${disabled(busy || historical())}></textarea><div><button id="source-save" class="button button--publish" ${disabled(busy || !dirty() || historical())}>Guardar como nueva revisión</button><button id="source-discard" class="button" ${disabled(busy || !dirty())}>Descartar edición</button></div></section>` : `<div class="preview-frame source-empty-preview"><div class="source-empty-page"><div class="source-empty-browser"><span></span><span></span><span></span></div><div class="source-empty-copy"><h1>Un sitio que se sienta tuyo.</h1><p>Descríbelo a YAPI. Tu primera versión aparecerá aquí, lista para probar y seguir afinando.</p><button class="button button--publish" id="source-start">Empezar en el chat ${icon('send')}</button></div><div class="source-empty-footer">${escape(store?.name || 'Tu negocio')}<span>Tu diseño. Tus archivos.</span></div></div></div>`}
          <footer class="canvas-status"><span>${icon('lock')} Vista previa · sin cobros</span><span>${dirty() ? 'Edición sin guardar' : version ? `Revisión ${version.revision}` : 'Esperando tu idea'}</span></footer>
        </main>
      </div>${toast ? `<div class="toast" role="status">${escape(toast)}</div>` : ''}
    </div>`;
    bind();
    app.querySelectorAll<HTMLButtonElement>('[data-setup-option]').forEach(button => button.addEventListener('click', () => {
      const option = setup?.options[Number(button.dataset.setupOption)]; if (option) void send(option.value, option.action);
    }));
    app.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach(button => button.addEventListener('click', () => notifyParent({ type: 'pagosya:workspace', view: button.dataset.workspace })));

    const stream = app.querySelector<HTMLElement>('[data-agent-stream]');
    if (stream) stream.scrollTop = nearBottom ? stream.scrollHeight : oldScroll;
    const editor = app.querySelector<HTMLTextAreaElement>('#source-code');
    if (editor) editor.value = draft ?? version!.snapshot.files.find(f => f.path === filePath)?.content ?? '';
    const frame = app.querySelector<HTMLIFrameElement>('iframe');
    if (frame && version) try {
      frame.srcdoc = sourcePreviewDocument(previewSnapshot(), page);
    } catch (e) { frame.replaceWith(document.createTextNode(e instanceof Error ? e.message : 'No se pudo abrir la vista previa.')); }
  }
  function bind() {
    const on = (id: string, fn: () => void) => app.querySelector(`#${id}`)?.addEventListener('click', fn);
    const focusComposer = () => { const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); field?.focus(); field?.scrollIntoView({ block: 'nearest' }); };
    on('source-start', focusComposer);
    on('source-logout', () => void action(async () => { await api.logout().catch(() => {}); sessionStorage.removeItem(SESSION_STORAGE_KEY); api.setToken(''); clearAssets(); }));
    on('source-reload', () => void action(boot));
    app.querySelector('#source-store')?.addEventListener('change', event => {
      const next = (event.target as HTMLSelectElement).value;
      void action(async () => { storeId = next; sessionStorage.setItem('pagosya_current_store_id', storeId); clearAssets(); instruction = ''; version = null; messages = []; await load(); });
    });
    app.querySelector('#agent-command')?.addEventListener('input', event => { instruction = (event.target as HTMLTextAreaElement).value; const select = app.querySelector<HTMLSelectElement>('#source-store'); if (select) select.disabled = busy || dirty() || Boolean(instruction.trim()); });
    app.querySelector('[data-composer]')?.addEventListener('submit', event => { event.preventDefault(); void send(instruction); });
    app.querySelectorAll<HTMLButtonElement>('[data-suggestion]').forEach(button => button.addEventListener('click', () => {
      instruction = button.dataset.suggestion || ''; const field = app.querySelector<HTMLTextAreaElement>('#agent-command'); if (field) field.value = instruction; focusComposer();
    }));
    app.querySelectorAll<HTMLButtonElement>('[data-clarification]').forEach(button => button.addEventListener('click', () => void send(button.dataset.clarification || '')));
    app.querySelector('[data-action="open-upload"]')?.addEventListener('click', () => app.querySelector<HTMLInputElement>('[data-image-input]')?.click());
    app.querySelector('[data-image-input]')?.addEventListener('change', event => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length + assets.length > 6 || files.some(f => f.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) || [...assets.map(a => a.file), ...files].reduce((n, f) => n + f.size, 0) > 6 * 1024 * 1024) {
        error = 'Adjunta hasta 6 imágenes PNG, JPG o WebP: 2 MB cada una y 6 MB en total.';
      } else { error = ''; assets.push(...files.map(file => ({ file, src: URL.createObjectURL(file) }))); }
      render();
    });
    app.querySelectorAll<HTMLButtonElement>('[data-remove-asset]').forEach(button => button.addEventListener('click', () => { const [removed] = assets.splice(Number(button.dataset.removeAsset), 1); URL.revokeObjectURL(removed.src); render(); }));
    const selectVersion = (revision: number) => void action(async () => { version = await api.sourceVersion(storeId, revision); draft = null; page = 'index.html'; filePath = 'index.html'; mode = 'preview'; });
    app.querySelector('#source-revision')?.addEventListener('change', event => selectVersion(Number((event.target as HTMLSelectElement).value)));
    app.querySelectorAll<HTMLButtonElement>('[data-source-revision]').forEach(button => button.addEventListener('click', () => selectVersion(Number(button.dataset.sourceRevision))));
    on('source-older', () => void action(async () => { const older = await api.sourceState(storeId, state.nextBefore!); state = { ...older, versions: [...state.versions, ...older.versions] }; }));
    on('source-restore', () => void action(async () => { const result = await api.restoreSource(storeId, version!.revision, state.revision); await load(result.revision); toast = 'Revisión restaurada. El historial sigue guardado.'; }));
    on('source-export', () => void action(async () => { const blob = await api.exportSource(storeId, version!.revision); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `storefront-r${version!.revision}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }));
    on('source-preview-tab', () => { mode = 'preview'; render(); }); on('source-code-tab', () => { mode = 'code'; render(); }); on('source-width', () => { mobile = !mobile; render(); });
    app.querySelector('#source-page')?.addEventListener('change', event => { page = (event.target as HTMLSelectElement).value; render(); });
    app.querySelector('#source-file')?.addEventListener('change', event => { filePath = (event.target as HTMLSelectElement).value; draft = null; render(); });
    app.querySelector('#source-code')?.addEventListener('input', event => {
      draft = (event.target as HTMLTextAreaElement).value;
      app.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('#agent-command, [data-composer] button, [data-suggestion], [data-clarification], [data-source-revision], #source-store, #source-reload, #source-logout, #source-revision, #source-export, #source-restore, #source-older, #source-file').forEach(control => { control.disabled = busy || dirty(); });
      app.querySelector<HTMLButtonElement>('#source-save')!.disabled = busy || !dirty() || historical();
      app.querySelector<HTMLButtonElement>('#source-discard')!.disabled = busy || !dirty();
    });
    on('source-save', () => void action(async () => { const result = await api.editSourceFile(storeId, state.revision, filePath, draft!); await load(result.revision); toast = 'Archivo guardado en una nueva revisión.'; }));
    on('source-discard', () => { draft = null; render(); });
  }
  render();
  if (sessionStorage.getItem(SESSION_STORAGE_KEY)) { await action(boot); if (embedded && storeId) void refreshCatalog(); }
  else loading = false;
}
