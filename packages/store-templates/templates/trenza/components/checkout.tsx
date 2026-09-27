import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="tz">
    <Header />
    <main id="contenido" className="tz-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="tz-status" />
    <Footer />
  </div>;
}
