import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="na">
    <Header />
    <main id="contenido" className="na-page na-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="na-status" />
    <Footer />
    <Commerce />
  </div>;
}
