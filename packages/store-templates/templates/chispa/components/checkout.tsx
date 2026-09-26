import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="ch">
    <Header />
    <main id="contenido" className="ch-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ch-status" />
    <Footer />
  </div>;
}
