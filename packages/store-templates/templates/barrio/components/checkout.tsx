import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ba">
    <Announce />
    <Header />
    <main id="contenido" className="ba-page ba-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ba-status" />
    <Footer />
    <Commerce />
  </div>;
}
