import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ju">
    <Header />
    <main id="contenido" className="ju-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ju-status" />
    <Footer />
  </div>;
}
