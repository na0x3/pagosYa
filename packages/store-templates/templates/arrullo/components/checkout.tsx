import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="au">
    <Header />
    <main id="contenido" className="au-page au-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="au-status" />
    <Footer />
    <Commerce />
  </div>;
}
