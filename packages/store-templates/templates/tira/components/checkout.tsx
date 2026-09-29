import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ti">
    <Header />
    <main id="contenido" className="ti-page ti-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ti-status" />
    <Footer />
    <Commerce />
  </div>;
}
