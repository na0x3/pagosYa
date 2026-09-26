import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="tv">
    <Header />
    <main id="contenido" className="tv-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="tv-status" />
    <Footer />
  </div>;
}
