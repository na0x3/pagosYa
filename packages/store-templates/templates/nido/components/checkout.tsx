import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ni">
    <Header />
    <main id="contenido" className="ni-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ni-status" />
    <Footer />
  </div>;
}
