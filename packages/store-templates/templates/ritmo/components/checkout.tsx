import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ri">
    <Header />
    <main id="contenido" className="ri-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ri-status" />
    <Footer />
  </div>;
}
