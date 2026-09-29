import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="af">
    <Header />
    <main id="contenido" className="af-page af-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="af-status" />
    <Footer />
    <Commerce />
  </div>;
}
