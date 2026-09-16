import { preserveDialogForms } from './dialog-form-state';
import { MerchantStudioApi, type CatalogLayout, type Collection } from './api';
import { escapeHtml as escape } from './studio-ui';
import './brand-profile.css';

const MAX_COLLECTIONS = 12;
const MAX_COLLECTION_PRODUCTS = 200;

// The spec's four arrangements, in the order they're offered — value, name, and a
// plain-Spanish line explaining what a shopper will see, so an owner can choose
// without a manual.
const LAYOUTS: Array<[CatalogLayout, string, string]> = [
  ['all', 'Todo en la portada', 'Todos tus productos se muestran juntos en la portada, en una sola cuadrícula.'],
  ['sections', 'Por secciones', 'La portada repite la cuadrícula una vez por colección, cada una con su título, en el orden que elijas.'],
  ['page', 'Página de productos aparte', 'La portada muestra los primeros 4 productos y un enlace "Ver todos los productos"; el catálogo completo vive en una página aparte.'],
  ['tabs', 'Una pestaña por colección', 'Una fila de pestañas, una por colección; cada pestaña abre su propia página con esos productos.'],
];

export async function openCatalogArrangement(api: MerchantStudioApi, storeId: string, onSaved?: () => void) {
  const dialog = document.createElement('dialog'); dialog.className = 'brand-dialog'; dialog.setAttribute('aria-label', 'Cómo se ven tus productos');
  let layout: CatalogLayout = 'all';
  let list: Collection[] = [];
  // Every product regardless of status — a collection's saved membership must
  // never silently drop an archived product just because it wouldn't show on
  // the live storefront.
  let products: Array<{ id: string; name: string; status: string }> = [];
  let busy = false; let message = '';
  document.body.append(dialog); dialog.innerHTML = '<p role="status">Cargando…</p>'; dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove()); dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  try {
    const [stores, collections, allProducts] = await Promise.all([api.listStores(), api.collections(storeId), api.products(storeId)]);
    layout = stores.find(store => store.id === storeId)?.catalogLayout || 'all';
    list = collections;
    products = allProducts;
    render();
  } catch (e) {
    dialog.innerHTML = `<p>${escape(e instanceof Error ? e.message : 'No se pudieron cargar tus productos.')}</p><button>Cerrar</button>`;
    dialog.querySelector('button')!.onclick = () => dialog.close();
  }
  async function run(task: () => Promise<void>) { if (busy) return; const restore = preserveDialogForms(dialog); let failed = false; busy = true; message = ''; dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input,textarea,select,button').forEach(control => control.disabled = true); try { await task(); } catch (e) { failed = true; message = e instanceof Error ? e.message : 'No se pudo guardar.'; } finally { busy = false; render(); if (failed) restore(); } }
  async function reorder(id: string, direction: -1 | 1) {
    const index = list.findIndex(c => c.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const ids = list.map(c => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await api.reorderCollections(storeId, ids);
    list = await api.collections(storeId);
    message = 'Orden actualizado.';
    onSaved?.();
  }
  // Reordering the products inside a collection is a local, unsaved edit — it
  // mutates this collection's own productIds array (the same array a save
  // submits) in place, in memory, and just re-renders. Nothing is sent to the
  // API until "Guardar productos" is submitted, same as a checkbox toggle.
  function moveProduct(collectionId: string, productId: string, direction: -1 | 1) {
    const collection = list.find(c => c.id === collectionId);
    if (!collection) return;
    const index = collection.productIds.indexOf(productId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= collection.productIds.length) return;
    const ids = collection.productIds;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    render();
  }
  function collectionBlock(collection: Collection, index: number) {
    // A product this collection already holds can be missing from `products`
    // (e.g. a reference to a product this store no longer has) — render it
    // anyway, checked, so saving an unrelated change never silently drops it
    // and the owner still has a way to remove it on purpose.
    const labelFor = (id: string) => {
      const product = products.find(p => p.id === id);
      if (!product) return { label: 'Producto no disponible (archivado o eliminado)', archived: true };
      return { label: product.name, archived: product.status === 'ARCHIVED' };
    };
    const memberIds = collection.productIds;
    const memberSet = new Set(memberIds);
    // Members render first, in the collection's own order (reorderable below)
    // and pre-checked so unchecking one removes it. Products not yet in the
    // collection render after, unchecked, so checking one adds it at the end.
    const memberRow = (id: string, memberIndex: number) => {
      const { label, archived } = labelFor(id);
      return `<div class="arrangement-product-row${archived ? ' arrangement-product-inactive' : ''}">
        <label><span><input type="checkbox" name="product" value="${escape(id)}" style="width:auto" checked> ${escape(label)}${archived ? ' (archivado)' : ''}</span></label>
        <span class="arrangement-product-actions">
          <button type="button" data-move-product-up="${escape(id)}" ${memberIndex === 0 ? 'disabled' : ''}>Subir ${escape(label)}</button>
          <button type="button" data-move-product-down="${escape(id)}" ${memberIndex === memberIds.length - 1 ? 'disabled' : ''}>Bajar ${escape(label)}</button>
        </span>
      </div>`;
    };
    const addableRow = (product: { id: string; name: string; status: string }) => {
      const archived = product.status === 'ARCHIVED';
      return `<label${archived ? ' class="arrangement-product-inactive"' : ''}><span><input type="checkbox" name="product" value="${escape(product.id)}" style="width:auto"> ${escape(product.name)}${archived ? ' (archivado)' : ''}</span></label>`;
    };
    const rows = [
      ...memberIds.map((id, memberIndex) => memberRow(id, memberIndex)),
      ...products.filter(product => !memberSet.has(product.id)).map(addableRow),
    ];
    return `<article class="brand-import" data-collection="${escape(collection.id)}">
      <form data-rename="${escape(collection.id)}"><label>Nombre de la colección<input name="name" maxlength="60" required value="${escape(collection.name)}"></label><button class="button" type="submit">Renombrar</button></form>
      <div class="arrangement-collection-actions">
        <button type="button" data-move-up="${escape(collection.id)}" ${index === 0 ? 'disabled' : ''}>Subir ${escape(collection.name)}</button>
        <button type="button" data-move-down="${escape(collection.id)}" ${index === list.length - 1 ? 'disabled' : ''}>Bajar ${escape(collection.name)}</button>
        <button type="button" class="button" data-delete="${escape(collection.id)}">Eliminar colección</button>
      </div>
      <form data-products="${escape(collection.id)}">
        <fieldset><legend>Productos en esta colección (${collection.productIds.length}/${MAX_COLLECTION_PRODUCTS})</legend>
        ${rows.length ? rows.join('') : '<p>Todavía no tienes productos.</p>'}
        </fieldset>
        <button class="button" type="submit">Guardar productos</button>
      </form>
    </article>`;
  }
  function render() {
    dialog.innerHTML = `<header><h2>Cómo se ven tus productos</h2><button class="button" id="arrangement-close">Cerrar</button></header>
      <p>Elige cómo se muestran tus productos y agrúpalos en colecciones. Puedes tener hasta ${MAX_COLLECTIONS} colecciones, cada una con hasta ${MAX_COLLECTION_PRODUCTS} productos, y un producto puede estar en varias a la vez. Los productos que no agregues a ninguna colección aparecen al final, en "Más productos".</p>
      <form id="arrangement-layout"><fieldset><legend>Elige cómo se ven tus productos</legend>
        ${LAYOUTS.map(([value, title, description]) => `<div class="arrangement-option"><label><span><input type="radio" name="layout" value="${value}" style="width:auto" aria-describedby="arrangement-desc-${value}" ${layout === value ? 'checked' : ''}> ${escape(title)}</span></label><p id="arrangement-desc-${value}">${escape(description)}</p></div>`).join('')}
      </fieldset><button class="button button--publish" type="submit">Guardar arreglo</button></form>
      <section class="brand-import"><h3>Colecciones (${list.length}/${MAX_COLLECTIONS})</h3>
        <form id="arrangement-create-collection"><label>Nombre de la nueva colección<input name="name" maxlength="60" required placeholder="Verano"></label><button class="button" type="submit">Crear colección</button></form>
        ${list.length ? list.map(collectionBlock).join('') : '<p>Todavía no tienes colecciones.</p>'}
      </section>
      <p role="status">${escape(message)}</p>`;
    dialog.querySelector('#arrangement-close')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#arrangement-layout')!.addEventListener('submit', e => {
      e.preventDefault();
      const value = String(new FormData(e.target as HTMLFormElement).get('layout') || 'all') as CatalogLayout;
      void run(async () => { const saved = await api.saveCatalogLayout(storeId, value); layout = saved.catalogLayout || value; message = 'Guardamos cómo se ven tus productos.'; onSaved?.(); });
    });
    dialog.querySelector('#arrangement-create-collection')!.addEventListener('submit', e => {
      e.preventDefault();
      const name = String(new FormData(e.target as HTMLFormElement).get('name') || '').trim();
      void run(async () => { await api.createCollection(storeId, name); list = await api.collections(storeId); message = 'Colección creada.'; onSaved?.(); });
    });
    dialog.querySelectorAll<HTMLFormElement>('[data-rename]').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      const id = form.dataset.rename!;
      const name = String(new FormData(form).get('name') || '').trim();
      void run(async () => { await api.renameCollection(storeId, id, name); list = await api.collections(storeId); message = 'Colección renombrada.'; onSaved?.(); });
    }));
    dialog.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(button => button.onclick = () => {
      if (!confirm('¿Eliminar esta colección? Sus productos no se eliminan, solo dejan de estar agrupados aquí.')) return;
      void run(async () => { await api.deleteCollection(storeId, button.dataset.delete!); list = await api.collections(storeId); message = 'Colección eliminada.'; onSaved?.(); });
    });
    dialog.querySelectorAll<HTMLButtonElement>('[data-move-up]').forEach(button => button.onclick = () => void run(() => reorder(button.dataset.moveUp!, -1)));
    dialog.querySelectorAll<HTMLButtonElement>('[data-move-down]').forEach(button => button.onclick = () => void run(() => reorder(button.dataset.moveDown!, 1)));
    dialog.querySelectorAll<HTMLButtonElement>('[data-move-product-up]').forEach(button => button.onclick = () => moveProduct(button.closest('form')!.dataset.products!, button.dataset.moveProductUp!, -1));
    dialog.querySelectorAll<HTMLButtonElement>('[data-move-product-down]').forEach(button => button.onclick = () => moveProduct(button.closest('form')!.dataset.products!, button.dataset.moveProductDown!, 1));
    dialog.querySelectorAll<HTMLFormElement>('[data-products]').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      const id = form.dataset.products!;
      const collection = list.find(c => c.id === id);
      if (!collection) return;
      const checked = new Set(new FormData(form).getAll('product').map(String));
      // The saved order comes from the collection's own (possibly just
      // reordered) productIds, filtered to what's still checked — never from
      // checkbox DOM order, which is catalog order and would silently
      // scramble any collection the owner had ordered differently. Newly
      // checked products (not yet members) are appended at the end.
      const kept = collection.productIds.filter(productId => checked.has(productId));
      const added = products.filter(product => checked.has(product.id) && !collection.productIds.includes(product.id)).map(product => product.id);
      const paymentLinkIds = [...kept, ...added];
      void run(async () => { await api.setCollectionProducts(storeId, id, paymentLinkIds); list = await api.collections(storeId); message = 'Productos actualizados.'; onSaved?.(); });
    }));
  }
}
