import '../../apps/merchant-dashboard/src/product-options.js';
import '../../apps/merchant-dashboard/src/product-options.css';
import { createProductForm } from '../../apps/merchant-studio/src/source-create-product';
import { sourcePreviewDocument } from '../../apps/merchant-studio/src/source-preview';
import commerce from '../../apps/api/src/stores/source-kit/commerce.js?raw';
import commerceCss from '../../apps/api/src/stores/source-kit/commerce-pages.css?raw';
import type { VariantDraft } from '../../apps/merchant-dashboard/src/product-options';

const initial = PagosYaProductOptions.combinations([{ name: 'Color', values: ['Azul', 'Blanco', 'Negro'] }, { name: 'Talla', values: ['S', 'M', 'L'] }], [], '120');
initial.forEach((row, i) => { row.stock = String([0, 3, 2, 5, 0, 4, 1, 2, 0][i]); });
function preview(name: string, drafts: VariantDraft[]) {
  const variants = PagosYaProductOptions.serialize(drafts.map(row => ({ ...row, stockDirty: true }))).map((row, i) => ({ ...row, id: row.id || `demo-${i}` }));
  const item = { id: 'example', name, description: 'Elige tus opciones. Cada combinación tiene su precio y su propio inventario.', amount: 12000, currency: 'BOB', stock: null, variants, imageUrls: [] };
  document.querySelector('iframe')!.srcdoc = sourcePreviewDocument({ schemaVersion: 1, brief: { businessType: 'Prueba', audience: '', primaryAction: '', visualDirection: '' }, files: [
    { path: 'product.html', content: '<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="commerce-pages.css"><style>:root{--store-background:#fff;--store-foreground:#252525;--store-accent:#263e35;--store-accent-foreground:#fff;--store-font-family:Arial,sans-serif}body{margin:0;font:14px Arial,sans-serif}[data-pagosya-product-page] .product-detail__layout{grid-template-columns:1fr!important}[data-pagosya-product-page] .product-detail__gallery{display:none!important}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><main data-pagosya-product data-pagosya-product-page></main></body></html>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG=' + JSON.stringify({ demo: true, slug: 'option-example', productPage: 'product.html', data: { storeName: 'Producto de ejemplo', items: [item], categories: [], locations: [] } }) + ';' },
    { path: 'commerce.js', content: commerce }, { path: 'commerce-pages.css', content: commerceCss },
  ] }, 'product.html', { query: '?id=example', theme: 'light' });
}
PagosYaProductOptions.mount(document.querySelector('#editor')!, { variants: initial, basePrice: () => '120', onChange: rows => { try { preview('Camisa de algodón', rows); } catch {} } });
preview('Camisa de algodón', initial);
const newHost = document.querySelector<HTMLElement>('#new')!;
let form: ReturnType<typeof createProductForm> | undefined;
const close = () => { form?.dispose(); newHost.hidden = true; document.querySelector<HTMLElement>('#editor')!.hidden = false; };
document.querySelector('#show-editor')!.addEventListener('click', close);
document.querySelector('#show-create')!.addEventListener('click', () => {
  close(); newHost.hidden = false; document.querySelector<HTMLElement>('#editor')!.hidden = true;
  form = createProductForm({ createProduct: async (_storeId: string, product: any) => {
    if (product.variants?.length) preview(product.name, product.variants.map((v: any) => ({ ...v, amount: String(v.amount / 100), stock: v.stock == null ? '' : String(v.stock) })));
    document.querySelector('#message')!.textContent = `Producto validado: ${product.name} · ${product.variants?.length || 1} combinaciones. Prueba local, sin guardar en el servidor.`;
    return { id: 'example', name: product.name };
  }, upload: async (file: File) => ({ url: URL.createObjectURL(file) }) } as any, 'local-example', () => {}, close);
  newHost.append(form.element); form.focus();
});
