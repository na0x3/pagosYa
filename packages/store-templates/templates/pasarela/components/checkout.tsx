import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="pa">
    <Header />
    <main id="contenido" className="pa-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pa-status" />
    <Footer />
  </div>;
}
