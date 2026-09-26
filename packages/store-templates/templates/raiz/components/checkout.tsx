import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ra">
    <Header />
    <main id="contenido" className="ra-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ra-status" />
    <Footer />
  </div>;
}
