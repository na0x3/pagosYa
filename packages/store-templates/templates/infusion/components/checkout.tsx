import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="in">
    <Header />
    <main id="contenido" className="in-page in-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="in-status" />
    <Footer />
    <Commerce />
  </div>;
}
