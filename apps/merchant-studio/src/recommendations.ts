import { preserveDialogForms } from './dialog-form-state';
import { MerchantStudioApi, type RecommendableProduct } from './api';
import { openCommerceContent } from './commerce-content';
import { escapeHtml as escape } from './studio-ui';
import './brand-profile.css';

/** What the storefront shows: 3 cart suggestions out of up to 12, and 4 products under a product page. */
const MAX_CART_PRODUCTS = 12;
const MAX_PRODUCT_RECOMMENDATIONS = 4;

export async function openRecommendations(api: MerchantStudioApi, storeId: string) {
  const dialog = document.createElement('dialog'); dialog.className = 'brand-dialog'; dialog.setAttribute('aria-label', 'Recomendaciones');
  let products: RecommendableProduct[] = [];
  let cartEnabled = true, cartIds: string[] = [];
  let productId = '';
  let busy = false, message = '';
  document.body.append(dialog); dialog.innerHTML = '<p role="status">Cargando…</p>'; dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove()); dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  async function run(task: () => Promise<void>) { if (busy) return; const restore = preserveDialogForms(dialog); let failed = false; busy = true; message = ''; dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button').forEach(control => control.disabled = true); try { await task(); } catch (e) { failed = true; message = e instanceof Error ? e.message : 'No se pudo guardar.'; } finally { busy = false; render(); if (failed) restore(); } }
  // Saved ids keep the catalog's order, so the storefront shows them the way the owner sees them here.
  const inCatalogOrder = (ids: Set<string>) => products.filter(product => ids.has(product.id)).map(product => product.id);
  const checklist = (name: string, chosen: string[], exclude: string, max: number) => {
    const full = chosen.filter(id => products.some(product => product.id === id && product.id !== exclude)).length >= max;
    return products.filter(product => product.id !== exclude).map(product => {
      const checked = chosen.includes(product.id);
      return `<label><span><input type="checkbox" name="${name}" value="${escape(product.id)}" style="width:auto" ${checked ? 'checked' : ''} ${!checked && full ? 'disabled' : ''}> ${escape(product.name)}</span></label>`;
    }).join('') || '<p>Crea más productos para poder recomendarlos.</p>';
  };
  function limitChecks(form: HTMLFormElement, name: string, max: number) {
    const boxes = [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)];
    const full = boxes.filter(box => box.checked).length >= max;
    boxes.forEach(box => { if (!box.checked) box.disabled = full; });
  }
  function render() {
    const current = products.find(product => product.id === productId);
    dialog.innerHTML = `<header><h2>Recomendaciones</h2><button class="button" id="recommendations-close">Cerrar</button></header>
      <p>Sugiere productos donde tus clientes deciden: en el carrito y debajo de cada producto.</p>
      ${message ? `<p role="status">${escape(message)}</p>` : '<p role="status"></p>'}
      <section class="brand-import" data-cart-recommendations><h3>En el carrito · Súmale algo más</h3><p>Mostramos hasta 3 de estos productos que el cliente aún no tenga en su pedido.</p>
        <form id="cart-recommendations-form"><label><span><input type="checkbox" name="enabled" style="width:auto" ${cartEnabled ? 'checked' : ''}> Mostrar sugerencias en el carrito</span></label>
        <fieldset class="arrangement-products"><legend>Productos sugeridos (hasta ${MAX_CART_PRODUCTS})</legend>${checklist('cartProduct', cartIds, '', MAX_CART_PRODUCTS)}</fieldset>
        <button class="button" type="submit">Guardar sugerencias del carrito</button></form></section>
      <section class="brand-import" data-product-recommendations><h3>Debajo de cada producto · Combínalo con</h3><p>Elige hasta ${MAX_PRODUCT_RECOMMENDATIONS} productos que combinen con cada uno.</p>
        <form id="product-recommendations-form"><label for="recommendations-product">Producto</label><select id="recommendations-product" name="product"><option value="">Elige un producto</option>${products.map(product => `<option value="${escape(product.id)}" ${product.id === productId ? 'selected' : ''}>${escape(product.name)}</option>`).join('')}</select>
        ${current ? `<fieldset class="arrangement-products"><legend>Combínalo con</legend>${checklist('recommended', current.recommendedProductIds || [], current.id, MAX_PRODUCT_RECOMMENDATIONS)}</fieldset><button class="button" type="submit">Guardar recomendaciones</button>` : ''}</form></section>
      <section class="brand-import"><h3>Paquetes</h3><p>Los paquetes con descuento aparecen debajo de los productos que incluyen. Créalos en Contenido y ofertas.</p><button class="button" type="button" id="recommendations-bundles">Paquetes y promociones</button></section>`;
    dialog.querySelector('#recommendations-close')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#recommendations-bundles')!.addEventListener('click', () => { dialog.close(); void openCommerceContent(api, storeId); });
    const cartForm = dialog.querySelector<HTMLFormElement>('#cart-recommendations-form')!;
    cartForm.addEventListener('change', () => limitChecks(cartForm, 'cartProduct', MAX_CART_PRODUCTS));
    cartForm.addEventListener('submit', e => {
      e.preventDefault();
      const enabled = (cartForm.elements.namedItem('enabled') as HTMLInputElement).checked;
      const ids = inCatalogOrder(new Set([...cartForm.querySelectorAll<HTMLInputElement>('[name="cartProduct"]:checked')].map(box => box.value)));
      void run(async () => {
        const saved = await api.saveCartRecommendations(storeId, enabled, ids);
        cartEnabled = saved.cartRecommendationsEnabled !== false; cartIds = saved.cartRecommendationProductIds || ids;
        message = 'Guardamos las sugerencias del carrito.';
      });
    });
    const productForm = dialog.querySelector<HTMLFormElement>('#product-recommendations-form')!;
    productForm.querySelector<HTMLSelectElement>('[name="product"]')!.addEventListener('change', e => { productId = (e.target as HTMLSelectElement).value; message = ''; render(); dialog.querySelector<HTMLSelectElement>('#product-recommendations-form [name="product"]')?.focus(); });
    productForm.addEventListener('change', e => { if ((e.target as HTMLInputElement).name === 'recommended') limitChecks(productForm, 'recommended', MAX_PRODUCT_RECOMMENDATIONS); });
    productForm.addEventListener('submit', e => {
      e.preventDefault();
      const product = products.find(item => item.id === productId);
      if (!product) return;
      const ids = inCatalogOrder(new Set([...productForm.querySelectorAll<HTMLInputElement>('[name="recommended"]:checked')].map(box => box.value)));
      void run(async () => {
        await api.saveProductRecommendations(storeId, product.id, ids);
        product.recommendedProductIds = ids;
        message = `Guardamos las recomendaciones de ${product.name}.`;
      });
    });
  }
  try {
    const [stores, allProducts] = await Promise.all([api.listStores(), api.products(storeId)]);
    const store = stores.find(item => item.id === storeId);
    cartEnabled = store?.cartRecommendationsEnabled !== false;
    cartIds = store?.cartRecommendationProductIds || [];
    products = allProducts.filter(product => product.status === 'ACTIVE');
    render();
  } catch (e) {
    dialog.innerHTML = `<p>${escape(e instanceof Error ? e.message : 'No se pudieron cargar tus productos.')}</p><button>Cerrar</button>`;
    dialog.querySelector('button')!.onclick = () => dialog.close();
  }
}
