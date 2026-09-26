import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ta">
    <Header />
    <main id="contenido" className="ta-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ta-status" />
    <Footer />
  </div>;
}
