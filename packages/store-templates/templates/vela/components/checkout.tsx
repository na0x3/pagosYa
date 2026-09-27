import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ve">
    <Header />
    <main id="contenido" className="ve-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ve-status" />
    <Footer />
  </div>;
}
