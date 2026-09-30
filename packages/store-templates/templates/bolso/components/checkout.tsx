import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="bo">
    <Announce />
    <Header />
    <main id="contenido" className="bo-page bo-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="bo-status" />
    <Footer />
    <Commerce />
  </div>;
}
