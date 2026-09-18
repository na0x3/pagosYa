import { inheritResourceTheme } from './source-resource-theme';
import { API_BASE_URL, MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import type { SourceSnapshot } from './source-preview';
import { escapeHtml as escape } from './studio-ui';
import { openCommerceContent } from './commerce-content';
import './source-library.css';

type Media = { url: string; name: string; kind: string; uses: string[] };
const mime: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg' };

/** Parse saved files as inert documents; never execute generated HTML in the dashboard. */
export function collectStoreResources(snapshot: SourceSnapshot | undefined, catalog: any, store: any) {
  const media = new Map<string, Media>();
  const texts = new Set<string>();
  const pages: Array<{ name: string; path: string; text: string[] }> = [];
  const files = snapshot?.files || [];
  function add(value: unknown, name: string, use: string, base = '') {
    if (typeof value !== 'string' || !value || value.startsWith('#')) return;
    if (value.startsWith('//')) value = `${location.protocol}${value}`;
    if (/^\/(?:api\/)?v1\/uploads\//.test(String(value))) value = new URL(String(value), new URL(API_BASE_URL, location.href)).href;
    let key = String(value);
    if (!/^(https?:|data:)/i.test(key)) {
      key = new URL(key, `https://saved.local/${base}`).pathname.slice(1);
      const file = files.find(file => file.path === key);
      if (!file) return;
      const type = mime[key.split('.').pop()!.toLowerCase()];
      if (!type) return;
      value = file.encoding === 'base64' ? `data:${type};base64,${file.content}` : `data:${type},${encodeURIComponent(file.content)}`;
    }
    if (!/^(https?:\/\/|data:(image|video|audio)\/)/i.test(String(value))) return;
    const kind = /(?:^data:video|\.(?:mp4|webm)(?:[?#]|$))/i.test(String(value)) ? 'video' : /(?:^data:audio|\.(?:mp3|ogg)(?:[?#]|$))/i.test(String(value)) ? 'audio' : /(?:^data:image\/svg|\.svg(?:[?#]|$))/i.test(String(value)) ? 'icon' : 'image';
    const entry = media.get(key) || { url: String(value), name, kind, uses: [] };
    if (use && !entry.uses.includes(use)) entry.uses.push(use);
    media.set(key, entry);
  }
  for (const file of files) {
    if (mime[file.path.split('.').pop()!.toLowerCase()]) add(file.path, file.path.split('/').pop()!, '');
    if (file.path.endsWith('.html')) {
      const doc = new DOMParser().parseFromString(file.content, 'text/html');
      doc.querySelectorAll('img, video, audio, source, image').forEach(el => {
        add(el.getAttribute('src') || el.getAttribute('href'), el.getAttribute('alt') || el.getAttribute('aria-label') || file.path, file.path, file.path);
        add(el.getAttribute('poster'), 'Portada de video', file.path, file.path);
        const srcset = el.getAttribute('srcset');
        if (srcset && !srcset.includes('data:')) srcset.split(',').forEach(src => add(src.trim().split(/\s+/)[0], 'Imagen adaptable', file.path, file.path));
      });
      doc.querySelectorAll('svg').forEach((el, index) => add(`data:image/svg+xml,${encodeURIComponent(el.outerHTML)}`, el.getAttribute('aria-label') || `Icono ${index + 1}`, file.path));
      doc.querySelectorAll('script,style,template,noscript').forEach(el => el.remove());
      const text = [...doc.querySelectorAll('h1,h2,h3,h4,p,li,summary,label,button,a')].map(el => el.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean);
      pages.push({ name: doc.title || doc.querySelector('h1')?.textContent || file.path, path: file.path, text: [...new Set(text)] });
    }
    if (/\.(html|css)$/.test(file.path)) {
      for (const match of file.content.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) add(match[1], 'Fondo del sitio', file.path, file.path);
    }
  }
  function walk(value: any, label: string) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(item => walk(item, label)); return; }
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && /^(title|subtitle|tagline|headline|description|text|body|caption|announcementText|label)$/.test(key) && item.trim()) texts.add(item.trim());
      if (/imageUrls$/i.test(key) && Array.isArray(item)) item.forEach(url => add(url, value.name || label, label));
      else if (/(image|banner|logo|video|poster|background).*url$/i.test(key)) add(item, value.name || label, label);
      else if (typeof item === 'object') walk(item, label);
    }
  }
  for (const item of catalog?.items || []) walk(item, `Producto · ${item.name}`);
  walk(store, 'Identidad y secciones');
  const config = files.find(file => file.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  if (config) try { walk(JSON.parse(config[1]), 'Contenido del sitio'); } catch { /* Hand-authored configs remain available through their HTML. */ }
  return { media: [...media.values()], pages, texts: [...texts] };
}

export async function mountSourceLibrary(app: HTMLDivElement) {
  inheritResourceTheme();
  document.body.className = 'store-resource-body';
  const params = new URLSearchParams(location.search), storeId = params.get('store') || '', mode = params.get('library');
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  const resize = () => window.parent.postMessage({ type: 'pagosya:resource-height', storeId, height: app.scrollHeight + 24 }, location.origin);
  new ResizeObserver(resize).observe(app);
  let search = '', filter = '';
  async function load() {
    app.innerHTML = '<p role="status">Cargando los recursos de esta tienda…</p>';
    try {
      const [state, catalog, stores] = await Promise.all([api.sourceState(storeId), api.sourceCatalog(storeId), api.listStores()]);
      const store = stores.find(item => item.id === storeId);
      if (!store) throw Error('Esta tienda no está disponible.');
      const version = state.revision ? await api.sourceVersion(storeId, state.revision) : undefined;
      const { media, pages, texts } = collectStoreResources(version?.snapshot, catalog, store);
      // Uploaded media is resolved against the same API connection as the dashboard.
      media.forEach(item => { if (item.url.startsWith('/')) item.url = new URL(item.url, new URL(API_BASE_URL, location.href)).href; });
      let articles: any[] = [], contentError = '';
      if (mode === 'content') try { articles = ((await api.commerceContent(storeId)) as any).articles || []; } catch { contentError = 'No se pudieron cargar los artículos. Puedes volver a intentar.'; }
      app.innerHTML = `<div class="resource-heading"><strong>${escape(store.name)}</strong><button type="button" data-reload>Actualizar</button></div><div class="resource-tools"><label>Buscar ${mode === 'media' ? 'medios' : 'contenido'}<input type="search" data-search placeholder="${mode === 'media' ? 'Nombre, producto o página' : 'Página, título o texto'}"></label>${mode === 'media' ? '<label>Tipo<select data-filter><option value="">Todos los medios</option><option value="image">Imágenes</option><option value="video">Videos</option><option value="icon">Iconos</option><option value="audio">Audio</option></select></label>' : '<button type="button" data-manage>Gestionar artículos y reseñas</button>'}<span data-count role="status"></span></div><div data-results></div>`;
      function draw() {
        const host = app.querySelector<HTMLElement>('[data-results]')!;
        const matches = (text: string) => text.toLocaleLowerCase().includes(search);
        if (mode === 'media') {
          const visible = media.filter(item => (!filter || item.kind === filter) && matches(`${item.name} ${item.uses.join(' ')}`));
          app.querySelector('[data-count]')!.textContent = `${visible.length} de ${media.length} medios`;
          host.className = 'resource-grid';
          host.innerHTML = visible.map(item => `<article class="resource-card"><div class="resource-cover">${item.kind === 'video' ? `<video src="${escape(item.url)}" controls preload="metadata" playsinline aria-label="${escape(item.name)}"></video>` : item.kind === 'audio' ? `<audio src="${escape(item.url)}" controls preload="none" aria-label="${escape(item.name)}"></audio>` : `<img src="${escape(item.url)}" alt="${escape(item.name)}" loading="lazy">`}</div><div class="resource-copy"><strong>${escape(item.name)}</strong><p>${escape(item.uses.join(' · ') || 'Guardado en el diseño')}</p><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">Abrir archivo ↗</a></div></article>`).join('') || `<p class="resource-empty">${media.length ? 'No hay medios que coincidan con tu búsqueda.' : 'Esta tienda todavía no tiene medios. Las fotos de productos y los archivos del diseño aparecerán aquí.'}</p>`;
        } else {
          const visible = pages.filter(page => matches(`${page.name} ${page.text.join(' ')}`));
          const visibleTexts = texts.filter(matches);
          const visibleArticles = articles.filter(item => matches(`${item.title} ${item.body}`));
          app.querySelector('[data-count]')!.textContent = `${visible.length} páginas · ${visibleTexts.length} textos · ${visibleArticles.length} artículos`;
          host.innerHTML = `<div class="content-pages">${visible.map(page => `<details class="content-page" open><summary><strong>${escape(page.name)}</strong><span>${escape(page.path)}</span></summary><div>${page.text.map(text => `<p>${escape(text)}</p>`).join('') || '<p>Esta página muestra contenido del catálogo.</p>'}</div></details>`).join('')}</div>${visibleArticles.length ? `<h2>Artículos</h2>${visibleArticles.map(item => `<article class="content-page"><h3>${escape(item.title)}</h3><small>${item.publishedAt ? 'Publicado o programado' : 'Borrador'}</small><p>${escape(item.excerpt || item.body || '')}</p></article>`).join('')}` : ''}${visibleTexts.length ? `<details class="content-page" open><summary><strong>Textos de secciones y productos</strong></summary><div>${visibleTexts.map(text => `<p>${escape(text)}</p>`).join('')}</div></details>` : ''}${!visible.length && !visibleArticles.length && !visibleTexts.length ? '<p class="resource-empty">No hay contenido para mostrar con esta búsqueda.</p>' : ''}${contentError ? `<p role="alert">${contentError}</p>` : ''}`;
        }
      }
      app.querySelector('[data-search]')!.addEventListener('input', event => { search = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase(); draw(); });
      app.querySelector('[data-filter]')?.addEventListener('change', event => { filter = (event.target as HTMLSelectElement).value; draw(); });
      app.querySelector('[data-manage]')?.addEventListener('click', () => void openCommerceContent(api, storeId));
      app.querySelector('[data-reload]')!.addEventListener('click', () => { search = ''; filter = ''; void load(); });
      draw();
    } catch (error) {
      app.innerHTML = `<p role="alert">${escape(error instanceof Error ? error.message : 'No se pudieron cargar los recursos.')}</p><button type="button">Volver a intentar</button>`;
      app.querySelector('button')!.onclick = () => void load();
    }
  }
  await load();
}
