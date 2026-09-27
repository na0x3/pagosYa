import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="br">
    <Header />
    <main id="contenido" className="br-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="br-status" />
    <Footer />
  </div>;
}
