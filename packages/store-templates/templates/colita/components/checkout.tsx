import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="co">
    <Header />
    <main id="contenido" className="co-page co-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="co-status" />
    <Footer />
    <Commerce />
  </div>;
}
