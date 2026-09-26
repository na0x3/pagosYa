import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="pg">
    <Header />
    <main id="contenido" className="pg-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pg-status" />
    <Footer />
  </div>;
}
