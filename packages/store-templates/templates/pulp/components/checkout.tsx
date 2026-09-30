import { Announce, Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="pu">
    <Announce />
    <Header />
    <main id="contenido" className="pu-page pu-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="pu-status" />
    <Footer />
    <Commerce />
  </div>;
}
