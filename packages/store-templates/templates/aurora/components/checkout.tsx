import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="au">
    <Header />
    <main id="contenido" className="au-checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="au-status" />
    <Footer />
  </div>;
}
