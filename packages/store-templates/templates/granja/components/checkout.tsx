import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="gr">
    <Header />
    <main id="contenido" className="gr-page gr-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="gr-status" />
    <Footer />
    <Commerce />
  </div>;
}
