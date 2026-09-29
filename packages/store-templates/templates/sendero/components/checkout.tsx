import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="se">
    <Announce />
    <Header />
    <main id="contenido" className="se-page se-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="se-status" />
    <Footer />
    <Commerce />
  </div>;
}
