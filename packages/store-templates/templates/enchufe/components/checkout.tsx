import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ec">
    <Announce />
    <Header />
    <main id="contenido" className="ec-page ec-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ec-status" />
    <Footer />
    <Commerce />
  </div>;
}
