import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="pe">
    <Header />
    <main id="contenido" className="pe-page pe-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pe-status" />
    <Footer />
    <Commerce />
  </div>;
}
