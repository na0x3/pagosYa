import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="pt">
    <Header />
    <main id="contenido" className="pt-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pt-status" />
    <Footer />
  </div>;
}
