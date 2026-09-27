import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="pa2">
    <Header />
    <main id="contenido" className="pa2-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pa2-status" />
    <Footer />
  </div>;
}
