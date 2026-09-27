import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="cu">
    <Header />
    <main id="contenido" className="cu-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="cu-status" />
    <Footer />
  </div>;
}
