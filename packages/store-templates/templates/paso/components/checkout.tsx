import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ps">
    <Header />
    <main id="contenido" className="ps-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ps-status" />
    <Footer />
  </div>;
}
