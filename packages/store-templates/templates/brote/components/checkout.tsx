import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="br">
    <Announce />
    <Header />
    <main id="contenido" className="br-page br-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="br-status" />
    <Footer />
    <Commerce />
  </div>;
}
