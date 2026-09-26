import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="mi">
    <Header />
    <main id="contenido" className="mi-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="mi-status" />
    <Footer />
  </div>;
}
