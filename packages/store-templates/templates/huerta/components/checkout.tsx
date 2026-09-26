import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="hu">
    <Header />
    <main id="contenido" className="hu-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="hu-status" />
    <Footer />
  </div>;
}
