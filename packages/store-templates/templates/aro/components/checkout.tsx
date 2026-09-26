import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ar">
    <Header />
    <main id="contenido" className="ar-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ar-status" />
    <Footer />
  </div>;
}
