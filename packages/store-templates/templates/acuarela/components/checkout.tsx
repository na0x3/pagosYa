import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ac">
    <Announce />
    <Header />
    <main id="contenido" className="ac-page ac-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ac-status" />
    <Footer />
    <Commerce />
  </div>;
}
