import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="rt">
    <Header />
    <main id="contenido" className="rt-page rt-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="rt-status" />
    <Footer />
    <Commerce />
  </div>;
}
