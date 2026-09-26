import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="so">
    <Header />
    <main id="contenido" className="so-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="so-status" />
    <Footer />
  </div>;
}
