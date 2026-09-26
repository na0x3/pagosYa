import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ba">
    <Header />
    <main id="contenido" className="ba-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ba-status" />
    <Footer />
  </div>;
}
