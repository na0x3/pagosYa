import { ApiError, MerchantStudioApi, SESSION_STORAGE_KEY, type MerchantStore, type SourceState, type SourceVersion } from './api';
import { sourcePreviewDocument, type SourceSnapshot } from './source-preview';
import './source-studio.css';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export async function mountSourceStudio(app: HTMLDivElement): Promise<void> {
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  let stores: MerchantStore[] = [], storeId = '', state: SourceState = {revision:0,versions:[],nextBefore:null}, version: SourceVersion | null = null;
  let busy = false, message = '', error = '', mode = 'preview', mobile = false, page = 'index.html', filePath = 'index.html', draft: string | null = null;
  let instruction = '', assets: Array<{url:string;name:string}> = [];
  let brief: SourceSnapshot['brief'] = {businessType:'', audience:'', primaryAction:'Explorar el catálogo y hacer un pedido', visualDirection:'Diseño limpio, profesional y propio de este negocio; composición y tipografía elegidas para sus clientes.'};
  const dirty = () => draft !== null && draft !== version?.snapshot.files.find(f => f.path === filePath)?.content;
  window.addEventListener('beforeunload', event => { if (dirty() || busy) { event.preventDefault(); event.returnValue = ''; } });
  async function action(task: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ''; render();
    try { await task(); } catch (e) {
      error = e instanceof Error ? e.message : 'No pudimos completar la solicitud.';
      if (e instanceof ApiError && e.status === 401) { sessionStorage.removeItem(SESSION_STORAGE_KEY); api.setToken(''); }
    } finally { busy = false; render(); }
  }
  async function load(revision?: number) {
    state = await api.sourceState(storeId);
    version = state.revision ? await api.sourceVersion(storeId, revision || state.revision) : null;
    if (version) brief = {...version.snapshot.brief};
    draft = null; page = 'index.html'; filePath = 'index.html';
  }
  async function boot() {
    stores = await api.listStores();
    storeId = stores.find(s => s.id === sessionStorage.getItem('pagosya_current_store_id'))?.id || stores[0]?.id || '';
    if (storeId) await load();
  }
  function render() {
    const locked = busy || dirty();
    const briefLocked = locked || Boolean(version && version.revision !== state.revision);
    const disabled = (condition: boolean) => condition ? 'disabled' : '';
    if (!sessionStorage.getItem(SESSION_STORAGE_KEY)) {
      app.innerHTML = `<main class="source-login"><a href="/">PagosYa / Studio</a><h1>Un sitio propio para tu negocio.</h1><p>Entra para crear, revisar y descargar tu sitio.</p><form id="source-login"><label>Correo<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button ${disabled(busy)}>Entrar</button></form><p role="alert">${escape(error)}</p></main>`;
      app.querySelector('form')?.addEventListener('submit', event => { event.preventDefault(); const fields = new FormData(event.currentTarget as HTMLFormElement); void action(async () => { const login = await api.login(String(fields.get('email')), String(fields.get('password'))); sessionStorage.setItem(SESSION_STORAGE_KEY,login.token); api.setToken(login.token); await boot(); }); });
      return;
    }
    app.innerHTML = `<div class="source-studio"><header class="source-header"><a href="/">PagosYa <span>/ Studio</span></a><label class="source-store">Negocio<select id="source-store" ${disabled(locked)}>${stores.map(s => `<option value="${escape(s.id)}" ${s.id === storeId ? 'selected' : ''}>${escape(s.name)}</option>`).join('')}</select></label><button id="source-reload" ${disabled(locked)}>Actualizar</button><button id="source-logout" ${disabled(locked)}>Salir</button></header>
    <div class="source-title"><div><p class="source-eyebrow">DISEÑO Y CÓDIGO PROPIOS</p><h1>Sitio independiente</h1><p>Crea una página para tu negocio. Cada cambio queda guardado en su propia revisión.</p></div><a href="/">Volver al editor</a></div>
    <p class="source-feedback" role="status" aria-live="polite">${escape(busy ? 'Procesando… Generar un sitio puede tomar hasta cuatro minutos.' : message)}</p>${error ? `<p class="source-error" role="alert">${escape(error)}</p>` : ''}
    ${!storeId ? '<p class="source-empty">Crea una tienda en el dashboard para comenzar.</p>' : `<div class="source-workspace"><form id="source-brief" class="source-brief"><h2>La dirección del sitio</h2><p>${version && version.revision !== state.revision ? "Estás viendo una revisión anterior. Restaúrala para pedir cambios." : "Cuéntanos qué distingue a este negocio."}</p>
    ${([['businessType','Tipo de negocio',120],['audience','Para quién es',500],['primaryAction','Qué debe poder hacer el cliente',500]] as const).map(([key,label,max]) => `<label>${label}<input name="${key}" value="${escape(brief[key])}" maxlength="${max}" required ${disabled(briefLocked)}></label>`).join('')}
    <label>Dirección visual<textarea name="visualDirection" maxlength="2000" required ${disabled(briefLocked)}>${escape(brief.visualDirection)}</textarea></label>
    <label>${version ? 'Qué quieres cambiar' : 'Detalles que debe incluir'}<textarea name="instruction" maxlength="8000" required ${disabled(briefLocked)} placeholder="Describe las páginas, el estilo y los detalles importantes…">${escape(instruction)}</textarea></label>
    <label class="source-upload">Fotos del negocio <span>Hasta 6 imágenes, 2 MB cada una y 6 MB en total</span><input id="source-assets" type="file" accept="image/png,image/jpeg,image/webp" multiple ${disabled(briefLocked)}></label>
    ${assets.length ? `<ul class="source-assets">${assets.map((a,i) => `<li>${escape(a.name)} <button type="button" data-remove-asset="${i}" ${disabled(briefLocked)} aria-label="Quitar ${escape(a.name)}">×</button></li>`).join('')}</ul>` : ''}
    <button class="source-primary" ${disabled(briefLocked)}>${version ? 'Generar nueva revisión' : 'Crear mi sitio'}</button><p class="source-footnote">La generación crea una revisión para revisar. Tu tienda publicada sigue disponible.</p></form>
    <section class="source-review" aria-label="Revisión del sitio"><div class="source-toolbar"><label>Revisión<select id="source-revision" ${disabled(locked || !version)}>${state.versions.map(v => `<option value="${v.revision}" ${v.revision === version?.revision ? 'selected' : ''}>${v.revision} · ${escape(v.label)}</option>`).join('')}</select></label>${state.nextBefore ? `<button id="source-older" ${disabled(locked)}>Ver anteriores</button>` : ''}<button id="source-export" ${disabled(locked || !version)}>Descargar ZIP</button>${version && version.revision !== state.revision ? `<button id="source-restore" ${disabled(locked)}>Restaurar esta revisión</button>` : ''}</div>
    ${version ? `<div class="source-viewbar"><button id="source-preview-tab" aria-pressed="${mode === 'preview'}">Vista previa</button><button id="source-code-tab" aria-pressed="${mode === 'code'}">Código</button>${mode === 'preview' ? `<label>Página<select id="source-page">${version.snapshot.files.filter(f=>f.path.endsWith('.html')).map(f=>`<option ${f.path===page?'selected':''}>${escape(f.path)}</option>`).join('')}</select></label><button id="source-width" aria-pressed="${mobile}">${mobile ? 'Ver escritorio' : 'Ver móvil'}</button>` : ''}</div>
    ${mode === 'preview' ? `<p class="source-preview-note">Vista previa · los pedidos no generan cobros.${dirty() ? ' Incluye cambios sin guardar.' : ''}</p><div class="source-frame-wrap ${mobile?'is-mobile':''}"><iframe title="Vista previa del sitio" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div>` : `<div class="source-editor"><label>Archivo<select id="source-file" ${disabled(dirty())}>${version.snapshot.files.filter(f=>f.encoding !== 'base64').map(f=>`<option ${f.path === filePath ? 'selected' : ''}>${escape(f.path)}</option>`).join('')}</select></label><textarea id="source-code" aria-label="Código del archivo" spellcheck="false" maxlength="180000" ${disabled(busy || version.revision !== state.revision)}></textarea><div><button id="source-save" class="source-primary" ${disabled(busy || !dirty() || version.revision !== state.revision)}>Guardar como nueva revisión</button><button id="source-discard" ${disabled(busy || !dirty())}>Descartar edición</button></div><p>${version.revision !== state.revision ? 'Restaura esta revisión para editarla.' : 'Edita un archivo y guárdalo antes de cambiar de archivo o generar.'}</p></div>`}` : '<div class="source-empty"><span>01 / EL PRIMER SITIO</span><h2>El diseño empieza con tu negocio.</h2><p>Completa la dirección del sitio. Aquí podrás probarlo, revisar sus archivos y descargar el proyecto completo.</p></div>'}</section></div>`}</div>`;
    const on = (id:string, fn:()=>void) => app.querySelector(`#${id}`)?.addEventListener('click',fn);
    on('source-logout',()=>void action(async()=>{ await api.logout().catch(()=>{}); sessionStorage.removeItem(SESSION_STORAGE_KEY); api.setToken(''); }));
    on('source-reload',()=>void action(boot));
    app.querySelector('#source-store')?.addEventListener('change',event=>void action(async()=>{ storeId=(event.target as HTMLSelectElement).value; sessionStorage.setItem('pagosya_current_store_id',storeId); assets=[]; instruction=''; version=null; brief={...brief,businessType:'',audience:''}; await load(); }));
    app.querySelector('#source-brief')?.addEventListener('input',event=>{const field=event.target as HTMLInputElement; if(field.name==='instruction') instruction=field.value; else if(field.name in brief) brief={...brief,[field.name]:field.value};});
    app.querySelector('#source-brief')?.addEventListener('submit',event=>{event.preventDefault(); void action(async()=>{const result=await api.generateSource(storeId,{revision:state.revision,brief,instruction,assetUrls:assets.map(a=>a.url)}); await load(result.revision); mode='preview'; message='Tu nueva revisión está lista para revisar.';});});
    app.querySelector('#source-assets')?.addEventListener('change',event=>{const files=Array.from((event.target as HTMLInputElement).files||[]); void action(async()=>{if(files.length+assets.length>6 || files.some(f=>f.size>2_000_000 || !['image/png','image/jpeg','image/webp'].includes(f.type))) throw new Error('Selecciona hasta 6 imágenes PNG, JPG o WebP de menos de 2 MB.'); for(const file of files) {const result=await api.upload(file);assets.push({url:result.url,name:file.name});}});});
    app.querySelectorAll<HTMLButtonElement>('[data-remove-asset]').forEach(button=>button.addEventListener('click',()=>{assets.splice(Number(button.dataset.removeAsset),1);render();}));
    app.querySelector('#source-revision')?.addEventListener('change',event=>void action(async()=>{version=await api.sourceVersion(storeId,Number((event.target as HTMLSelectElement).value)); draft=null;page='index.html';filePath='index.html';}));
    on('source-older',()=>void action(async()=>{const older=await api.sourceState(storeId,state.nextBefore!);state={...older,versions:[...state.versions,...older.versions]};}));
    on('source-restore',()=>void action(async()=>{const result=await api.restoreSource(storeId,version!.revision,state.revision);await load(result.revision);message='Revisión restaurada. El historial anterior sigue guardado.';}));
    on('source-export',()=>void action(async()=>{const blob=await api.exportSource(storeId,version!.revision);const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`storefront-r${version!.revision}.zip`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}));
    on('source-preview-tab',()=>{mode='preview';render();}); on('source-code-tab',()=>{mode='code';render();});on('source-width',()=>{mobile=!mobile;render();});
    app.querySelector('#source-page')?.addEventListener('change',event=>{page=(event.target as HTMLSelectElement).value;render();});
    app.querySelector('#source-file')?.addEventListener('change',event=>{filePath=(event.target as HTMLSelectElement).value;draft=null;render();});
    const editor=app.querySelector<HTMLTextAreaElement>('#source-code');
    if(editor) {editor.value=draft ?? version!.snapshot.files.find(f=>f.path===filePath)?.content ?? ''; editor.addEventListener('input',()=>{
      draft=editor.value;
      const changed=dirty();
      app.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('#source-brief input, #source-brief textarea, #source-brief button, #source-store, #source-reload, #source-logout, #source-revision, #source-export, #source-restore, #source-older, #source-file').forEach(control=>{control.disabled=busy || changed;});
      const save=app.querySelector<HTMLButtonElement>('#source-save'),discard=app.querySelector<HTMLButtonElement>('#source-discard');
      if(save)save.disabled=busy || !changed || version!.revision!==state.revision;
      if(discard)discard.disabled=busy || !changed;
    });}
    on('source-save',()=>void action(async()=>{const result=await api.editSourceFile(storeId,state.revision,filePath,draft!);await load(result.revision);message='Archivo guardado en una nueva revisión.';}));
    on('source-discard',()=>{draft=null;render();});
    const frame=app.querySelector<HTMLIFrameElement>('iframe');
    if(frame && version) {try {frame.srcdoc=sourcePreviewDocument({...version.snapshot,files:version.snapshot.files.map(f=>f.path===filePath && draft!==null ? {...f,content:draft} : f)},page);}catch(e){frame.replaceWith(document.createTextNode(e instanceof Error?e.message:'No se pudo abrir la vista previa.'));}}
  }
  render();
  if(sessionStorage.getItem(SESSION_STORAGE_KEY)) await action(boot);
}
