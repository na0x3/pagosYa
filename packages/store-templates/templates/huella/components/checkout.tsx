import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="hl">
    <Header />
    <main id="contenido" className="hl-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="hl-status" />
    <Footer />
  </div>;
}
