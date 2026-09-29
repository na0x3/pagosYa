import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="at">
    <Announce />
    <Header />
    <main id="contenido" className="at-page at-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="at-status" />
    <Footer />
    <Commerce />
  </div>;
}
