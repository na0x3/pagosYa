import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="fl">
    <Header />
    <main id="contenido" className="fl-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="fl-status" />
    <Footer />
  </div>;
}
