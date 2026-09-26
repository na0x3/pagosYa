import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="li">
    <Header />
    <main id="contenido" className="li-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="li-status" />
    <Footer />
  </div>;
}
