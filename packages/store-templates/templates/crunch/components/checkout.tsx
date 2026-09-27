import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="cr">
    <Header />
    <main id="contenido" className="cr-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="cr-status" />
    <Footer />
  </div>;
}
