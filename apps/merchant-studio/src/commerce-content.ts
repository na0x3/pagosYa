import { preserveDialogForms } from './dialog-form-state';
import { API_BASE_URL, MerchantStudioApi } from './api';
import { escapeHtml as escape } from './studio-ui';
import './brand-profile.css';
import './commerce-content.css';

export async function openCommerceContent(api: MerchantStudioApi, storeId: string) {
  const dialog = document.createElement('dialog'); dialog.className = 'brand-dialog'; dialog.setAttribute('aria-label', 'Contenido y ofertas');
  let state: any, catalog: any; let article: any = null; let message = ''; let busy = false; let reviewLoading = false; let reviewFilter = '';
  const productName = (id: string) => (catalog.items || []).find((item: any) => item.id === id)?.name || 'Producto';
  const bundleKind: Record<string, string> = { FIXED: 'Paquete', MIX_MATCH: 'Combina y ahorra', BOGO: '2 × 1' };
  function bundleCard(item: any) {
    const lines = (Array.isArray(item.items) ? item.items : []).map((line: any) => `${Number(line.quantity) > 1 ? `${Number(line.quantity)} × ` : ''}${escape(productName(line.productId))}`);
    const deal = item.kind === 'BOGO' ? 'El de menor precio es gratis' : item.kind === 'MIX_MATCH' ? `${item.discountPercent}% al llevar ${item.minimumQuantity} o más` : `${item.discountPercent}% de descuento`;
    return `<li class="bundle-card" data-active="${item.active}"><div><div class="bundle-card-head"><strong>${escape(item.name)}</strong><span class="bundle-pill">${escape(bundleKind[item.kind] || item.kind)}</span><span class="bundle-status">${item.active ? 'Activo' : 'Pausado'}</span></div><p>${lines.join(' + ') || 'Sin productos'}</p><p class="bundle-deal">${escape(deal)}</p></div><button class="button" data-toggle-bundle="${escape(item.id)}">${item.active ? 'Pausar' : 'Activar'}</button></li>`;
  }
  function bundleProductRow(item: any) {
    const photo = Array.isArray(item.imageUrls) ? item.imageUrls.find((url: string) => !/\.(mp4|webm|mov)(\?|$)/i.test(url)) : '';
    // Uploaded photos are API-relative; resolve them the way the media library does.
    const image = photo && /^\/(?:api\/)?v1\/uploads\//.test(photo) ? new URL(photo, new URL(API_BASE_URL, location.href)).href : photo;
    const price = Number.isFinite(item.amount) ? `${item.currency === 'BOB' ? 'Bs' : escape(item.currency || '')} ${(item.amount / 100).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
    return `<div class="bundle-product"><label><input type="checkbox" name="product" value="${escape(item.id)}">${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : '<span class="bundle-product-blank" aria-hidden="true"></span>'}<span><strong>${escape(item.name)}</strong><small>${price}</small></span></label><input type="number" data-quantity="${escape(item.id)}" min="1" max="99" value="1" disabled aria-label="Unidades de ${escape(item.name)} por paquete"></div>`;
  }
  // Only the fields that apply to the chosen offer are shown; quantities unlock with their product.
  function bindBundleForm() {
    const form = dialog.querySelector<HTMLFormElement>('#bundle-form');
    if (!form) return;
    const kind = form.elements.namedItem('kind') as HTMLSelectElement;
    const sync = () => {
      const value = kind.value;
      form.querySelector<HTMLElement>('[data-bundle-field="discount"]')!.hidden = value === 'BOGO';
      form.querySelector<HTMLElement>('[data-bundle-field="minimum"]')!.hidden = value !== 'MIX_MATCH';
      form.querySelector('[data-bundle-hint]')!.textContent = value === 'BOGO' ? 'En el 2 × 1, el producto de menor precio es gratis.' : value === 'MIX_MATCH' ? 'El descuento se aplica cuando el cliente lleva la cantidad mínima entre los productos elegidos.' : 'El cliente añade el paquete completo con un solo botón.';
      form.querySelectorAll<HTMLInputElement>('input[name=product]').forEach(box => {
        const quantity = form.querySelector<HTMLInputElement>(`[data-quantity="${CSS.escape(box.value)}"]`)!;
        quantity.disabled = !box.checked || value !== 'FIXED';
        box.closest('.bundle-product')!.toggleAttribute('data-checked', box.checked);
      });
      const count = form.querySelectorAll('input[name=product]:checked').length;
      form.querySelector('[data-bundle-count]')!.textContent = `${count} ${count === 1 ? 'elegido' : 'elegidos'}`;
    };
    form.addEventListener('change', sync); sync();
  }
  document.body.append(dialog); dialog.innerHTML = '<p role="status">Cargando contenido…</p>'; dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove()); dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  try { [state, catalog] = await Promise.all([api.commerceContent(storeId), api.sourceCatalog(storeId)]); render(); } catch (e) { dialog.innerHTML = `<p>${escape(e instanceof Error ? e.message : 'No se pudo cargar.')}</p><button>Cerrar</button>`; dialog.querySelector('button')!.onclick = () => dialog.close(); }
  async function run(task: () => Promise<void>) { if (busy) return; const restore = preserveDialogForms(dialog); let failed = false; busy = true; message = ''; dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input,textarea,select,button').forEach(control => control.disabled = true); try { await task(); state = await api.commerceContent(storeId); reviewFilter = ''; } catch (e) { failed = true; message = e instanceof Error ? e.message : 'No se pudo guardar.'; } finally { busy = false; render(); if (failed) restore(); } }
  async function loadReviews(replace: boolean) {
    if (reviewLoading || busy || (!replace && !state.reviewNextBefore)) return;
    reviewLoading = true; message = ''; render();
    try {
      const result = await api.commerceContentReviews(storeId, { status: reviewFilter || undefined, before: replace ? undefined : state.reviewNextBefore });
      state = { ...state, reviews: replace ? result.items : [...(state.reviews || []), ...result.items], reviewNextBefore: result.nextBefore, reviewCounts: result.counts };
    } catch (e) { message = e instanceof Error ? e.message : 'No se pudieron cargar más reseñas.'; }
    finally { reviewLoading = false; render(); }
  }
  function render() {
    const reviewCounts = state.reviewCounts || {};
    const reviewTotal = Object.values(reviewCounts).reduce((sum: number, value: any) => sum + Number(value || 0), 0) || (state.reviews || []).length;
    dialog.innerHTML = `<header><h2>Contenido y ofertas</h2><button class="button" id="content-close">Cerrar</button></header><p>Gestiona artículos, paquetes y reseñas. Pídele a YAPI que añada sus secciones al sitio cuando quieras mostrarlos.</p>
      <section class="brand-import"><h3>Artículos</h3>${state.articles.map((item: any) => `<article><strong>${escape(item.title)}</strong><p>${escape(item.locale)} · ${item.publishedAt ? new Date(item.publishedAt) > new Date() ? 'Programado' : 'Publicado' : 'Borrador'}</p><button class="button" data-edit-article="${escape(item.id)}">Editar</button></article>`).join('') || '<p>No hay artículos todavía.</p>'}
      <form id="article-form"><div class="brand-fields"><label>Título<input name="title" maxlength="160" required value="${escape(article?.title || '')}"></label><label>Dirección del artículo<input name="slug" maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*" required value="${escape(article?.slug || '')}" ${article ? 'readonly' : ''}></label><label>Idioma<input name="locale" required pattern="[a-z]{2}(-[A-Z]{2})?" value="${escape(article?.locale || 'es')}" ${article ? 'readonly' : ''}></label><label>Autor<input name="author" required maxlength="100" value="${escape(article?.author || '')}"></label></div><label>Resumen<textarea name="excerpt" maxlength="500">${escape(article?.excerpt || '')}</textarea></label><label>Artículo<textarea name="body" rows="8" maxlength="40000" required>${escape(article?.body || '')}</textarea></label><label>Publicar en esta fecha (vacío = borrador)<input type="datetime-local" name="publishedAt" value="${article?.publishedAt ? localDate(article.publishedAt) : ''}"></label><button type="submit" class="button button--publish">Guardar artículo</button>${article ? '<button type="button" class="button" id="article-new">Nuevo artículo</button>' : ''}</form></section>
      <section class="brand-import bundle-section"><h3>Paquetes y promociones</h3><p>Se aplica la mejor oferta disponible. Los paquetes no se acumulan con códigos promocionales.</p>${state.bundles.length ? `<ul class="bundle-list">${state.bundles.map(bundleCard).join('')}</ul>` : ''}
      <form id="bundle-form" class="bundle-form"><h4>Nueva oferta</h4><div class="bundle-grid"><label>Nombre<input name="name" maxlength="100" required placeholder="Ej.: Dúo de cuadros"></label><label>Tipo de oferta<select name="kind"><option value="FIXED">Paquete de productos</option><option value="MIX_MATCH">Combina productos</option><option value="BOGO">Lleva dos, paga el mayor</option></select></label><label data-bundle-field="discount">Descuento<span class="bundle-suffix"><input name="discountPercent" type="number" min="1" max="99" value="10" required><span aria-hidden="true">%</span></span></label><label data-bundle-field="minimum">Unidades mínimas<input name="minimumQuantity" type="number" min="2" max="99" value="2" required></label></div><p class="bundle-hint" data-bundle-hint></p><fieldset class="bundle-products"><legend>Productos incluidos <small data-bundle-count>0 elegidos</small></legend>${(catalog.items || []).map(bundleProductRow).join('') || '<p>Crea productos para armar paquetes.</p>'}</fieldset><button type="submit" class="button button--publish">Crear oferta</button></form></section>
      <section class="brand-import"><h3>Reseñas de compras verificadas</h3><p>Solo un pedido pagado que incluya el producto puede enviar una reseña. Revisa el contenido antes de publicarlo.</p><div class="commerce-review-tools"><label>Mostrar<select id="review-status-filter"><option value="" ${!reviewFilter ? 'selected' : ''}>Todas (${reviewTotal})</option><option value="PENDING" ${reviewFilter === 'PENDING' ? 'selected' : ''}>Pendientes (${reviewCounts.PENDING || 0})</option><option value="PUBLISHED" ${reviewFilter === 'PUBLISHED' ? 'selected' : ''}>Publicadas (${reviewCounts.PUBLISHED || 0})</option><option value="REJECTED" ${reviewFilter === 'REJECTED' ? 'selected' : ''}>Ocultas (${reviewCounts.REJECTED || 0})</option></select></label><small>${reviewLoading ? 'Cargando reseñas…' : `${(state.reviews || []).length} mostradas`}</small></div>${(state.reviews || []).map((review: any) => `<article><strong>${escape(review.displayName)} · ${review.rating} de 5</strong><p>${escape(review.body)}</p><small>${escape(review.status)}</small><button class="button" data-review="${escape(review.id)}" data-status="PUBLISHED">Publicar</button><button class="button" data-review="${escape(review.id)}" data-status="REJECTED">Ocultar</button></article>`).join('') || '<p>No hay reseñas para este filtro.</p>'}${state.reviewNextBefore ? `<button type="button" class="button" data-review-more ${reviewLoading ? 'disabled' : ''}>${reviewLoading ? 'Cargando…' : 'Cargar más reseñas'}</button>` : ''}</section><p role="status">${escape(message)}</p>`;
    dialog.querySelector('#content-close')!.addEventListener('click', () => dialog.close());
    dialog.querySelectorAll<HTMLButtonElement>('[data-edit-article]').forEach(button => button.onclick = () => { article = state.articles.find((item: any) => item.id === button.dataset.editArticle); render(); dialog.querySelector('#article-form')!.scrollIntoView({ block: 'start' }); });
    dialog.querySelector('#article-new')?.addEventListener('click', () => { article = null; render(); });
    dialog.querySelector('#article-form')!.addEventListener('submit', e => { e.preventDefault(); const form = Object.fromEntries(new FormData(e.target as HTMLFormElement)); void run(async () => { await api.writeCommerceContent(storeId, 'articles', 'PUT', { ...form, revision: article?.revision || 0, publishedAt: form.publishedAt ? new Date(String(form.publishedAt)).toISOString() : null }); article = null; message = 'Artículo guardado.'; }); });
    bindBundleForm();
    dialog.querySelector('#bundle-form')!.addEventListener('submit', e => { e.preventDefault(); const form = new FormData(e.target as HTMLFormElement); const ids = form.getAll('product').map(String); const items = ids.map(productId => ({ productId, quantity: Number([...dialog.querySelectorAll<HTMLInputElement>('[data-quantity]')].find(el => el.dataset.quantity === productId)!.value) })); void run(async () => { await api.writeCommerceContent(storeId, 'bundles', 'POST', { name: form.get('name'), kind: form.get('kind'), minimumQuantity: Number(form.get('minimumQuantity')), discountPercent: Number(form.get('discountPercent')), items }); message = 'Oferta activa. Se aplicará a los pedidos que cumplan sus condiciones.'; }); });
    dialog.querySelectorAll<HTMLButtonElement>('[data-toggle-bundle]').forEach(button => button.onclick = () => void run(async () => { const item = state.bundles.find((b: any) => b.id === button.dataset.toggleBundle); await api.writeCommerceContent(storeId, `bundles/${encodeURIComponent(item.id)}`, 'PATCH', { active: !item.active }); }));
    dialog.querySelectorAll<HTMLButtonElement>('[data-review]').forEach(button => button.onclick = () => void run(async () => { await api.writeCommerceContent(storeId, `reviews/${encodeURIComponent(button.dataset.review!)}`, 'PATCH', { status: button.dataset.status }); }));
    dialog.querySelector<HTMLSelectElement>('#review-status-filter')?.addEventListener('change', e => { reviewFilter = (e.target as HTMLSelectElement).value; void loadReviews(true); });
    dialog.querySelector<HTMLButtonElement>('[data-review-more]')?.addEventListener('click', () => void loadReviews(false));
  }
}
function localDate(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
