import type { MerchantStudioApi, SourceVersion, SourceGenerationSettings } from './api';
import { escapeHtml as escape } from './studio-ui';
import './source-visual-tools.css';

export type VisualAsset = { path: string; role: string; description: string; kind: 'image' | 'icon' | 'video'; references: string[]; bytes: number };
export type AssetLibrary = { revision: number; assets: VisualAsset[]; icons: Array<{ name: string; path: string; svg: string }>; iconLibrary: string };
/** Kept as an API shape for stored reports; visual review is no longer exposed in Studio. */
export type VisualReport = { revision: number; page: string; model: string; summary: string; credits: number | null; findings: Array<{ viewport: string; severity: string; category: string; location: string; observation: string; correction: string }>; captures: Array<{ viewport: string; width: number; height: number; y: number; pageHeight: number; image: string }> };

const roles = [['unknown', 'Por definir'], ['product', 'Producto'], ['logo', 'Logo'], ['business', 'Negocio'], ['background', 'Fondo'], ['team', 'Equipo'], ['reference', 'Solo referencia'], ['unused', 'No usar']];
const iconLabels: Record<string, string> = { 'shopping-bag': 'Bolsa', 'shopping-cart': 'Carrito', 'arrow-right': 'Avanzar', 'arrow-left': 'Volver', 'chevron-down': 'Desplegar', 'chevron-right': 'Siguiente', check: 'Confirmar', x: 'Cerrar', plus: 'Agregar', minus: 'Quitar', search: 'Buscar', menu: 'Menú', 'map-pin': 'Ubicación', clock: 'Horario', phone: 'Teléfono', mail: 'Correo', truck: 'Envío', package: 'Paquete', heart: 'Favorito', 'shield-check': 'Protección', 'credit-card': 'Tarjeta', calendar: 'Calendario', utensils: 'Restaurante', coffee: 'Café' };
const imageType: Record<string, string> = { mp4: 'video/mp4', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };

