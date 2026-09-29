import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="as">
    <Header />
    <main id="contenido" className="as-page as-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="as-status" />
    <Footer />
    <Commerce />
  </div>;
}
