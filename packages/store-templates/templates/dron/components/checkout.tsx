import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="dr">
    <Header />
    <main id="contenido" className="dr-page dr-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="dr-status" />
    <Footer />
    <Commerce />
  </div>;
}
