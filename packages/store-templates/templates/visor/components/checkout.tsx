import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="vi">
    <Header />
    <main id="contenido" className="vi-page vi-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="vi-status" />
    <Footer />
    <Commerce />
  </div>;
}
