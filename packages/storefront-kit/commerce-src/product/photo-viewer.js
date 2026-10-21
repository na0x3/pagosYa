  // ---- Photo viewer (spec 2026-10-21 photo zoom) ----
  // One full-screen modal <dialog> for a product's photos: ‹ ›, ←/→ or a swipe move between them; double-click, double-tap,
  // pinch or the wheel zoom (1×–4×) at the point asked; a zoomed photo is dragged to look around. A modal dialog so it rises
  // above the product dialog (top layer). The page scroll lock it sets is always given back as it found it.
  const VIEWER_VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
  const VIEWER_MAX = 4, VIEWER_STEP = 2.5;
  const ZOOM_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>';
  const PHOTO_VIEWER_CSS = `
    :where(.pagosya-viewer){position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:color-mix(in srgb,var(--store-background,#fff) 97%,transparent);color:var(--store-foreground,#111);overflow:hidden}
    .pagosya-viewer::backdrop{background:transparent}
    .pagosya-viewer:not([open]){display:none}
    .pagosya-viewer__stage{position:absolute;inset:0 0 88px;display:grid;place-items:center;overflow:hidden;touch-action:none;cursor:zoom-in}
    .pagosya-viewer[data-single] .pagosya-viewer__stage{bottom:0}
    .pagosya-viewer[data-zoomed] .pagosya-viewer__stage{cursor:grab}
    .pagosya-viewer[data-dragging] .pagosya-viewer__stage{cursor:grabbing}
    .pagosya-viewer__photo{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;transition:transform .25s cubic-bezier(.2,.7,.2,1);will-change:transform}
    .pagosya-viewer[data-dragging] .pagosya-viewer__photo{transition:none}
    :where(.pagosya-viewer) button{font:inherit;color:inherit;background:var(--store-background,#fff);border:1px solid color-mix(in srgb,currentColor 18%,transparent);cursor:pointer}
    :where(.pagosya-viewer__close,.pagosya-viewer__nav){position:absolute;z-index:2;display:grid;place-items:center;width:44px;height:44px;padding:0;border-radius:999px;font-size:26px;line-height:1}
    .pagosya-viewer__close{top:16px;right:16px}
    .pagosya-viewer__nav{top:calc(50% - 66px)}
    .pagosya-viewer__nav--prev{left:16px}.pagosya-viewer__nav--next{right:16px}
    .pagosya-viewer__nav[hidden]{display:none}
    .pagosya-viewer__count{position:absolute;top:28px;left:20px;margin:0;font-size:13px;letter-spacing:.06em}
    .pagosya-viewer__thumbs{position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:center;gap:8px;padding:0 16px;overflow-x:auto}
    :where(.pagosya-viewer__thumbs) button{flex:0 0 56px;width:56px;height:56px;padding:0;border-radius:4px;overflow:hidden;opacity:.6}
    .pagosya-viewer__thumbs button[aria-current=true]{opacity:1;outline:1.5px solid currentColor;outline-offset:2px}
    .pagosya-viewer__thumbs img{display:block;width:100%;height:100%;object-fit:cover}
    @media(max-width:640px){.pagosya-viewer__nav{display:none}}
    :where([data-product-zoom]){position:absolute;top:10px;right:10px;z-index:3;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:color-mix(in srgb,var(--store-background,#fff) 88%,transparent);color:var(--store-foreground,#111);cursor:zoom-in;box-shadow:0 1px 3px rgba(0,0,0,.12)}
    [data-product-zoom] svg{width:18px;height:18px}
    :where(:has(>[data-product-zoom])){position:relative}
    @media(hover:hover){:where([data-product-zoom]){opacity:0;transition:opacity .2s}:where(.menu-item:hover,.menu-item:focus-within) [data-product-zoom]{opacity:1}}
    @media(hover:none){:where([data-product-zoom]){width:30px;height:30px}}
    :where([data-photo-zoom]){cursor:zoom-in}
    :where(.product-detail__stage[data-magnify]){overflow:hidden}
    .product-detail__stage[data-magnify] .product-detail__photo{scale:2;transition:scale .2s ease}
    @media(prefers-reduced-motion:reduce){.pagosya-viewer__photo,.product-detail__stage[data-magnify] .product-detail__photo,:where([data-product-zoom]){transition:none}}
  `;
  let photoViewer = null;
  const viewerState = { images: [], index: 0, scale: 1, x: 0, y: 0, title: '', opener: null, lockedFrom: null, moved: false, lastTap: 0 };
  const viewerPhotos = list => (Array.isArray(list) ? list : []).filter(url => typeof url === 'string' && url && !VIEWER_VIDEO.test(url));
  function ensurePhotoViewerStyle() {
    if (document.querySelector('style[data-pagosya-photo-viewer]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-photo-viewer', '');
    style.textContent = PHOTO_VIEWER_CSS;
    document.head.append(style);
  }
  function photoViewerElement() {
    if (photoViewer?.isConnected) return photoViewer;
    ensurePhotoViewerStyle();
    photoViewer = document.createElement('dialog');
    photoViewer.className = 'pagosya-viewer';
    photoViewer.setAttribute('data-pagosya-viewer', '');
    photoViewer.innerHTML = '<div class="pagosya-viewer__stage" data-viewer-stage><img class="pagosya-viewer__photo" data-viewer-photo alt="" draggable="false" /></div>'
      + '<p class="pagosya-viewer__count" data-viewer-count aria-live="polite"></p>'
      + '<button type="button" class="pagosya-viewer__close" data-viewer-close aria-label="Cerrar">×</button>'
      + '<button type="button" class="pagosya-viewer__nav pagosya-viewer__nav--prev" data-viewer-prev aria-label="Foto anterior">‹</button>'
      + '<button type="button" class="pagosya-viewer__nav pagosya-viewer__nav--next" data-viewer-next aria-label="Foto siguiente">›</button>'
      + '<div class="pagosya-viewer__thumbs" data-viewer-thumbs></div>';
    document.body.append(photoViewer);
    wirePhotoViewer(photoViewer);
    return photoViewer;
  }
  function viewerApply() {
    const el = photoViewer, photo = el.querySelector('[data-viewer-photo]'), stage = el.querySelector('[data-viewer-stage]');
    const s = viewerState.scale;
    // Pan stops where the photo's edge meets the stage's: never a gap on a side the photo is wider than.
    const maxX = Math.max(0, (photo.offsetWidth * s - stage.clientWidth) / 2), maxY = Math.max(0, (photo.offsetHeight * s - stage.clientHeight) / 2);
    viewerState.x = s === 1 ? 0 : Math.max(-maxX, Math.min(maxX, viewerState.x));
    viewerState.y = s === 1 ? 0 : Math.max(-maxY, Math.min(maxY, viewerState.y));
    photo.style.transform = `translate(${Math.round(viewerState.x)}px, ${Math.round(viewerState.y)}px) scale(${s})`;
    el.dataset.zoom = String(Math.round(s * 100) / 100);
    el.toggleAttribute('data-zoomed', s > 1);
  }
  // Zoom to `next` keeping the point (px, py), measured from the stage centre, under the finger or cursor.
  function viewerZoomTo(next, px = 0, py = 0) {
    const from = viewerState.scale, to = Math.max(1, Math.min(VIEWER_MAX, next));
    viewerState.x = px - (px - viewerState.x) * (to / from);
    viewerState.y = py - (py - viewerState.y) * (to / from);
    viewerState.scale = to;
    viewerApply();
  }
  function viewerPoint(event) {
    const rect = photoViewer.querySelector('[data-viewer-stage]').getBoundingClientRect();
    return [(event.clientX || 0) - (rect.left + rect.width / 2), (event.clientY || 0) - (rect.top + rect.height / 2)];
  }
  function viewerToggleZoom(event) {
    const [px, py] = viewerPoint(event);
    viewerZoomTo(viewerState.scale > 1 ? 1 : VIEWER_STEP, px, py);
  }
  function viewerShow(index) {
    const el = photoViewer, count = viewerState.images.length;
    viewerState.index = ((index % count) + count) % count;
    viewerState.scale = 1; viewerState.x = 0; viewerState.y = 0;
    const photo = el.querySelector('[data-viewer-photo]');
    photo.src = viewerState.images[viewerState.index];
    photo.alt = count > 1 ? `${viewerState.title} · foto ${viewerState.index + 1} de ${count}` : viewerState.title;
    el.querySelector('[data-viewer-count]').textContent = count > 1 ? `${viewerState.index + 1} / ${count}` : '';
    el.querySelectorAll('[data-viewer-thumb]').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.viewerThumb) === viewerState.index)));
    el.dataset.index = String(viewerState.index);
    viewerApply();
  }
  const viewerGo = step => { if (viewerState.images.length > 1) viewerShow(viewerState.index + step); };
  function openPhotoViewer(images, index, options = {}) {
    const list = viewerPhotos(images);
    if (!list.length) return false;
    const el = photoViewerElement();
    const asked = Array.isArray(images) ? images[index] : undefined;
    viewerState.images = list;
    viewerState.title = String(options.title || '');
    viewerState.opener = options.opener || document.activeElement;
    el.setAttribute('aria-label', `Fotos de ${viewerState.title}`);
    el.toggleAttribute('data-single', list.length === 1);
    el.querySelector('[data-viewer-prev]').hidden = list.length === 1;
    el.querySelector('[data-viewer-next]').hidden = list.length === 1;
    el.querySelector('[data-viewer-thumbs]').innerHTML = list.length > 1
      ? list.map((url, i) => `<button type="button" data-viewer-thumb="${i}" aria-label="Ver foto ${i + 1}"><img src="${escape(url)}" alt="" loading="lazy" /></button>`).join('') : '';
    viewerShow(Math.max(0, list.indexOf(asked)));
    if (!el.open) {
      viewerState.lockedFrom = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (typeof el.showModal === 'function') el.showModal(); else el.setAttribute('open', '');
    }
    el.querySelector('[data-viewer-close]').focus({ preventScroll: true });
    return true;
  }
  function closePhotoViewer() {
    const el = photoViewer;
    if (!el || !el.open) return;
    if (typeof el.close === 'function') el.close(); else el.removeAttribute('open');
    document.documentElement.style.overflow = viewerState.lockedFrom || '';
    viewerState.lockedFrom = null;
    const opener = viewerState.opener;
    viewerState.opener = null;
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  }
  function wirePhotoViewer(el) {
    const stage = el.querySelector('[data-viewer-stage]');
    const pointers = new Map();
    let pinchFrom = 0, pinchScale = 1, start = null;
    el.addEventListener('cancel', event => { event.preventDefault(); closePhotoViewer(); });
    el.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); viewerGo(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); viewerGo(1); }
      else if (event.key === 'Escape') { event.preventDefault(); closePhotoViewer(); }
    });
    el.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-viewer-close')) return closePhotoViewer();
      if (button?.hasAttribute('data-viewer-prev')) return viewerGo(-1);
      if (button?.hasAttribute('data-viewer-next')) return viewerGo(1);
      if (button?.hasAttribute('data-viewer-thumb')) return viewerShow(Number(button.dataset.viewerThumb));
      if (event.target === stage && viewerState.scale === 1 && !viewerState.moved) closePhotoViewer();
    });
    stage.addEventListener('dblclick', event => { event.preventDefault(); viewerToggleZoom(event); });
    stage.addEventListener('wheel', event => {
      event.preventDefault();
      const [px, py] = viewerPoint(event);
      viewerZoomTo(viewerState.scale * Math.exp(-event.deltaY * 0.002), px, py);
    }, { passive: false });
    stage.addEventListener('pointerdown', event => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture?.(event.pointerId);
      viewerState.moved = false;
      start = { x: event.clientX, y: event.clientY, panX: viewerState.x, panY: viewerState.y };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchFrom = Math.hypot(a.x - b.x, a.y - b.y) || 1; pinchScale = viewerState.scale;
      }
    });
    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId) || !start) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) viewerState.moved = true;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const [px, py] = viewerPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        viewerZoomTo(pinchScale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchFrom), px, py);
      } else if (viewerState.scale > 1) {
        el.setAttribute('data-dragging', '');
        viewerState.x = start.panX + (event.clientX - start.x);
        viewerState.y = start.panY + (event.clientY - start.y);
        viewerApply();
      }
    });
    const release = event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      el.removeAttribute('data-dragging');
      if (pointers.size || !start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      // A swipe at 1× moves between photos; a quick second tap on touch toggles zoom (mobile Safari sends no dblclick).
      if (viewerState.scale === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) viewerGo(dx < 0 ? 1 : -1);
      else if (event.pointerType === 'touch' && !viewerState.moved) {
        const now = Date.now();
        if (now - viewerState.lastTap < 300) { viewerToggleZoom(event); viewerState.lastTap = 0; viewerState.moved = true; } else viewerState.lastTap = now;
      }
      start = null;
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
  }
  // A public handle so a store's own code can open the same viewer (and the kit's specs can reach it).
  window.pagosyaPhotos = { open: openPhotoViewer, close: closePhotoViewer };
  // Product page: the shown photo (data-photo-zoom="") or a stacked one (its index) opens the viewer. A click an editor already
  // handled (defaultPrevented) is left alone.
  function openProductPhoto(target) {
    const own = target.getAttribute('data-photo-zoom');
    const index = own === '' ? selectedImage : Number(own);
    return openPhotoViewer(currentGallery(), Number.isFinite(index) ? index : 0, { title: selectedProduct?.name || '', opener: target });
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const target = event.target.closest?.('[data-pagosya-product] [data-photo-zoom]');
    if (target && openProductPhoto(target)) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = event.target.closest?.('[data-pagosya-product] [data-photo-zoom]');
    if (target && openProductPhoto(target)) event.preventDefault();
  });
  // Desktop magnifier: a fine mouse over the stage photo zooms it 2× around the cursor; leaving the stage resets it.
  document.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const photo = event.target.closest?.('[data-pagosya-product] .product-detail__stage .product-detail__photo');
    if (!photo || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    ensurePhotoViewerStyle();
    const stage = photo.closest('.product-detail__stage'), rect = photo.getBoundingClientRect();
    const x = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50, y = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
    photo.style.transformOrigin = `${Math.max(0, Math.min(100, x)).toFixed(1)}% ${Math.max(0, Math.min(100, y)).toFixed(1)}%`;
    if (!stage.hasAttribute('data-magnify')) {
      stage.setAttribute('data-magnify', '');
      stage.addEventListener('pointerleave', () => stage.removeAttribute('data-magnify'), { once: true });
    }
  });
