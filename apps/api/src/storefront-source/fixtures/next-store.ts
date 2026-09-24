import type { SourceProjectFileDto } from '../dto/save-source-project.dto';

export const nextBrief = { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Pedido', visualDirection: 'Carta compacta' };
export function nextStoreFiles(): SourceProjectFileDto[] {
  return [
    { path: 'components/Header.tsx', content: `export default function Header() { return <header className="flex items-center justify-between gap-4"><a href="index.html">Café de prueba</a><button data-cart-open>Mi pedido <span data-cart-count /></button></header>; }` },
    { path: 'components/home.tsx', content: `import { useState } from 'react'; import Header from './Header';
export default function Home() { const [open, setOpen] = useState(false); return <><Header/><main><section id="menu"><h1 className="text-3xl font-bold">Nuestra carta</h1><button onClick={() => setOpen(!open)}>Horarios</button>{open && <p>Abierto de 8 a 18</p>}<img src="/assets/sample.png" alt="Marca de prueba" width="16" height="16"/><div data-pagosya-catalog /></section></main><div data-pagosya-cart hidden/><p data-pagosya-status role="status" aria-live="polite"/><section data-pagosya-contact hidden/></>; }` },
    { path: 'components/product.tsx', content: `import Header from './Header'; export default function Product() { return <><Header/><main data-pagosya-product-page/><div data-pagosya-cart hidden/><p data-pagosya-status role="status"/></>; }` },
    { path: 'components/checkout.tsx', content: `import Header from './Header'; export default function Checkout() { return <><Header/><main data-pagosya-checkout-page/><p data-pagosya-status role="status"/></>; }` },
    { path: 'styles/globals.css', content: 'body{margin:0;padding:24px;font-family:system-ui;background:#fffaf0;color:#20211d}button{min-height:44px;padding:8px 16px}header{margin-bottom:24px}.menu-item{padding:20px 0}.menu-add{min-width:44px}' },
  ];
}
export const nextStoreConfig = { demo: true, slug: 'framework-test', productPage: 'product.html', checkoutPage: 'checkout.html', checkoutOrigin: 'http://localhost:5175', data: { storeName: 'Café de prueba', checkoutMode: 'payment', categories: [], items: [{ id: 'p1', name: 'Café filtrado', amount: 2000, currency: 'BOB', stock: 8, imageUrls: [] }], locations: [{ id: 'central', name: 'Central', pickupEnabled: true, deliveryEnabled: true, address: 'La Paz' }] } };
export const nextStoreImage: SourceProjectFileDto = { path: 'assets/sample.png', encoding: 'base64', content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1cAAAAASUVORK5CYII=' };
