import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ob">
    <Announce />
    <Header />
    <main id="contenido" className="ob-page ob-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ob-status" />
    <Footer />
    <Commerce />
  </div>;
}
