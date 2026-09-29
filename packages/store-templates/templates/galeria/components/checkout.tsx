import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ga">
    <Header />
    <main id="contenido" className="ga-page ga-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ga-status" />
    <Footer />
    <Commerce />
  </div>;
}
