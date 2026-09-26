import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="se">
    <Header />
    <main id="contenido" className="se-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="se-status" />
    <Footer />
  </div>;
}
