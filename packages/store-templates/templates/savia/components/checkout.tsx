import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="sv">
    <Announce />
    <Header />
    <main id="contenido" className="sv-page sv-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="sv-status" />
    <Footer />
    <Commerce />
  </div>;
}