/** Keep asset roles across ordinary Studio rerenders without exposing paid visual review. */
export function createSourceVisualTools(api: MerchantStudioApi) {
  const libraries = new Map<string, AssetLibrary>();
  let active = '', tab: 'assets' | null = null, error = '', pending = false;
  let redraw = () => {};
  let changes = new Map<string, { path: string; role: string; description: string }>();

  return function mount(host: HTMLElement, options: { storeId: string; version: SourceVersion; page: string; settings: SourceGenerationSettings; locked: boolean; historical: boolean; prepare: (text: string) => void; saved: () => Promise<void> }) {
    const { storeId, version, page } = options;
    const assetKey = `${storeId}:${version.revision}`;
    if (active !== assetKey) { active = assetKey; tab = null; error = ''; changes = new Map(); }
    const current = () => host.isConnected && active === assetKey;
    async function execute(task: () => Promise<void>) {
      if (pending) return;
      pending = true; error = ''; draw();
      try { await task(); } catch (e) { if (active === assetKey) error = e instanceof Error ? e.message : 'No se pudo completar. Intenta de nuevo.'; }
      finally { pending = false; redraw(); }
    }
    function assetImage(path: string) {
      const file = version.snapshot.files.find(f => f.path === path);
      const type = imageType[path.split('.').at(-1)!];
      if (!file || !type) return '';
      return file.encoding === 'base64' ? `data:${type};base64,${file.content}` : `data:${type},${encodeURIComponent(file.content)}`;
    }
    function draw() {
      const focused = document.activeElement instanceof HTMLElement && host.contains(document.activeElement) ? document.activeElement : null;
      const focusKey = focused?.dataset.visualFocus;
      const library = libraries.get(assetKey);
      const disabled = pending || options.locked;
      const resourceBody = library ? `<p>Define cómo puede usar YAPI cada imagen o video. Se guarda automáticamente, sin créditos de IA.</p><div class="source-asset-list">${library.assets.filter(asset => asset.kind !== 'icon').map((asset, index) => {
        const value = changes.get(asset.path) || asset;
        const preview = asset.kind === 'video' ? `<video src="${escape(assetImage(asset.path))}" controls autoplay muted loop playsinline preload="auto" aria-label="${escape(asset.description || `Video ${index + 1}`)}"></video>` : `<img src="${escape(assetImage(asset.path))}" alt="" loading="lazy">`;
        return `<article class="source-asset-row">${preview}<div><p class="source-asset-name">${escape(asset.description || `${asset.kind === 'video' ? 'Video' : 'Imagen'} ${index + 1}`)}</p><label>Uso<select data-asset-role="${index}" ${disabled || options.historical ? 'disabled' : ''}>${roles.map(([id, label]) => `<option value="${id}" ${value.role === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Descripción<input data-asset-description="${index}" value="${escape(value.description)}" maxlength="500" ${disabled || options.historical ? 'disabled' : ''}></label><small>${asset.references.length ? `En ${escape(asset.references.join(', '))}` : 'Guardada, sin uso actual'}</small><button type="button" data-use-asset="${escape(asset.path)}" ${disabled || value.role === 'unused' ? 'disabled' : ''}>Usar en indicación</button></div></article>`;
      }).join('') || '<p>Aún no hay imágenes o videos guardados. Adjunta archivos en el chat para incorporarlas al sitio.</p>'}</div><button type="button" data-save-roles ${disabled || options.historical || !changes.size ? 'disabled' : ''}>Guardar usos</button><h3>Iconos disponibles</h3><p>${escape(library.iconLibrary)} · Se incluyen solo los que uses.</p><div class="source-icon-list">${library.icons.map(icon => `<button type="button" data-use-asset="${escape(icon.path)}" ${disabled ? 'disabled' : ''}><img src="data:image/svg+xml,${encodeURIComponent(icon.svg)}" alt="">${escape(iconLabels[icon.name] || icon.name)}</button>`).join('')}</div>` : '<button type="button" data-load-assets>Volver a cargar recursos</button>';
      host.innerHTML = `<div class="source-visual-buttons"><button type="button" data-visual-tab="assets" aria-expanded="${tab === 'assets'}" ${disabled ? 'disabled' : ''}>Recursos visuales</button></div>${tab === 'assets' ? `<section class="source-visual-panel" aria-label="Recursos visuales"><div class="source-visual-heading"><h2 tabindex="-1" data-visual-title>Recursos visuales</h2><button type="button" data-visual-close ${pending ? 'disabled' : ''}>Cerrar</button></div>${error ? `<p role="alert">${escape(error)}</p>` : ''}${pending ? '<p role="status">Preparando…</p>' : ''}${resourceBody}</section>` : ''}`;
      host.querySelectorAll<HTMLButtonElement>('[data-visual-tab]').forEach(button => button.addEventListener('click', () => {
        tab = tab === button.dataset.visualTab ? null : 'assets'; draw();
        if (tab) host.querySelector<HTMLElement>('[data-visual-title]')?.focus({ preventScroll: true });
        if (tab === 'assets' && !libraries.has(assetKey)) void loadAssets();
      }));
      host.querySelector('[data-visual-close]')?.addEventListener('click', () => { tab = null; draw(); host.querySelector<HTMLButtonElement>('[data-visual-tab="assets"]')?.focus(); });
      host.querySelector('[data-load-assets]')?.addEventListener('click', () => void loadAssets());
      host.querySelectorAll<HTMLButtonElement>('[data-use-asset]').forEach(button => button.addEventListener('click', () => {
        const path = button.dataset.useAsset!;
        const role = changes.get(path)?.role || library?.assets.find(asset => asset.path === path)?.role;
        if (role === 'unused' || pending || options.locked) return;
        options.prepare(`Usa el recurso guardado ${path} en esta página (${page}), respetando su uso confirmado y el diseño actual.`);
      }));
      const photos = library?.assets.filter(asset => asset.kind !== 'icon') || [];
      host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-asset-role], [data-asset-description]').forEach(field => field.addEventListener('input', () => {
        const index = Number(field.dataset.assetRole ?? field.dataset.assetDescription);
        const asset = photos[index]; if (!asset) return;
        changes.set(asset.path, { path: asset.path, role: host.querySelector<HTMLSelectElement>(`[data-asset-role="${index}"]`)!.value, description: host.querySelector<HTMLInputElement>(`[data-asset-description="${index}"]`)!.value });
        const save = host.querySelector<HTMLButtonElement>('[data-save-roles]'); if (save) save.disabled = disabled || options.historical;
        const insert = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-use-asset]')).find(candidate => candidate.dataset.useAsset === asset.path);
        if (insert) insert.disabled = disabled || changes.get(asset.path)?.role === 'unused';
      }));
      host.querySelector('[data-save-roles]')?.addEventListener('click', () => void execute(async () => {
        await api.saveSourceAssetRoles(storeId, version.revision, [...changes.values()]); changes.clear(); await options.saved();
      }));
      const focusable = Array.from(host.querySelectorAll<HTMLElement>('button, input, select, [data-visual-title]'));
      for (const element of focusable) {
        const attribute = Array.from(element.attributes).find(attribute => attribute.name.startsWith('data-') && attribute.name !== 'data-visual-focus');
        element.dataset.visualFocus = attribute ? `${attribute.name}:${attribute.value}` : element.tagName;
      }
      if (focusKey) {
        const replacement = focusable.find(element => element.dataset.visualFocus === focusKey && !element.hasAttribute('disabled'));
        (replacement || host.querySelector<HTMLElement>('[data-visual-title]'))?.focus({ preventScroll: true });
      }
    }
    async function loadAssets() { await execute(async () => { libraries.set(assetKey, await api.sourceAssets(storeId, version.revision)); }); }
    redraw = () => { if (current()) draw(); };
    draw();
  };
}
